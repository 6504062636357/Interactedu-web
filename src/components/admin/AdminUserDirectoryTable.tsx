import Link from "next/link";
import type { ReactElement } from "react";

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

function AccountRow({ user }: { user: UserDirectoryRow }): ReactElement {
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
      <td className="px-5 py-4 text-right"><Link href={`/dashboard/admin/users/${user.id}`} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#3157D5] hover:bg-blue-50">ดูรายละเอียด</Link></td>
    </tr>
  );
}

export default function AdminUserDirectoryTable({ users }: { users: UserDirectoryRow[] }): ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px]">
        <thead><tr className="border-b border-slate-100 bg-slate-50/70"><th className="px-5 py-3 text-left text-[11px] text-slate-400">ผู้ใช้</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">ติดต่อ</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">บทบาท</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">กิจกรรม</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">เข้าใช้ล่าสุด</th><th><span className="sr-only">รายละเอียด</span></th></tr></thead>
        <tbody>
          {users.map((user) => <AccountRow key={user.id} user={user} />)}
        </tbody>
      </table>
    </div>
  );
}
