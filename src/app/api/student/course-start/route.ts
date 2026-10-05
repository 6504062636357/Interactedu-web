import { createClient } from "@/utils/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request" }, { status: 400 });
  const { courseId, lessonId } = body as Record<string, unknown>;
  if (typeof courseId !== "string" || !UUID.test(courseId) || typeof lessonId !== "string" || !UUID.test(lessonId)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile) return Response.json({ error: "Could not verify user" }, { status: 503 });
  if (profile.role === "admin" || profile.role === "teacher") return Response.json({ started: false, preview: true });
  if (profile.role !== "student") return Response.json({ error: "Forbidden" }, { status: 403 });

  // The RPC checks active account, enrollment ownership/expiry and the
  // published lesson in the same transaction as the first-start notification.
  const { data, error } = await supabase.rpc("start_course_learning", { p_course_id: courseId, p_lesson_id: lessonId });
  if (error) {
    if (error.code === "42501") return Response.json({ error: "Forbidden" }, { status: 403 });
    console.warn("[course start]", error.code, error.message);
    return Response.json({ error: "Could not record course start" }, { status: 503 });
  }
  return Response.json({ started: data === true });
}
