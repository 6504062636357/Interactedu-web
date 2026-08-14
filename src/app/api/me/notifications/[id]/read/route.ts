import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const modernResult = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  const result = modernResult.error
    ? await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle()
    : modernResult;

  if (result.error) {
    console.error("[notification read PATCH]", {
      modern: modernResult.error?.message,
      fallback: result.error.message,
    });
    return NextResponse.json({ error: "Unable to update notification" }, { status: 500 });
  }
  if (!result.data) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
