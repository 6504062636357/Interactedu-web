// // src/app/api/lessons/[lessonId]/scorm-info/route.ts
// import { NextRequest, NextResponse } from 'next/server';
// import { createClient } from '@/utils/supabase/server';

// export async function GET(
//   request: NextRequest,
//   { params }: { params: Promise<{ lessonId: string }> }
// ) {
//   const { lessonId } = await params;
//   const supabase = await createClient();

//   const { data: lesson, error } = await supabase
//     .from('lessons')
//     .select('is_scorm, scorm_entry_point, scorm_version, scorm_manifest')
//     .eq('id', lessonId)
//     .single();

//   if (error || !lesson) {
//     return NextResponse.json({ error: 'ไม่พบบทเรียนนี้' }, { status: 404 });
//   }

//   if (!lesson.is_scorm) {
//     return NextResponse.json({ error: 'บทเรียนนี้ไม่ใช่ SCORM' }, { status: 400 });
//   }

//   return NextResponse.json({
//     entryPoint: lesson.scorm_entry_point,
//     scormVersion: lesson.scorm_version,
//     manifest: lesson.scorm_manifest ?? null, // { organizationTitle, items: [...] } หรือ null ถ้าเป็นแพ็กเกจเก่าที่ยังไม่มี manifest เก็บไว้
//   });
// }

// src/app/api/lessons/[lessonId]/scorm-info/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const supabase = await createClient();

  // TODO: ถ้า schema จริงไม่ใช่ lessons.course_id ตรงๆ (เช่นต้องผ่าน chapters/modules)
  // ให้แก้ .select() ตรงนี้เป็น join แบบ:
  //   'title, is_scorm, scorm_entry_point, scorm_version, scorm_manifest, chapters(course_id, courses(title))'
  // แล้วดึง courseTitle จาก lesson.chapters.courses.title แทน
  const { data: lesson, error } = await supabase
    .from('lessons')
    .select('title, is_scorm, scorm_entry_point, scorm_version, scorm_manifest, course_id, courses(title)')
    .eq('id', lessonId)
    .single();

  if (error || !lesson) {
    return NextResponse.json({ error: 'ไม่พบบทเรียนนี้' }, { status: 404 });
  }

  if (!lesson.is_scorm) {
    return NextResponse.json({ error: 'บทเรียนนี้ไม่ใช่ SCORM' }, { status: 400 });
  }

  // courses(title) จาก supabase join จะได้เป็น object เดี่ยวหรือ array แล้วแต่ความสัมพันธ์ที่ตั้งไว้ใน DB
  // เผื่อไว้ทั้งสองแบบกันพัง
  const coursesRel = (lesson as any).courses;
  const courseTitle = Array.isArray(coursesRel) ? coursesRel[0]?.title ?? null : coursesRel?.title ?? null;

  return NextResponse.json({
    courseTitle,
    lessonTitle: lesson.title ?? null,
    entryPoint: lesson.scorm_entry_point,
    scormVersion: lesson.scorm_version,
    manifest: lesson.scorm_manifest ?? null, // { organizationTitle, items: [...] } หรือ null ถ้าเป็นแพ็กเกจเก่าที่ยังไม่มี manifest เก็บไว้
  });
}