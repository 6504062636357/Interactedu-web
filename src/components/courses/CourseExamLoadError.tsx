"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CourseExamLoadError({ message, backHref }: { message: string; backHref: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center" aria-busy={pending}>
      <p role="alert" className="mb-2 text-[15px] font-bold text-red-500">{message}</p>
      <p className="mb-6 text-[13.5px] text-[#0F1B3D]/50">
        การเชื่อมต่ออาจขัดข้องชั่วคราว กรุณาลองใหม่ ข้อมูลที่บันทึกไว้จะไม่ถูกแก้ไข
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => router.refresh())}
          className="min-h-11 rounded-xl bg-[#0F1B3D] px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-[#0F1B3D]/90 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "กำลังโหลดใหม่…" : "ลองใหม่"}
        </button>
        <Link href={backHref} className="min-h-11 rounded-xl border border-[#0F1B3D]/10 px-5 py-2.5 text-[13.5px] font-bold text-[#0F1B3D] hover:bg-[#0F1B3D]/5">
          กลับไปจัดการคอร์ส
        </Link>
      </div>
    </div>
  );
}
