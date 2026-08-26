import type { ReactElement, ReactNode } from "react";
import DashboardShell from "@/components/DashboardShell";
import DashboardSidebar from "@/components/DashboardSidebar";
import { createClient } from "@/utils/supabase/server";

export default async function StudentLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "ผู้ใช้";

  return (
    <DashboardShell displayName={displayName} role="student" sidebar={<DashboardSidebar />}>
      {children}
    </DashboardShell>
  );
}
