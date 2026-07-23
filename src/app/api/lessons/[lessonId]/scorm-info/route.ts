// src/app/api/lessons/[lessonId]/scorm-info/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const { data: lesson, error } = await supabase
    .from('lessons')
    .select('is_scorm, scorm_entry_point, scorm_version, scorm_manifest')
    .eq('id', lessonId)
    .single();

  if (error || !lesson) {
    return NextResponse.json({ error: 'ไม่พบบทเรียนนี้' }, { status: 404 });
  }

  if (!lesson.is_scorm) {
    return NextResponse.json({ error: 'บทเรียนนี้ไม่ใช่ SCORM' }, { status: 400 });
  }

  return NextResponse.json({
    entryPoint: lesson.scorm_entry_point,
    scormVersion: lesson.scorm_version,
    manifest: lesson.scorm_manifest ?? null, // { organizationTitle, items: [...] } หรือ null ถ้าเป็นแพ็กเกจเก่าที่ยังไม่มี manifest เก็บไว้
  });
}