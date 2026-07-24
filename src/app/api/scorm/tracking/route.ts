// src/app/api/scorm/tracking/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

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
    const { lessonId, courseId, lessonStatus, scoreRaw, suspendData, scoType } = body;
    // scoType: "lesson" | "quiz" — บอกว่า commit นี้มาจาก SCO ไหน

    // 1. หา enrollment ของนักเรียนคนนี้ในคอร์สนี้
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('student_id', user.id)
      .eq('course_id', courseId)
      .single();

    if (!enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });

    // 2. ดึงแถวเดิม (ถ้ามี) เพื่อ merge สถานะ ไม่ให้ SCO นึงเขียนทับอีก SCO
    const { data: existing } = await supabase
      .from('scorm_tracking')
      .select('video_completed, quiz_passed')
      .eq('enrollment_id', enrollment.id)
      .eq('lesson_id', lessonId)
      .maybeSingle();

    const videoCompleted =
      scoType === 'lesson'
        ? lessonStatus === 'completed' || existing?.video_completed || false
        : existing?.video_completed ?? false;

    const quizPassed =
      scoType === 'quiz'
        ? lessonStatus === 'passed' || existing?.quiz_passed || false
        : existing?.quiz_passed ?? false;

    // 3. Upsert แถวเดียวต่อ 1 lesson แต่ merge สถานะจากทั้งสอง SCO แทนที่จะทับกัน
    const { error: upsertError } = await supabase
      .from('scorm_tracking')
      .upsert({
        enrollment_id: enrollment.id,
        lesson_id: lessonId,
        lesson_status: lessonStatus,
        score_raw: scoreRaw,
        suspend_data: suspendData,
        video_completed: videoCompleted,
        quiz_passed: quizPassed,
        last_accessed: new Date().toISOString(),
      }, {
        onConflict: 'enrollment_id,lesson_id',
      });

    if (upsertError) throw upsertError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Tracking Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}