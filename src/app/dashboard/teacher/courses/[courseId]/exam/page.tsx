import CourseExamManagementPage from "@/components/courses/CourseExamManagementPage";

export default async function TeacherCourseExamPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <CourseExamManagementPage courseId={courseId} workspace="teacher" />;
}
