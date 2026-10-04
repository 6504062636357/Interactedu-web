import { createClient } from "@/utils/supabase/server";
import { getResumeSeconds, type StudentTracking } from "@/lib/courses/student-progress";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const courseId = url.searchParams.get("courseId");
  const lessonId = url.searchParams.get("lessonId");
  if (!courseId || !UUID.test(courseId) || !lessonId || !UUID.test(lessonId)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: profile }, { data: course }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("courses").select("created_by").eq("id", courseId).maybeSingle(),
  ]);
  if (profile?.role === "admin" || course?.created_by === user.id) {
    return Response.json({ maxWatchedSeconds: 0, preview: true });
  }

  const { data: enrollment, error: enrollmentError } = await supabase.from("enrollments")
    .select("id")
    .eq("student_id", user.id)
    .eq("course_id", courseId)
    .eq("status", "approved")
    .or(`access_expires_at.is.null,access_expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();
  if (enrollmentError) return Response.json({ error: "Could not load enrollment" }, { status: 500 });
  if (!enrollment) return Response.json({ error: "Forbidden" }, { status: 403 });

  const [watchResult, trackingResult] = await Promise.all([
    supabase.from("student_video_watch_progress")
      .select("max_watched_seconds")
      .eq("enrollment_id", enrollment.id)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
    supabase.from("scorm_tracking")
      .select("cmi_data, lesson_status, video_completed")
      .eq("enrollment_id", enrollment.id)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
  ]);
  if (watchResult.error || trackingResult.error) {
    const error = watchResult.error ?? trackingResult.error;
    console.error("[video watch progress] read", error?.code, error?.message);
    return Response.json({ error: "Could not load video watch progress" }, { status: 500 });
  }

  // Learners who started before the seek guard existed have a saved SCORM
  // location but no watch-progress row. Honor that existing resume point.
  const tracking = trackingResult.data;
  const resumeSeconds = getResumeSeconds(tracking ? {
    lesson_id: lessonId,
    cmi_data: tracking.cmi_data,
    lesson_status: tracking.lesson_status,
    video_completed: tracking.video_completed,
  } as StudentTracking : undefined);
  return Response.json({ maxWatchedSeconds: Math.max(Number(watchResult.data?.max_watched_seconds) || 0, resumeSeconds) });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request" }, { status: 400 });

  const { courseId, lessonId, positionSeconds, active } = body as Record<string, unknown>;
  if (typeof courseId !== "string" || !UUID.test(courseId)
    || typeof lessonId !== "string" || !UUID.test(lessonId)
    || typeof positionSeconds !== "number" || !Number.isFinite(positionSeconds)
    || positionSeconds < 0 || positionSeconds > 86400 || typeof active !== "boolean") {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("record_student_video_watch_progress", {
    p_course_id: courseId,
    p_lesson_id: lessonId,
    p_position_seconds: positionSeconds,
    p_active: active,
  });
  if (error) {
    if (error.code === "42501") return Response.json({ error: "Forbidden" }, { status: 403 });
    console.error("[video watch progress] write", error.code, error.message);
    return Response.json({ error: "Could not save video watch progress" }, { status: 500 });
  }

  return Response.json({ maxWatchedSeconds: Number(data) || 0 });
}
