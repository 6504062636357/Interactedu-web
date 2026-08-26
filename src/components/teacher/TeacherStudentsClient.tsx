"use client";

import Link from "next/link";
import { useMemo, useState, type ReactElement } from "react";

export type StudentProgressStatus = "not_started" | "in_progress" | "completed";

export interface TeacherCourseOption {
  id: string;
  title: string;
}

export interface TeacherStudentProgressRow {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  university: string | null;
  faculty: string | null;
  courseId: string;
  courseTitle: string;
  enrolledAt: string;
  progress: number;
  completedLessons: number;
  totalLessons: number;
  latestScore: number | null;
  scoreLabel: string | null;
  nextLessonTitle: string | null;
  status: StudentProgressStatus;
}

interface TeacherStudentsClientProps {
  courses: TeacherCourseOption[];
  rows: TeacherStudentProgressRow[];
  loadError?: string;
}

const STATUS_LABELS: Record<StudentProgressStatus, string> = {
  not_started: "ยังไม่เริ่มเรียน",
  in_progress: "กำลังเรียน",
  completed: "เรียนครบแล้ว",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }): ReactElement {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className={`mt-1.5 text-[25px] font-extrabold tabular-nums ${tone}`}>{value.toLocaleString("th-TH")}</p>
    </div>
  );
}

function ProgressBar({ progress }: { progress: number }): ReactElement {
  const color = progress === 100 ? "bg-emerald-500" : progress > 0 ? "bg-[#3157D5]" : "bg-slate-300";
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-bold text-[#0F1B3D]">{progress}%</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export default function TeacherStudentsClient({
  courses,
  rows,
  loadError,
}: TeacherStudentsClientProps): ReactElement {
  const [query, setQuery] = useState("");
  const [courseId, setCourseId] = useState("all");
  const [status, setStatus] = useState<"all" | StudentProgressStatus>("all");

  const uniqueStudentCount = useMemo(
    () => new Set(rows.map((row) => row.studentId)).size,
    [rows]
  );
  const completedCount = rows.filter((row) => row.status === "completed").length;
  const inProgressCount = rows.filter((row) => row.status === "in_progress").length;

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th-TH");
    return rows.filter((row) => {
      const searchableText = [
        row.studentName,
        row.courseTitle,
        row.university ?? "",
        row.faculty ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("th-TH");
      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);
      const matchesCourse = courseId === "all" || row.courseId === courseId;
      const matchesStatus = status === "all" || row.status === status;
      return matchesQuery && matchesCourse && matchesStatus;
    });
  }, [courseId, query, rows, status]);

  const hasFilters = query.trim() !== "" || courseId !== "all" || status !== "all";

  function resetFilters(): void {
    setQuery("");
    setCourseId("all");
    setStatus("all");
  }

  return (
    <div>
      <div className="mb-7">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#FF5A3C]">Student progress</p>
        <h1 className="text-[25px] font-extrabold tracking-[-0.025em] text-[#0F1B3D]">ติดตามนักเรียน</h1>
        <p className="mt-1.5 text-[13.5px] text-slate-500">
          ดูความคืบหน้า คะแนนล่าสุด และบทเรียนที่นักเรียนต้องเรียนต่อ
        </p>
      </div>

      {loadError && (
        <div role="alert" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] font-medium text-amber-800">
          {loadError}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="นักเรียนทั้งหมด" value={uniqueStudentCount} tone="text-[#0F1B3D]" />
        <StatCard label="กำลังเรียน" value={inProgressCount} tone="text-[#3157D5]" />
        <StatCard label="เรียนครบแล้ว" value={completedCount} tone="text-emerald-600" />
      </div>

      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-[minmax(0,1fr)_220px_180px]">
        <label className="relative block">
          <span className="sr-only">ค้นหานักเรียน</span>
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อ มหาวิทยาลัย หรือคอร์ส"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-[13px] text-[#0F1B3D] outline-none transition focus:border-[#3157D5] focus:ring-2 focus:ring-[#3157D5]/10"
          />
        </label>

        <label>
          <span className="sr-only">กรองตามคอร์ส</span>
          <select
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-700 outline-none transition focus:border-[#3157D5] focus:ring-2 focus:ring-[#3157D5]/10"
          >
            <option value="all">ทุกคอร์ส</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">กรองตามสถานะ</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | StudentProgressStatus)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-700 outline-none transition focus:border-[#3157D5] focus:ring-2 focus:ring-[#3157D5]/10"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="not_started">ยังไม่เริ่มเรียน</option>
            <option value="in_progress">กำลังเรียน</option>
            <option value="completed">เรียนครบแล้ว</option>
          </select>
        </label>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium text-slate-400">
          แสดง {filteredRows.length.toLocaleString("th-TH")} จาก {rows.length.toLocaleString("th-TH")} รายการ
        </p>
        {hasFilters && (
          <button type="button" onClick={resetFilters} className="text-[12px] font-bold text-[#3157D5] hover:underline">
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-[#3157D5]">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
              <path d="M3.5 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5M16 7.5c2.4.3 4 1.9 4 4.5M16.5 15c2.3.5 3.5 2 3.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-[14px] font-bold text-slate-700">
            {courses.length === 0 ? "ยังไม่มีคอร์สของคุณ" : "ยังไม่มีนักเรียนในคอร์ส"}
          </p>
          <p className="mt-1 text-[12.5px] text-slate-400">
            {courses.length === 0
              ? "สร้างและเผยแพร่คอร์สก่อนเพื่อเริ่มรับนักเรียน"
              : "เมื่อนักเรียนลงทะเบียนสำเร็จ รายชื่อและความคืบหน้าจะแสดงที่นี่"}
          </p>
          {courses.length === 0 && (
            <Link href="/dashboard/teacher/courses/new" className="mt-5 inline-flex rounded-xl bg-[#0F1B3D] px-4 py-2.5 text-[12.5px] font-bold text-white">
              สร้างคอร์สใหม่
            </Link>
          )}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
          <p className="text-[13.5px] font-bold text-slate-600">ไม่พบนักเรียนที่ตรงกับเงื่อนไข</p>
          <button type="button" onClick={resetFilters} className="mt-2 text-[12px] font-bold text-[#3157D5] hover:underline">
            ล้างตัวกรองทั้งหมด
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80">
          <div className="hidden grid-cols-[1.4fr_1.1fr_1fr_0.8fr_1.2fr] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400 lg:grid">
            <span>นักเรียน</span>
            <span>คอร์ส</span>
            <span>ความคืบหน้า</span>
            <span>คะแนนล่าสุด</span>
            <span>บทที่ต้องเรียนต่อ</span>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredRows.map((row) => (
              <article key={row.enrollmentId} className="grid gap-4 px-5 py-4 transition-colors hover:bg-slate-50/60 lg:grid-cols-[1.4fr_1.1fr_1fr_0.8fr_1.2fr] lg:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0F1B3D] text-[11px] font-extrabold text-white">
                    {row.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : initials(row.studentName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-[#0F1B3D]">{row.studentName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      {[row.university, row.faculty].filter(Boolean).join(" · ") || `ID ${row.studentId.slice(0, 8)}`}
                    </p>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400 lg:hidden">คอร์ส</p>
                  <Link href={`/dashboard/teacher/courses/${row.courseId}`} className="line-clamp-2 text-[12.5px] font-bold text-[#3157D5] hover:underline">
                    {row.courseTitle}
                  </Link>
                  <p className="mt-1 text-[10.5px] text-slate-400">
                    ลงทะเบียน {new Date(row.enrolledAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>

                <div>
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400 lg:hidden">ความคืบหน้า</p>
                  <ProgressBar progress={row.progress} />
                  <p className="mt-1.5 text-[10.5px] text-slate-400">{row.completedLessons}/{row.totalLessons} บทเรียน · {STATUS_LABELS[row.status]}</p>
                </div>

                <div>
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400 lg:hidden">คะแนนล่าสุด</p>
                  {row.latestScore === null ? (
                    <span className="text-[12px] font-medium text-slate-400">ยังไม่มีคะแนน</span>
                  ) : (
                    <div>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-extrabold tabular-nums ${row.latestScore >= 70 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {row.latestScore}%
                      </span>
                      <p className="mt-1 text-[10px] text-slate-400">{row.scoreLabel}</p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400 lg:hidden">บทที่ต้องเรียนต่อ</p>
                  {row.totalLessons === 0 ? (
                    <span className="text-[12px] text-slate-400">คอร์สยังไม่มีบทเรียน</span>
                  ) : row.nextLessonTitle ? (
                    <p className="line-clamp-2 text-[12px] font-semibold text-slate-600">{row.nextLessonTitle}</p>
                  ) : (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">✓ เรียนครบทุกบทแล้ว</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
