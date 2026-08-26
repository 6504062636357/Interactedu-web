import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const ASSET_BUCKET = "certificate-assets";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface AuthorizedCourse {
  id: string;
  created_by: string | null;
  certificate_logo_path: string | null;
}

function detectImage(bytes: Uint8Array): { extension: "png" | "jpg"; contentType: string } | null {
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (isPng) return { extension: "png", contentType: "image/png" };

  const isJpeg =
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return { extension: "jpg", contentType: "image/jpeg" };

  return null;
}

async function authorizeCourse(courseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }) };
  }

  const [{ data: profile }, { data: course, error }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("courses")
      .select("id, created_by, certificate_logo_path")
      .eq("id", courseId)
      .maybeSingle(),
  ]);

  if (error) {
    return { response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!course) {
    return { response: NextResponse.json({ error: "ไม่พบคอร์ส" }, { status: 404 }) };
  }

  const typedCourse = course as AuthorizedCourse;
  const allowed =
    profile?.role === "admin" ||
    (profile?.role === "teacher" && typedCourse.created_by === user.id);
  if (!allowed) {
    return { response: NextResponse.json({ error: "ไม่มีสิทธิ์จัดการคอร์สนี้" }, { status: 403 }) };
  }

  return { supabase, course: typedCourse };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const authorization = await authorizeCourse(courseId);
  if (authorization.response) return authorization.response;

  const logoPath = authorization.course.certificate_logo_path;
  if (!logoPath) {
    return NextResponse.json({ error: "ยังไม่มีโลโก้" }, { status: 404 });
  }

  const { data, error } = await authorization.supabase.storage
    .from(ASSET_BUCKET)
    .download(logoPath);
  if (error || !data) {
    return NextResponse.json({ error: "โหลดโลโก้ไม่สำเร็จ" }, { status: 404 });
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": logoPath.endsWith(".png") ? "image/png" : "image/jpeg",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const authorization = await authorizeCourse(courseId);
  if (authorization.response) return authorization.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "ข้อมูลอัปโหลดไม่ถูกต้อง" }, { status: 400 });
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "กรุณาเลือกไฟล์โลโก้" }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: "ไฟล์โลโก้ต้องมีขนาดไม่เกิน 2 MB" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image) {
    return NextResponse.json({ error: "รองรับเฉพาะไฟล์ PNG หรือ JPG เท่านั้น" }, { status: 415 });
  }

  const logoPath = `${courseId}/logo.${image.extension}`;
  const { error: uploadError } = await authorization.supabase.storage
    .from(ASSET_BUCKET)
    .upload(logoPath, bytes, {
      contentType: image.contentType,
      cacheControl: "300",
      upsert: true,
    });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: updatedCourse, error: updateError } = await authorization.supabase
    .from("courses")
    .update({ certificate_logo_path: logoPath })
    .eq("id", courseId)
    .select("id")
    .maybeSingle();
  if (updateError || !updatedCourse) {
    await authorization.supabase.storage.from(ASSET_BUCKET).remove([logoPath]);
    return NextResponse.json(
      { error: updateError?.message || "ไม่มีสิทธิ์บันทึกโลโก้ของคอร์สนี้" },
      { status: updateError ? 500 : 403 }
    );
  }

  const previousPath = authorization.course.certificate_logo_path;
  if (previousPath && previousPath !== logoPath && previousPath.startsWith(`${courseId}/`)) {
    await authorization.supabase.storage.from(ASSET_BUCKET).remove([previousPath]);
  }

  return NextResponse.json({ logoPath });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const authorization = await authorizeCourse(courseId);
  if (authorization.response) return authorization.response;

  const logoPath = authorization.course.certificate_logo_path;
  const { data: updatedCourse, error: updateError } = await authorization.supabase
    .from("courses")
    .update({ certificate_logo_path: null })
    .eq("id", courseId)
    .select("id")
    .maybeSingle();
  if (updateError || !updatedCourse) {
    return NextResponse.json(
      { error: updateError?.message || "ไม่มีสิทธิ์แก้ไขคอร์สนี้" },
      { status: updateError ? 500 : 403 }
    );
  }

  if (logoPath && logoPath.startsWith(`${courseId}/`)) {
    await authorization.supabase.storage.from(ASSET_BUCKET).remove([logoPath]);
  }

  return NextResponse.json({ removed: true });
}
