import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CourseReviewAccordion from "@/components/CourseReviewAccordion";

interface QuizChoiceRow {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface QuizQuestionRow {
  id: string;
  question_text: string;
  order_index: number;
  quiz_choices: QuizChoiceRow[];
}

interface LessonDraftRow {
  id: string;
  video_url: string | null;
  content_html: string | null;
  status: string;
  quiz_questions: QuizQuestionRow[];
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

  const [profileRes, courseRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("courses")
      .select(
        `
        id, title, status,
        lessons (
          id, title, order_index, video_url,
          lesson_drafts (
            id, video_url, content_html, status,
            quiz_questions (
              id, question_text, order_index,
              quiz_choices ( choice_text, is_correct, order_index )
            )
          )
        )
      `
      )
      .eq("id", courseId)
      .order("order_index", { referencedTable: "lessons", ascending: true })
      .single(),
  ]);

  if (profileRes.data?.role !== "admin") redirect("/");

  if (courseRes.error || !courseRes.data) notFound();

  const course = courseRes.data as unknown as CourseWithLessons;

  // แต่ละบทเรียน เอา draft ล่าสุด (สมมติว่า array อาจมีหลายอัน เอาอันแรกที่ status ไม่ใช่ draft เปล่า)
  const lessonsWithDraft = course.lessons
    .sort((a, b) => a.order_index - b.order_index)
    .map((lesson) => ({
      ...lesson,
      latestDraft: lesson.lesson_drafts[0] ?? null,
    }));

  // ครบทุกบทก่อนถึงจะอนุมัติได้: ทุก lesson ต้องมี draft ที่ status = submitted / pending_review
  const allLessonsReady =
    lessonsWithDraft.length > 0 &&
    lessonsWithDraft.every(
      (l) =>
        l.latestDraft !== null &&
        (l.latestDraft.status === "submitted" || l.latestDraft.status === "pending_review")
    );

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

        <CourseReviewAccordion
          courseId={course.id}
          lessons={lessonsWithDraft}
          allLessonsReady={allLessonsReady}
        />
      </div>
    </div>
  );
}