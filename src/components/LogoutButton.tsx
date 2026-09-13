"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
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
      className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
    >
      <LogOut size={16} aria-hidden="true" /> ออกจากระบบ
    </button>
  );
}
