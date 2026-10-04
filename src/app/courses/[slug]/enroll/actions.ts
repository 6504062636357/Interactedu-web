"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { createNotification, notifyAdmins } from "@/lib/notifications/service";

// 1. คอร์สฟรี: อนุมัติทันที + ส่งโนติหานักเรียน
export async function enrollFreeCourse(courseId: string, slug: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/courses/${slug}/enroll`);
  }

  const [{ data: existing, error: existingError }, { data: course }] = await Promise.all([
    supabase.from("enrollments").select("id, status, access_expires_at")
      .eq("student_id", user.id).eq("course_id", courseId).maybeSingle(),
    supabase.from("courses").select("title").eq("id", courseId).maybeSingle(),
  ]);

  if (existingError) {
    console.error("Failed to check existing free enrollment:", existingError.message);
    redirect(`/courses/${slug}/enroll?error=1`);
  }
  if (existing?.status === "approved"
    && (!existing.access_expires_at || new Date(existing.access_expires_at).getTime() > Date.now())) {
    redirect(`/courses/${slug}/success`);
  }

  const enrollmentQuery = existing
    ? supabase.from("enrollments").update({
        status: "approved",
        approved_at: new Date().toISOString(),
        paid_amount: 0,
        membership_order_id: null,
        access_expires_at: null,
      }).eq("id", existing.id).select("id").single()
    : supabase.from("enrollments").insert({
        student_id: user.id,
        course_id: courseId,
        status: "approved",
        approved_at: new Date().toISOString(),
        paid_amount: 0,
      }).select("id").single();
  const { data: enrollment, error } = await enrollmentQuery;

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

// 2. จ่ายผ่าน Omise QR Code: อนุมัติทันทีอัตโนมัติ + ส่งโนติหานักเรียน
export async function enrollPaidCourseAuto(
  courseId: string,
  slug: string,
  chargeId: string
): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/courses/${slug}/enroll`);
  }

  const { data: course } = await supabase
    .from("courses")
    .select("title, price")
    .eq("id", courseId)
    .maybeSingle();
  const { data: enrollment, error } = await supabase
    .from("enrollments")
    .insert({
      student_id: user.id,
      course_id: courseId,
      status: "approved",
      approved_at: new Date().toISOString(),
      payment_slip_url: chargeId,
      paid_amount: Number(course?.price ?? 0),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create auto paid enrollment:", error.message);
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

// 3. แนบรูปสลิปโอนเงินเอง: รอแอดมินตรวจ (pending) + ส่งโนติหาแอดมิน
export async function enrollPaidCourseManualSlip(
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

  const { data: course } = await supabase
    .from("courses")
    .select("title, price")
    .eq("id", courseId)
    .maybeSingle();
  const { data: enrollment, error } = await supabase
    .from("enrollments")
    .insert({
      student_id: user.id,
      course_id: courseId,
      status: "pending",
      payment_slip_url: paymentSlipUrl,
      paid_amount: Number(course?.price ?? 0),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create manual slip enrollment:", error.message);
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
