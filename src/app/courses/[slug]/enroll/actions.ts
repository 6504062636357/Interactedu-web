"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function enrollFreeCourse(courseId: string, slug: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/courses/${slug}/enroll`);
  }

  const { error } = await supabase.from("enrollments").insert({
    student_id: user.id,
    course_id: courseId,
    status: "approved",
    approved_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to create free enrollment:", error.message);
    redirect(`/courses/${slug}/enroll?error=1`);
  }

   redirect(`/courses/${slug}/success`);
}

export async function enrollPaidCourse(
  courseId: string,
  slug: string,
  paymentSlipUrl: string
): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/courses/${slug}/enroll`);
  }

  const { error } = await supabase.from("enrollments").insert({
    student_id: user.id,
    course_id: courseId,
    status: "pending",
    payment_slip_url: paymentSlipUrl,
  });

  if (error) {
    console.error("Failed to create paid enrollment:", error.message);
    redirect(`/courses/${slug}/enroll?error=1`);
  }

  redirect(`/courses/${slug}/enroll?submitted=1`);
}