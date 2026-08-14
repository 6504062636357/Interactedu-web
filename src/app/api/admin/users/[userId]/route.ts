import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

interface UserProfileUpdateBody {
  fullName?: unknown;
  phone?: unknown;
  university?: unknown;
  faculty?: unknown;
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();

  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", actor.id)
    .maybeSingle();

  if (actorProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: UserProfileUpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });
  }

  const fullName = requiredText(body.fullName, 150);
  const phone = optionalText(body.phone, 50);
  const university = optionalText(body.university, 200);
  const faculty = optionalText(body.faculty, 200);

  if (!fullName) return NextResponse.json({ error: "กรุณาระบุชื่อไม่เกิน 150 ตัวอักษร" }, { status: 400 });
  if (phone === undefined) return NextResponse.json({ error: "เบอร์โทรต้องไม่เกิน 50 ตัวอักษร" }, { status: 400 });
  if (university === undefined) return NextResponse.json({ error: "ชื่อมหาวิทยาลัยต้องไม่เกิน 200 ตัวอักษร" }, { status: 400 });
  if (faculty === undefined) return NextResponse.json({ error: "ชื่อคณะต้องไม่เกิน 200 ตัวอักษร" }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: previousProfile, error: profileReadError }, { data: authData, error: authReadError }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, phone, university, faculty")
        .eq("id", userId)
        .maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);

  if (profileReadError || authReadError) {
    const message = profileReadError?.message ?? authReadError?.message ?? "โหลดข้อมูลผู้ใช้ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!previousProfile || !authData.user) {
    return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });
  }

  const { data: updatedProfile, error: profileUpdateError } = await admin
    .from("profiles")
    .update({ full_name: fullName, phone, university, faculty })
    .eq("id", userId)
    .select("id, full_name, phone, university, faculty")
    .single();

  if (profileUpdateError) {
    console.error("[admin user PATCH] profile update", profileUpdateError.message);
    return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
  }

  const previousMetadata = authData.user.user_metadata ?? {};
  const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...previousMetadata, full_name: fullName },
  });

  if (authUpdateError) {
    await admin
      .from("profiles")
      .update({
        full_name: previousProfile.full_name,
        phone: previousProfile.phone,
        university: previousProfile.university,
        faculty: previousProfile.faculty,
      })
      .eq("id", userId);

    console.error("[admin user PATCH] auth metadata update", authUpdateError.message);
    return NextResponse.json({ error: "อัปเดตชื่อในระบบ Auth ไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ profile: updatedProfile });
}
