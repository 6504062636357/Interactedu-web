// components/ChangePasswordForm.tsx
"use client";

import { useState, type ReactElement, type FormEvent } from "react";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export default function ChangePasswordForm(): ReactElement {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "รหัสผ่านใหม่ไม่ตรงกัน" });
      return;
    }

    setIsSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setMessage({ type: "error", text: "ไม่พบเซสชันผู้ใช้ กรุณาเข้าสู่ระบบใหม่" });
      setIsSaving(false);
      return;
    }

    // Verify current password by attempting sign-in with it
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verifyError) {
      setMessage({ type: "error", text: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
      setIsSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setIsSaving(false);

    if (updateError) {
      setMessage({ type: "error", text: updateError.message });
    } else {
      setMessage({ type: "success", text: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">รหัสผ่านปัจจุบัน</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
      <div>
        <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">รหัสผ่านใหม่</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={8}
          required
          className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
      <div>
        <label className="block text-[12.5px] font-semibold text-slate-600 mb-1">ยืนยันรหัสผ่านใหม่</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
          className="w-full text-[13.5px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {message && (
        <p className={`text-[13px] font-medium ${message.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="bg-blue-950 hover:bg-blue-900 disabled:opacity-50 text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-lg transition-colors"
      >
        {isSaving ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
      </button>
    </form>
  );
}