"use client";

import { useEffect, useState } from "react";
import type { ReactElement } from "react";

export default function PlusBadge({ expiresAt, dark = false }: { expiresAt: string; dark?: boolean }): ReactElement | null {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      if (remaining <= 0 || !Number.isFinite(remaining)) setVisible(false);
      else timeout = setTimeout(checkExpiry, Math.min(remaining, 60_000));
    };
    timeout = setTimeout(checkExpiry, 0);
    return () => clearTimeout(timeout);
  }, [expiresAt]);
  if (!visible) return null;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${dark ? "border border-white/25 bg-white/15 text-white" : "border border-blue-200 bg-blue-50 text-[#3157D5]"}`}>
      ✦ Plus
    </span>
  );
}
