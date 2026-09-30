import { createClient } from "@/utils/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { courseId, lessonId, active } = body as Record<string, unknown>;
  if (typeof courseId !== "string" || !UUID.test(courseId) || typeof lessonId !== "string" || !UUID.test(lessonId) || typeof active !== "boolean") {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("record_student_study_time", {
    p_course_id: courseId,
    p_lesson_id: lessonId,
    p_active: active,
  });
  if (error) {
    if (error.code === "42501") return Response.json({ error: "Forbidden" }, { status: 403 });
    console.error("[student study time]", error.code, error.message);
    return Response.json({ error: "Could not save study time" }, { status: 500 });
  }

  return Response.json({ totalSeconds: Number(data) || 0 });
}
