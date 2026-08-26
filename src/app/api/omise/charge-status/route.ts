import { NextRequest, NextResponse } from "next/server";
import { approveEnrollmentForCharge } from "@/lib/payments/approve-charge";
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

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
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

  if (charge.status === "successful") {
    try {
      await approveEnrollmentForCharge(chargeId);
    } catch (error) {
      console.error("[omise charge-status] enrollment approval failed", error);
      return NextResponse.json({ error: "Unable to approve enrollment" }, { status: 500 });
    }
  }

  return NextResponse.json({ status: charge.status });
}
