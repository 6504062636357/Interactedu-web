import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { generateCertificatePdf } from "@/lib/certificates/pdf";

const textFields = {
  title: 120,
  description: 240,
  issuerName: 100,
  signatoryName: 100,
  signatoryTitle: 100,
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const [{ data: profile }, { data: course, error: courseError }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("courses")
      .select("id, title, created_by, certificate_logo_path")
      .eq("id", courseId)
      .maybeSingle(),
  ]);
  if (courseError) return NextResponse.json({ error: courseError.message }, { status: 500 });
  if (!course) return NextResponse.json({ error: "ไม่พบคอร์ส" }, { status: 404 });
  if (profile?.role !== "admin" && !(profile?.role === "teacher" && course.created_by === user.id)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดูตัวอย่างใบประกาศของคอร์สนี้" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลตัวอย่างไม่ถูกต้อง" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "ข้อมูลตัวอย่างไม่ถูกต้อง" }, { status: 400 });
  }
  const fields = body as Record<string, unknown>;
  const passPercentage = Number(fields.passPercentage);
  if (!Number.isFinite(passPercentage) || passPercentage < 0 || passPercentage > 100) {
    return NextResponse.json({ error: "คะแนนผ่านต้องอยู่ระหว่าง 0 ถึง 100" }, { status: 400 });
  }
  for (const [key, maxLength] of Object.entries(textFields)) {
    if (typeof fields[key] !== "string" || fields[key].trim().length > maxLength) {
      return NextResponse.json({ error: "ข้อมูลใบประกาศไม่ถูกต้องหรือยาวเกินกำหนด" }, { status: 400 });
    }
  }

  let logoBytes: Uint8Array | null = null;
  let logoFormat: "png" | "jpg" | null = null;
  if (course.certificate_logo_path) {
    const { data: logo, error: logoError } = await supabase.storage
      .from("certificate-assets")
      .download(course.certificate_logo_path);
    if (logoError || !logo) {
      return NextResponse.json({ error: "โหลดโลโก้สำหรับตัวอย่างไม่สำเร็จ" }, { status: 500 });
    }
    logoBytes = new Uint8Array(await logo.arrayBuffer());
    logoFormat = course.certificate_logo_path.endsWith(".png") ? "png" : "jpg";
  }

  try {
    const pdf = await generateCertificatePdf({
      certificateNo: "CERT-EXAMPLE",
      certificateTitle: (fields.title as string).trim(),
      certificateDescription: (fields.description as string).trim(),
      courseTitle: course.title,
      learnerName: "ชื่อผู้เรียน ตัวอย่าง",
      scorePercentage: 100,
      passPercentage,
      issuedAt: new Date(),
      issuerName: (fields.issuerName as string).trim(),
      signatoryName: (fields.signatoryName as string).trim(),
      signatoryTitle: (fields.signatoryTitle as string).trim(),
      logoBytes,
      logoFormat,
      isPreview: true,
    });
    return new NextResponse(Uint8Array.from(pdf).buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="certificate-preview.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to generate certificate preview:", error);
    return NextResponse.json({ error: "สร้างตัวอย่างใบประกาศไม่สำเร็จ" }, { status: 500 });
  }
}
