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

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'admin') {
    return NextResponse.json({ lastPositionSeconds: 0 });
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
    return NextResponse.json({ lastPositionSeconds: 0 });
  }

  const { data: progress } = await supabase
    .from('lesson_watch_progress')
    .select('last_position_seconds')
    .eq('student_id', user.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  return NextResponse.json({ lastPositionSeconds: progress?.last_position_seconds ?? 0 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'admin') {
    // แอดมินพรีวิวเลสสัน ไม่ต้องบันทึกตำแหน่ง
    return NextResponse.json({ ok: true });
  }

  let body: { positionSeconds?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const positionSeconds = Number(body.positionSeconds);
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
    return NextResponse.json({ error: 'Invalid positionSeconds' }, { status: 400 });
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
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
  }

  const { error: upsertError } = await supabase
    .from('lesson_watch_progress')
    .upsert(
      {
        student_id: user.id,
        lesson_id: lessonId,
        last_position_seconds: positionSeconds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,lesson_id' }
    );

  if (upsertError) {
    console.error('[watch-position POST] upsert failed:', upsertError.message);
    return NextResponse.json({ error: 'Failed to save position' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}