import Link from "next/link";
import SaveCourseButton from "./SaveCourseButton";

export interface CourseAccessActionsProps {
  courseId: string;
  slug: string;
  hasAccess: boolean;
  membership?: boolean;
  started?: boolean;
  saved?: boolean;
  savingAvailable?: boolean;
}

export default function CourseAccessActions({ courseId, slug, hasAccess, membership = false, started = false, saved = false, savingAvailable = true }: CourseAccessActionsProps) {
  return <div className="relative z-20 flex w-full flex-col gap-2">
    <Link href={hasAccess ? `/dashboard/student/courses/${courseId}?start=1` : `/courses/${slug}/enroll`}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0F1B3D] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#3157D5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] focus-visible:ring-offset-2">
      {hasAccess ? started ? "เรียนต่อ" : "เริ่มเรียน" : "ลงทะเบียน"}
    </Link>
    {hasAccess && membership && !started && <SaveCourseButton courseId={courseId} initialSaved={saved} available={savingAvailable} />}
  </div>;
}
