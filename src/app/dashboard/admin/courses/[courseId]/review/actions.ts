"use server";

import { createClient } from "@/utils/supabase/server";
import { generateScormPackage } from "@/lib/scorm/generate";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "กรุณาเข้าสู่ระบบก่อน" as const };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { supabase, error: "ไม่มีสิทธิ์ดำเนินการ" as const };

  return { supabase, user, error: null };
}

export async function approveCourse(courseId: string): Promise<{ error?: string }> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  // ดึงทุก lesson + draft ล่าสุดของคอร์สนี้
  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id, lesson_drafts(id, status)")
    .eq("course_id", courseId);

  if (lessonsError || !lessons) {
    console.error("[approveCourse] lessons fetch failed", lessonsError);
    return { error: "ไม่พบบทเรียนของคอร์สนี้" };
  }

  if (lessons.length === 0) {
    return { error: "คอร์สนี้ยังไม่มีบทเรียน" };
  }

  // เช็คว่าทุกบทมี draft ที่พร้อมอนุมัติ (submitted / pending_review)
  const pendingDrafts: { draftId: string; lessonId: string }[] = [];
  for (const lesson of lessons) {
    const drafts = (lesson as unknown as { id: string; lesson_drafts: { id: string; status: string }[] })
      .lesson_drafts;
    const readyDraft = drafts?.find((d) => d.status === "submitted" || d.status === "pending_review");
    if (!readyDraft) {
      return { error: "ยังมีบทเรียนที่ไม่มี draft ส่งตรวจ ไม่สามารถอนุมัติทั้งคอร์สได้" };
    }
    pendingDrafts.push({ draftId: readyDraft.id, lessonId: lesson.id });
  }

  // generate SCORM ให้ทุกบท
  for (const { draftId, lessonId } of pendingDrafts) {
    const genResult = await generateScormPackage(supabase, draftId, lessonId);
    if ("error" in genResult) {
      return { error: `สร้างไฟล์ SCORM ของบทเรียน ${lessonId} ไม่สำเร็จ: ${genResult.error}` };
    }

    const { error: lessonUpdateError } = await supabase
      .from("lessons")
      .update({ is_scorm: true, scorm_entry_point: "index.html", scorm_version: "1.2" })
      .eq("id", lessonId);

    if (lessonUpdateError) {
      console.error("[approveCourse] lesson update failed:", lessonUpdateError);
      return { error: `อัปเดตบทเรียนไม่สำเร็จ: ${lessonUpdateError.message}` };
    }
  }

  // อัปเดต draft ทุกอันเป็น approved
  const draftIds = pendingDrafts.map((d) => d.draftId);
  const { data: updatedDrafts, error: draftUpdateError } = await supabase
    .from("lesson_drafts")
    .update({ status: "approved", reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
    .in("id", draftIds)
    .select();

  if (draftUpdateError || !updatedDrafts || updatedDrafts.length !== draftIds.length) {
    console.error("[approveCourse] draft status update failed:", draftUpdateError);
    return { error: "อัปเดตสถานะ draft บางรายการไม่สำเร็จ (อาจติด RLS)" };
  }

  // อัปเดตสถานะคอร์สเป็น published
  const { error: courseUpdateError } = await supabase
    .from("courses")
    .update({ status: "published" })
    .eq("id", courseId);

  if (courseUpdateError) {
    console.error("[approveCourse] course status update failed:", courseUpdateError);
    return { error: `อัปเดตสถานะคอร์สไม่สำเร็จ: ${courseUpdateError.message}` };
  }

  revalidatePath("/dashboard/admin/courses");
  revalidatePath(`/dashboard/admin/courses/${courseId}/review`);
  return {};
}

export async function rejectCourse(courseId: string, reason: string): Promise<{ error?: string }> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  if (!reason.trim()) return { error: "กรุณาระบุเหตุผลที่ปฏิเสธ" };

  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id, lesson_drafts(id, status)")
    .eq("course_id", courseId);

  if (lessonsError || !lessons) {
    return { error: "ไม่พบบทเรียนของคอร์สนี้" };
  }

  const draftIds = lessons
    .flatMap(
      (l) => (l as unknown as { lesson_drafts: { id: string; status: string }[] }).lesson_drafts ?? []
    )
    .filter((d) => d.status === "submitted" || d.status === "pending_review")
    .map((d) => d.id);

  if (draftIds.length === 0) {
    return { error: "ไม่มี draft ที่รอตรวจสอบในคอร์สนี้" };
  }

  const { error: draftError } = await supabase
    .from("lesson_drafts")
    .update({
      status: "rejected",
      rejection_reason: reason.trim(),
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
    })
    .in("id", draftIds);

  if (draftError) {
    console.error("[rejectCourse] draft reject failed:", draftError);
    return { error: "ปฏิเสธ draft ไม่สำเร็จ" };
  }

  const { error: courseUpdateError } = await supabase
    .from("courses")
    .update({ status: "rejected" })
    .eq("id", courseId);

  if (courseUpdateError) {
    console.error("[rejectCourse] course status update failed:", courseUpdateError);
    return { error: `อัปเดตสถานะคอร์สไม่สำเร็จ: ${courseUpdateError.message}` };
  }

  revalidatePath("/dashboard/admin/courses");
  revalidatePath(`/dashboard/admin/courses/${courseId}/review`);
  return {};
}

export async function regenerateScormPackage(lessonId: string): Promise<{ error?: string }> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  // หา draft ล่าสุดของ lesson นี้ (ไม่จำกัดสถานะ เพราะถ้า approve ไปแล้ว draft จะเป็น "approved")
  const { data: draft, error: draftError } = await supabase
    .from("lesson_drafts")
    .select("id")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (draftError || !draft) {
    console.error("[regenerateScormPackage] draft fetch failed:", draftError);
    return { error: "ไม่พบฉบับร่างของบทเรียนนี้" };
  }

  const genResult = await generateScormPackage(supabase, draft.id, lessonId);
  if ("error" in genResult) {
    console.error("[regenerateScormPackage] generate failed:", genResult.error);
    return { error: `สร้าง SCORM ใหม่ไม่สำเร็จ: ${genResult.error}` };
  }

  const { error: lessonUpdateError } = await supabase
    .from("lessons")
    .update({ is_scorm: true, scorm_entry_point: "index.html", scorm_version: "1.2" })
    .eq("id", lessonId);

  if (lessonUpdateError) {
    console.error("[regenerateScormPackage] lesson update failed:", lessonUpdateError);
    return { error: `อัปเดตบทเรียนไม่สำเร็จ: ${lessonUpdateError.message}` };
  }

  revalidatePath("/dashboard/admin/courses");
  return {};
}