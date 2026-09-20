import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CertificatePdfViewer from "@/components/certificates/CertificatePdfViewer";

export default async function AdminCertificateDetailPage({ params }: { params: Promise<{ certificateId: string }> }) {
  const { certificateId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/admin/certificates");
  const { data: actor } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (actor?.role !== "admin") redirect("/dashboard");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(certificateId)) notFound();

  const { data: certificate, error } = await supabase.from("certificates")
    .select("id, certificate_no, user_id, course_id, score_percentage, pass_percentage, status, issued_at, revoked_at, pdf_path, courses(title)")
    .eq("id", certificateId).maybeSingle();
  if (error) throw new Error("ไม่สามารถโหลดรายละเอียดใบรับรองได้");
  if (!certificate) notFound();
  const { data: learner, error: learnerError } = await supabase.from("profiles")
    .select("full_name").eq("id", certificate.user_id).maybeSingle();
  const course = certificate.courses as unknown as { title: string } | null;
  const revoked = certificate.status === "revoked";
  const formatDate = (value: string) => new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/dashboard/admin/certificates" className="inline-block text-[13px] font-semibold text-[#3157D5] hover:underline">← กลับรายการใบรับรอง</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-[#0F1B3D]">รายละเอียดใบรับรอง</h1>
          <p className="mt-2 break-all font-mono text-sm text-slate-500">{certificate.certificate_no}</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${revoked ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>{revoked ? "ยกเลิกแล้ว" : "ใช้งาน"}</span>
      </div>
      {revoked && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">ใบรับรองนี้ถูกยกเลิกแล้ว{certificate.revoked_at ? ` เมื่อ ${formatDate(certificate.revoked_at)}` : ""} แสดงไฟล์เดิมเพื่อการตรวจสอบเท่านั้น</p>}
      <dl className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 sm:p-6">
        <div><dt className="text-xs text-slate-500">ชื่อนักเรียน</dt><dd className="mt-2 break-words text-sm font-bold"><Link href={`/dashboard/admin/users/${certificate.user_id}`} className="text-[#3157D5] hover:underline">{learnerError ? "โหลดชื่อไม่สำเร็จ — ดูข้อมูลผู้เรียน" : learner?.full_name || "ไม่ระบุชื่อ — ดูข้อมูลผู้เรียน"}</Link></dd></div>
        <div><dt className="text-xs text-slate-500">วิชา / คอร์ส</dt><dd className="mt-2 break-words text-sm font-bold text-[#0F1B3D]">{course ? <Link href={`/dashboard/admin/courses/${certificate.course_id}`} className="text-[#3157D5] hover:underline">{course.title}</Link> : "ไม่พบข้อมูลคอร์ส"}</dd></div>
        <div><dt className="text-xs text-slate-500">วันที่ออก (เวลาไทย)</dt><dd className="mt-2 text-sm font-bold text-[#0F1B3D]">{formatDate(certificate.issued_at)}</dd></div>
        <div><dt className="text-xs text-slate-500">คะแนน / เกณฑ์ผ่าน ณ วันที่ออก</dt><dd className="mt-2 text-sm font-bold text-[#0F1B3D]">{Number(certificate.score_percentage)}% / {Number(certificate.pass_percentage)}%</dd></div>
      </dl>
      <p className="text-xs text-slate-500">ชื่อผู้เรียนและชื่อคอร์สด้านบนเป็นข้อมูลปัจจุบัน ส่วน PDF เป็นไฟล์ที่จัดเก็บไว้เมื่อออกใบรับรอง</p>
      {certificate.pdf_path ? <CertificatePdfViewer key={certificate.id} certificateId={certificate.id} /> : <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">ไม่พบไฟล์ PDF สำหรับใบรับรองนี้</p>}
    </div>
  );
}
