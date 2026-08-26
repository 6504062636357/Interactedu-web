import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CourseReviewAccordion from "@/components/CourseReviewAccordion";
import CertificateSettingsForm from "@/components/certificates/CertificateSettingsForm";

interface QuizChoiceRow {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface QuizQuestionRow {
  id: string;
  question_text: string;
  order_index: number;
  video_timestamp_seconds: number | null;
  explanation: string | null;
  quiz_choices: QuizChoiceRow[];
}

interface LessonDraftRow {
  id: string;
  video_url: string | null;
  content_html: string | null;
  status: string;
  quiz_questions: QuizQuestionRow[];
  created_at?: string | null;
}

interface LessonRow {
  id: string;
  title: string;
  order_index: number;
  video_url: string | null;
  lesson_drafts: LessonDraftRow[];
}

interface CourseWithLessons {
  id: string;
  title: string;
  status: string;
  lessons: LessonRow[];
}

interface CourseCertificateSettings {
  certificate_enabled: boolean;
  certificate_pass_percentage: number;
  certificate_title: string | null;
  certificate_description: string | null;
  certificate_logo_path: string | null;
  certificate_issuer_name: string | null;
  certificate_signatory_name: string | null;
  certificate_signatory_title: string | null;
}

// export default async function AdminCourseReviewPage({
//   params,
// }: {
//   params: Promise<{ courseId: string }>;
// }): Promise<ReactElement> {
//   const { courseId } = await params;
//   const supabase = await createClient();

//   const {
//     data: { user },
//   } = await supabase.auth.getUser();

//   if (!user) redirect(`/login?redirect=/admin/courses/${courseId}/review`);

//   const [profileRes, courseRes] = await Promise.all([
//     supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
//     supabase
//       .from("courses")
//       .select(
//         `
//         id, title, status,
//         lessons (
//           id, title, order_index, video_url,
//           lesson_drafts (
//             id, video_url, content_html, status,
//             quiz_questions (
//               id, question_text, order_index, video_timestamp_seconds, explanation,
//               quiz_choices ( choice_text, is_correct, order_index )
//             )
//           )
//         )
//       `
//       )
//       .eq("id", courseId)
//       .order("order_index", { referencedTable: "lessons", ascending: true })
//       .order("created_at", { referencedTable: "lessons.lesson_drafts", ascending: false })
//       .single(),
//   ]);

//   if (profileRes.data?.role !== "admin") redirect("/");

//   if (courseRes.error || !courseRes.data) notFound();

//   const course = courseRes.data as unknown as CourseWithLessons;

//   // แต่ละบทเรียน เอา draft ล่าสุด (สมมติว่า array อาจมีหลายอัน เอาอันแรกที่ status ไม่ใช่ draft เปล่า)
//   const lessonsWithDraft = course.lessons
//   .sort((a, b) => a.order_index - b.order_index)
//   .map((lesson) => {
//     const drafts = lesson.lesson_drafts ?? [];
//     // เอาตัวที่ status พร้อมตรวจก่อน ถ้าไม่มีค่อย fallback เป็นตัวล่าสุดสุด (index 0 หลัง order by created_at desc)
//     const readyDraft = drafts.find(
//       (d) => d.status === "submitted" || d.status === "pending_review"
//     );
//     const latestDraft = readyDraft ?? drafts[0] ?? null;
//     return { ...lesson, latestDraft };
//   });

//   // ครบทุกบทก่อนถึงจะอนุมัติได้: ทุก lesson ต้องมี draft ที่ status = submitted / pending_review
//   // const allLessonsReady =
//   //   lessonsWithDraft.length > 0 &&
//   //   lessonsWithDraft.every(
//   //     (l) =>
//   //       l.latestDraft !== null &&
//   //       (l.latestDraft.status === "submitted" || l.latestDraft.status === "pending_review")
//   //   );

//   return (
//     <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
//       <div className="max-w-3xl mx-auto">
//         <p className="text-[13px] font-bold text-[#FF5A3C] mb-2">รีวิวคอร์ส</p>
//         <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] mb-2">
//           {course.title}
//         </h1>
//         <p className="text-[13px] text-[#0F1B3D]/50 mb-8">
//           {lessonsWithDraft.length} บทเรียน — สถานะคอร์ส: {course.status}
//         </p>

//         <CourseReviewAccordion
//           courseId={course.id}
//           lessons={lessonsWithDraft}
//         />
//       </div>
//     </div>
//   );
// }

export default async function AdminCourseReviewPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}): Promise<ReactElement> {
  const { courseId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirect=/admin/courses/${courseId}/review`);

  const [profileRes, courseRes, certificateRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("courses")
      .select(
        `
        id, title, status,
        lessons (
          id, title, order_index, video_url,
          lesson_drafts (
            id, video_url, content_html, status, created_at,
            quiz_questions (
              id, question_text, order_index, video_timestamp_seconds, explanation,
              quiz_choices ( choice_text, is_correct, order_index )
            )
          )
        )
      `
      )
      .eq("id", courseId)
      .maybeSingle(),
    supabase
      .from("courses")
      .select("certificate_enabled, certificate_pass_percentage, certificate_title, certificate_description, certificate_logo_path, certificate_issuer_name, certificate_signatory_name, certificate_signatory_title")
      .eq("id", courseId)
      .maybeSingle(),
  ]);

  if (profileRes.data?.role !== "admin") redirect("/");

  // ถ้าเกิด error ให้ log ออกมาดูใน Terminal เพื่อจะได้เห็นสาเหตุที่แท้จริง
  if (courseRes.error) {
    console.error("Supabase Query Error in Review Page:", courseRes.error);
  }

  if (!courseRes.data) notFound();

  const course = courseRes.data as unknown as CourseWithLessons;
  const certificateSettings = certificateRes.data as CourseCertificateSettings | null;

  // คัดเลือก Draft ล่าสุดของแต่ละบทเรียน
  const lessonsWithDraft = (course.lessons ?? [])
    .sort((a, b) => a.order_index - b.order_index)
    .map((lesson) => {
      const drafts = lesson.lesson_drafts ?? [];

      // Sort drafts ตามเวลาสร้างล่าสุด (Newest First)
      const sortedDrafts = [...drafts].sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime()
      );

      // เอาตัวที่ส่งตรวจก่อน (submitted / pending_review) ถ้าไม่มีเอาตัวล่าสุดสุทธิ
      const readyDraft = sortedDrafts.find(
        (d) => d.status === "submitted" || d.status === "pending_review"
      );
      const latestDraft = readyDraft ?? sortedDrafts[0] ?? null;

      return {
        id: lesson.id,
        title: lesson.title,
        order_index: lesson.order_index,
        video_url: lesson.video_url,
        latestDraft,
      };
    });

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <p className="text-[13px] font-bold text-[#FF5A3C] mb-2">รีวิวคอร์ส</p>
        <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] mb-2">
          {course.title}
        </h1>
        <p className="text-[13px] text-[#0F1B3D]/50 mb-8">
          {lessonsWithDraft.length} บทเรียน — สถานะคอร์ส: {course.status}
        </p>

        <div className="mb-6 flex flex-wrap gap-2">
          <a href={`/dashboard/admin/courses/${course.id}`} className="rounded-full border border-[#0F1B3D]/15 bg-white px-4 py-2 text-[12.5px] font-bold text-[#0F1B3D]">จัดการเนื้อหา</a>
          <a href={`/dashboard/admin/courses/${course.id}/exam`} className="rounded-full border border-[#0F1B3D]/15 bg-white px-4 py-2 text-[12.5px] font-bold text-[#0F1B3D]">ตรวจบททดสอบท้ายคอร์ส</a>
        </div>

        {certificateSettings ? (
          <div className="mb-8">
            <CertificateSettingsForm
              courseId={course.id}
              courseTitle={course.title}
              initialEnabled={certificateSettings.certificate_enabled}
              initialPassPercentage={Number(certificateSettings.certificate_pass_percentage)}
              initialTitle={certificateSettings.certificate_title}
              initialDescription={certificateSettings.certificate_description}
              initialLogoPath={certificateSettings.certificate_logo_path}
              initialIssuerName={certificateSettings.certificate_issuer_name}
              initialSignatoryName={certificateSettings.certificate_signatory_name}
              initialSignatoryTitle={certificateSettings.certificate_signatory_title}
            />
          </div>
        ) : (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-[12.5px] text-amber-800">
            ยังโหลดการตั้งค่าใบประกาศไม่ได้ แต่สามารถตรวจและอนุมัติเนื้อหาคอร์สต่อได้ตามปกติ
          </div>
        )}

        <CourseReviewAccordion
          courseId={course.id}
          lessons={lessonsWithDraft}
        />
      </div>
    </div>
  );
}
