"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ReactElement } from "react";

export type CourseStatusFilter = "all" | "published" | "pending" | "draft" | "rejected";

interface StatusCounts {
  all: number;
  published: number;
  pending: number;
  draft: number;
  rejected: number;
}

interface CourseStatusTabsProps {
  counts: StatusCounts;
}

const TABS: { value: CourseStatusFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "published", label: "เผยแพร่แล้ว" },
  { value: "pending", label: "รออนุมัติ" },
  { value: "draft", label: "ฉบับร่าง" },
  { value: "rejected", label: "ตีกลับ" },
];

export default function CourseStatusTabs({ counts }: CourseStatusTabsProps): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentStatus = (searchParams.get("status") as CourseStatusFilter) || "all";

  const handleTabClick = (status: CourseStatusFilter): void => {
    const params = new URLSearchParams(searchParams.toString());

    if (status === "all") {
      params.delete("status");
    } else {
      params.set("status", status);
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="flex items-center gap-2 border-b border-[#0F1B3D]/[0.08] mb-6 overflow-x-auto">
      {TABS.map((tab) => {
        const isActive = currentStatus === tab.value;
        const count = counts[tab.value];

        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleTabClick(tab.value)}
            className={`relative flex items-center gap-1.5 px-4 py-3 text-[14px] font-bold whitespace-nowrap transition-colors ${
              isActive
                ? "text-[#0F1B3D]"
                : "text-[#0F1B3D]/40 hover:text-[#0F1B3D]/70"
            }`}
          >
            {tab.label}
            <span
              className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                isActive ? "bg-[#0F1B3D]/[0.08] text-[#0F1B3D]" : "bg-[#0F1B3D]/[0.05] text-[#0F1B3D]/40"
              }`}
            >
              {count}
            </span>
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#FF5A3C] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}