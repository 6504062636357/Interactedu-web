// src/app/api/scorm/tracking/route.ts
//
// ไฟล์เต็ม — เอาไปทับ src/app/api/scorm/tracking/route.ts ได้ทั้งไฟล์
//
// เนื้อหา: import + POST เดิมของคุณ (คงตรรกะไว้ทุกบรรทัด แก้แค่เรื่อง suspend_data
// ตามที่อธิบายไว้ในหมายเหตุท้ายไฟล์) + GET ตัวใหม่สำหรับงานข้อ 01
//
// หมายเหตุ: บล็อกโค้ดเวอร์ชันเก่าที่คอมเมนต์ทิ้งไว้ 72 บรรทัดแรกของไฟล์เดิม
// ผมตัดออกให้แล้ว ถ้าอยากเก็บไว้ก็ก๊อปกลับมาวางข้างบนได้ ไม่กระทบอะไร

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createNotification } from '@/lib/notifications/service';

interface ManifestItem {
  identifier: string;
  href: string | null;
  children?: ManifestItem[];
  type?: 'lesson' | 'quiz';
}

interface ExistingTracking {
  video_completed: boolean | null;
  quiz_passed: boolean | null;
  completed_scos: string[] | null;
  score_raw: number | string | null;
  suspend_data?: string | null;
  quiz_score_recorded?: boolean | null;
  // ก้อน CMI เต็มจาก commit ล่าสุด (งานข้อ 02) — undefined ถ้า DB ยังไม่มีคอลัมน์นี้ (schema เก่า)
  cmi_data?: Record<string, unknown> | null;
}

function isMissingSchemaField(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(error.message ?? '');
}

// เดินทุกกิ่งของ manifest เก็บเฉพาะ href ของ SCO ประเภทวิดีโอ (ไม่ใช่ quiz)
function collectVideoScoHrefs(items: ManifestItem[]): string[] {
  const result: string[] = [];
  for (const item of items) {
    const isQuiz = item.type === 'quiz' || item.identifier?.includes('QUIZ');
    if (item.href && !isQuiz) result.push(item.href);
    if (item.children?.length) result.push(...collectVideoScoHrefs(item.children));
  }
  return result;
}

// [งานข้อ 20] ดึง cmi.core.lesson_location (1.2) หรือ cmi.location (2004) ออกจากก้อน CMI
// ที่เก็บไว้ตอน commit ล่าสุด — ใช้เป็น fallback ตอนที่ยังไม่มี cmi_data เต็มก้อน (แถวเก่าก่อน
// งานข้อ 02 หรือ commit แรกที่ client serialize ไม่สำเร็จ) เพราะ page.tsx จะใช้ cmi_data
// เต็มก้อนก่อนอยู่แล้วถ้ามี ค่านี้จึงมีผลจริงเฉพาะกรณี fallback เท่านั้น — แทนที่ endpoint
// /api/lessons/[lessonId]/watch-position เดิมที่แยกออกไปเก็บคนละที่ ทำให้ resume ไม่ผ่าน
// CMI pipeline เดียวกับข้อมูลอื่น
function extractLessonLocationFromCmi(cmi: Record<string, unknown> | null | undefined): string {
  if (!cmi || typeof cmi !== 'object') return '';
  const core = cmi.core as Record<string, unknown> | undefined;
  const locationFrom12 = core && typeof core === 'object' ? core.lesson_location : undefined;
  const locationFrom2004 = cmi.location;
  const value = locationFrom12 ?? locationFrom2004;
  return typeof value === 'string' ? value : '';
}

// [งานข้อ 06] ดึง cmi.core.score.raw (SCORM 1.2) หรือ cmi.score.raw (2004) ออกจากก้อน CMI
// ที่ผู้เล่นส่งมา — ใช้เฉพาะกับแพ็กเกจ "imported" เท่านั้น (ดูจุดที่เรียกใช้ด้านล่าง) เพราะแพ็กเกจ
// ที่เราสร้างเอง คะแนนสอบปลายคอร์สตัวจริงมาจาก quiz_attempts เสมอ ไม่ใช่ค่านี้
function extractScoreRawFromCmi(cmi: Record<string, unknown> | null | undefined): number | null {
  if (!cmi || typeof cmi !== 'object') return null;
  const core = cmi.core as Record<string, unknown> | undefined;
  const scoreFrom12 =
    core && typeof core === 'object'
      ? (core.score as Record<string, unknown> | undefined)?.raw
      : undefined;
  const scoreFrom2004 = (cmi.score as Record<string, unknown> | undefined)?.raw;
  const raw = scoreFrom12 ?? scoreFrom2004;
  if (raw === undefined || raw === null || raw === '') return null;
  const num = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(num) ? num : null;
}

// ============================================================================
// ค่าที่ SCORM 1.2 ยอมรับสำหรับ cmi.core.lesson_status เท่านั้น
// กันค่าแปลกๆ ใน DB หลุดเข้าไปใน CMI แล้วทำให้ scorm-again โยน error 405
// ============================================================================
const SCORM12_LESSON_STATUS = new Set([
  'passed',
  'completed',
  'failed',
  'incomplete',
  'browsed',
  'not attempted',
]);

function normalizeLessonStatus(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SCORM12_LESSON_STATUS.has(normalized) ? normalized : 'not attempted';
}

// สถานะว่าง = เริ่มใหม่ ใช้ตอบกรณีแอดมินพรีวิว / ยังไม่ลงทะเบียน / ยังไม่เคยเรียน
const EMPTY_STATE = {
  hasPriorAttempt: false,
  lessonStatus: 'not attempted',
  scoreRaw: '',
  suspendData: '',
  lessonLocation: '',
  completedScos: [] as string[],
  cmiData: null as Record<string, unknown> | null,
};

// [งานข้อ 08] โหมด/เครดิตของครั้งนี้ — 'no-credit'+'browse' คือวิธีมาตรฐานของ SCORM ที่บอก SCO
// ว่า "ครั้งนี้ไม่นับคะแนน อย่าเก็บผลเป็นการสอบจริง" ใช้ตอนแอดมินเปิดพรีวิว หรือไม่มี enrollment
// จริง (เช่นครูเปิดดูเนื้อหาคอร์สตัวเอง) เพราะทั้งสองกรณีนี้ POST /api/scorm/tracking ก็ไม่บันทึก
// ผลอยู่แล้ว (ข้ามด้วย role admin หรือหา enrollment ไม่เจอ) — ผู้เรียนจริงที่ลงทะเบียนแล้วเท่านั้น
// ที่ควรได้ 'credit'/'normal' ไม่ว่าจะเคยมี tracking row มาก่อนหรือยังก็ตาม
const PREVIEW_MODE = { credit: 'no-credit' as const, lessonMode: 'browse' as const };
const CREDIT_MODE = { credit: 'credit' as const, lessonMode: 'normal' as const };

// ============================================================================
// POST — SCO commit เข้ามา แล้วบันทึกลง DB (ของเดิม)
// ============================================================================

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // กันไม่ให้แอดมิน (ที่เปิดดู preview) บันทึกคะแนน/ความคืบหน้าปนกับนักเรียนจริง
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'admin') {
    return NextResponse.json({ success: true, skipped: 'admin preview mode' });
  }

  try {
    const body = await request.json();
    const { lessonId, courseId, lessonStatus, suspendData, scoType, scoIdentifier, cmiData } = body;
    // scoType: "lesson" | "quiz"
    // scoIdentifier: href/identifier เฉพาะของ SCO นี้ ใช้แยกว่า SCO ไหนจบ

    // 1. หา enrollment ของนักเรียนคนนี้ในคอร์สนี้
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('student_id', user.id)
      .eq('course_id', courseId)
      .single();

    if (!enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });

    // 2. ดึงแถวเดิม (ถ้ามี) เพื่อ merge สถานะ ไม่ให้ SCO นึงเขียนทับอีก SCO
    const modernTrackingRes = await supabase
      .from('scorm_tracking')
      .select('video_completed, quiz_passed, completed_scos, score_raw, suspend_data, quiz_score_recorded, cmi_data')
      .eq('enrollment_id', enrollment.id)
      .eq('lesson_id', lessonId)
      .maybeSingle();

    let existing = modernTrackingRes.data as ExistingTracking | null;
    let supportsTrustedQuizFlag = true;
    if (modernTrackingRes.error) {
      if (!isMissingSchemaField(modernTrackingRes.error)) throw modernTrackingRes.error;
      supportsTrustedQuizFlag = false;
      const legacyTrackingRes = await supabase
        .from('scorm_tracking')
        .select('video_completed, quiz_passed, completed_scos, score_raw, suspend_data')
        .eq('enrollment_id', enrollment.id)
        .eq('lesson_id', lessonId)
        .maybeSingle();
      if (legacyTrackingRes.error) throw legacyTrackingRes.error;
      existing = legacyTrackingRes.data as ExistingTracking | null;
    }

    const existingScos: string[] = Array.isArray(existing?.completed_scos) ? existing.completed_scos : [];

    // ถือว่า SCO นี้ "จบ" ถ้า status เป็น completed (lesson) หรือ passed (quiz)
    const thisScoCompleted =
      scoType === 'quiz' ? lessonStatus === 'passed' : lessonStatus === 'completed';

    const completedScos =
      thisScoCompleted && scoIdentifier && !existingScos.includes(scoIdentifier)
        ? [...existingScos, scoIdentifier]
        : existingScos;

    // 3. ดึง manifest ของเลสสันนี้ เพื่อรู้ว่าต้องจบกี่ SCO วิดีโอถึงจะนับว่าเลสสัน "completed" จริง
    const { data: lessonRow } = await supabase
      .from('lessons')
      .select('title, scorm_manifest, scorm_source')
      .eq('id', lessonId)
      .maybeSingle();

    const manifestItems: ManifestItem[] = (lessonRow?.scorm_manifest as { items?: ManifestItem[] } | null)?.items ?? [];
    const totalVideoScos = collectVideoScoHrefs(manifestItems);

    // เลสสัน "completed" จริง ก็ต่อเมื่อ SCO วิดีโอทุกตัวใน manifest อยู่ใน completedScos ครบแล้ว
    const allVideoScosDone =
      totalVideoScos.length > 0 && totalVideoScos.every((href) => completedScos.includes(href));

    const derivedLessonStatus = allVideoScosDone ? 'completed' : (lessonStatus || 'incomplete');

    // video_completed / quiz_passed ยังคงไว้เป็น "จบทั้งเลสสัน" เผื่อโค้ดส่วนอื่นยังอ้างอิงอยู่
    const videoCompleted = allVideoScosDone || existing?.video_completed || false;

    // Final scores are written by the course final exam after grading against database
    // choices. Never overwrite that trusted result with a browser-supplied score.
    const quizPassed = supportsTrustedQuizFlag
      ? existing?.quiz_score_recorded
        ? existing.quiz_passed ?? false
        : false
      : existing?.quiz_passed ?? false;

    // [แก้ใหม่] อย่าเขียนทับ suspend_data เดิมด้วยค่าว่าง
    // SCO อาจ commit ก่อนที่จะเขียน suspend_data ถ้าเขียนทับตรงๆ ข้อมูลที่ใช้
    // กลับมาเรียนต่อจะหายทันที — เห็นผลชัดตอนที่ GET ข้างล่างเริ่มถูกใช้งาน
    const existingSuspendData =
      typeof existing?.suspend_data === 'string' ? existing.suspend_data : '';
    const nextSuspendData =
      typeof suspendData === 'string' && suspendData.length > 0 ? suspendData : existingSuspendData;

    // [งานข้อ 02] เก็บ CMI เต็มก้อน (lesson_location, session_time, interactions, objectives ฯลฯ)
    // ที่หน้า player ส่งมาตอน commit — เหมือน suspend_data ข้างบน ถ้า client ไม่ได้ส่งมา
    // (เช่น serialize ฝั่ง client ล้มเหลว) ให้คงของเดิมไว้ อย่าเขียนทับด้วยค่าว่าง
    const existingCmiData =
      existing?.cmi_data && typeof existing.cmi_data === 'object' ? existing.cmi_data : {};
    const nextCmiData =
      cmiData && typeof cmiData === 'object' ? cmiData : existingCmiData;

    // [งานข้อ 06] แพ็กเกจ "imported" (อัปโหลด .zip ของคนอื่นผ่าน admin/scorm-upload) ไม่ผ่าน
    // pipeline ตรวจคะแนนฝั่งเซิร์ฟเวอร์ของเรา (quiz_attempts ผ่าน gradeCourseFinalExam — งานข้อ
    // 03) เพราะไม่ได้ถูกสร้างจากคลังข้อสอบของเรา คะแนนที่ SCO รายงานเองผ่าน
    // cmi.core.score.raw / cmi.score.raw จึงเป็นแหล่งความจริงเดียวที่มีอยู่จริงสำหรับแพ็กเกจกลุ่ม
    // นี้ ต่างจากแพ็กเกจ "generated" (ของเราเอง) ที่คะแนนสอบปลายคอร์สตัดสินที่ quiz_attempts เสมอ
    // — เชื่อคะแนนจากเบราว์เซอร์ตรงๆ ไม่ได้ ต้องคง score_raw ไว้เป็น null/ค่าเดิมตามพฤติกรรมเดิม
    const isImportedPackage = lessonRow?.scorm_source === 'imported';
    const scoreFromCmi = isImportedPackage
      ? extractScoreRawFromCmi(nextCmiData as Record<string, unknown>)
      : null;
    const nextScoreRaw = isImportedPackage
      ? scoreFromCmi ?? existing?.score_raw ?? null
      : existing?.score_raw ?? null;

    // 4. Upsert แถวเดียวต่อ 1 lesson แต่ merge completed_scos + derive lesson_status ให้ถูกต้อง
    const { error: upsertError } = await supabase
      .from('scorm_tracking')
      .upsert({
        enrollment_id: enrollment.id,
        lesson_id: lessonId,
        lesson_status: derivedLessonStatus,
        score_raw: nextScoreRaw,
        suspend_data: nextSuspendData,
        cmi_data: nextCmiData,
        video_completed: videoCompleted,
        quiz_passed: quizPassed,
        completed_scos: completedScos,
        last_accessed: new Date().toISOString(),
      }, {
        onConflict: 'enrollment_id,lesson_id',
      });

    if (upsertError) throw upsertError;

    if (videoCompleted && !existing?.video_completed) {
      await createNotification({
        userId: user.id,
        type: 'lesson_completed',
        title: 'เรียนจบบทเรียนแล้ว',
        message: `เรียนบท ${lessonRow?.title ?? 'นี้'} สำเร็จแล้ว`,
        relatedType: 'lesson',
        relatedId: lessonId,
        actionUrl: `/play/${courseId}/${lessonId}`,
        dedupeKey: `lesson_completed:${user.id}:${lessonId}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Tracking Sync Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tracking sync failed' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET — ส่ง CMI เดิมของผู้เรียนกลับไปให้ player  [ของใหม่ งานข้อ 01]
//
// GET /api/scorm/tracking?lessonId=...&courseId=...
//
// คืนรูปแบบกลางๆ (ไม่ผูกกับ SCORM 1.2 หรือ 2004) แล้วให้ฝั่ง client แปลงเป็น
// ชื่อ element ของเวอร์ชันที่ใช้จริงเอง จะได้ไม่ต้องรู้เวอร์ชันที่ฝั่ง server
// ============================================================================

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lessonId = request.nextUrl.searchParams.get('lessonId');
  const courseId = request.nextUrl.searchParams.get('courseId');
  if (!lessonId || !courseId) {
    return NextResponse.json({ error: 'Missing lessonId or courseId' }, { status: 400 });
  }

  // [งานข้อ 08] ตัวตนผู้เรียน — LMS ที่ conform ต้องป้อน cmi.core.student_id/student_name ให้ SCO
  // เสมอ ไม่ว่าจะนับคะแนนครั้งนี้หรือไม่ (ดึงพร้อม role เดิมที่เช็คแอดมินอยู่แล้ว ไม่ต้อง query เพิ่ม)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle();
  const studentId = user.id;
  const studentName = profile?.full_name?.trim() || user.email || 'ผู้เรียน';

  // แอดมินเปิดพรีวิวไม่มี state ของตัวเอง ให้เริ่มใหม่ทุกครั้ง
  // (สอดคล้องกับ POST ที่ข้ามการบันทึกเมื่อ role === 'admin') — และ POST ไม่บันทึกผลจริงในเซสชันนี้
  // เลย จึงต้องบอก SCO ผ่าน credit/lesson_mode ว่าครั้งนี้ไม่นับคะแนน (งานข้อ 08)
  if (profile?.role === 'admin') {
    return NextResponse.json({ ...EMPTY_STATE, studentId, studentName, ...PREVIEW_MODE });
  }

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('student_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle();

  // ยังไม่ลงทะเบียน (หรือครูเปิดดู) — ไม่ error เพื่อให้ยังเปิดบทเรียนดูได้ แค่ไม่มี state เดิม
  // เหตุผลเดียวกับแอดมินข้างบน: POST หา enrollment ไม่เจอก็ไม่บันทึกผลอยู่ดี ต้องเป็น preview mode
  if (!enrollment) {
    return NextResponse.json({ ...EMPTY_STATE, studentId, studentName, ...PREVIEW_MODE });
  }

  const { data: row, error } = await supabase
    .from('scorm_tracking')
    .select('lesson_status, score_raw, suspend_data, completed_scos, cmi_data')
    .eq('enrollment_id', enrollment.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  if (error) {
    // อ่านไม่ได้ก็ให้เริ่มใหม่ ดีกว่าทำให้เปิดบทเรียนไม่ได้เลย — แต่ enrollment มีจริง (ผ่านเช็คข้างบน
    // มาแล้ว) จึงยังเป็นครั้งที่นับคะแนนตามปกติ ไม่ใช่ preview
    console.error('[scorm/tracking GET] lookup failed:', error.message);
    return NextResponse.json({ ...EMPTY_STATE, studentId, studentName, ...CREDIT_MODE });
  }

  if (!row) return NextResponse.json({ ...EMPTY_STATE, studentId, studentName, ...CREDIT_MODE });

  const suspendData = typeof row.suspend_data === 'string' ? row.suspend_data : '';
  const lessonStatus = normalizeLessonStatus(row.lesson_status);
  const scoreRaw =
    row.score_raw === null || row.score_raw === undefined ? '' : String(row.score_raw);
  const completedScos = Array.isArray(row.completed_scos) ? (row.completed_scos as string[]) : [];
  // [งานข้อ 02] ก้อน CMI เต็มจาก commit ล่าสุด — ให้ฝั่ง client ใช้แทน buildCmiJson ถ้ามี
  // (แถวเก่าก่อนงานข้อ 02 หรือคอลัมน์ยังไม่มี จะได้ null/undefined กลับไป แล้ว client fallback เอง)
  const cmiData =
    row.cmi_data && typeof row.cmi_data === 'object' ? (row.cmi_data as Record<string, unknown>) : null;

  // ใช้ตัดสินว่า cmi.core.entry ควรเป็น 'resume' หรือ 'ab-initio'
  const hasPriorAttempt =
    suspendData.length > 0 || lessonStatus !== 'not attempted' || completedScos.length > 0;

  // [งานข้อ 20] ไม่มีคอลัมน์ lesson_location แยกใน DB (ไม่จำเป็นต้องมี) — ดึงจาก cmi_data
  // เต็มก้อนแทน เป็น fallback เผื่อกรณีที่ page.tsx ยังไม่มี cmi_data เต็มก้อนให้ใช้ตรงๆ
  const lessonLocation = extractLessonLocationFromCmi(cmiData);

  return NextResponse.json({
    hasPriorAttempt,
    lessonStatus,
    scoreRaw,
    suspendData,
    lessonLocation,
    completedScos,
    cmiData,
    studentId,
    studentName,
    ...CREDIT_MODE,
  });
}