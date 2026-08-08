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
        "id, created_by, certificate_enabled, certificate_pass_percentage, certificate_template_id, certificate_title, certificate_description"
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

  let body: { enabled?: unknown; passPercentage?: unknown; title?: unknown; description?: unknown };
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

  const { data: settings, error } = await authorization.supabase
    .from("courses")
    .update({
      certificate_enabled: body.enabled,
      certificate_pass_percentage: passPercentage,
      certificate_title: typeof body.title === "string" ? body.title.trim() || null : null,
      certificate_description:
        typeof body.description === "string" ? body.description.trim() || null : null,
    })
    .eq("id", courseId)
    .select(
      "id, certificate_enabled, certificate_pass_percentage, certificate_template_id, certificate_title, certificate_description"
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings });
}

