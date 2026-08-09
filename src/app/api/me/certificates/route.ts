import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("certificates")
    .select(
      "id, certificate_no, course_id, score_percentage, pass_percentage, status, issued_at, revoked_at, courses(title, slug)"
    )
    .eq("user_id", user.id)
    .order("issued_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ certificates: data ?? [] });
}

