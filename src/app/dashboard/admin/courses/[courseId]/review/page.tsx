import type { ReactElement } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CourseReviewAccordion from "@/components/CourseReviewAccordion";
import CourseOverview from "@/components/admin/CourseOverview";
import CertificateSettingsForm from "@/components/certificates/CertificateSettingsForm";
import CourseManagementTabs from "@/components/courses/CourseManagementTabs";
import CourseApproveActions from "@/components/CourseApproveActions";
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

interface VideoQuizMarkerRow {
  id: string;
  timestamp_seconds: number;
  random_difficulty: "easy" | "medium" | "hard";
  order_index: number;
}

interface LessonDraftRow {
  id: string;
  video_url: string | null;
  content_html: string | null;
  status: string;
  quiz_questions: QuizQuestionRow[];
  video_quiz_markers: VideoQuizMarkerRow[];
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
  course_code: string | null;
  category: string | null;
  description: string | null;
  price: number;
  cover_image_url: string | null;
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
        id, title, status, course_code, category, description, price, cover_image_url,
        lessons (
          id, title, order_index, video_url,
          lesson_drafts (
            id, video_url, content_html, status, created_at,
            quiz_questions (
              id, question_text, order_index, video_timestamp_seconds, explanation,
              quiz_choices ( choice_text, is_correct, order_index )
            ),
            video_quiz_markers (
              id, timestamp_seconds, random_difficulty, order_index
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
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[13px] font-bold text-[#FF5A3C]">รีวิวคอร์ส</p>
            <h1 className="mb-2 text-[24px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">
              {course.title}
            </h1>
            <p className="text-[13px] text-[#0F1B3D]/50">
              {lessonsWithDraft.length} บทเรียน — สถานะคอร์ส: {course.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/admin/courses/${course.id}`} className="rounded-full border border-[#0F1B3D]/15 bg-white px-4 py-2 text-[12.5px] font-bold text-[#0F1B3D]">จัดการเนื้อหา</Link>
            <Link href={`/dashboard/admin/courses/${course.id}/exam`} className="rounded-full border border-[#0F1B3D]/15 bg-white px-4 py-2 text-[12.5px] font-bold text-[#0F1B3D]">ตรวจบททดสอบท้ายคอร์ส</Link>
          </div>
        </div>

        <CourseApproveActions
          courseId={course.id}
          courseStatus={course.status}
        />

        <CourseManagementTabs ariaLabel="ส่วนที่ต้องการตรวจสอบในคอร์ส" tabs={[
          { id: "lessons", label: `บทเรียน (${lessonsWithDraft.length})`, description: "วิดีโอ เนื้อหา และคำถาม", content: (
            <CourseReviewAccordion courseId={course.id} lessons={lessonsWithDraft} />
          ) },
          { id: "details", label: "ข้อมูลคอร์ส", description: "รายละเอียดที่ส่งตรวจ", content: (
            <section className="rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6">
              <h2 className="mb-5 text-base font-extrabold text-[#0F1B3D]">ข้อมูลคอร์สที่ส่งตรวจ</h2>
              <CourseOverview
                title={course.title}
                courseCode={course.course_code}
                category={course.category}
                description={course.description}
                price={Number(course.price)}
                coverImageUrl={course.cover_image_url}
              />
            </section>
          ) },
          { id: "certificate", label: "ใบประกาศ", description: "ตั้งค่าและดูตัวอย่าง", content: certificateSettings ? (
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
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-[12.5px] text-amber-800">
              ยังโหลดการตั้งค่าใบประกาศไม่ได้ แต่สามารถตรวจและอนุมัติเนื้อหาคอร์สต่อได้ตามปกติ
            </div>
          ) },
        ]} />
      </div>
    </div>
  );
}
