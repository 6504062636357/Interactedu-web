import type { ReactNode } from "react";
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
  variant?: "default" | "card";
  price?: ReactNode;
}

export default function CourseAccessActions({ courseId, slug, hasAccess, membership = false, started = false, saved = false, savingAvailable = true, variant = "default", price }: CourseAccessActionsProps) {
  const isCard = variant === "card";
  const action = (
    <Link
      href={hasAccess ? `/dashboard/student/courses/${courseId}?start=1` : `/courses/${slug}/enroll`}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-[#0F1B3D] px-4 py-2.5 font-bold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] focus-visible:ring-offset-2 ${isCard ? `rounded-full text-[13px] ${hasAccess ? "shadow-[0_4px_12px_rgba(15,27,61,0.12)] hover:bg-[#19284F]" : "hover:bg-[#FF5A3C]"}` : "rounded-xl text-sm hover:bg-[#3157D5]"}`}
    >
      {isCard && hasAccess && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden="true">
          <path d="M8 5.5a1 1 0 0 1 1.52-.85l9 5.5a1 1 0 0 1 0 1.7l-9 5.5A1 1 0 0 1 8 16.5z" />
        </svg>
      )}
      {hasAccess ? started ? "เรียนต่อ" : "เริ่มเรียน" : "ลงทะเบียน"}
    </Link>
  );

  return (
    <div className={`relative z-20 flex w-full flex-col ${isCard ? "gap-3" : "gap-2"}`}>
      {isCard ? <div className="flex min-w-0 items-center justify-between gap-3">{price}{action}</div> : action}
      {hasAccess && membership && !started && (
        <SaveCourseButton courseId={courseId} initialSaved={saved} available={savingAvailable} variant={variant} />
      )}
    </div>
  );
}
