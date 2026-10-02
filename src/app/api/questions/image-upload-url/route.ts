// app/api/questions/image-upload-url/route.ts
//
// Presigned upload URL สำหรับรูปภาพประกอบคำถาม (video quiz / final exam / question bank
// ใช้ endpoint เดียวกันหมด เพราะแค่อัปโหลดรูปแล้วได้ public URL กลับมา ไม่ผูกกับ courseId
// เหมือน materials/upload-url — ตัวคำถามใน question_bank ไม่มี courseId เดียวตายตัวอยู่แล้ว)
//
// Reuse โครง r2-upload-url/route.ts (เช็ค auth + role admin/teacher เหมือนกัน) แต่จำกัด
// fileType ให้เป็นรูปภาพเท่านั้น แทนวิดีโอ
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_FILE_NAME_LENGTH = 180;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่ก่อนอัปโหลดรูปภาพ" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[question image-upload-url] profile lookup failed:", profileError.message);
      return NextResponse.json({ error: "ตรวจสอบสิทธิ์อัปโหลดไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
    }

    if (profile?.role !== "admin" && profile?.role !== "teacher") {
      return NextResponse.json({ error: "ไม่มีสิทธิ์อัปโหลดรูปภาพ" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { fileName?: unknown; fileType?: unknown } | null;
    if (typeof body?.fileName !== "string" || typeof body.fileType !== "string") {
      return NextResponse.json({ error: "ข้อมูลไฟล์ไม่ครบ" }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(body.fileType)) {
      return NextResponse.json(
        { error: "รองรับเฉพาะไฟล์รูปภาพ PNG, JPEG, WEBP หรือ GIF เท่านั้น" },
        { status: 400 }
      );
    }

    const safeFileName =
      body.fileName.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(-MAX_FILE_NAME_LENGTH) || "image";
    const key = `question-images/${crypto.randomUUID()}-${safeFileName}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: body.fileType,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });
    const publicUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (error) {
    console.error("[question image-upload-url] unexpected failure:", error);
    return NextResponse.json(
      { error: "เตรียมการอัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
