import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

interface CertificateRow {
  id: string;
  certificate_no: string;
  user_id: string;
  course_id: string;
  score_percentage: number;
  pass_percentage: number;
  status: "issued" | "revoked";
  issued_at: string;
  courses: { title: string } | null;
}

export default async function AdminCertificatesPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const { data: certificatesData, error } = await supabase
    .from("certificates")
    .select("id, certificate_no, user_id, course_id, score_percentage, pass_percentage, status, issued_at, courses(title)")
    .order("issued_at", { ascending: false });
  const certificates = (certificatesData ?? []) as unknown as CertificateRow[];
  const userIds = [...new Set(certificates.map((certificate) => certificate.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? "ไม่ระบุชื่อ"]));
  const issuedCount = certificates.filter((certificate) => certificate.status === "issued").length;

  return (
    <div>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Certificates</p><h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.03em] text-[#0F1B3D]">ใบรับรอง</h1><p className="mt-1.5 text-[13.5px] text-slate-500">ตรวจสอบใบรับรองที่ระบบออกหลังผู้เรียนผ่านบททดสอบท้ายคอร์ส</p></div>
        <Link href="/dashboard/admin/courses" className="w-fit rounded-full bg-[#0F1B3D] px-5 py-2.5 text-[12.5px] font-bold text-white">ตั้งค่าใบรับรองรายคอร์ส</Link>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-400">ออกทั้งหมด</p><p className="mt-1 text-2xl font-extrabold text-[#0F1B3D]">{certificates.length}</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5"><p className="text-xs text-emerald-600">ใช้งานอยู่</p><p className="mt-1 text-2xl font-extrabold text-emerald-700">{issuedCount}</p></div></div>
      {error && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">โหลดใบรับรองไม่สำเร็จ: {error.message}</p>}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {certificates.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead><tr className="border-b border-slate-100 bg-slate-50"><th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400">เลขที่ใบรับรอง</th><th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400">ผู้เรียน</th><th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400">คอร์ส</th><th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400">คะแนน</th><th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400">วันที่ออก</th><th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400">สถานะ</th></tr></thead><tbody>{certificates.map((certificate) => <tr key={certificate.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4 font-mono text-xs font-bold text-[#0F1B3D]">{certificate.certificate_no}</td><td className="px-5 py-4"><Link href={`/dashboard/admin/users/${certificate.user_id}`} className="text-[13px] font-bold text-[#3157D5] hover:underline">{names.get(certificate.user_id) ?? "ไม่ระบุชื่อ"}</Link></td><td className="px-5 py-4 text-[13px] text-slate-600">{certificate.courses?.title ?? "ไม่พบคอร์ส"}</td><td className="px-5 py-4 text-[13px] font-bold text-slate-700">{Number(certificate.score_percentage)}%</td><td className="px-5 py-4 text-xs text-slate-500">{new Date(certificate.issued_at).toLocaleDateString("th-TH")}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${certificate.status === "issued" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{certificate.status === "issued" ? "ใช้งาน" : "ยกเลิก"}</span></td></tr>)}</tbody></table></div> : <div className="py-16 text-center text-sm text-slate-400">ยังไม่มีใบรับรองที่ออกโดยระบบ</div>}
      </div>
    </div>
  );
}
