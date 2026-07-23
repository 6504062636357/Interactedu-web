import Link from "next/link";
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
  return (
    <Link
      href={`/dashboard/admin/courses/${course.id}/review`}
      className="flex items-center gap-3 py-3.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-slate-900 truncate">
          {course.title}
        </p>
        <p className="text-[12px] text-slate-500">โดย {course.instructorName}</p>
      </div>
      <span className="text-[12px] font-semibold text-blue-950 shrink-0 flex items-center gap-1">
        ตรวจสอบ <span>›</span>
      </span>
    </Link>
  );
}