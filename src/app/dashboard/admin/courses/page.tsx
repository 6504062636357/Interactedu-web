import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import CourseStatusTabs, { type CourseStatusFilter } from "./components/CourseStatusTabs";
import AdminCourseCard from "./components/AdminCourseCard";

const VALID_STATUSES: CourseStatusFilter[] = ["all", "published", "pending", "draft", "rejected"];

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}): Promise<ReactElement> {
  const { status, q } = await searchParams;
  const activeStatus = VALID_STATUSES.includes(status as CourseStatusFilter)
    ? (status as CourseStatusFilter)
    : "all";
  const searchTerm = q?.trim().toLocaleLowerCase("th-TH") ?? "";

  const supabase = await createClient();

  const { data: allCourses, error } = await supabase
    .from("courses")
    .select("id, course_code, title, category, description, status, price, cover_image_url, created_at, created_by")
    .order("created_at", { ascending: false });

  const courses = allCourses ?? [];
  const creatorIds = [...new Set(courses.map((course) => course.created_by).filter((id): id is string => Boolean(id)))];
  const { data: creators, error: creatorsError } = creatorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
    : { data: [], error: null };
  const creatorNames = new Map((creators ?? []).map((profile) => [profile.id, profile.full_name ?? "ไม่ระบุชื่อ"]));

  const counts = {
    all: courses.length,
    published: courses.filter((c) => c.status === "published").length,
    pending: courses.filter((c) => c.status === "pending").length,
    draft: courses.filter((c) => c.status === "draft").length,
    rejected: courses.filter((c) => c.status === "rejected").length,
  };

  const filteredCourses = courses.filter((course) => {
    const matchesStatus = activeStatus === "all" || course.status === activeStatus;
    const searchableText = `${course.course_code ?? ""} ${course.title ?? ""} ${course.category ?? ""}`.toLocaleLowerCase("th-TH");
    return matchesStatus && (!searchTerm || searchableText.includes(searchTerm));
  });

  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Course management</p>
          <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#0F1B3D] sm:text-[32px]">จัดการคอร์ส</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">ตรวจสอบสถานะ เนื้อหา และการเผยแพร่คอร์สทั้งหมด</p>
        </div>
        <Link href="/dashboard/admin/courses/new" className="inline-flex w-fit items-center rounded-xl bg-[#0F1B3D] px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#192A55]">
          + เพิ่มคอร์สใหม่
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/70 bg-white px-5 py-4"><p className="text-[11.5px] text-slate-400">ทั้งหมด</p><p className="mt-1 text-[22px] font-extrabold text-[#0F1B3D]">{counts.all}</p></div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-5 py-4"><p className="text-[11.5px] text-amber-600">รอตรวจสอบ</p><p className="mt-1 text-[22px] font-extrabold text-amber-700">{counts.pending}</p></div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-5 py-4"><p className="text-[11.5px] text-emerald-600">เผยแพร่แล้ว</p><p className="mt-1 text-[22px] font-extrabold text-emerald-700">{counts.published}</p></div>
        <div className="rounded-2xl border border-red-100 bg-red-50/70 px-5 py-4"><p className="text-[11.5px] text-red-500">ตีกลับ</p><p className="mt-1 text-[22px] font-extrabold text-red-600">{counts.rejected}</p></div>
      </div>

      {(error || creatorsError) && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] font-medium text-red-700">
          โหลดข้อมูลคอร์สไม่ครบ กรุณารีเฟรชหน้าอีกครั้ง
        </div>
      )}

      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5">
        <form method="get" className="mb-1 flex flex-col gap-3 sm:flex-row">
          {activeStatus !== "all" && <input type="hidden" name="status" value={activeStatus} />}
          <label className="relative flex-1">
            <span className="sr-only">ค้นหาคอร์ส</span>
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/><path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <input name="q" defaultValue={q ?? ""} placeholder="ค้นหาจากชื่อ รหัส หรือหมวดคอร์ส" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-[13px] outline-none transition focus:border-[#3157D5] focus:bg-white" />
          </label>
          <button type="submit" className="rounded-xl bg-slate-100 px-5 py-2.5 text-[12.5px] font-bold text-slate-700 hover:bg-slate-200">ค้นหา</button>
        </form>

        <CourseStatusTabs counts={counts} />

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredCourses.map((course) => (
            <AdminCourseCard
              key={course.id}
              id={course.id}
              courseCode={course.course_code}
              title={course.title}
              category={course.category}
              description={course.description}
              status={course.status}
              price={course.price}
              coverImageUrl={course.cover_image_url}
              createdAt={course.created_at}
              instructorName={course.created_by ? creatorNames.get(course.created_by) ?? "ไม่ระบุชื่อ" : "ไม่ระบุชื่อ"}
            />
          ))}
        </div>

        {filteredCourses.length === 0 && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">▤</div>
            <p className="text-[13.5px] font-bold text-slate-600">ไม่พบคอร์สที่ตรงกับตัวกรอง</p>
            <p className="mt-1 text-[12px] text-slate-400">ลองเปลี่ยนสถานะหรือคำค้นหา</p>
          </div>
        )}
      </div>
    </div>
  );
}
