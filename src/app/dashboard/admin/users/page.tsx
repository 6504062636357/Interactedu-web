import Link from "next/link";
import type { ReactElement } from "react";
import { createClient } from "@/utils/supabase/server";
import AdminUserDirectoryTable, { type UserDirectoryRow } from "@/components/admin/AdminUserDirectoryTable";

type ProfileRole = "student" | "teacher" | "admin";

const roleFilters: { label: string; value: ProfileRole | "all" }[] = [
  { label: "ทั้งหมด", value: "all" }, { label: "นักเรียน", value: "student" },
  { label: "ครูผู้สอน", value: "teacher" }, { label: "แอดมิน", value: "admin" },
];

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
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{[["บัญชีทั้งหมด", allUsers.length, ""], ["นักเรียน", countRole("student"), "text-blue-700"], ["ครูผู้สอน", countRole("teacher"), "text-violet-700"], ["แอดมิน", countRole("admin"), "text-slate-700"]].map(([label, count, color]) => <div key={String(label)} className="rounded-2xl border border-slate-200/70 bg-white px-5 py-4"><p className="text-[11.5px] text-slate-400">{label}</p><p className={`mt-1 text-[22px] font-extrabold ${color || "text-[#0F1B3D]"}`}>{count}</p></div>)}</div>
      {loadError && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">ข้อมูลอีเมล/กิจกรรมจะพร้อมหลังรัน migration ล่าสุด: {loadError}</div>}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
        <div className="border-b border-slate-100 p-4 sm:p-5"><form method="get" className="flex flex-col gap-3 sm:flex-row">{activeRole !== "all" && <input type="hidden" name="role" value={activeRole} />}<input name="q" defaultValue={q ?? ""} placeholder="ค้นหาชื่อ อีเมล หรือเบอร์โทร" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] outline-none focus:border-[#3157D5] focus:bg-white" /><button className="rounded-xl bg-slate-100 px-5 py-2.5 text-[12.5px] font-bold text-slate-700">ค้นหา</button></form>
          <div className="mt-4 flex gap-2 overflow-x-auto">{roleFilters.map((filter) => { const params = new URLSearchParams(); if (filter.value !== "all") params.set("role", filter.value); if (q) params.set("q", q); return <Link key={filter.value} href={params.size ? `/dashboard/admin/users?${params}` : "/dashboard/admin/users"} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${activeRole === filter.value ? "bg-[#0F1B3D] text-white" : "border border-slate-200 text-slate-600"}`}>{filter.label}</Link>; })}</div>
        </div>
        {users.length ? <AdminUserDirectoryTable users={users} /> : <div className="py-16 text-center text-sm text-slate-400">ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข</div>}
      </div>
    </div>
  );
}
