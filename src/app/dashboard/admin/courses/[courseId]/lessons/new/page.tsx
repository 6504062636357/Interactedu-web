import { CourseLessonEditorPage } from "@/app/dashboard/teacher/courses/[courseId]/lessons/new/page";

export default async function AdminNewLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ lessonId?: string }>;
}) {
  return CourseLessonEditorPage({ params, searchParams, workspace: "admin" });
}
