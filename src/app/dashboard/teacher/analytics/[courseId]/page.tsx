import TeacherAnalyticsPage from "@/components/teacher/TeacherAnalyticsPage";

export default async function Page({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <TeacherAnalyticsPage courseId={courseId} />;
}