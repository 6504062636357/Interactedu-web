import { CourseMaterialsWorkspacePage } from "@/app/dashboard/teacher/courses/[courseId]/materials/page";

export default async function AdminCourseMaterialsPage({ params }: { params: Promise<{ courseId: string }> }) {
  return CourseMaterialsWorkspacePage({ params, workspace: "admin" });
}
