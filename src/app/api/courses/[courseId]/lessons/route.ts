// src/app/api/courses/[courseId]/lessons/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isLessonComplete } from '@/lib/courses/student-progress';

interface LessonRow {
  id: string;
  title: string;
  order_index: number;
  is_published: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: modules } = await supabase
    .from('modules')
    .select('id, title, order_index, lessons(id, title, order_index, is_published)')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true });

  const allLessons = (modules ?? [])
    .flatMap((moduleRow) => {
      const moduleLessons = (moduleRow.lessons ?? []) as LessonRow[];
      return [...moduleLessons]
        .sort((a, b) => a.order_index - b.order_index)
        .map((lesson) => ({ ...lesson, moduleTitle: moduleRow.title }));
    });

  // แอดมินไม่มี enrollment → คืนรายชื่อเลสสันเฉยๆ ไม่ต้องมี progress — เห็นครบทุกบท (รวมที่ยัง
  // ไม่ publish) เพราะแอดมินต้องใช้หน้านี้ตรวจสอบ/จัดการคอร์สได้ ไม่ใช่มุมมองของผู้เรียน
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'admin') {
    return NextResponse.json({
      lessons: allLessons.map((l) => ({ id: l.id, title: l.title, moduleTitle: l.moduleTitle, completed: false })),
    });
  }

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('student_id', user.id)
    .eq('course_id', courseId)
    .eq('status', 'approved')
    .maybeSingle();

  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
  }

  // กรองบทเรียนที่ยังไม่ publish (ครูสร้างค้างไว้/แก้ไขแล้วยังไม่ผ่านการอนุมัติ generate) ออก
  // ก่อนส่งให้นักเรียน — เดิมไม่กรองเลย ทำให้บทเรียนที่ไม่มีแพ็กเกจ SCORM จริง (scorm_entry_point
  // เป็น null) โผล่ในเมนูนักเรียนทันทีที่ครูกด "สร้างบทเรียนใหม่" กดเข้าไปแล้วเจอหน้าโหลดไม่ขึ้น/error
  // ทันที เพราะไม่มีอะไรให้เล่นจริง — is_published ถูกตั้งเป็น true ก็ต่อเมื่อ generateScormPackage()
  // สร้างแพ็กเกจสำเร็จแล้วเท่านั้น (ดู lib/scorm/generate.ts ท้ายฟังก์ชัน)
  const lessons = allLessons.filter((l) => l.is_published);

  const { data: tracking } = await supabase
    .from('scorm_tracking')
    .select('lesson_id, lesson_status, video_completed')
    .eq('enrollment_id', enrollment.id);

  const completedByLesson = new Map<string, boolean>();
  for (const t of tracking ?? []) {
    completedByLesson.set(t.lesson_id, isLessonComplete(t));
  }

  return NextResponse.json({
    lessons: lessons.map((l) => {
      return {
        id: l.id,
        title: l.title,
        moduleTitle: l.moduleTitle,
        completed: completedByLesson.get(l.id) ?? false,
      };
    }),
  });
}
