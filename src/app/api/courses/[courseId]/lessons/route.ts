// src/app/api/courses/[courseId]/lessons/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface LessonRow {
  id: string;
  title: string;
  order_index: number;
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
    .select('id, title, order_index, lessons(id, title, order_index)')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true });

  const lessons = (modules ?? [])
    .flatMap((moduleRow) => {
      const moduleLessons = (moduleRow.lessons ?? []) as LessonRow[];
      return [...moduleLessons]
        .sort((a, b) => a.order_index - b.order_index)
        .map((lesson) => ({ ...lesson, moduleTitle: moduleRow.title }));
    });

  // แอดมินไม่มี enrollment → คืนรายชื่อเลสสันเฉยๆ ไม่ต้องมี progress
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'admin') {
    return NextResponse.json({
      lessons: lessons.map((l) => ({ id: l.id, title: l.title, moduleTitle: l.moduleTitle, completed: false })),
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

  const { data: tracking } = await supabase
    .from('scorm_tracking')
    .select('lesson_id, lesson_status')
    .eq('enrollment_id', enrollment.id);

  const statusByLesson = new Map<string, string | null>();
  for (const t of tracking ?? []) {
    statusByLesson.set(t.lesson_id, t.lesson_status);
  }

  return NextResponse.json({
    lessons: lessons.map((l) => {
      const status = statusByLesson.get(l.id) ?? null;
      return {
        id: l.id,
        title: l.title,
        moduleTitle: l.moduleTitle,
        completed: status === 'completed' || status === 'passed',
      };
    }),
  });
}
