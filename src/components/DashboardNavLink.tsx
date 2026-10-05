import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { MouseEventHandler, ReactElement } from "react";

interface DashboardNavLinkProps {
  href: string;
  label: string;
  icon: ReactElement;
  active?: boolean;
  badge?: number;
  showChevron?: boolean;
  role?: "menuitem";
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export default function DashboardNavLink({ href, label, icon, active = false, badge, showChevron = false, role, onClick }: DashboardNavLinkProps): ReactElement {
  return (
    <Link
      href={href}
      onClick={onClick}
      role={role}
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-12 min-w-0 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[12.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5] focus-visible:ring-offset-2 ${
        active
          ? "bg-[linear-gradient(135deg,#0F1B3D,#1D3268)] text-white shadow-[0_8px_20px_rgba(15,27,61,0.16)]"
          : "text-slate-500 hover:bg-slate-100 hover:text-[#0F1B3D]"
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
        active ? "bg-white/10 text-[#FF8B73]" : "bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-[#3157D5]"
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="min-w-6 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-center text-[11px] font-bold text-amber-700">{badge}</span>
      )}
      {showChevron && (
        <ChevronRight size={14} aria-hidden="true" className={`shrink-0 transition-opacity ${active ? "text-white/50" : "text-slate-300 opacity-0 group-hover:opacity-100"}`} />
      )}
    </Link>
  );
}
