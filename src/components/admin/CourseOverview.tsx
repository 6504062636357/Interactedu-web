import type { ReactElement } from "react";

export interface CourseOverviewDetails {
  title: string;
  courseCode: string | null;
  category: string | null;
  description: string | null;
  price: number;
  coverImageUrl: string | null;
}

export default function CourseOverview({
  title,
  courseCode,
  category,
  description,
  price,
  coverImageUrl,
}: CourseOverviewDetails): ReactElement {
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
      <dl className="grid content-start gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-bold text-slate-400">ชื่อคอร์ส</dt>
          <dd className="mt-1 text-[16px] font-extrabold text-[#0F1B3D]">{title}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold text-slate-400">รหัสคอร์ส</dt>
          <dd className="mt-1 text-[13px] font-semibold text-[#0F1B3D]">{courseCode?.trim() || "ไม่ระบุ"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold text-slate-400">หมวดวิชา</dt>
          <dd className="mt-1 text-[13px] font-semibold text-[#0F1B3D]">{category?.trim() || "ไม่ระบุ"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold text-slate-400">ราคา</dt>
          <dd className="mt-1 text-[13px] font-semibold text-[#0F1B3D]">
            {price === 0 ? "ฟรี" : `${new Intl.NumberFormat("th-TH").format(price)} บาท`}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-bold text-slate-400">คำอธิบาย</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-700">
            {description?.trim() || "ยังไม่มีคำอธิบาย"}
          </dd>
        </div>
      </dl>
      <div>
        <p className="mb-2 text-[11px] font-bold text-slate-400">รูปปกคอร์ส</p>
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImageUrl} alt={`รูปปกคอร์ส ${title}`} className="aspect-video w-full rounded-xl border border-slate-200 object-cover" />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
            ยังไม่มีรูปปก
          </div>
        )}
      </div>
    </div>
  );
}
