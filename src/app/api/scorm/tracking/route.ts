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
    const { lessonId, courseId, lessonStatus, scoreRaw, suspendData } = body;

    // 1. หา enrollment_id ของนักเรียนคนนี้ในคอร์สนี้ก่อน
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .single();

    if (!enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });

    // 2. ทำการ Upsert (ถ้าไม่มีให้สร้างใหม่ ถ้ามีแล้วให้บันทึกทับ) ลงตาราง tracking
    const { error: upsertError } = await supabase
      .from('scorm_tracking')
      .upsert({
        enrollment_id: enrollment.id,
        lesson_id: lessonId,
        lesson_status: lessonStatus,
        score_raw: scoreRaw,
        suspend_data: suspendData,
        last_accessed: new Date().toISOString()
      }, {
        onConflict: 'enrollment_id,lesson_id' // มั่นใจว่า 1 คน ต่อ 1 บทเรียน จะมีแค่ 1 แถวข้อมูล
      });

    if (upsertError) throw upsertError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Tracking Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}