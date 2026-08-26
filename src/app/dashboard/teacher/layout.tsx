import type { ReactElement, ReactNode } from "react";
import DashboardShell from "@/components/DashboardShell";
import TeacherSidebar from "@/components/TeacherSidebar";
import { createClient } from "@/utils/supabase/server";

export default async function TeacherLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "ผู้ใช้";

  return (
    <DashboardShell displayName={displayName} role="teacher" sidebar={<TeacherSidebar />}>
      {children}
    </DashboardShell>
  );
}
