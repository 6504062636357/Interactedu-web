"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function updateMembershipOffer(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/dashboard/admin/membership");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("ตรวจสอบสิทธิ์ผู้ดูแลไม่สำเร็จ");
  if (profile?.role !== "admin") redirect("/dashboard");

  const rawPrice = formData.get("monthlyPrice");
  const price = typeof rawPrice === "string" ? Number(rawPrice) : Number.NaN;
  const enabled = formData.get("enabled") === "on";
  if (typeof rawPrice !== "string" || !rawPrice.trim() || !Number.isFinite(price) || price < 0 || (enabled && price <= 0) || price > 1000000) {
    redirect("/dashboard/admin/membership?error=price");
  }

  const { data, error } = await supabase
    .from("membership_settings")
    .update({ monthly_price: price, enabled, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("Failed to update membership offer:", error?.message ?? "No settings row was updated");
    redirect("/dashboard/admin/membership?error=save");
  }

  revalidatePath("/membership");
  revalidatePath("/dashboard/admin/membership");
  redirect("/dashboard/admin/membership?saved=1");
}
