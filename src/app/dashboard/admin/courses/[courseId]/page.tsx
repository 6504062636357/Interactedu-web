import type { ReactElement } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminCourseDetailsForm from "@/components/admin/AdminCourseDetailsForm";
import CertificateSettingsForm from "@/components/certificates/CertificateSettingsForm";
import { createClient } from "@/utils/supabase/server";

interface CertificateSettings {
  certificate_enabled: boolean;
  certificate_pass_percentage: number;
  certificate_title: string | null;
  certificate_description: string | null;
  certificate_logo_path: string | null;
  certificate_issuer_name: string | null;
  certificate_signatory_name: string | null;
  certificate_signatory_title: string | null;
}

export default async function AdminCourseWorkspacePage({ params }: { params: Promise<{ courseId: string }> }): Promise<ReactElement> {
  const { courseId } = await params;
  const supabase = await createClient();
  const [courseRes, certificateRes, lessonsRes] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, course_code, category, description, price, cover_image_url, status, created_by")
      .eq("id", courseId)
      .maybeSingle(),
    supabase.from("courses").select("certificate_enabled, certificate_pass_percentage, certificate_title, certificate_description, certificate_logo_path, certificate_issuer_name, certificate_signatory_name, certificate_signatory_title").eq("id", courseId).maybeSingle(),
    supabase.from("lessons").select("id, title, order_index, lesson_drafts(id, status, created_at)").eq("course_id", courseId).order("order_index", { ascending: true }),
  ]);
  if (!courseRes.data) notFound();

  const course = courseRes.data;
  const certificate = certificateRes.data as CertificateSettings | null;
  const lessons = lessonsRes.data ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/admin/courses" className="mb-2 inline-block text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">← กลับหน้าจัดการคอร์ส</Link>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Course workspace</p>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.03em] text-[#0F1B3D]">{course.title}</h1>
          <p className="mt-1 text-[12.5px] text-slate-500">{course.course_code ?? "ไม่ระบุรหัส"} · สถานะ {course.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {course.status === "pending" && <Link href={`/dashboard/admin/courses/${course.id}/review`} className="rounded-full bg-amber-500 px-4 py-2.5 text-[12.5px] font-bold text-white">ตรวจและอนุมัติ</Link>}
          <Link href={`/dashboard/admin/courses/${course.id}/materials`} className="rounded-full border border-[#0F1B3D]/15 bg-white px-4 py-2.5 text-[12.5px] font-bold text-[#0F1B3D]">เอกสารประกอบ</Link>
          <Link href={`/dashboard/admin/courses/${course.id}/exam`} className="rounded-full border border-[#0F1B3D]/15 bg-white px-4 py-2.5 text-[12.5px] font-bold text-[#0F1B3D]">บททดสอบท้ายคอร์ส</Link>
          <Link href={`/dashboard/admin/courses/${course.id}/lessons/new`} className="rounded-full bg-[#FF5A3C] px-4 py-2.5 text-[12.5px] font-bold text-white">+ เพิ่มบทเรียน</Link>
        </div>
      </div>

      <AdminCourseDetailsForm
        courseId={course.id}
        initialTitle={course.title}
        initialCourseCode={course.course_code}
        initialCategory={course.category}
        initialDescription={course.description}
        initialPrice={Number(course.price)}
        initialCoverImageUrl={course.cover_image_url}
      />

      {certificate ? <div className="mb-7"><CertificateSettingsForm courseId={course.id} courseTitle={course.title} initialEnabled={certificate.certificate_enabled} initialPassPercentage={Number(certificate.certificate_pass_percentage)} initialTitle={certificate.certificate_title} initialDescription={certificate.certificate_description} initialLogoPath={certificate.certificate_logo_path} initialIssuerName={certificate.certificate_issuer_name} initialSignatoryName={certificate.certificate_signatory_name} initialSignatoryTitle={certificate.certificate_signatory_title} /></div> : <div className="mb-7 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">กรุณาอัปเดต migration ระบบใบรับรองก่อนตั้งค่า</div>}

      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-[#0F1B3D]">บทเรียน</h2><p className="text-xs text-slate-400">{lessons.length} บทเรียน</p></div></div>
        {lessonsRes.error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{lessonsRes.error.message}</p>}
        {lessons.length ? <div className="space-y-3">{lessons.map((lesson, index) => {
          const drafts = (lesson.lesson_drafts as { id: string; status: string; created_at: string }[] | null) ?? [];
          const latest = [...drafts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          return <div key={lesson.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 px-4 py-3"><div className="min-w-0"><p className="truncate text-[13.5px] font-bold text-[#0F1B3D]">{index + 1}. {lesson.title}</p><p className="mt-0.5 text-[11.5px] text-slate-400">{latest?.status ?? "ยังไม่มีฉบับร่าง"}</p></div><Link href={`/dashboard/admin/courses/${course.id}/lessons/new?lessonId=${lesson.id}`} className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-[#0F1B3D]">แก้ไข</Link></div>;
        })}</div> : <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">ยังไม่มีบทเรียน</div>}
      </section>
    </div>
  );
}
