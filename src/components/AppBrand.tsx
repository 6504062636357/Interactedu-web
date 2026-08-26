import Link from "next/link";
import type { ReactElement } from "react";

interface AppBrandProps {
  href?: string;
  subtitle?: string;
  compact?: boolean;
  inverse?: boolean;
}

export default function AppBrand({
  href = "/",
  subtitle,
  compact = false,
  inverse = false,
}: AppBrandProps): ReactElement {
  return (
    <Link href={href} className="group inline-flex min-w-0 items-center gap-3" aria-label="Interact Edu">
      <span className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-[#0F1B3D] shadow-[0_8px_22px_rgba(15,27,61,0.18)] transition duration-300 group-hover:-rotate-3 group-hover:scale-105 ${compact ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-[15px]"}`}>
        <span className="absolute -right-2 -top-3 h-7 w-7 rounded-full bg-[#3157D5] blur-md" />
        <svg className="relative" width={compact ? 18 : 21} height={compact ? 18 : 21} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="#FF795F" strokeWidth="1.9" strokeLinejoin="round" />
          <path d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className={`block truncate font-black tracking-[-0.035em] ${compact ? "text-[17px]" : "text-[19px]"} ${inverse ? "text-white" : "text-[#0F1B3D]"}`}>
          Interact Edu
        </span>
        {subtitle && (
          <span className={`mt-0.5 block truncate text-[10.5px] font-medium ${inverse ? "text-white/50" : "text-slate-400"}`}>
            {subtitle}
          </span>
        )}
      </span>
    </Link>
  );
}
