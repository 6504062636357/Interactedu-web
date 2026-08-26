import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

async function authorizeCourseSettings(courseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const [{ data: profile }, { data: course, error: courseError }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("courses")
      .select(
        "id, created_by, certificate_enabled, certificate_pass_percentage, certificate_template_id, certificate_title, certificate_description, certificate_logo_path, certificate_issuer_name, certificate_signatory_name, certificate_signatory_title"
      )
      .eq("id", courseId)
      .maybeSingle(),
  ]);
  if (courseError) return { response: NextResponse.json({ error: courseError.message }, { status: 500 }) };
  if (!course) return { response: NextResponse.json({ error: "Course not found" }, { status: 404 }) };

  const allowed = profile?.role === "admin" || (profile?.role === "teacher" && course.created_by === user.id);
  if (!allowed) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { supabase, course };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const authorization = await authorizeCourseSettings(courseId);
  if (authorization.response) return authorization.response;
  return NextResponse.json({ settings: authorization.course });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const authorization = await authorizeCourseSettings(courseId);
  if (authorization.response) return authorization.response;

  let body: {
    enabled?: unknown;
    passPercentage?: unknown;
    title?: unknown;
    description?: unknown;
    issuerName?: unknown;
    signatoryName?: unknown;
    signatoryTitle?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const passPercentage = Number(body.passPercentage);
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }
  if (!Number.isFinite(passPercentage) || passPercentage < 0 || passPercentage > 100) {
    return NextResponse.json({ error: "Passing score must be between 0 and 100" }, { status: 400 });
  }
  if (body.title !== undefined && body.title !== null && typeof body.title !== "string") {
    return NextResponse.json({ error: "title must be a string" }, { status: 400 });
  }
  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
    return NextResponse.json({ error: "description must be a string" }, { status: 400 });
  }
  if (body.issuerName !== undefined && body.issuerName !== null && typeof body.issuerName !== "string") {
    return NextResponse.json({ error: "issuerName must be a string" }, { status: 400 });
  }
  if (body.signatoryName !== undefined && body.signatoryName !== null && typeof body.signatoryName !== "string") {
    return NextResponse.json({ error: "signatoryName must be a string" }, { status: 400 });
  }
  if (body.signatoryTitle !== undefined && body.signatoryTitle !== null && typeof body.signatoryTitle !== "string") {
    return NextResponse.json({ error: "signatoryTitle must be a string" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const issuerName = typeof body.issuerName === "string" ? body.issuerName.trim() : "";
  const signatoryName = typeof body.signatoryName === "string" ? body.signatoryName.trim() : "";
  const signatoryTitle = typeof body.signatoryTitle === "string" ? body.signatoryTitle.trim() : "";
  if (title.length > 120) {
    return NextResponse.json({ error: "ชื่อใบประกาศต้องไม่เกิน 120 ตัวอักษร" }, { status: 400 });
  }
  if (description.length > 240) {
    return NextResponse.json({ error: "ข้อความเสริมต้องไม่เกิน 240 ตัวอักษร" }, { status: 400 });
  }
  if (issuerName.length > 100 || signatoryName.length > 100 || signatoryTitle.length > 100) {
    return NextResponse.json({ error: "ข้อมูลผู้ออกใบประกาศต้องไม่เกินช่องละ 100 ตัวอักษร" }, { status: 400 });
  }

  const { data: settings, error } = await authorization.supabase
    .from("courses")
    .update({
      certificate_enabled: body.enabled,
      certificate_pass_percentage: passPercentage,
      certificate_title: title || null,
      certificate_description: description || null,
      certificate_issuer_name: issuerName || null,
      certificate_signatory_name: signatoryName || null,
      certificate_signatory_title: signatoryTitle || null,
    })
    .eq("id", courseId)
    .select(
      "id, certificate_enabled, certificate_pass_percentage, certificate_template_id, certificate_title, certificate_description, certificate_logo_path, certificate_issuer_name, certificate_signatory_name, certificate_signatory_title"
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings });
}
