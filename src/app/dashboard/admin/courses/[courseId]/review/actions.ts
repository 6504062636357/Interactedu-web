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
    // หมายเหตุ: generateScormPackage อัปเดต lessons (is_scorm, scorm_entry_point,
    // scorm_version, scorm_manifest) ให้ครบอยู่แล้วภายในตัวมันเอง ไม่ต้อง update ซ้ำตรงนี้
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
  // หมายเหตุ: generateScormPackage อัปเดต lessons ให้ครบอยู่แล้ว (รวม scorm_entry_point
  // ที่ต้องเป็น "lesson.html" ไม่ใช่ "index.html") ไม่ต้อง update ซ้ำตรงนี้

  revalidatePath("/dashboard/admin/courses");
  return {};
}

export async function approveLesson(draftId: string, lessonId: string): Promise<{ error?: string }> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const genResult = await generateScormPackage(supabase, draftId, lessonId);
  if ("error" in genResult) {
    return { error: `สร้างไฟล์ SCORM ไม่สำเร็จ: ${genResult.error}` };
  }

  const { data: updatedDraft, error: draftUpdateError } = await supabase
    .from("lesson_drafts")
    .update({ status: "approved", reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
    .eq("id", draftId)
    .select()
    .single();

  if (draftUpdateError || !updatedDraft) {
    console.error("[approveLesson] draft status update failed:", draftUpdateError);
    return { error: "อัปเดตสถานะ draft ไม่สำเร็จ (อาจติด RLS)" };
  }

  // ดึง course_id ของ lesson นี้ เพื่อ revalidate หน้า review และเช็คว่าควร publish คอร์สหรือยัง
  const { data: lessonRow } = await supabase
    .from("lessons")
    .select("course_id")
    .eq("id", lessonId)
    .maybeSingle();

  if (lessonRow?.course_id) {
    const courseId = lessonRow.course_id;

    // ดึงทุก lesson + draft ล่าสุดของคอร์สนี้ เพื่อเช็คว่าทุกบทอนุมัติครบหรือยัง
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id, lesson_drafts(id, status, created_at)")
      .eq("course_id", courseId);

    if (lessons && lessons.length > 0) {
      const allApproved = lessons.every((lesson) => {
        const drafts =
          (lesson as unknown as { lesson_drafts: { id: string; status: string; created_at: string }[] })
            .lesson_drafts ?? [];
        // เอา draft ล่าสุดของแต่ละบท (เรียงตาม created_at)
        const sorted = [...drafts].sort(
          (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
        );
        return sorted[0]?.status === "approved";
      });

      if (allApproved) {
        const { error: courseUpdateError } = await supabase
          .from("courses")
          .update({ status: "published" })
          .eq("id", courseId);

        if (courseUpdateError) {
          console.error("[approveLesson] course status update failed:", courseUpdateError);
          // ไม่ return error ตรงนี้ เพราะ lesson อนุมัติสำเร็จแล้ว แค่ course status อัปเดตไม่ทัน
        }
      }
    }

    revalidatePath(`/dashboard/admin/courses/${courseId}/review`);
  }
  revalidatePath("/dashboard/admin/courses");
  return {};
}

export async function rejectLesson(draftId: string, reason: string): Promise<{ error?: string }> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError) return { error: authError };
  if (!reason.trim()) return { error: "กรุณาระบุเหตุผลที่ปฏิเสธ" };

  const { data: updatedDraft, error: draftError } = await supabase
    .from("lesson_drafts")
    .update({
      status: "rejected",
      rejection_reason: reason.trim(),
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .select("*, lessons(course_id)")
    .single();

  if (draftError || !updatedDraft) {
    console.error("[rejectLesson] draft reject failed:", draftError);
    return { error: "ปฏิเสธ draft ไม่สำเร็จ" };
  }

  // ถ้าคอร์สนี้เคย publish ไปแล้ว แต่มีบทถูก reject ภายหลัง ให้ดึงกลับเป็น pending
  const courseId = (updatedDraft as unknown as { lessons: { course_id: string } }).lessons?.course_id;
  if (courseId) {
    const { data: course } = await supabase
      .from("courses")
      .select("status")
      .eq("id", courseId)
      .maybeSingle();

    if (course?.status === "published") {
      await supabase.from("courses").update({ status: "pending" }).eq("id", courseId);
    }
    revalidatePath(`/dashboard/admin/courses/${courseId}/review`);
  }

  revalidatePath("/dashboard/admin/courses");
  return {};
}