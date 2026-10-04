import type { ReactElement, ReactNode } from "react";
import DashboardShell from "@/components/DashboardShell";
import DashboardSidebar from "@/components/DashboardSidebar";
import { createClient } from "@/utils/supabase/server";
import { getActivePlusExpiry } from "@/lib/payments/active-plus";

export default async function StudentLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle()
    : { data: null };
  const displayName =
    profile?.full_name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "ผู้ใช้";
  const plusExpiresAt = user ? await getActivePlusExpiry(supabase, user.id) : null;

  return (
    <DashboardShell displayName={displayName} avatarUrl={profile?.avatar_url} role="student" plusExpiresAt={plusExpiresAt} sidebar={<DashboardSidebar />}>
      {children}
    </DashboardShell>
  );
}
