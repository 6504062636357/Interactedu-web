import "server-only";

import { createNotification } from "@/lib/notifications/service";
import { createAdminClient } from "@/utils/supabase/admin";

interface EnrollmentRow {
  id: string;
  student_id: string;
  course_id: string;
  status: string;
  courses: { title: string } | { title: string }[] | null;
}

function courseTitle(row: EnrollmentRow): string {
  const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
  return course?.title ?? "ที่ลงทะเบียน";
}

export async function approveEnrollmentForCharge(chargeId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, student_id, course_id, status, courses(title)")
    .eq("payment_slip_url", chargeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return false;

  const enrollment = data as unknown as EnrollmentRow;
  if (enrollment.status !== "approved") {
    const { error: updateError } = await supabase
      .from("enrollments")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", enrollment.id);
    if (updateError) throw new Error(updateError.message);
  }

  await createNotification({
    userId: enrollment.student_id,
    type: "payment_approved",
    title: "ชำระเงินเรียบร้อยแล้ว",
    message: `ชำระเงินเรียบร้อยแล้ว สามารถเข้าเรียนคอร์ส ${courseTitle(enrollment)} ได้แล้ว`,
    relatedType: "enrollment",
    relatedId: enrollment.id,
    actionUrl: `/dashboard/student/courses/${enrollment.course_id}`,
    dedupeKey: `payment_approved:${enrollment.id}`,
  });

  return true;
}

