import Link from "next/link";
import type { ReactElement } from "react";

interface AdminCourseCardProps{ //กำหนดว่า Component การ์ดแสดงผลคอร์สฝั่ง ต้องรับข้อมูลรูปทรงแบบไหนเข้ามาบ้างเพื่อเอาไปแสดงผลบนหน้าจอ
    id:string;
    courseCode:string;
    title:string;
    category:string;
    description:string | null; //คำอธิบายคอร์สอาจจะมีหรือไม่มี
    status:"draft" | "pending"|"published"|"rejected"|"archived";
    price:number;
    coverImageUrl:string | null;
    createdAt:string;
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
}: AdminCourseCardProps): ReactElement {
  const isPending = status === "pending";
  const manageHref = isPending ? `/dashboard/admin/courses/${id}/review` : `/dashboard/admin/courses/${id}/lessons`;

  return (
    <div className="rounded-2xl bg-white border border-[#0F1B3D]/[0.06] overflow-hidden">
      <div className="h-[140px] bg-[#F0F1F5] flex items-center justify-center">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImageUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[#0F1B3D]/20 text-2xl">▤</span>
        )}
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

        <Link
          href={manageHref}
          className="text-[13px] font-bold text-[#3B5BFF] hover:underline inline-flex items-center gap-1"
        >
          {isPending ? "ตรวจสอบเพื่ออนุมัติ" : "จัดการบทเรียน"} <span>›</span>
        </Link>

        <p className="text-[11.5px] text-[#0F1B3D]/35 mt-3">
          สร้างเมื่อ {new Date(createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>
    </div>
  );
}