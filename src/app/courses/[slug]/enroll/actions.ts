"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { createNotification, notifyAdmins } from "@/lib/notifications/service";

export async function enrollFreeCourse(courseId: string, slug: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/courses/${slug}/enroll`);
  }

  const [{ data: enrollment, error }, { data: course }] = await Promise.all([
    supabase
      .from("enrollments")
      .insert({
        student_id: user.id,
        course_id: courseId,
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
    supabase.from("courses").select("title").eq("id", courseId).maybeSingle(),
  ]);

  if (error) {
    console.error("Failed to create free enrollment:", error.message);
    redirect(`/courses/${slug}/enroll?error=1`);
  }

  if (enrollment) {
    await createNotification({
      userId: user.id,
      type: "course_access_granted",
      title: "เข้าเรียนได้แล้ว",
      message: `คุณได้รับสิทธิ์เข้าเรียนคอร์ส ${course?.title ?? "ที่ลงทะเบียน"} แล้ว`,
      relatedType: "enrollment",
      relatedId: enrollment.id,
      actionUrl: `/dashboard/student/courses/${courseId}`,
      dedupeKey: `course_access_granted:${enrollment.id}`,
    });
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

  const [{ data: enrollment, error }, { data: course }] = await Promise.all([
    supabase
      .from("enrollments")
      .insert({
        student_id: user.id,
        course_id: courseId,
        status: "pending",
        payment_slip_url: paymentSlipUrl,
      })
      .select("id")
      .single(),
    supabase.from("courses").select("title").eq("id", courseId).maybeSingle(),
  ]);

  if (error) {
    console.error("Failed to create paid enrollment:", error.message);
    redirect(`/courses/${slug}/enroll?error=1`);
  }


  if (enrollment) {
    await notifyAdmins({
      type: "payment_slip_pending",
      title: "มีหลักฐานการชำระเงินใหม่",
      message: `มีหลักฐานการชำระเงินคอร์ส ${course?.title ?? "ออนไลน์"} รอตรวจสอบ`,
      relatedType: "enrollment",
      relatedId: enrollment.id,
      actionUrl: `/dashboard/admin/users/${user.id}`,
      dedupeKey: `payment_slip_pending:${enrollment.id}`,
    });
  }

  redirect(`/courses/${slug}/enroll?submitted=1`);
}
