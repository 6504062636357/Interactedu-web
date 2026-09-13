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

function groupAccounts(users: UserDirectoryRow[]): UserDirectoryRow[][] {
  const groups = new Map<string, UserDirectoryRow[]>();
  for (const user of users) {
    // ชื่อเดียวกันไม่ใช่บัญชีเดียวกัน: จัดกลุ่มเพื่อแสดงผลเท่านั้น และคงทุก ID ไว้
    const name = user.full_name?.trim().toLocaleLowerCase("th-TH");
    const key = name ? `${user.role}:${name}` : `id:${user.id}`;
    const group = groups.get(key) ?? [];
    group.push(user);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function SingleAccountRow({ user }: { user: UserDirectoryRow }): ReactElement {
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

function SameNameAccountsRow({ accounts }: { accounts: UserDirectoryRow[] }): ReactElement {
  const first = accounts[0];
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td colSpan={6} className="px-4 py-3">
        <details className="group rounded-xl border border-amber-200/70 bg-amber-50/50">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]/50 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13.5px] font-bold text-slate-800">{first.full_name}</span>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">{accounts.length} บัญชีใช้ชื่อนี้</span>
              <RoleBadge role={first.role} />
            </span>
            <span className="text-xs font-bold text-[#3157D5]">เลือกบัญชีเพื่อดูรายละเอียด</span>
          </summary>
          <div className="divide-y divide-amber-100 border-t border-amber-200/70 bg-white">
            {accounts.map((user) => (
              <div key={user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[180px] flex-1">
                  <p className="break-all text-xs font-semibold text-slate-700">{user.email ?? "ไม่พบอีเมล"}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">ID {user.id.slice(0, 8)}</p>
                </div>
                <span className="text-[11px] text-slate-500">{user.enrollment_count} คอร์ส · {user.certificate_count} ใบรับรอง</span>
                <span className="text-[11px] text-slate-500">เข้าใช้ {lastSignIn(user.last_sign_in_at)}</span>
                <Link href={`/dashboard/admin/users/${user.id}`} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#3157D5] hover:bg-blue-50">ดูรายละเอียด</Link>
              </div>
            ))}
          </div>
        </details>
      </td>
    </tr>
  );
}

export default function AdminUserDirectoryTable({ users }: { users: UserDirectoryRow[] }): ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px]">
        <thead><tr className="border-b border-slate-100 bg-slate-50/70"><th className="px-5 py-3 text-left text-[11px] text-slate-400">ผู้ใช้</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">ติดต่อ</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">บทบาท</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">กิจกรรม</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">เข้าใช้ล่าสุด</th><th><span className="sr-only">รายละเอียด</span></th></tr></thead>
        <tbody>
          {groupAccounts(users).map((accounts) => accounts.length === 1
            ? <SingleAccountRow key={accounts[0].id} user={accounts[0]} />
            : <SameNameAccountsRow key={`${accounts[0].role}:${accounts[0].full_name}`} accounts={accounts} />)}
        </tbody>
      </table>
    </div>
  );
}
