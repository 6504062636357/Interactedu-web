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

  const rawMonthlyPrice = formData.get("monthlyPrice");
  const rawAnnualPrice = formData.get("annualPrice");
  const rawAnnualRegularPrice = formData.get("annualRegularPrice");
  const monthlyPrice = typeof rawMonthlyPrice === "string" ? Number(rawMonthlyPrice) : Number.NaN;
  const annualPrice = typeof rawAnnualPrice === "string" ? Number(rawAnnualPrice) : Number.NaN;
  const annualRegularPrice = typeof rawAnnualRegularPrice === "string" ? Number(rawAnnualRegularPrice) : Number.NaN;
  const enabled = formData.get("enabled") === "on";
  const prices = [monthlyPrice, annualPrice, annualRegularPrice];
  if (
    [rawMonthlyPrice, rawAnnualPrice, rawAnnualRegularPrice].some((value) => typeof value !== "string" || !value.trim())
    || prices.some((price) => !Number.isFinite(price) || price < 0 || price > 1000000)
    || (enabled && prices.some((price) => price <= 0))
    || annualRegularPrice < annualPrice
  ) {
    redirect("/dashboard/admin/membership?error=price");
  }

  const { data, error } = await supabase
    .from("membership_settings")
    .update({
      monthly_price: monthlyPrice,
      annual_price: annualPrice,
      annual_regular_price: annualRegularPrice,
      enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("Failed to update membership offer:", error?.message ?? "No settings row was updated");
    redirect("/dashboard/admin/membership?error=save");
  }

  revalidatePath("/membership");
  revalidatePath("/");
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/admin/membership");
  redirect("/dashboard/admin/membership?saved=1");
}
