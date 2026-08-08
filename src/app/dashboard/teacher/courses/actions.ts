// app/teacher/courses/actions.ts
"use server";

import { createClient } from "@/utils/supabase/server";

interface CreateCourseInput {
  title: string;
  courseCode: string;
  category: string;
  description: string | null;
  isFree: boolean;
  price: number;
  coverImageUrl: string | null;
  certificateEnabled: boolean;
  certificatePassPercentage: number;
}

interface CreateCourseResult {
  courseId?: string;
  moduleId?: string;
  error?: string;
}

function slugify(input: string): string {
  return input
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createCourse(input: CreateCourseInput): Promise<CreateCourseResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") {
    return { error: "ไม่มีสิทธิ์สร้างคอร์ส" };
  }

  if (!input.title.trim()) return { error: "กรุณาใส่ชื่อคอร์ส" };
  if (!input.courseCode.trim()) return { error: "กรุณาใส่รหัสวิชา" };
  if (!input.category.trim()) return { error: "กรุณาระบุหมวดวิชา" };

  const priceValue = input.isFree ? 0 : input.price;
  if (Number.isNaN(priceValue) || priceValue < 0) {
    return { error: "ราคาต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0" };
  }
  if (
    !Number.isFinite(input.certificatePassPercentage) ||
    input.certificatePassPercentage < 0 ||
    input.certificatePassPercentage > 100
  ) {
    return { error: "คะแนนผ่านต้องอยู่ระหว่าง 0 ถึง 100" };
  }

  const slug = `${slugify(input.courseCode)}-${Date.now().toString(36)}`;

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .insert({
      title: input.title.trim(),
      slug,
      description: input.description?.trim() || null,
      category: input.category.trim(),
      price: priceValue,
      cover_image_url: input.coverImageUrl,
      course_code: input.courseCode.trim().toUpperCase(),
      status: "draft",
      created_by: user.id,
      certificate_enabled: input.certificateEnabled,
      certificate_pass_percentage: input.certificatePassPercentage,
    })
    .select("id")
    .single();

  if (courseError || !course) {
    console.error("Failed to create course:", courseError?.message);
    return { error: courseError?.message ?? "สร้างคอร์สไม่สำเร็จ กรุณาลองใหม่" };
  }

  const { data: courseModule, error: moduleError } = await supabase
    .from("modules")
    .insert({ course_id: course.id, title: "บทเรียนทั่วไป", order_index: 0 })
    .select("id")
    .single();

  if (moduleError || !courseModule) {
    console.error("Failed to create default module:", moduleError?.message);
    return { error: "สร้างคอร์สสำเร็จ แต่สร้างหมวดบทเรียนไม่สำเร็จ กรุณาติดต่อแอดมิน" };
  }

  return { courseId: course.id, moduleId: courseModule.id };
}
