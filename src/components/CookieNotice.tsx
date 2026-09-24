"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";

const STORAGE_KEY = "cookie-notice-dismissed";

export default function CookieNotice(): ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // เข้าถึง localStorage ไม่ได้ (private mode ฯลฯ) — แสดงแบนเนอร์ตามปกติโดยไม่จำสถานะ
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ไม่สามารถบันทึกได้ก็ไม่เป็นไร แค่จะเด้งขึ้นมาอีกครั้งตอนโหลดหน้าใหม่
    }
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="การแจ้งเตือนการใช้คุกกี้"
      className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 sm:px-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 rounded-2xl bg-[#0F1B3D] p-5 shadow-[0_8px_30px_rgba(15,27,61,0.35)] sm:flex-row sm:items-center sm:gap-5">
        <p className="flex-1 text-[13px] leading-relaxed text-white/80">
          เว็บไซต์นี้ใช้คุกกี้ที่จำเป็นต่อการทำงาน เช่น การเข้าสู่ระบบและรักษาความปลอดภัยของบัญชีท่าน เราไม่ใช้คุกกี้เพื่อการวิเคราะห์หรือโฆษณา{" "}
          <Link href="/cookies" className="font-semibold text-[#FF9478] underline underline-offset-2 hover:text-[#FFB199]">
            อ่านนโยบายคุกกี้
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="w-full shrink-0 rounded-full bg-[#FF5A3C] px-6 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#e64f31] sm:w-auto"
        >
          เข้าใจแล้ว
        </button>
      </div>
    </div>
  );
}
