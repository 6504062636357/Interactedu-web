import { createClient } from "@/utils/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "ข้อมูลคอร์สไม่ถูกต้อง" }, { status: 400 });
  }
  const courseId = body && typeof body === "object" ? (body as Record<string, unknown>).courseId : null;
  if (typeof courseId !== "string" || !UUID.test(courseId)) {
    return Response.json({ error: "ข้อมูลคอร์สไม่ถูกต้อง" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  // This scoped RPC checks role, active account, ownership, publication and
  // unexpired Plus access. Saving never updates enrollment or learning state.
  const { error } = await supabase.rpc("save_course_to_library", { p_course_id: courseId });
  if (error) {
    if (error.code === "42501") return Response.json({ error: "ไม่มีสิทธิ์เพิ่มคอร์สนี้ กรุณาตรวจสอบแพ็กเกจของคุณ" }, { status: 403 });
    console.warn("[save course]", error.code, error.message);
    return Response.json({ error: "ยังเพิ่มคอร์สไม่ได้ กรุณาลองใหม่ภายหลัง" }, { status: 503 });
  }
  return Response.json({ saved: true });
}
