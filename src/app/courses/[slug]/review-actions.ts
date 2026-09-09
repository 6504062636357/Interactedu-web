"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { REVIEW_TAGS } from "./review-constants";

interface SubmitCourseReviewInput {
  courseId: string;
  slug: string;
  rating: number;
  meetsExpectation: boolean;
  likedTags: string[];
  comment: string;
}

interface SubmitCourseReviewResult {
  error?: string;
}

export async function submitCourseReview(
  input: SubmitCourseReviewInput
): Promise<SubmitCourseReviewResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อนรีวิวคอร์ส" };

  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { error: "กรุณาให้คะแนนระหว่าง 1-5 ดาว" };
  }

  const comment = input.comment.trim();
  if (comment.length > 2000) return { error: "ความคิดเห็นยาวเกิน 2000 ตัวอักษร" };

  // เช็คสิทธิ์ฝั่งนี้ก่อนเพื่อโชว์ error message ที่เข้าใจง่าย — RLS ของตาราง course_reviews
  // เองก็บังคับเงื่อนไขนี้ซ้ำอีกชั้นอยู่แล้ว (กันกรณี bypass ฟังก์ชันนี้มาเรียก insert ตรงๆ)
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", user.id)
    .eq("course_id", input.courseId)
    .eq("status", "approved")
    .maybeSingle();

  if (!enrollment) return { error: "ต้องลงทะเบียนคอร์สนี้ก่อนถึงจะรีวิวได้" };

  const allowedTagKeys = new Set<string>(REVIEW_TAGS.map((t) => t.key));
  const likedTags = [...new Set(input.likedTags)].filter((tag) => allowedTagKeys.has(tag));

  // ★ profiles มี RLS ให้เห็นแค่โปรไฟล์ตัวเอง หน้าคอร์ส (สาธารณะ) เลย join ไปอ่านชื่อ/รูปคนอื่น
  // ไม่ได้ตามปกติ — เก็บ snapshot ชื่อ/รูปตอนส่งรีวิวไว้ในตารางเลยแทน ไม่ต้องเปิด RLS profiles
  // ให้กว้างขึ้น (ซึ่งจะกระทบทุกจุดที่ใช้ตาราง profiles อยู่)
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("course_reviews").upsert(
    {
      course_id: input.courseId,
      student_id: user.id,
      rating: input.rating,
      meets_expectation: input.meetsExpectation,
      liked_tags: likedTags,
      comment: comment || null,
      student_name: profile?.full_name?.trim() || "ผู้เรียน",
      student_avatar_url: profile?.avatar_url ?? null,
    },
    { onConflict: "course_id,student_id" }
  );

  if (error) {
    console.error("Failed to submit course review:", error.message);
    return { error: "ส่งรีวิวไม่สำเร็จ กรุณาลองใหม่" };
  }

  revalidatePath(`/courses/${input.slug}`);
  return {};
}