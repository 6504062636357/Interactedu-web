import Link from "next/link";
import type { ReactElement } from "react";
import AdminAccountStatusSwitch from "@/components/admin/AdminAccountStatusSwitch";

export type UserDirectoryRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "student" | "teacher" | "admin" | null;
  phone: string | null;
  university: string | null;
  faculty: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  enrollment_count: number;
  certificate_count: number;
  is_active: boolean | null;
};

const roleLabels = { student: "นักเรียน", teacher: "ครูผู้สอน", admin: "แอดมิน" };
const roleStyles = {
  student: "bg-blue-50 text-blue-700",
  teacher: "bg-violet-50 text-violet-700",
  admin: "bg-slate-100 text-slate-700",
};

function RoleBadge({ role }: { role: UserDirectoryRow["role"] }): ReactElement {
  if (!role) return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">ยังไม่กำหนดบทบาท</span>;
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${roleStyles[role]}`}>{roleLabels[role]}</span>;
}

function lastSignIn(value: string | null): string {
  return value ? new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function AccountRow({ user, currentUserId, statusReady }: { user: UserDirectoryRow; currentUserId: string | null; statusReady: boolean }): ReactElement {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
      <td className="px-5 py-4">
        <Link href={`/dashboard/admin/users/${user.id}`} className="group inline-block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]/40">
          <span className="block text-[13.5px] font-bold text-slate-800 transition-colors group-hover:text-[#3157D5] group-hover:underline">{user.full_name ?? "ไม่ระบุชื่อ"}</span>
          <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{user.id.slice(0, 8)}</span>
        </Link>
      </td>
      <td className="px-5 py-4"><p className="text-xs text-slate-600">{user.email ?? "—"}</p><p className="mt-1 text-[11px] text-slate-400">{user.phone ?? "ไม่ระบุเบอร์โทร"}</p></td>
      <td className="px-5 py-4"><RoleBadge role={user.role} /></td>
      <td className="px-5 py-4 text-xs text-slate-500">{user.enrollment_count} คอร์ส · {user.certificate_count} ใบรับรอง</td>
      <td className="px-5 py-4 text-xs text-slate-500">{lastSignIn(user.last_sign_in_at)}</td>
      <td className="w-[170px] px-3 py-4 align-middle"><AdminAccountStatusSwitch key={`${user.id}-${user.is_active}`} userId={user.id} userName={user.full_name ?? user.email ?? "ผู้ใช้"} initialActive={user.is_active} disabledReason={!statusReady ? "โหลดข้อมูลจัดการบัญชีไม่สำเร็จ" : user.is_active === null ? "ยังไม่ทราบสถานะบัญชี" : user.id === currentUserId ? "ไม่สามารถเปลี่ยนสถานะบัญชีตัวเอง" : !user.role ? "บัญชีนี้ยังไม่มีบทบาท" : null} /></td>
      <td className="w-[125px] px-3 py-4 text-center align-middle"><Link href={`/dashboard/admin/users/${user.id}`} className="inline-flex min-w-24 justify-center rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#3157D5] hover:bg-blue-50">ดูรายละเอียด</Link></td>
    </tr>
  );
}

export default function AdminUserDirectoryTable({ users, currentUserId, statusReady }: { users: UserDirectoryRow[]; currentUserId: string | null; statusReady: boolean }): ReactElement {
  return (
    <>
      <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 2xl:hidden">
        {users.map((user) => (
          <div key={user.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/dashboard/admin/users/${user.id}`} className="block truncate text-sm font-extrabold text-[#0F1B3D] hover:text-[#3157D5] hover:underline">{user.full_name ?? "ไม่ระบุชื่อ"}</Link>
                <p className="mt-1 truncate text-xs text-slate-500">{user.email ?? user.phone ?? user.id.slice(0, 8)}</p>
              </div>
              <RoleBadge role={user.role} />
            </div>
            <p className="mt-3 text-xs text-slate-500">{user.enrollment_count} คอร์ส · {user.certificate_count} ใบรับรอง</p>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-slate-100 pt-4">
              <AdminAccountStatusSwitch key={`${user.id}-${user.is_active}`} userId={user.id} userName={user.full_name ?? user.email ?? "ผู้ใช้"} initialActive={user.is_active} disabledReason={!statusReady ? "โหลดข้อมูลจัดการบัญชีไม่สำเร็จ" : user.is_active === null ? "ยังไม่ทราบสถานะบัญชี" : user.id === currentUserId ? "ไม่สามารถเปลี่ยนสถานะบัญชีตัวเอง" : !user.role ? "บัญชีนี้ยังไม่มีบทบาท" : null} />
              <Link href={`/dashboard/admin/users/${user.id}`} className="inline-flex min-w-24 justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-[#3157D5] hover:bg-blue-50">ดูรายละเอียด</Link>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto 2xl:block">
      <table className="w-full min-w-[1100px]">
        <thead><tr className="border-b border-slate-100 bg-slate-50/70"><th className="px-5 py-3 text-left text-[11px] text-slate-400">ผู้ใช้</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">ติดต่อ</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">บทบาท</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">กิจกรรม</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">เข้าใช้ล่าสุด</th><th className="w-[170px] px-3 py-3 text-left text-[11px] text-slate-400">สถานะ</th><th className="w-[125px] px-3 py-3 text-center text-[11px] text-slate-400">จัดการ</th></tr></thead>
        <tbody>
          {users.map((user) => <AccountRow key={user.id} user={user} currentUserId={currentUserId} statusReady={statusReady} />)}
        </tbody>
      </table>
      </div>
    </>
  );
}
