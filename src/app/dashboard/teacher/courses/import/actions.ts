// app/teacher/courses/import/actions.ts
"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// ---------- Types ----------

export interface ImportLessonRow {
  moduleName: string;
  lessonTitle: string;
  lessonDescription: string | null;
  order: number | null;
}

export interface ImportCourseMeta {
  title: string;
  courseCode: string;
  category: string;
  description: string | null;
  isFree: boolean;
  price: number;
}

export interface ImportLessonsInput {
  course: ImportCourseMeta;
  rows: ImportLessonRow[];
}

export interface ImportRowResult {
  moduleName: string;
  lessonTitle: string;
  lessonId?: string;
  draftId?: string;
  error?: string;
}

export interface ImportLessonsResult {
  courseId?: string;
  results: ImportRowResult[];
  error?: string; // error ระดับ course (เช่นสร้าง course ไม่สำเร็จ ทำให้ import ไม่เริ่มเลย)
}

// ---------- Helpers ----------

function slugify(input: string): string {
  return input
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ปัจจุบัน: สร้าง course ใหม่เสมอ (create-only MVP)
// ทีหลังถ้าต้อง import เข้า course เดิม แก้แค่ฟังก์ชันนี้ให้รับ existingCourseId แล้ว return เลย
async function resolveCourseId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  course: ImportCourseMeta
): Promise<{ courseId?: string; error?: string }> {
  if (!course.title.trim()) return { error: "กรุณาระบุชื่อคอร์สในไฟล์" };
  if (!course.courseCode.trim()) return { error: "กรุณาระบุรหัสวิชาในไฟล์" };
  if (!course.category.trim()) return { error: "กรุณาระบุหมวดวิชาในไฟล์" };

  const priceValue = course.isFree ? 0 : course.price;
  if (Number.isNaN(priceValue) || priceValue < 0) {
    return { error: "ราคาต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0" };
  }

  const slug = `${slugify(course.courseCode)}-${Date.now().toString(36)}`;

  const { data, error } = await supabase
    .from("courses")
    .insert({
      title: course.title.trim(),
      slug,
      description: course.description?.trim() || null,
      category: course.category.trim(),
      price: priceValue,
      cover_image_url: null,
      course_code: course.courseCode.trim().toUpperCase(),
      status: "draft",
      created_by: userId,
      certificate_enabled: false,
      certificate_pass_percentage: 0,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[importLessonsFromExcel] Failed to create course:", error?.message);
    return { error: error?.message ?? "สร้างคอร์สไม่สำเร็จ" };
  }

  return { courseId: data.id };
}

// ปัจจุบัน: สร้าง module ใหม่เสมอต่อ module_name หนึ่งชื่อ (ไม่ query เทียบของเดิม เพราะ course ใหม่เอี่ยม)
// ทีหลังถ้าต้อง merge เข้า module เดิม แก้แค่ฟังก์ชันนี้ให้ query หาชื่อซ้ำก่อน insert
async function resolveModuleId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: string,
  moduleName: string,
  orderIndex: number
): Promise<{ moduleId?: string; error?: string }> {
  const { data, error } = await supabase
    .from("modules")
    .insert({
      course_id: courseId,
      title: moduleName.trim() || `หมวดที่ ${orderIndex + 1}`,
      order_index: orderIndex,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[importLessonsFromExcel] Failed to create module:", error?.message);
    return { error: error?.message ?? `สร้างหมวด "${moduleName}" ไม่สำเร็จ` };
  }

  return { moduleId: data.id };
}

// ---------- Main ----------

export async function importLessonsFromExcel(input: ImportLessonsInput): Promise<ImportLessonsResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { results: [], error: "กรุณาเข้าสู่ระบบก่อน" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") {
    return { results: [], error: "ไม่มีสิทธิ์สร้างคอร์ส" };
  }

  if (input.rows.length === 0) {
    return { results: [], error: "ไม่พบข้อมูลบทเรียนในไฟล์" };
  }

  // 1. สร้าง course
  const { courseId, error: courseError } = await resolveCourseId(supabase, user.id, input.course);
  if (!courseId) {
    return { results: [], error: courseError };
  }

  // 2. จัดกลุ่มแถวตาม module_name ตามลำดับที่พบในไฟล์ (คงลำดับเดิม ไม่ sort ใหม่)
  const moduleOrder: string[] = [];
  const rowsByModule = new Map<string, ImportLessonRow[]>();

  for (const row of input.rows) {
    const key = row.moduleName.trim() || "บทเรียนทั่วไป";
    if (!rowsByModule.has(key)) {
      rowsByModule.set(key, []);
      moduleOrder.push(key);
    }
    rowsByModule.get(key)!.push(row);
  }

  const results: ImportRowResult[] = [];

  // 3. สร้าง module ทีละกลุ่ม แล้ว insert lesson + lesson_draft ทีละแถวในกลุ่มนั้น
  for (let mIndex = 0; mIndex < moduleOrder.length; mIndex++) {
    const moduleName = moduleOrder[mIndex];
    const rows = rowsByModule.get(moduleName)!;

    const { moduleId, error: moduleError } = await resolveModuleId(supabase, courseId, moduleName, mIndex);

    if (!moduleId) {
      // ทั้ง module นี้ล้มเหลว บันทึก error ต่อแถวไว้ แล้วไปกลุ่มถัดไป (ไม่ตัดทั้ง import)
      for (const row of rows) {
        results.push({ moduleName, lessonTitle: row.lessonTitle, error: moduleError });
      }
      continue;
    }

    const sortedRows = [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (let lIndex = 0; lIndex < sortedRows.length; lIndex++) {
      const row = sortedRows[lIndex];

      if (!row.lessonTitle.trim()) {
        results.push({ moduleName, lessonTitle: row.lessonTitle, error: "ไม่มีชื่อบทเรียน" });
        continue;
      }

      // 3a. สร้าง lesson (ตาม pattern saveLessonDraft: video_url เป็น null รอครูอัปโหลดทีหลัง)
      const { data: lesson, error: lessonError } = await supabase
        .from("lessons")
        .insert({
          module_id: moduleId,
          course_id: courseId,
          title: row.lessonTitle.trim(),
          video_url: null,
          order_index: lIndex,
        })
        .select("id")
        .single();

      if (lessonError || !lesson) {
        console.error("[importLessonsFromExcel] Failed to create lesson:", lessonError?.message);
        results.push({ moduleName, lessonTitle: row.lessonTitle, error: "สร้างบทเรียนไม่สำเร็จ" });
        continue;
      }

      // 3b. สร้าง draft ผูกกับ lesson (status: draft — เหมือน flow ปกติ)
      const { data: draft, error: draftError } = await supabase
        .from("lesson_drafts")
        .insert({
          lesson_id: lesson.id,
          teacher_id: user.id,
          video_url: null,
          content_html: row.lessonDescription ?? "",
          status: "draft",
        })
        .select("id")
        .single();

      if (draftError || !draft) {
        console.error("[importLessonsFromExcel] Failed to create draft:", draftError?.message);
        // lesson ถูกสร้างไปแล้วแต่ draft พัง — บันทึก lessonId ไว้เผื่อ debug/cleanup ทีหลัง
        results.push({
          moduleName,
          lessonTitle: row.lessonTitle,
          lessonId: lesson.id,
          error: "สร้างฉบับร่างไม่สำเร็จ (สร้างบทเรียนไปแล้ว)",
        });
        continue;
      }

      results.push({ moduleName, lessonTitle: row.lessonTitle, lessonId: lesson.id, draftId: draft.id });
    }
  }

  revalidatePath("/dashboard/teacher");
  revalidatePath("/dashboard/teacher/courses");
  revalidatePath(`/dashboard/teacher/courses/${courseId}`);

  return { courseId, results };
}