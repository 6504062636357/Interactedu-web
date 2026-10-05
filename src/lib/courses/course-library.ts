import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadSavedCourseEnrollments(supabase: SupabaseClient, studentId: string) {
  const { data, error } = await supabase.from("student_course_library")
    .select("enrollment_id").eq("student_id", studentId);
  if (error) {
    console.warn("[course library]", error.code, error.message);
    return {
      enrollmentIds: new Set<string>(),
      ready: false,
      error: "โหลดรายการคอร์สที่เก็บไว้ไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
    };
  }
  return {
    enrollmentIds: new Set<string>((data ?? []).map((row) => row.enrollment_id as string)),
    ready: true,
    error: null,
  };
}
