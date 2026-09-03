"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    //scope: "local" แค่ล้าง session ในเบราว์เซอร์ ไม่ต้องรอ network call ไป revoke
    // ที่ฝั่ง Supabase server — กันปุ่ม logout ค้างถ้าเน็ต/antivirus บนเครื่องบล็อค request
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-[13px] font-medium text-slate-500 hover:text-red-600 transition-colors"
    >
      ออกจากระบบ
    </button>
  );
}