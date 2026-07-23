//หน้าที่แอดมินเอาไว้ดูว่าจะอนัมัติคอสไหม

"use server";

import { createClient } from "@/utils/supabase/server";
import { generateScormPackage } from "@/lib/scorm/generate";
import { revalidatePath } from "next/cache";

// app/admin/review/[draftId]/actions.ts
export async function approveDraft(draftId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { error: "ไม่มีสิทธิ์ดำเนินการ" };

  const { data: draft, error: draftError } = await supabase
    .from("lesson_drafts")
    .select("id, lesson_id, status, lessons(id, course_id, module_id, title)")
    .eq("id", draftId)
    .single();

  if (draftError || !draft || !draft.lessons) {
    console.error("[approveDraft] draft fetch failed", draftError);
    return { error: "ไม่พบ draft นี้" };
  }
  if (draft.status !== "pending_review") {
    return { error: "draft นี้ยังไม่ถูกส่งตรวจสอบ หรือถูกดำเนินการไปแล้ว" };
  }

  const lessonId = draft.lesson_id as string;

  const generateResult = await generateScormPackage(supabase, draftId, lessonId);
  if ("error" in generateResult) {
    return { error: `สร้างไฟล์ SCORM ไม่สำเร็จ: ${generateResult.error}` };
  }

  // ✅ เช็ค error ของ lessons update ด้วย (เดิมไม่เช็คเลย)
  const { error: lessonUpdateError } = await supabase
    .from("lessons")
    .update({ is_scorm: true, scorm_entry_point: "index.html", scorm_version: "1.2" })
    .eq("id", lessonId);

  if (lessonUpdateError) {
    console.error("[approveDraft] lesson update failed:", lessonUpdateError);
    return { error: `อัปเดต lesson ไม่สำเร็จ: ${lessonUpdateError.message}` };
  }

  // ✅ เพิ่ม .select() เพื่อจับกรณี RLS บล็อกแบบเงียบๆ
  const { data: updatedRows, error: updateError } = await supabase
    .from("lesson_drafts")
    .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", draftId)
    .select();

  if (updateError) {
    console.error("[approveDraft] draft status update failed:", updateError);
    return { error: `อัปเดตสถานะ draft ไม่สำเร็จ: ${updateError.message}` };
  }

  if (!updatedRows || updatedRows.length === 0) {
    console.error("[approveDraft] no rows updated — likely blocked by RLS");
    return { error: "อัปเดตสถานะ draft ไม่สำเร็จ: อาจไม่มีสิทธิ์ (RLS) หรือไม่พบ draft" };
  }

  revalidatePath("/admin/review");
  return {};
}

export async function rejectDraft(draftId: string, reason: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { error: "ไม่มีสิทธิ์ดำเนินการ" };

  if (!reason.trim()) return { error: "กรุณาระบุเหตุผลที่ปฏิเสธ" };

  const { error } = await supabase
    .from("lesson_drafts")
    .update({
      status: "rejected",
      rejection_reason: reason.trim(),
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("status", "submitted");

  if (error) {
    console.error("Failed to reject draft:", error.message);
    return { error: "ปฏิเสธ draft ไม่สำเร็จ" };
  }

  revalidatePath("/admin/review");
  return {};
}