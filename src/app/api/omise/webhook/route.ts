import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const event = await request.json();

  if (event.key === "charge.complete" && event.data?.status === "successful") {
    const chargeId = event.data.id as string;
    const supabase = await createClient();

    await supabase
      .from("enrollments")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("payment_slip_url", chargeId);
  }

  return NextResponse.json({ received: true });
}