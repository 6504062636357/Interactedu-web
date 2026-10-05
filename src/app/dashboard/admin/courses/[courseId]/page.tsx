import type { ReactElement } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminCourseDetailsForm from "@/components/admin/AdminCourseDetailsForm";
import AdminLessonOverview, { type AdminLesson } from "@/components/admin/AdminLessonOverview";
import CertificateSettingsForm from "@/components/certificates/CertificateSettingsForm";
import CourseManagementTabs from "@/components/courses/CourseManagementTabs";
import { createClient } from "@/utils/supabase/server";
import { checkCourseReadiness } from "@/app/dashboard/teacher/courses/actions";
import PublishCourseButton from "@/components/admin/PublishCourseButton";
import CourseLifecycleButton from "@/components/courses/CourseLifecycleButton";
import { CourseWorkspaceSaveButton, CourseWorkspaceSaveProvider } from "@/components/courses/CourseWorkspaceSave";
import { FileText, ListChecks, MoreHorizontal, Plus } from "lucide-react";

const COURSE_STATUS_LABEL: Record<string, string> = {
  draft: "ฉบับร่าง",
  pending: "รออนุมัติ",
  published: "เผยแพร่แล้ว",
  rejected: "ตีกลับ",
  archived: "เก็บถาวร",
};

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
    supabase.from("lessons").select(`
      id, title, order_index, video_url, is_scorm, scorm_version,
      lesson_drafts (
        id, status, created_at, video_url, content_html,
        quiz_questions (
          id, question_text, video_timestamp_seconds, order_index, explanation, image_url, image_caption, image_pins, interaction_type, answer_data,
          quiz_choices (choice_text, is_correct, order_index)
        ),
        video_quiz_markers (id, timestamp_seconds, random_difficulty, order_index)
      )
    `).eq("course_id", courseId).order("order_index", { ascending: true }),
  ]);
  if (!courseRes.data) notFound();

  const course = courseRes.data;
  const { data: { user } } = await supabase.auth.getUser();
  const isOwnCourse = course.created_by === user?.id;
  const readiness = isOwnCourse ? await checkCourseReadiness(courseId) : null;
  const certificate = certificateRes.data as CertificateSettings | null;
  const lessons = (lessonsRes.data ?? []) as unknown as AdminLesson[];

  return (
    <CourseWorkspaceSaveProvider key={course.id} enabled={course.status === "draft"}>
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/admin/courses" className="mb-2 inline-block text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">← กลับหน้าจัดการคอร์ส</Link>
      <div className="mb-6">
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Course workspace</p>
          <h1 className="mt-1 break-words text-[28px] font-extrabold tracking-[-0.03em] text-[#0F1B3D]">{course.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px] text-slate-500"><span>{course.course_code ?? "ไม่ระบุรหัส"}</span><span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${course.status === "draft" ? "bg-amber-50 text-amber-800" : course.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{COURSE_STATUS_LABEL[course.status] ?? course.status}</span></div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
          {!isOwnCourse && course.status === "pending" && <Link href={`/dashboard/admin/courses/${course.id}/review`} className="inline-flex min-h-11 items-center rounded-xl bg-amber-500 px-4 text-[13px] font-bold text-white">ตรวจและอนุมัติ</Link>}
          {course.status !== "archived" && <>
          <Link href={`/dashboard/admin/courses/${course.id}/lessons/new`} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#FF5A3C]/20 bg-orange-50 px-4 text-[13px] font-bold text-[#D6472C] transition hover:bg-orange-100"><Plus size={16} aria-hidden="true" />เพิ่มบทเรียน</Link>
          <Link href={`/dashboard/admin/courses/${course.id}/materials`} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50"><FileText size={16} aria-hidden="true" />เอกสารประกอบ</Link>
          <Link href={`/dashboard/admin/courses/${course.id}/exam`} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50"><ListChecks size={16} aria-hidden="true" />บททดสอบท้ายคอร์ส</Link>
          </>}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3 lg:shrink-0 lg:border-t-0 lg:pt-0">
            {course.status === "draft" && <CourseWorkspaceSaveButton />}
            <details className="group relative">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 px-3 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] [&::-webkit-details-marker]:hidden"><MoreHorizontal size={18} aria-hidden="true" />เพิ่มเติม</summary>
              <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                <CourseLifecycleButton courseId={course.id} courseTitle={course.title} mode={course.status === "archived" ? "restore" : "archive"} appearance="menu" />
                {course.status === "draft" && <CourseLifecycleButton courseId={course.id} courseTitle={course.title} mode="delete" redirectTo="/dashboard/admin/courses" appearance="menu" />}
              </div>
            </details>
          </div>
        </div>
      </div>

      {course.status === "archived" && <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">คอร์สนี้อยู่ในคลัง นำออกจากคลังก่อนแก้ไขหรือเผยแพร่</div>}

      {readiness && course.status !== "published" && course.status !== "archived" && (
        <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
          <h2 className="font-bold text-[#0F1B3D]">เตรียมคอร์สก่อนเผยแพร่</h2>
          <p className="mt-1 text-sm text-slate-600">บันทึกฉบับร่างไว้แก้ต่อได้ เพิ่มบทเรียนและบททดสอบท้ายคอร์สให้ครบก่อนเผยแพร่</p>
          {!readiness.ready && <ul className="my-3 list-inside list-disc space-y-1 text-sm text-amber-800">
            {!readiness.hasLessons && <li>ยังไม่มีบทเรียน</li>}
            {readiness.lessonIssues.map((issue) => <li key={issue.lessonId}>{issue.title}: {issue.missingVideo ? "ยังไม่มีวิดีโอ" : "คลังคำถามสำหรับควิซไม่เพียงพอ"}</li>)}
            {readiness.examIssue && <li>{readiness.examIssue} — <Link href={`/dashboard/admin/courses/${course.id}/exam`} className="font-bold underline">จัดการบททดสอบท้ายคอร์ส</Link></li>}
          </ul>}
          </div>
          <div className="shrink-0"><PublishCourseButton courseId={course.id} ready={readiness.ready} /></div>
        </section>
      )}

      {course.status !== "archived" && <CourseManagementTabs tabs={[
        { id: "lessons", label: `บทเรียน (${lessons.length})`, description: "เนื้อหาและคำถาม", content: (
          <section className="rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-[#0F1B3D]">บทเรียน</h2><p className="text-xs text-slate-400">{lessons.length} บทเรียน</p></div></div>
            {lessonsRes.error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{lessonsRes.error.message}</p>}
            {lessons.length ? (
              <div className="space-y-4">
                {lessons.map((lesson, index) => (
                  <AdminLessonOverview key={lesson.id} courseId={course.id} lesson={lesson} index={index} />
                ))}
              </div>
            ) : <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">ยังไม่มีบทเรียน</div>}
          </section>
        ) },
        { id: "details", label: "ข้อมูลคอร์ส", description: "ชื่อ หมวด ราคา และรูปปก", content: (
          <AdminCourseDetailsForm
            courseId={course.id}
            initialTitle={course.title}
            initialCourseCode={course.course_code}
            initialCategory={course.category}
            initialDescription={course.description}
            initialPrice={Number(course.price)}
            initialCoverImageUrl={course.cover_image_url}
            draft={course.status === "draft"}
          />
        ) },
        { id: "certificate", label: "ใบประกาศ", description: "ตั้งค่าและดูตัวอย่าง", content: certificate ? (
          <CertificateSettingsForm courseId={course.id} courseTitle={course.title} initialEnabled={certificate.certificate_enabled} initialPassPercentage={Number(certificate.certificate_pass_percentage)} initialTitle={certificate.certificate_title} initialDescription={certificate.certificate_description} initialLogoPath={certificate.certificate_logo_path} initialIssuerName={certificate.certificate_issuer_name} initialSignatoryName={certificate.certificate_signatory_name} initialSignatoryTitle={certificate.certificate_signatory_title} />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">กรุณาอัปเดต migration ระบบใบรับรองก่อนตั้งค่า</div>
        ) },
      ]} />}
    </div>
    </CourseWorkspaceSaveProvider>
  );
}
