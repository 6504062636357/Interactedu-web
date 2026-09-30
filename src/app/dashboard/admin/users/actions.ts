"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function setUserActive(userId: string, isActive: boolean): Promise<{ error?: string }> {
  if (typeof isActive !== "boolean") return { error: "สถานะบัญชีไม่ถูกต้อง" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const { data: actor } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
  if (actor?.role !== "admin" || actor.is_active === false) return { error: "ไม่มีสิทธิ์เปลี่ยนสถานะบัญชี" };

  const { data: result, error } = await supabase.rpc("admin_set_user_active", {
    p_user_id: userId,
    p_is_active: isActive,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { error: "ฐานข้อมูลยังไม่มีฟังก์ชันเปลี่ยนสถานะบัญชี กรุณารัน migration ล่าสุด" };
    console.warn("[setUserActive]", error.code, error.message);
    return { error: "เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่" };
  }
  if (result === "self") return { error: "ไม่สามารถปิดใช้งานบัญชีของตัวเอง" };
  if (result === "last_admin") return { error: "ต้องมีแอดมินที่ใช้งานได้อย่างน้อยหนึ่งบัญชี" };
  if (result === "not_found") return { error: "ไม่พบบัญชีนี้" };
  if (result) return { error: "ไม่มีสิทธิ์เปลี่ยนสถานะบัญชี" };

  revalidatePath("/dashboard/admin/users");
  revalidatePath(`/dashboard/admin/users/${userId}`);
  return {};
}
