import type { ReactElement, ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AdminShell from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/admin");
  }

  const [profileRes, pendingRes] = await Promise.all([
    supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle(),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  if (profileRes.data?.role !== "admin") redirect("/dashboard");

  const displayName =
    profileRes.data.full_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Admin";

  return (
    <AdminShell displayName={displayName} pendingCourses={pendingRes.count ?? 0}>
      {children}
    </AdminShell>
  );
}
