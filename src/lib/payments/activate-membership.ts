import "server-only";

import { createNotification } from "@/lib/notifications/service";
import { createAdminClient } from "@/utils/supabase/admin";

export async function activateMembershipForCharge(chargeId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin
    .from("student_membership_orders")
    .select("id, student_id")
    .eq("charge_id", chargeId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) return false;

  const { data: expiresAt, error: activationError } = await admin.rpc(
    "activate_student_membership_for_charge",
    { p_charge_id: chargeId }
  );
  if (activationError || !expiresAt) {
    throw new Error(activationError?.message ?? "Membership activation returned no expiration date");
  }

  await createNotification({
    userId: order.student_id,
    type: "course_access_granted",
    title: "เปิดสิทธิ์สมาชิกเรียบร้อยแล้ว",
    message: `คุณเข้าเรียนได้ทุกคอร์สจนถึง ${new Date(expiresAt).toLocaleDateString("th-TH")}`,
    relatedType: "membership",
    relatedId: order.id,
    actionUrl: "/dashboard/student/courses",
    dedupeKey: `membership_access_granted:${order.id}`,
  });
  return true;
}
