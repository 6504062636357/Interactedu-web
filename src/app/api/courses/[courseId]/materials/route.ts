// src/app/api/courses/[courseId]/materials/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: course } = await supabase
    .from("courses")
    .select("id, created_by")
    .eq("id", courseId)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  const isOwnerTeacher = profile?.role === "teacher" && course?.created_by === user.id;

  let isEnrolledStudent = false;
  if (!isAdmin && !isOwnerTeacher) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("course_id", courseId)
      .eq("student_id", user.id)
      .eq("status", "approved")
      .maybeSingle();
    isEnrolledStudent = !!enrollment;
  }

  if (!isAdmin && !isOwnerTeacher && !isEnrolledStudent) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: materials } = await supabase
    .from("course_materials")
    .select("id, file_name, file_url")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });

  return NextResponse.json({ materials: materials ?? [] });
}