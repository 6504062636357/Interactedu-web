"use client";

import { useMemo, useState, type ReactElement } from "react";
import Link from "next/link";
import { CATEGORIES, CATEGORY_COLORS, type Category } from "@/lib/constants/categories";
import { DEFAULT_COURSE_COVER_URL } from "@/lib/constants/course-cover";
import FavoriteHeartButton from "@/components/FavoriteHeartButton";

export interface ExplorerCourse {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  price: number;
  cover_image_url: string | null;
  total_duration_seconds: number;
  lesson_count: number;
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชั่วโมง`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes} นาที ${secs} วินาที` : `${minutes} นาที`;
  }
  return `${secs} วินาที`;
}

function formatPrice(price: number): string {
  return `฿${price.toLocaleString("th-TH")}`;
}

function CourseCard({ course, isEnrolled }: { course: ExplorerCourse; isEnrolled: boolean }): ReactElement {
  const tagColor =
    (course.category && CATEGORY_COLORS[course.category as Category]) ?? "bg-[#0F1B3D] text-white";

  return (
    <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-[#0F1B3D]/[0.06] bg-white shadow-[0_1px_2px_rgba(15,27,61,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-18px_rgba(15,27,61,0.22)] focus-within:ring-2 focus-within:ring-[#3157D5]">
      <Link
        href={`/courses/${course.slug}`}
        aria-label={`ดูรายละเอียดคอร์ส ${course.title}`}
        className="absolute inset-0 z-10"
      />
      <div className="relative h-40 bg-gradient-to-br from-[#0F1B3D]/[0.04] to-[#0F1B3D]/[0.09] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={course.cover_image_url ?? DEFAULT_COURSE_COVER_URL}
          alt={course.title}
          className="w-full h-full object-cover"
        />
        {course.category && (
          <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full ${tagColor}`}>
            {course.category}
          </span>
        )}
        <div className="absolute top-2 right-2 z-20 bg-white/90 rounded-full">
          <FavoriteHeartButton courseId={course.id} />
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-[15.5px] font-bold text-[#0F1B3D] leading-snug mb-1.5 line-clamp-2">{course.title}</h3>
        <p className="text-[13px] text-[#0F1B3D]/50 mb-4 font-medium">
          {course.lesson_count} บทเรียน · {formatDuration(course.total_duration_seconds)}
        </p>

        <div className="mt-auto pt-4 border-t border-[#0F1B3D]/[0.06] flex items-center justify-between">
          <span className={`text-[17px] font-extrabold ${course.price === 0 ? "text-[#00B37E]" : "text-[#0F1B3D]"}`}>
            {course.price === 0 ? "ฟรี" : formatPrice(course.price)}
          </span>
          <Link
            href={isEnrolled ? `/dashboard/student/courses/${course.id}` : `/courses/${course.slug}`}
            className="relative z-20 text-[13px] font-bold text-white bg-[#0F1B3D] group-hover:bg-[#FF5A3C] px-4 py-2.5 rounded-full transition-colors"
          >
            {isEnrolled ? "เข้าเรียนต่อ" : "ลงทะเบียน"}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CoursesExplorer({
  courses,
  enrolledCourseIds = [],
  initialFreeOnly = false,
}: {
  courses: ExplorerCourse[];
  enrolledCourseIds?: string[];
  initialFreeOnly?: boolean;
}): ReactElement {
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [freeOnly, setFreeOnly] = useState(initialFreeOnly);
  const enrolledSet = useMemo(() => new Set(enrolledCourseIds), [enrolledCourseIds]);

  function toggleCategory(category: Category) {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses.filter((course) => {
      const matchesQuery = q.length === 0 || course.title.toLowerCase().includes(q);
      const matchesCategory =
        selectedCategories.length === 0 ||
        (course.category !== null && selectedCategories.includes(course.category as Category));
      const matchesFree = !freeOnly || course.price === 0;
      return matchesQuery && matchesCategory && matchesFree;
    });
  }, [courses, query, selectedCategories, freeOnly]);

  return (
    <>
      {/* แถบค้นหา + ตัวกรองหมวดหมู่ — ลอยทับขอบล่างของ Hero เหมือนหน้าแรก */}
      <div className="relative z-20 -mt-10 sm:-mt-14">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="bg-white rounded-[28px] shadow-[0_30px_60px_-25px_rgba(15,27,61,0.35)] border border-[#0F1B3D]/[0.06] p-6 sm:p-8">
            <label htmlFor="course-search" className="block text-[15px] font-bold text-[#0F1B3D] mb-3">
              อยากเรียนเรื่องอะไรดี?
            </label>
            <div className="relative mb-7">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                className="absolute left-4 top-1/2 -translate-y-1/2"
              >
                <circle cx="11" cy="11" r="7" stroke="#0F1B3D" strokeOpacity="0.35" strokeWidth="1.8" />
                <path d="M21 21L16.65 16.65" stroke="#0F1B3D" strokeOpacity="0.35" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                id="course-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาด้วยชื่อคอร์สหรือหัวข้อ"
                className="w-full text-[14.5px] font-medium text-[#0F1B3D] placeholder:text-[#0F1B3D]/35 bg-[#0F1B3D]/[0.03] border border-[#0F1B3D]/[0.06] rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:border-[#FF5A3C]/50 focus:bg-white transition-colors"
              />
            </div>

            <p className="text-[13px] font-bold text-[#0F1B3D]/50 tracking-[0.04em] mb-3">เลือกหมวดหมู่</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => {
                const active = selectedCategories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    aria-pressed={active}
                    className={`text-[13px] font-semibold px-4 py-2 rounded-full border transition-colors ${
                      active
                        ? "bg-[#0F1B3D] text-white border-[#0F1B3D]"
                        : "bg-white text-[#0F1B3D]/70 border-[#0F1B3D]/12 hover:border-[#0F1B3D]/30 hover:text-[#0F1B3D]"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setFreeOnly((prev) => !prev)}
                aria-pressed={freeOnly}
                className={`text-[13px] font-semibold px-4 py-2 rounded-full border transition-colors ${
                  freeOnly
                    ? "bg-[#00B37E] text-white border-[#00B37E]"
                    : "bg-white text-[#0F1B3D]/70 border-[#0F1B3D]/12 hover:border-[#00B37E]/40 hover:text-[#00B37E]"
                }`}
              >
                คอร์สฟรีเท่านั้น
              </button>
              {(selectedCategories.length > 0 || freeOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategories([]);
                    setFreeOnly(false);
                  }}
                  className="text-[13px] font-bold text-[#FF5A3C] px-4 py-2 rounded-full hover:bg-[#FF5A3C]/[0.06] transition-colors"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ผลลัพธ์ */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 pt-14 pb-24 lg:pb-28">
        <div className="mb-10 flex items-end justify-between">
          <h2 className="text-[22px] sm:text-[26px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
            {query || selectedCategories.length > 0 ? "ผลการค้นหา" : "คอร์สทั้งหมด"}
          </h2>
          <span className="text-[13px] text-[#0F1B3D]/45 font-semibold">{filtered.length} คอร์ส</span>
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filtered.map((course) => (
              <CourseCard key={course.id} course={course} isEnrolled={enrolledSet.has(course.id)} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
            <p className="text-[14px] text-[#0F1B3D]/40 font-medium">
              ไม่พบคอร์สที่ตรงกับการค้นหา ลองเปลี่ยนคำค้นหรือหมวดหมู่ดูนะ
            </p>
          </div>
        )}
      </section>
    </>
  );
}
