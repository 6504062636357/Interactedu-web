import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createNotification } from "@/lib/notifications/service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chargeId = request.nextUrl.searchParams.get("chargeId");
  if (!chargeId) {
    return NextResponse.json({ error: "Missing chargeId" }, { status: 400 });
  }

  const omiseSecretKey = process.env.OMISE_SECRET_KEY;
  if (!omiseSecretKey) {
    return NextResponse.json({ error: "Payment gateway not configured" }, { status: 500 });
  }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, status, course_id, courses(title)")
    .eq("student_id", user.id)
    .eq("payment_slip_url", chargeId)
    .maybeSingle();
  if (!enrollment) return NextResponse.json({ error: "Charge not found" }, { status: 404 });

  const response = await fetch(`https://api.omise.co/charges/${chargeId}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${omiseSecretKey}:`).toString("base64")}`,
    },
  });

  const charge = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: "Failed to fetch charge" }, { status: 500 });
  }

  // ถ้าจ่ายสำเร็จแล้ว อัปเดต enrollment เป็น approved ทันที (กันเคส webhook มาช้า)
  if (charge.status === "successful") {

    if (enrollment.status !== "approved") {
      const { error: updateError } = await supabase
        .from("enrollments")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", enrollment.id)
        .eq("student_id", user.id);
      if (updateError) {
        console.error("[omise charge-status] enrollment approval failed", updateError.message);
        return NextResponse.json({ error: "Unable to approve enrollment" }, { status: 500 });
      }
    }

    const relation = enrollment.courses as unknown as { title: string } | { title: string }[] | null;
    const course = Array.isArray(relation) ? relation[0] : relation;
    await createNotification({
      userId: user.id,
      type: "payment_approved",
      title: "ชำระเงินเรียบร้อยแล้ว",
      message: `ชำระเงินเรียบร้อยแล้ว สามารถเข้าเรียนคอร์ส ${course?.title ?? "ที่ลงทะเบียน"} ได้แล้ว`,
      relatedType: "enrollment",
      relatedId: enrollment.id,
      actionUrl: `/dashboard/student/courses/${enrollment.course_id}`,
      dedupeKey: `payment_approved:${enrollment.id}`,
    });
// =======
//     const supabase = await createClient();
//     const { data: updated, error: updateError } = await supabase
//       .from("enrollments")
//       .update({ status: "approved", approved_at: new Date().toISOString() })
//       .eq("payment_slip_url", chargeId)
//       .select("id, status");

//     // ชั่วคราว: log ผลลัพธ์การ update เพื่อเช็คว่า RLS บล็อกหรือ chargeId ไม่ match
//     console.log("[charge-status] update result:", {
//       chargeId,
//       updateError,
//       updatedRows: updated,
//     });

//     if (updateError) {
//       console.error("[charge-status] Failed to update enrollment:", updateError);
//     } else if (!updated || updated.length === 0) {
//       console.warn(
//         "[charge-status] No enrollment row matched payment_slip_url =",
//         chargeId,
//         "- charge succeeded but nothing was updated."
//       );
//     }
// >>>>>>> Stashed changes
  }

  return NextResponse.json({ status: charge.status });
}
