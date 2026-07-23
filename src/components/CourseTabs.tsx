"use client";

import { useState, type ReactElement } from "react";

interface LessonItem {
  id: string;
  title: string;
  video_duration_seconds: number;
  order_index: number;
}

interface ModuleItem {
  id: string;
  title: string;
  order_index: number;
  lessons: LessonItem[];
}

interface CourseTabsProps {
  description: string | null;
  modules: ModuleItem[];
}

const tabs = ["รายละเอียด", "เนื้อหาในคอร์ส"] as const;
type Tab = (typeof tabs)[number];

function formatLessonDuration(seconds: number): string {
  if (seconds <= 0) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours} ชม. ${rem} นาที` : `${hours} ชม.`;
}

function ModuleAccordion({ module, index }: { module: ModuleItem; index: number }): ReactElement {
  const [open, setOpen] = useState<boolean>(index === 0);

  return (
    <div className="border-b border-[#0F1B3D]/[0.08] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-5 text-left"
      >
        <div className="flex items-center gap-4">
          <span className="text-[13px] font-bold text-[#0F1B3D]/30 tracking-wider">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-[15.5px] font-bold text-[#0F1B3D]">{module.title}</span>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" stroke="#0F1B3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="pb-5 pl-[38px] space-y-3">
          {module.lessons.length > 0 ? (
            module.lessons.map((lesson) => (
              <div key={lesson.id} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 text-[14px] text-[#0F1B3D]/70 font-medium">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    <path
                      d="M8 6.5v11l9-5.5-9-5.5z"
                      stroke="#FF5A3C"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {lesson.title}
                </div>
                {lesson.video_duration_seconds > 0 && (
                  <span className="text-[12.5px] text-[#0F1B3D]/40 font-medium shrink-0">
                    {formatLessonDuration(lesson.video_duration_seconds)}
                  </span>
                )}
              </div>
            ))
          ) : (
            <p className="text-[13.5px] text-[#0F1B3D]/40 font-medium">ยังไม่มีบทเรียนในบทนี้</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CourseTabs({ description, modules }: CourseTabsProps): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>("รายละเอียด");

  return (
    <div className="mt-10 rounded-3xl bg-white border border-[#0F1B3D]/[0.06] overflow-hidden">
      <div className="flex items-center gap-1 px-6 pt-2 border-b border-[#0F1B3D]/[0.08]">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`relative px-4 py-4 text-[14.5px] font-bold transition-colors ${
              activeTab === tab ? "text-[#0F1B3D]" : "text-[#0F1B3D]/40 hover:text-[#0F1B3D]/70"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute left-4 right-4 -bottom-px h-[2.5px] bg-[#FF5A3C] rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="p-6 sm:p-8">
        {activeTab === "รายละเอียด" && (
          <p className="text-[15px] leading-relaxed text-[#0F1B3D]/60 whitespace-pre-line">
            {description ?? "ยังไม่มีคำอธิบายสำหรับคอร์สนี้"}
          </p>
        )}

        {activeTab === "เนื้อหาในคอร์ส" && (
          <div>
            {modules.length > 0 ? (
              modules.map((module, i) => <ModuleAccordion key={module.id} module={module} index={i} />)
            ) : (
              <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ยังไม่มีเนื้อหาในคอร์สนี้</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}