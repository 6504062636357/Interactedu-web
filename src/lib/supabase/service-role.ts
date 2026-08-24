import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS entirely.
 * ใช้เฉพาะงาน backend ที่ต้องการอ่านข้อมูลข้าม RLS policy โดยเจตนา
 * (เช่น sampling คำถามจากคลังข้อสอบให้นักเรียน)
 *
 * ห้าม import ไฟล์นี้จาก client component หรือโค้ดที่อาจถูก bundle ไปฝั่ง browser เด็ดขาด
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars for service-role client"
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}