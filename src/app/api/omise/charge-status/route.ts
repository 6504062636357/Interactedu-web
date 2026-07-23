import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const chargeId = request.nextUrl.searchParams.get("chargeId");
  if (!chargeId) {
    return NextResponse.json({ error: "Missing chargeId" }, { status: 400 });
  }

  const omiseSecretKey = process.env.OMISE_SECRET_KEY;
  if (!omiseSecretKey) {
    return NextResponse.json({ error: "Payment gateway not configured" }, { status: 500 });
  }

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
    const supabase = await createClient();
    await supabase
      .from("enrollments")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("payment_slip_url", chargeId);
  }

  return NextResponse.json({ status: charge.status });
}