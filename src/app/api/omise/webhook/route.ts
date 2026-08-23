import { NextRequest, NextResponse } from "next/server";
import { approveEnrollmentForCharge } from "@/lib/payments/approve-charge";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let event: { key?: unknown; data?: { id?: unknown } };
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (event.key === "charge.complete" && typeof event.data?.id === "string") {
    const omiseSecretKey = process.env.OMISE_SECRET_KEY;
    if (!omiseSecretKey) {
      return NextResponse.json({ error: "Payment gateway not configured" }, { status: 500 });
    }

    // Do not trust the webhook body alone. Re-fetch the charge from Omise and
    // only approve an enrollment when Omise confirms it is successful.
    const response = await fetch(`https://api.omise.co/charges/${event.data.id}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${omiseSecretKey}:`).toString("base64")}`,
      },
    });
    const charge = await response.json();
    if (!response.ok) return NextResponse.json({ error: "Unable to verify charge" }, { status: 502 });

    if (charge.status === "successful") {
      try {
        await approveEnrollmentForCharge(event.data.id);
      } catch (error) {
        console.error("[omise webhook] enrollment approval failed", error);
        return NextResponse.json({ error: "Unable to approve enrollment" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
