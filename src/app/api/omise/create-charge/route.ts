import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { courseId } = (await request.json()) as { courseId: string };

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, price, title")
    .eq("id", courseId)
    .eq("status", "published")
    .single();

  if (courseError || !course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  if (course.price <= 0) {
    return NextResponse.json({ error: "Course is free, no charge needed" }, { status: 400 });
  }

  // กันสร้างซ้ำถ้ามี enrollment pending อยู่แล้ว
  const { data: existing } = await supabase
    .from("enrollments")
    .select("id, status")
    .eq("student_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();

  if (existing?.status === "approved") {
    return NextResponse.json({ error: "Already enrolled" }, { status: 400 });
  }

  const amountSatang = Math.round(course.price * 100); // Omise ใช้หน่วยสตางค์

  const omiseSecretKey = process.env.OMISE_SECRET_KEY;
  if (!omiseSecretKey) {
    return NextResponse.json({ error: "Payment gateway not configured" }, { status: 500 });
  }

  const chargeResponse = await fetch("https://api.omise.co/charges", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${omiseSecretKey}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      amount: String(amountSatang),
      currency: "thb",
      "source[type]": "promptpay",
    }),
  });

  const charge = await chargeResponse.json();

  if (!chargeResponse.ok) {
    console.error("Omise charge creation failed:", charge);
    return NextResponse.json({ error: "Failed to create charge" }, { status: 500 });
  }

  // สร้าง/อัปเดต enrollment เป็น pending พร้อมผูก charge id ไว้เช็คสถานะทีหลัง
  if (existing) {
    await supabase
      .from("enrollments")
      .update({ status: "pending", payment_slip_url: charge.id })
      .eq("id", existing.id);
  } else {
    await supabase.from("enrollments").insert({
      student_id: user.id,
      course_id: courseId,
      status: "pending",
      payment_slip_url: charge.id, // เก็บ omise charge id ไว้ในคอลัมน์นี้ชั่วคราว
    });
  }

  return NextResponse.json({
    chargeId: charge.id,
    qrImageUrl: charge.source?.scannable_code?.image?.download_uri ?? null,
    status: charge.status,
  });
}