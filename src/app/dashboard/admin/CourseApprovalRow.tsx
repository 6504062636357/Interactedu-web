import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import type { ReactElement } from "react";

type PendingCourse = {
  id: string;
  title: string;
  instructorName: string;
  createdAt: string;
};

export default function CourseApprovalRow({
  course,
}: {
  course: PendingCourse;
}): ReactElement {
  const createdDate = new Date(course.createdAt).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Link
      href={`/dashboard/admin/courses/${course.id}/review`}
      className="group flex min-w-0 items-center gap-3 border-b border-slate-100 py-4 transition-colors last:border-0 hover:bg-slate-50 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] sm:gap-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
        <BookOpen size={18} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-[#0F1B3D] group-hover:text-[#3157D5] sm:text-[14px]">{course.title}</span>
        <span className="mt-1 block text-[11px] text-slate-500 sm:text-[12px]">โดย {course.instructorName} · สร้างเมื่อ {createdDate}</span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-[12px] font-bold text-[#3157D5] sm:inline-flex">
        ตรวจสอบ <ArrowRight size={14} aria-hidden="true" />
      </span>
      <ArrowRight size={17} className="shrink-0 text-[#3157D5] sm:hidden" aria-hidden="true" />
    </Link>
  );
}
