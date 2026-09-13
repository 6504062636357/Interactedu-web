import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import type { ReactElement } from "react";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export default function AdminSettingsPage(): ReactElement {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/admin" className="mb-4 inline-flex text-[13px] font-semibold text-slate-500 hover:text-[#3157D5]">
        ← กลับไปภาพรวมระบบ
      </Link>
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#3157D5]">Admin account</p>
        <h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.035em] text-[#0F1B3D]">การตั้งค่า</h1>
        <p className="mt-1 text-[14px] text-slate-600">จัดการความปลอดภัยของบัญชีผู้ดูแลระบบ</p>
      </div>

      <section className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,27,61,0.035)] sm:p-7" aria-labelledby="admin-security-heading">
        <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#3157D5]">
            <LockKeyhole size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div>
            <h2 id="admin-security-heading" className="text-[16px] font-extrabold text-[#0F1B3D]">เปลี่ยนรหัสผ่าน</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">ยืนยันรหัสผ่านเดิมก่อนตั้งรหัสผ่านใหม่</p>
          </div>
        </div>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
