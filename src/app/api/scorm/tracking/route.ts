// // src/app/api/scorm/tracking/route.ts
// import { NextRequest, NextResponse } from 'next/server';
// import { createClient } from '@/utils/supabase/server';

// export async function POST(request: NextRequest) {
//   const supabase = await createClient();
//   const { data: { user } } = await supabase.auth.getUser();
//   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

//   // กันไม่ให้แอดมิน (ที่เปิดดู preview) บันทึกคะแนน/ความคืบหน้าปนกับนักเรียนจริง
//   const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
//   if (profile?.role === 'admin') {
//     return NextResponse.json({ success: true, skipped: 'admin preview mode' });
//   }

//   try {
//     const body = await request.json();
//     const { lessonId, courseId, lessonStatus, scoreRaw, suspendData, scoType } = body;
//     // scoType: "lesson" | "quiz" — บอกว่า commit นี้มาจาก SCO ไหน

//     // 1. หา enrollment ของนักเรียนคนนี้ในคอร์สนี้
//     const { data: enrollment } = await supabase
//       .from('enrollments')
//       .select('id')
//       .eq('student_id', user.id)
//       .eq('course_id', courseId)
//       .single();

//     if (!enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });

//     // 2. ดึงแถวเดิม (ถ้ามี) เพื่อ merge สถานะ ไม่ให้ SCO นึงเขียนทับอีก SCO
//     const { data: existing } = await supabase
//       .from('scorm_tracking')
//       .select('video_completed, quiz_passed')
//       .eq('enrollment_id', enrollment.id)
//       .eq('lesson_id', lessonId)
//       .maybeSingle();

//     const videoCompleted =
//       scoType === 'lesson'
//         ? lessonStatus === 'completed' || existing?.video_completed || false
//         : existing?.video_completed ?? false;

//     const quizPassed =
//       scoType === 'quiz'
//         ? lessonStatus === 'passed' || existing?.quiz_passed || false
//         : existing?.quiz_passed ?? false;

//     // 3. Upsert แถวเดียวต่อ 1 lesson แต่ merge สถานะจากทั้งสอง SCO แทนที่จะทับกัน
//     const { error: upsertError } = await supabase
//       .from('scorm_tracking')
//       .upsert({
//         enrollment_id: enrollment.id,
//         lesson_id: lessonId,
//         lesson_status: lessonStatus,
//         score_raw: scoreRaw,
//         suspend_data: suspendData,
//         video_completed: videoCompleted,
//         quiz_passed: quizPassed,
//         last_accessed: new Date().toISOString(),
//       }, {
//         onConflict: 'enrollment_id,lesson_id',
//       });

//     if (upsertError) throw upsertError;

//     return NextResponse.json({ success: true });
//   } catch (error: any) {
//     console.error('Tracking Sync Error:', error);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }

// src/app/api/scorm/tracking/route.ts
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
  quiz_score_recorded?: boolean | null;
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
    const { lessonId, courseId, lessonStatus, suspendData, scoType, scoIdentifier } = body;
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
      .select('video_completed, quiz_passed, completed_scos, score_raw, quiz_score_recorded')
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
        .select('video_completed, quiz_passed, completed_scos, score_raw')
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
      .select('title, scorm_manifest')
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

    // Final scores are written by /final-quiz after grading against database
    // choices. Never overwrite that trusted result with a browser-supplied score.
    const quizPassed = supportsTrustedQuizFlag
      ? existing?.quiz_score_recorded
        ? existing.quiz_passed ?? false
        : false
      : existing?.quiz_passed ?? false;

    // 4. Upsert แถวเดียวต่อ 1 lesson แต่ merge completed_scos + derive lesson_status ให้ถูกต้อง
    const { error: upsertError } = await supabase
      .from('scorm_tracking')
      .upsert({
        enrollment_id: enrollment.id,
        lesson_id: lessonId,
        lesson_status: derivedLessonStatus,
        score_raw: existing?.score_raw ?? null,
        suspend_data: suspendData,
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
