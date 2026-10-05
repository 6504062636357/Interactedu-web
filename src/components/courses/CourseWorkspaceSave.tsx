"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Loader2, Save, X } from "lucide-react";

type SaveSection = () => Promise<boolean>;
type SaveFeedback = { success: boolean; message: string };
type WorkspaceSave = {
  saving: boolean;
  register: (section: string, save: SaveSection) => () => void;
  saveDraft: () => Promise<void>;
};

const WorkspaceSaveContext = createContext<WorkspaceSave | null>(null);

export function CourseWorkspaceSaveProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const sections = useRef(new Map<string, SaveSection>());
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);

  const register = useCallback((section: string, save: SaveSection) => {
    if (!enabled) return () => {};
    sections.current.set(section, save);
    return () => { sections.current.delete(section); };
  }, [enabled]);

  useEffect(() => {
    if (!feedback?.success) return;
    const timer = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function saveDraft(): Promise<void> {
    if (!enabled || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      const saves = [...sections.current.values()];
      if (!saves.length) throw new Error("ยังโหลดข้อมูลคอร์สไม่ครบ กรุณาลองใหม่");
      for (const save of saves) {
        if (!await save()) throw new Error("บันทึกได้ไม่ครบ กรุณาตรวจข้อมูลคอร์สหรือการตั้งค่าใบประกาศแล้วลองอีกครั้ง");
      }
      setFeedback({ success: true, message: "บันทึกฉบับร่างแล้ว กลับมาแก้ไขต่อได้" });
    } catch (error) {
      setFeedback({ success: false, message: error instanceof Error ? error.message : "บันทึกฉบับร่างไม่สำเร็จ กรุณาลองใหม่" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <WorkspaceSaveContext.Provider value={{ saving, register, saveDraft }}>
      {children}
      {feedback && (
        <div className={`fixed right-4 top-24 z-50 flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg sm:right-6 ${feedback.success ? "border-emerald-200" : "border-red-200"}`}>
          {feedback.success ? <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <CircleAlert size={22} className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />}
          <p role={feedback.success ? "status" : "alert"} className="min-w-0 flex-1 text-sm font-semibold leading-6 text-[#0F1B3D]">{feedback.message}</p>
          <button type="button" aria-label="ปิดการแจ้งเตือน" onClick={() => setFeedback(null)} className="-mr-2 -mt-2 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
    </WorkspaceSaveContext.Provider>
  );
}

export function useCourseWorkspaceSave(section: string, save: SaveSection): boolean {
  const context = useContext(WorkspaceSaveContext);
  const register = context?.register;
  useEffect(() => register?.(section, save), [register, section, save]);
  return context?.saving ?? false;
}

export function useCourseWorkspaceSaving(): boolean {
  return useContext(WorkspaceSaveContext)?.saving ?? false;
}

export function CourseWorkspaceSaveButton() {
  const context = useContext(WorkspaceSaveContext);
  if (!context) return null;
  return (
    <button type="button" disabled={context.saving} onClick={() => void context.saveDraft()} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#0F1B3D] px-4 text-[13px] font-bold text-white transition hover:bg-[#1D3268] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
      {context.saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
      {context.saving ? "กำลังบันทึก..." : "บันทึกฉบับร่าง"}
    </button>
  );
}
