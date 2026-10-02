"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { deleteDraftCourse, setCourseArchived } from "@/app/dashboard/teacher/courses/actions";

type Mode = "archive" | "restore" | "delete";

// ===== แก้: เดิมกดแล้วข้อความ "ลบฉบับร่าง “ชื่อ” ? ยืนยัน/ยกเลิก" แทรกในแถวปุ่ม ทำให้แถวเพี้ยน
// เปลี่ยนเป็น popup (modal) ตรงกลางจอ อธิบายว่าจะลบอะไร และแสดง error ใน popup เดียวกัน =====
const COPY: Record<Mode, { label: string; title: string; description: string; confirmLabel: string; danger: boolean }> = {
  delete: {
    label: "ลบฉบับร่าง",
    title: "ลบฉบับร่าง?",
    description: "จะถูกลบถาวรและกู้คืนไม่ได้",
    confirmLabel: "ลบฉบับร่าง",
    danger: true,
  },
  archive: {
    label: "เก็บเข้าคลัง",
    title: "เก็บเข้าคลัง?",
    description: "จะถูกย้ายเข้าคลัง ไม่ได้ถูกลบ",
    confirmLabel: "เก็บเข้าคลัง",
    danger: false,
  },
  restore: {
    label: "นำออกจากคลัง",
    title: "นำออกจากคลัง?",
    description: "จะถูกนำกลับออกมาจากคลัง",
    confirmLabel: "นำออกจากคลัง",
    danger: false,
  },
};

export default function CourseLifecycleButton({
  courseId,
  courseTitle,
  mode,
  onDeleted,
  redirectTo,
  size = "compact",
}: {
  courseId: string;
  courseTitle: string;
  mode: Mode;
  onDeleted?: () => void;
  redirectTo?: string;
  // "large" = ขนาดเท่าปุ่มหลักในแถบหัวคอร์ส (px-5 py-2.5 text-[13px]); "compact" = ขนาดเดิมสำหรับในรายการ
  size?: "compact" | "large";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[mode];

  useEffect(() => setMounted(true), []);

  // ปิดด้วยปุ่ม Esc (ไม่ให้ปิดระหว่างกำลังบันทึก) + ล็อกการเลื่อนหน้าขณะ popup เปิด
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, pending]);

  function openDialog() {
    setError(null);
    setOpen(true);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = mode === "delete"
          ? await deleteDraftCourse(courseId)
          : await setCourseArchived(courseId, mode === "archive");
        if (result.error) {
          // คง popup ไว้ แล้วแสดงเหตุผลในนั้น (เช่น มีประวัติผู้เรียน ให้เก็บเข้าคลังแทน)
          setError(result.error);
          return;
        }
        setOpen(false);
        if (mode === "delete" && onDeleted) onDeleted();
        else if (mode === "delete" && redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch {
        setError("ดำเนินการไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }

  const sizeClass = size === "large" ? "px-5 py-2.5 text-[13px]" : "px-4 py-2 text-xs";
  const triggerClass =
    mode === "delete"
      ? "border-red-200 bg-white text-red-600 hover:bg-red-50"
      : "border-slate-200 bg-white text-[#0F1B3D] hover:bg-slate-50";

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`shrink-0 rounded-full border font-bold transition-colors ${sizeClass} ${triggerClass}`}
      >
        {copy.label}
      </button>

      {open && mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !pending) setOpen(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="lifecycle-dialog-title"
              aria-describedby="lifecycle-dialog-desc"
              className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-lg"
            >
              <h2 id="lifecycle-dialog-title" className="text-[15px] font-bold text-[#0F1B3D]">{copy.title}</h2>
              <p id="lifecycle-dialog-desc" className="mt-1.5 text-[13px] leading-5 text-slate-500">
                “{courseTitle}” {copy.description}
              </p>

              {error && (
                <p role="alert" className="mt-3 text-[12.5px] leading-5 text-red-600">{error}</p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-full px-4 py-2 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50"
                >
                  {error ? "ปิด" : "ยกเลิก"}
                </button>
                {!error && (
                  <button
                    type="button"
                    onClick={confirm}
                    disabled={pending}
                    autoFocus
                    className={`rounded-full px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-60 ${copy.danger ? "bg-red-600 hover:bg-red-700" : "bg-[#0F1B3D] hover:bg-[#0F1B3D]/90"}`}
                  >
                    {pending ? "กำลังบันทึก..." : copy.confirmLabel}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
