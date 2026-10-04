import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let durationMonths: 1 | 12;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("durationMonths" in body) || (body.durationMonths !== 1 && body.durationMonths !== 12)) {
      return NextResponse.json({ error: "Invalid membership plan" }, { status: 400 });
    }
    durationMonths = body.durationMonths;
  } catch {
    return NextResponse.json({ error: "Invalid membership plan" }, { status: 400 });
  }

  const [{ data: profile, error: profileError }, { data: offer, error: offerError }] = await Promise.all([
    supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle(),
    supabase.from("membership_settings").select("monthly_price, annual_price, enabled").eq("id", true).maybeSingle(),
  ]);
  if (profileError || offerError) {
    console.error("[membership charge] Could not load account or offer", profileError?.message, offerError?.message);
    return NextResponse.json({ error: "ระบบแพ็กเกจสมาชิกยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" }, { status: 503 });
  }
  if (profile?.role !== "student" || !profile.is_active) {
    return NextResponse.json({ error: "Student account required" }, { status: 403 });
  }
  const amount = Number(durationMonths === 12 ? offer?.annual_price : offer?.monthly_price);
  if (!offer?.enabled || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Membership plan is not available" }, { status: 400 });
  }

  const omiseSecretKey = process.env.OMISE_SECRET_KEY;
  if (!omiseSecretKey || !(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return NextResponse.json({ error: "ระบบชำระเงินยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" }, { status: 503 });
  }
  const admin = createAdminClient();
  const { error: ordersError } = await admin.from("student_membership_orders").select("id").limit(0);
  if (ordersError) {
    console.error("[membership charge] Orders unavailable", ordersError.message);
    return NextResponse.json({ error: "ระบบแพ็กเกจรายเดือนยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" }, { status: 503 });
  }

  const chargeResponse = await fetch("https://api.omise.co/charges", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${omiseSecretKey}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      amount: String(Math.round(amount * 100)),
      currency: "thb",
      "source[type]": "promptpay",
    }),
  });
  const charge = await chargeResponse.json();
  if (!chargeResponse.ok) {
    console.error("[membership charge] Omise charge creation failed", charge);
    return NextResponse.json({ error: "Failed to create charge" }, { status: 502 });
  }

  const qrImageUrl = charge.source?.scannable_code?.image?.download_uri;
  if (typeof charge.id !== "string" || typeof qrImageUrl !== "string") {
    console.error("[membership charge] Omise response did not include a charge ID and QR image");
    return NextResponse.json({ error: "Invalid payment gateway response" }, { status: 502 });
  }

  const { error: insertError } = await admin.from("student_membership_orders").insert({
    student_id: user.id,
    charge_id: charge.id,
    paid_amount: amount,
    duration_months: durationMonths,
    status: "pending",
  });
  if (insertError) {
    console.error("[membership charge] Failed to record membership order", insertError.message);
    return NextResponse.json({ error: "Failed to record membership order" }, { status: 500 });
  }

  return NextResponse.json({ chargeId: charge.id, qrImageUrl, status: charge.status });
}
