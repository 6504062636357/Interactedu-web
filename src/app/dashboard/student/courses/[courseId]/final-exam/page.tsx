import type { ReactElement } from "react";
import CourseFinalExam from "@/components/courses/CourseFinalExam";

export default async function CourseFinalExamPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}): Promise<ReactElement> {
  const { courseId } = await params;
  return <CourseFinalExam courseId={courseId} />;
}
