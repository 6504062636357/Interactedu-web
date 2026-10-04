import "server-only";

import type { createClient } from "@/utils/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getActivePlusExpiry(supabase: SupabaseServerClient, studentId: string): Promise<string | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("student_membership_orders")
    .select("expires_at")
    .eq("student_id", studentId)
    .eq("status", "active")
    .lte("starts_at", now)
    .gt("expires_at", now)
    .limit(1)
    .maybeSingle();
  return error ? null : data?.expires_at ?? null;
}
