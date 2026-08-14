import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

interface CourseUpdateBody {
  title?: unknown;
  courseCode?: unknown;
  category?: unknown;
  description?: unknown;
  price?: unknown;
  coverImageUrl?: unknown;
}

function requiredText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maximum ? text : null;
}

function optionalText(value: unknown, maximum: number): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length <= maximum ? text || null : undefined;
}

function safeCoverUrl(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CourseUpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });
  }

  const title = requiredText(body.title, 200);
  const courseCode = requiredText(body.courseCode, 50);
  const category = requiredText(body.category, 100);
  const description = optionalText(body.description, 5_000);
  const coverImageUrl = safeCoverUrl(body.coverImageUrl);
  const price = Number(body.price);

  if (!title) return NextResponse.json({ error: "กรุณาระบุชื่อคอร์สไม่เกิน 200 ตัวอักษร" }, { status: 400 });
  if (!courseCode) return NextResponse.json({ error: "กรุณาระบุรหัสคอร์สไม่เกิน 50 ตัวอักษร" }, { status: 400 });
  if (!category) return NextResponse.json({ error: "กรุณาระบุหมวดวิชาไม่เกิน 100 ตัวอักษร" }, { status: 400 });
  if (description === undefined) return NextResponse.json({ error: "คำอธิบายต้องไม่เกิน 5,000 ตัวอักษร" }, { status: 400 });
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) {
    return NextResponse.json({ error: "ราคาคอร์สไม่ถูกต้อง" }, { status: 400 });
  }
  if (coverImageUrl === undefined) {
    return NextResponse.json({ error: "URL รูปปกไม่ถูกต้อง" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: course, error } = await admin
    .from("courses")
    .update({
      title,
      course_code: courseCode.toUpperCase(),
      category,
      description,
      price,
      cover_image_url: coverImageUrl,
    })
    .eq("id", courseId)
    .select("id, title, course_code, category, description, price, cover_image_url")
    .maybeSingle();

  if (error) {
    console.error("[admin course PATCH]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!course) return NextResponse.json({ error: "ไม่พบคอร์ส" }, { status: 404 });

  return NextResponse.json({ course });
}
