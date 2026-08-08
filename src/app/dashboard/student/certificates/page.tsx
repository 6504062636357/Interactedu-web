import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

interface CertificateListRow {
  id: string;
  certificate_no: string;
  score_percentage: number;
  pass_percentage: number;
  status: "issued" | "revoked";
  issued_at: string;
  courses: { title: string; slug: string } | null;
}
export default async function CertificatesPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/student/certificates");

  const { data, error } = await supabase
    .from("certificates")
    .select("id, certificate_no, score_percentage, pass_percentage, status, issued_at, courses(title, slug)")
    .eq("user_id", user.id)
    .order("issued_at", { ascending: false });
  const certificates = (data ?? []) as unknown as CertificateListRow[];

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">My achievements</p>
          <h1 className="mt-1 text-[23px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">ใบรับรองของฉัน</h1>
          <p className="mt-1 text-[13px] text-[#0F1B3D]/50">ดาวน์โหลดใบรับรองการเรียนจบได้ทุกเมื่อ</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8.5 12.5L7 21l5-2.5L17 21l-1.5-8.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-[13px] text-red-700">
          โหลดรายการ Certificate ไม่สำเร็จ: {error.message}
        </div>
      ) : certificates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
          <p className="text-[14px] font-semibold text-[#0F1B3D]/45">ยังไม่มีใบรับรอง</p>
          <p className="mt-1 text-[12.5px] text-[#0F1B3D]/35">เรียนให้ครบทุกบทและทำคะแนนหลังเรียนถึงเกณฑ์ของคอร์ส</p>
          <Link href="/dashboard/student/courses" className="mt-4 inline-flex rounded-full bg-[#FF5A3C] px-5 py-2.5 text-[12.5px] font-bold text-white">
            ไปที่คอร์สของฉัน
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {certificates.map((certificate) => {
            const issued = certificate.status === "issued";
            return (
              <article key={certificate.id} className="rounded-2xl border border-[#0F1B3D]/[0.07] bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-extrabold text-[#0F1B3D]">
                      {certificate.courses?.title ?? "หลักสูตร"}
                    </p>
                    <p className="mt-1 font-mono text-[10.5px] text-[#0F1B3D]/40">{certificate.certificate_no}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${issued ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                    {issued ? "Issued" : "Revoked"}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-[#F7F8FA] p-3">
                  <div>
                    <p className="text-[10px] font-semibold text-[#0F1B3D]/40">คะแนน</p>
                    <p className="mt-0.5 text-[14px] font-extrabold text-[#0F1B3D]">{Number(certificate.score_percentage).toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-[#0F1B3D]/40">เกณฑ์ผ่าน</p>
                    <p className="mt-0.5 text-[14px] font-extrabold text-[#0F1B3D]">{Number(certificate.pass_percentage).toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-[#0F1B3D]/40">วันที่ออก</p>
                    <p className="mt-0.5 text-[12px] font-bold text-[#0F1B3D]">{new Date(certificate.issued_at).toLocaleDateString("th-TH")}</p>
                  </div>
                </div>
                {issued ? (
                  <a
                    href={`/api/me/certificates/${certificate.id}/download`}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[#0F1B3D] px-4 py-2.5 text-[12.5px] font-bold text-white hover:opacity-90"
                  >
                    ดาวน์โหลด PDF
                  </a>
                ) : (
                  <button disabled className="mt-4 w-full rounded-full bg-[#0F1B3D]/10 px-4 py-2.5 text-[12.5px] font-bold text-[#0F1B3D]/35">
                    ใบรับรองถูกยกเลิก
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
