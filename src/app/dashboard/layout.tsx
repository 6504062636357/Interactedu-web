import type { ReactElement, ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard");
  }

  // ไม่ render header/sidebar ใดๆ ที่นี่ — ให้แต่ละ role layout (student/teacher/admin) จัดการเอง
  return <>{children}</>;
}