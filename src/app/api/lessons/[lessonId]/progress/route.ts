// // src/app/api/lessons/[lessonId]/progress/route.ts
// import { NextRequest, NextResponse } from 'next/server';
// import { createClient } from '@/utils/supabase/server';

// export async function GET(
//   request: NextRequest,
//   { params }: { params: Promise<{ lessonId: string }> }
// ) {
//   const { lessonId } = await params;
//   const supabase = await createClient();

//   const { data: { user } } = await supabase.auth.getUser();
//   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

//   // แอดมินไม่มี enrollment → คืนค่า default ไม่ error
//   const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
//   if (profile?.role === 'admin') {
//     return NextResponse.json({ videoCompleted: false, quizPassed: false });
//   }

//   const { data: lesson } = await supabase
//     .from('lessons')
//     .select('course_id')
//     .eq('id', lessonId)
//     .maybeSingle();

//   if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

//   const { data: enrollment } = await supabase
//     .from('enrollments')
//     .select('id')
//     .eq('student_id', user.id)
//     .eq('course_id', lesson.course_id)
//     .maybeSingle();

//   if (!enrollment) {
//     return NextResponse.json({ videoCompleted: false, quizPassed: false });
//   }

//   const { data: tracking } = await supabase
//     .from('scorm_tracking')
//     .select('video_completed, quiz_passed')
//     .eq('enrollment_id', enrollment.id)
//     .eq('lesson_id', lessonId)
//     .maybeSingle();

//   return NextResponse.json({
//     videoCompleted: tracking?.video_completed ?? false,
//     quizPassed: tracking?.quiz_passed ?? false,
//   });
// }
// src/app/api/lessons/[lessonId]/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // แอดมินไม่มี enrollment → คืนค่า default ไม่ error
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'admin') {
    return NextResponse.json({ videoCompleted: false, quizPassed: false, completedScos: [] });
  }

  const { data: lesson } = await supabase
    .from('lessons')
    .select('course_id')
    .eq('id', lessonId)
    .maybeSingle();

  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('student_id', user.id)
    .eq('course_id', lesson.course_id)
    .maybeSingle();

  if (!enrollment) {
    return NextResponse.json({ videoCompleted: false, quizPassed: false, completedScos: [] });
  }

  const { data: tracking } = await supabase
    .from('scorm_tracking')
    .select('video_completed, quiz_passed, completed_scos')
    .eq('enrollment_id', enrollment.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  return NextResponse.json({
    videoCompleted: tracking?.video_completed ?? false,
    quizPassed: tracking?.quiz_passed ?? false,
    completedScos: Array.isArray(tracking?.completed_scos) ? tracking.completed_scos : [],
  });
}