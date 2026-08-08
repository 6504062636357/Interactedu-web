import Link from "next/link";
import type { ReactElement } from "react";

interface AdminCourseCardProps {
    id:string;
    courseCode:string | null;
    title:string;
    category:string | null;
    description:string | null; //คำอธิบายคอร์สอาจจะมีหรือไม่มี
    status:"draft" | "pending"|"published"|"rejected"|"archived";
    price:number;
    coverImageUrl:string | null;
    createdAt:string;
    instructorName:string;
}

const STATUS_LABEL: Record<AdminCourseCardProps["status"], string> = {
  draft: "ฉบับร่าง",
  pending: "รออนุมัติ",
  published: "เผยแพร่แล้ว",
  rejected: "ตีกลับ",
  archived: "เก็บถาวร",
};

const STATUS_COLOR: Record<AdminCourseCardProps["status"], string> = {
  draft: "bg-[#0F1B3D]/[0.06] text-[#0F1B3D]/60",
  pending: "bg-[#FFB020]/15 text-[#B8790A]",
  published: "bg-[#00B37E]/15 text-[#00996b]",
  rejected: "bg-[#EB4A2D]/15 text-[#EB4A2D]",
  archived: "bg-[#0F1B3D]/[0.06] text-[#0F1B3D]/40",
};

export default function AdminCourseCard({
  id,
  courseCode,
  title,
  category,
  description,
  status,
  price,
  coverImageUrl,
  createdAt,
  instructorName,
}: AdminCourseCardProps): ReactElement {
  const isPending = status === "pending";
  const manageHref = isPending ? `/dashboard/admin/courses/${id}/review` : `/dashboard/admin/courses/${id}`;

  return (
    <article className={`overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-[0_16px_38px_-22px_rgba(15,27,61,0.35)] ${isPending ? "border-amber-200 ring-1 ring-amber-100" : "border-slate-200/70"}`}>
      <div className="relative flex h-[150px] items-center justify-center bg-[#F0F1F5]">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImageUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl text-[#0F1B3D]/20">▤</span>
        )}
        {isPending && <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-extrabold text-amber-950 shadow-sm">รอตรวจ</span>}
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-bold text-[#3B5BFF]">{courseCode ?? "—"}</span>
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>

        <h3 className="text-[16px] font-bold text-[#0F1B3D] mb-1 line-clamp-1">{title}</h3>
        {category && <p className="text-[13px] text-[#0F1B3D]/50 mb-1">{category}</p>}
        {description && (
          <p className="text-[13px] text-[#0F1B3D]/60 mb-4 line-clamp-1">{description}</p>
        )}

        <div className="mb-4 flex items-center justify-between gap-3 text-[11.5px] text-slate-400">
          <span className="truncate">โดย {instructorName}</span>
          <span className="shrink-0 font-semibold text-slate-600">{Number(price) === 0 ? "ฟรี" : `฿${Number(price).toLocaleString("th-TH")}`}</span>
        </div>

        <Link
          href={manageHref}
          className={`inline-flex w-full items-center justify-center gap-1 rounded-xl px-4 py-2.5 text-[12.5px] font-bold transition-colors ${isPending ? "bg-[#FF6B50] text-white hover:bg-[#F15B40]" : "bg-slate-100 text-[#0F1B3D] hover:bg-slate-200"}`}
        >
          {isPending ? "ตรวจสอบเพื่ออนุมัติ" : "จัดการคอร์ส"} <span>›</span>
        </Link>

        <p className="text-[11.5px] text-[#0F1B3D]/35 mt-3">
          สร้างเมื่อ {new Date(createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>
    </article>
  );
}
