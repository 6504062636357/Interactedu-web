"use client";

import { Award, BookOpenText, FileText } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";

interface ManagementTab {
  id: string;
  label: string;
  description?: string;
  content: ReactNode;
}

export default function CourseManagementTabs({
  tabs,
  ariaLabel = "ส่วนที่ต้องการจัดการในคอร์ส",
}: {
  tabs: ManagementTab[];
  ariaLabel?: string;
}): ReactElement {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const idPrefix = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={`mb-6 grid gap-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-[0_8px_30px_rgba(15,27,61,0.05)] ${tabs.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
      >
        {tabs.map((tab, index) => {
          const selected = activeTab === tab.id;
          const Icon = tab.id === "lessons" ? BookOpenText : tab.id === "certificate" ? Award : FileText;
          return (
            <button
              key={tab.id}
              ref={(element) => { tabRefs.current[index] = element; }}
              id={`${idPrefix}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:text-left ${selected ? "border-[#0F1B3D] bg-[#0F1B3D] text-white shadow-[0_8px_18px_rgba(15,27,61,0.18)]" : "border-transparent bg-slate-50/80 text-[#0F1B3D] hover:border-slate-200 hover:bg-white"}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-white/10 text-[#FF8A72]" : "bg-white text-[#0F1B3D]/55 shadow-sm"}`}>
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11.5px] font-extrabold leading-4 sm:text-[13px]">{tab.label}</span>
                {tab.description && (
                  <span className={`mt-0.5 hidden text-[10.5px] leading-4 md:block ${selected ? "text-white/65" : "text-slate-400"}`}>
                    {tab.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${idPrefix}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-${tab.id}`}
          tabIndex={0}
          hidden={activeTab !== tab.id}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
