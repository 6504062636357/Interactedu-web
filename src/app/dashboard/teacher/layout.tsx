import type { ReactElement, ReactNode } from "react";
import DashboardShell from "@/components/DashboardShell";
import TeacherSidebar from "@/components/TeacherSidebar";
import { createClient } from "@/utils/supabase/server";

export default async function TeacherLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
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

  return (
    <DashboardShell displayName={displayName} avatarUrl={profile?.avatar_url} role="teacher" sidebar={<TeacherSidebar />}>
      {children}
    </DashboardShell>
  );
}
