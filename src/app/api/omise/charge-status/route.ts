import { NextRequest, NextResponse } from "next/server";
import { activateMembershipForCharge } from "@/lib/payments/activate-membership";
import { approveEnrollmentForCharge } from "@/lib/payments/approve-charge";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chargeId = request.nextUrl.searchParams.get("chargeId");
  if (!chargeId) {
    return NextResponse.json({ error: "Missing chargeId" }, { status: 400 });
  }

  const omiseSecretKey = process.env.OMISE_SECRET_KEY;
  if (!omiseSecretKey) {
    return NextResponse.json({ error: "Payment gateway not configured" }, { status: 500 });
  }

  const [{ data: enrollment, error: enrollmentError }, { data: membershipOrder, error: membershipError }] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", user.id)
        .eq("payment_slip_url", chargeId)
        .maybeSingle(),
      supabase
        .from("student_membership_orders")
        .select("id")
        .eq("student_id", user.id)
        .eq("charge_id", chargeId)
        .maybeSingle(),
    ]);
  if (enrollmentError || membershipError) {
    console.error("[omise charge-status] Failed to load payment", enrollmentError?.message, membershipError?.message);
    return NextResponse.json({ error: "Could not load payment" }, { status: 500 });
  }
  if (!enrollment && !membershipOrder) return NextResponse.json({ error: "Charge not found" }, { status: 404 });

  const response = await fetch(`https://api.omise.co/charges/${chargeId}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${omiseSecretKey}:`).toString("base64")}`,
    },
  });
  const charge = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: "Failed to fetch charge" }, { status: 500 });
  }

  if (charge.status === "successful") {
    if (enrollment) {
      try {
        await approveEnrollmentForCharge(chargeId);
      } catch (error) {
        console.error("[omise charge-status] enrollment approval failed", error);
        return NextResponse.json({ error: "Unable to approve enrollment" }, { status: 500 });
      }
    } else if (membershipOrder) {
      try {
        await activateMembershipForCharge(chargeId);
      } catch (error) {
        console.error("[omise charge-status] membership activation failed", error);
        return NextResponse.json({ error: "Unable to activate membership" }, { status: 500 });
      }
      return NextResponse.json({ status: charge.status, membershipActive: true });
    }
  } else if (membershipOrder && (charge.status === "failed" || charge.status === "expired")) {
    const admin = createAdminClient();
    const { error: failedUpdateError } = await admin
      .from("student_membership_orders")
      .update({ status: "failed" })
      .eq("id", membershipOrder.id)
      .eq("status", "pending");
    if (failedUpdateError) {
      console.error("[omise charge-status] Could not mark membership payment failed", failedUpdateError.message);
      return NextResponse.json({ error: "Unable to update membership payment" }, { status: 500 });
    }
  }

  return NextResponse.json({ status: charge.status });
}
