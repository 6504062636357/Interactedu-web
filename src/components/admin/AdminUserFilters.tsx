"use client";

import { useId, useRef, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";

export default function AdminUserFilters({
  query,
  role,
  status,
}: {
  query: string;
  role: "all" | "student" | "teacher" | "admin";
  status: "all" | "active" | "inactive";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const selectedRole = data.get("role");
    const selectedStatus = data.get("status");
    const search = String(data.get("q") ?? "").trim();
    if (selectedRole === "student" || selectedRole === "teacher" || selectedRole === "admin") params.set("role", selectedRole);
    if (selectedStatus === "active" || selectedStatus === "inactive") params.set("status", selectedStatus);
    if (search) params.set("q", search);
    startTransition(() => {
      router.push(params.size ? `/dashboard/admin/users?${params}` : "/dashboard/admin/users", { scroll: false });
    });
  }

  const fieldClass = "h-11 w-full rounded-xl border border-slate-200 bg-slate-50 text-[13px] text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-[#3157D5] focus:bg-white focus:ring-2 focus:ring-[#3157D5]/10 disabled:cursor-wait disabled:opacity-60";

  return (
    <form ref={formRef} action="/dashboard/admin/users" method="get" onSubmit={submit} aria-busy={pending} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_10rem_12rem_auto]">
      <div className="min-w-0 sm:col-span-2 xl:col-span-1">
        <label htmlFor={`${id}-search`} className="mb-1.5 block text-xs font-bold text-slate-500">ค้นหาผู้ใช้</label>
        <div className="relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input id={`${id}-search`} name="q" defaultValue={query} placeholder="ชื่อ อีเมล หรือเบอร์โทร" disabled={pending} className={`${fieldClass} pl-10 pr-4`} />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-role`} className="mb-1.5 block text-xs font-bold text-slate-500">บทบาท</label>
        <div className="relative">
          <select id={`${id}-role`} name="role" defaultValue={role} disabled={pending} onChange={() => formRef.current?.requestSubmit()} className={`${fieldClass} appearance-none pl-3.5 pr-10`}>
            <option value="all">ทั้งหมด</option>
            <option value="student">นักเรียน</option>
            <option value="teacher">ครูผู้สอน</option>
            <option value="admin">แอดมิน</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-status`} className="mb-1.5 block text-xs font-bold text-slate-500">สถานะบัญชี</label>
        <div className="relative">
          <select id={`${id}-status`} name="status" defaultValue={status} disabled={pending} onChange={() => formRef.current?.requestSubmit()} className={`${fieldClass} appearance-none pl-3.5 pr-10`}>
            <option value="all">ทุกสถานะ</option>
            <option value="active">ใช้งานอยู่</option>
            <option value="inactive">พักการใช้งาน</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      </div>
      <button type="submit" disabled={pending} className="h-11 self-end rounded-xl bg-[#0F1B3D] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1D3060] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:col-span-2 xl:col-span-1">{pending ? "กำลังกรอง..." : "ค้นหา"}</button>
      <span role="status" className="sr-only">{pending ? "กำลังโหลดรายชื่อผู้ใช้" : ""}</span>
    </form>
  );
}
