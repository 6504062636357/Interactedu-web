import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PATCH() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const modernResult = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("is_read", false);

  const result = modernResult.error
    ? await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false)
    : modernResult;

  if (result.error) {
    console.error("[notifications read-all PATCH]", {
      modern: modernResult.error?.message,
      fallback: result.error.message,
    });
    return NextResponse.json({ error: "Unable to update notifications" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
