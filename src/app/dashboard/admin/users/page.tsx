import Link from "next/link";
import type { ReactElement } from "react";
import { createClient } from "@/utils/supabase/server";

type ProfileRole = "student" | "teacher" | "admin";
type UserDirectoryRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: ProfileRole;
  phone: string | null;
  university: string | null;
  faculty: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  enrollment_count: number;
  certificate_count: number;
};

const roleFilters: { label: string; value: ProfileRole | "all" }[] = [
  { label: "ทั้งหมด", value: "all" }, { label: "นักเรียน", value: "student" },
  { label: "ครูผู้สอน", value: "teacher" }, { label: "แอดมิน", value: "admin" },
];

const roleLabels: Record<ProfileRole, string> = { student: "นักเรียน", teacher: "ครูผู้สอน", admin: "แอดมิน" };
const roleStyles: Record<ProfileRole, string> = { student: "bg-blue-50 text-blue-700", teacher: "bg-violet-50 text-violet-700", admin: "bg-slate-100 text-slate-700" };

export default async function ManageUsersPage({ searchParams }: { searchParams: Promise<{ role?: string; q?: string }> }): Promise<ReactElement> {
  const { role, q } = await searchParams;
  const activeRole: ProfileRole | "all" = role === "student" || role === "teacher" || role === "admin" ? role : "all";
  const searchTerm = q?.trim().toLocaleLowerCase("th-TH") ?? "";
  const supabase = await createClient();

  const directoryRes = await supabase.rpc("admin_list_users");
  let allUsers = (directoryRes.data ?? []) as UserDirectoryRow[];
  let loadError = directoryRes.error?.message ?? null;

  // ทำให้หน้ารายชื่อยังใช้งานได้ระหว่างรัน migration โดยข้อมูล Auth จะเพิ่มเข้ามาหลัง migration สำเร็จ
  if (directoryRes.error) {
    const fallback = await supabase.from("profiles").select("id, full_name, role, phone, university, faculty, created_at").order("created_at", { ascending: false });
    allUsers = (fallback.data ?? []).map((profile) => ({ ...profile, email: null, last_sign_in_at: null, enrollment_count: 0, certificate_count: 0 })) as UserDirectoryRow[];
    loadError = fallback.error?.message ?? directoryRes.error.message;
  }

  const users = allUsers.filter((user) => {
    const matchesRole = activeRole === "all" || user.role === activeRole;
    const searchable = `${user.full_name ?? ""} ${user.email ?? ""} ${user.phone ?? ""}`.toLocaleLowerCase("th-TH");
    return matchesRole && (!searchTerm || searchable.includes(searchTerm));
  });
  const countRole = (target: ProfileRole) => allUsers.filter((user) => user.role === target).length;

  return (
    <div>
      <div className="mb-7"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">User management</p><h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.03em] text-[#0F1B3D]">ข้อมูลผู้ใช้</h1><p className="mt-1.5 text-[13.5px] text-slate-500">ค้นหาและเปิดดูโปรไฟล์ ประวัติการเรียน และใบรับรองของผู้ใช้</p></div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{[["ผู้ใช้ทั้งหมด", allUsers.length, ""], ["นักเรียน", countRole("student"), "text-blue-700"], ["ครูผู้สอน", countRole("teacher"), "text-violet-700"], ["แอดมิน", countRole("admin"), "text-slate-700"]].map(([label, count, color]) => <div key={String(label)} className="rounded-2xl border border-slate-200/70 bg-white px-5 py-4"><p className="text-[11.5px] text-slate-400">{label}</p><p className={`mt-1 text-[22px] font-extrabold ${color || "text-[#0F1B3D]"}`}>{count}</p></div>)}</div>
      {loadError && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">ข้อมูลอีเมล/กิจกรรมจะพร้อมหลังรัน migration ล่าสุด: {loadError}</div>}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
        <div className="border-b border-slate-100 p-4 sm:p-5"><form method="get" className="flex flex-col gap-3 sm:flex-row">{activeRole !== "all" && <input type="hidden" name="role" value={activeRole} />}<input name="q" defaultValue={q ?? ""} placeholder="ค้นหาชื่อ อีเมล หรือเบอร์โทร" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] outline-none focus:border-[#3157D5] focus:bg-white" /><button className="rounded-xl bg-slate-100 px-5 py-2.5 text-[12.5px] font-bold text-slate-700">ค้นหา</button></form>
          <div className="mt-4 flex gap-2 overflow-x-auto">{roleFilters.map((filter) => { const params = new URLSearchParams(); if (filter.value !== "all") params.set("role", filter.value); if (q) params.set("q", q); return <Link key={filter.value} href={params.size ? `/dashboard/admin/users?${params}` : "/dashboard/admin/users"} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${activeRole === filter.value ? "bg-[#0F1B3D] text-white" : "border border-slate-200 text-slate-600"}`}>{filter.label}</Link>; })}</div>
        </div>
        {users.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px]"><thead><tr className="border-b border-slate-100 bg-slate-50/70"><th className="px-5 py-3 text-left text-[11px] text-slate-400">ผู้ใช้</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">ติดต่อ</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">บทบาท</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">กิจกรรม</th><th className="px-5 py-3 text-left text-[11px] text-slate-400">เข้าใช้ล่าสุด</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"><td className="px-5 py-4"><p className="text-[13.5px] font-bold text-slate-800">{user.full_name ?? "ไม่ระบุชื่อ"}</p><p className="mt-0.5 font-mono text-[10px] text-slate-300">{user.id.slice(0, 8)}</p></td><td className="px-5 py-4"><p className="text-xs text-slate-600">{user.email ?? "—"}</p><p className="mt-1 text-[11px] text-slate-400">{user.phone ?? "ไม่ระบุเบอร์โทร"}</p></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${roleStyles[user.role]}`}>{roleLabels[user.role]}</span></td><td className="px-5 py-4 text-xs text-slate-500">{user.enrollment_count} คอร์ส · {user.certificate_count} ใบรับรอง</td><td className="px-5 py-4 text-xs text-slate-500">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td><td className="px-5 py-4 text-right"><Link href={`/dashboard/admin/users/${user.id}`} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#3157D5]">ดูรายละเอียด</Link></td></tr>)}</tbody></table></div> : <div className="py-16 text-center text-sm text-slate-400">ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข</div>}
      </div>
    </div>
  );
}
