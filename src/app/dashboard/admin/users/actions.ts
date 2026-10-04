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
  if (result === "archived") return { error: "บัญชีนี้ถูกลบแล้ว ไม่สามารถเปิดใช้งานด้วยสวิตช์สถานะ" };
  if (result) return { error: "ไม่มีสิทธิ์เปลี่ยนสถานะบัญชี" };

  revalidatePath("/dashboard/admin/users");
  revalidatePath(`/dashboard/admin/users/${userId}`);
  return {};
}

export async function archiveUserAccount(userId: string, confirmation: string): Promise<{ error?: string }> {
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return { error: "รหัสบัญชีไม่ถูกต้อง" };
  }
  if (typeof confirmation !== "string" || !confirmation.trim() || confirmation.length > 320) {
    return { error: "กรุณาพิมพ์อีเมลหรือรหัสบัญชีเพื่อยืนยัน" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };
  const { data: actor } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
  if (actor?.role !== "admin" || actor.is_active !== true) return { error: "ไม่มีสิทธิ์ลบบัญชี" };
  if (userId.toLowerCase() === user.id.toLowerCase()) return { error: "ไม่สามารถลบบัญชีตัวเอง" };

  // The RPC validates the current Auth email, archives atomically and keeps history.
  const { data: result, error } = await supabase.rpc("admin_archive_user", {
    p_user_id: userId,
    p_confirmation: confirmation.trim(),
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      return { error: "ระบบลบบัญชียังไม่พร้อม กรุณารัน migration ระบบลบบัญชีใน Supabase" };
    }
    console.warn("[archiveUserAccount]", error.code);
    return { error: "ลบบัญชีไม่สำเร็จ กรุณาลองใหม่" };
  }
  if (result === "self") return { error: "ไม่สามารถลบบัญชีตัวเอง" };
  if (result === "last_admin") return { error: "ต้องมีแอดมินที่ใช้งานได้อย่างน้อยหนึ่งบัญชี" };
  if (result === "not_found") return { error: "ไม่พบบัญชีนี้" };
  if (result === "confirmation_mismatch") return { error: "ข้อมูลยืนยันไม่ตรงกับบัญชี กรุณาตรวจอีเมลอีกครั้ง" };
  if (result === "invalid") return { error: "ข้อมูลยืนยันไม่ถูกต้อง" };
  if (result !== null) return { error: "ไม่มีสิทธิ์ลบบัญชี" };

  revalidatePath("/dashboard/admin/users");
  revalidatePath(`/dashboard/admin/users/${userId}`);
  return {};
}
