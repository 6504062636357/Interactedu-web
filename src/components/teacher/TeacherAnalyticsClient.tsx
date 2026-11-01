"use client";

import { ArrowUpRight, BarChart3, Activity, Users, Award, DollarSign, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactElement } from "react";

export interface AnalyticsSummary {
  uniqueStudents: number;
  enrollments: number;
  activeStudents: number;
  averageProgress: number;
  completionRate: number;
  averageScore: number | null;
  scoredStudents: number;
  totalRevenue: number;
  notStarted: number;
  inProgress: number;
  completed: number;
}

export interface CourseAnalytics {
  courseId: string;
  courseTitle: string;
  totalStudents: number;
  activeStudents: number;
  averageProgress: number;
  completionRate: number;
  averageScore: number | null;
  scoredStudents: number;
  revenue: number;
  notStarted: number;
  inProgress: number;
  completed: number;
}

export interface LessonAnalytics {
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  courseTitle: string;
  totalStudents: number;
  startedStudents: number;
  completedStudents: number;
  stoppedStudents: number;
  stopRate: number;
  completionRate: number;
  // [งานข้อ 11] คะแนนแบบทดสอบระหว่างวิดีโอ (formative) — null/0 แปลว่ายังไม่มีใครตอบเลย
  // ตั้งใจแยกจาก completionRate/stopRate ข้างบนโดยสิ้นเชิง (คนละตาราง คนละความหมาย ไม่เอามารวม
  // กับคะแนนสอบท้ายคอร์ส/ใบรับรอง)
  videoQuizAverageScore: number | null;
  videoQuizAttemptedStudents: number;
}

interface TeacherAnalyticsClientProps {
  summary: AnalyticsSummary;
  courses: CourseAnalytics[];
  lessons: LessonAnalytics[];
  activeWindowDays?: number;
  dropoutGraceHours?: number;
  loadError?: string;
  videoQuizLoadError?: boolean;
  finalExamLoadError?: boolean;
  selectedCourseId?: string;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

const metricTones = {
  blue: { card: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white", icon: "bg-blue-600 text-white shadow-blue-600/20", value: "text-blue-950" },
  teal: { card: "border-teal-200/70 bg-gradient-to-br from-teal-50 to-white", icon: "bg-teal-600 text-white shadow-teal-600/20", value: "text-teal-950" },
  orange: { card: "border-orange-200/70 bg-gradient-to-br from-orange-50 to-white", icon: "bg-[#F47745] text-white shadow-orange-500/20", value: "text-orange-950" },
  violet: { card: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white", icon: "bg-violet-600 text-white shadow-violet-600/20", value: "text-violet-950" },
};

function MetricCard({ label, value, description, icon: Icon, tone }: {
  label: string; value: string; description: string; icon: LucideIcon; tone: keyof typeof metricTones;
}): ReactElement {
  const colors = metricTones[tone];
  return (
    <article className={`min-w-0 rounded-2xl border p-5 shadow-sm sm:p-6 ${colors.card}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-md ${colors.icon}`}><Icon size={17} aria-hidden="true" /></span>
        <h2 className="text-sm font-medium text-slate-700">{label}</h2>
      </div>
      <p className={`mt-4 break-words text-3xl font-semibold tracking-tight tabular-nums ${colors.value}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
    </article>
  );
}
const panelClass = "min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(30,58,138,0.035)]";
const panelHeaderClass = "border-b border-indigo-100/60 bg-gradient-to-r from-indigo-50/70 to-white px-5 py-5 sm:px-6";

export default function TeacherAnalyticsClient({
  summary,
  courses,
  lessons,
  activeWindowDays = 7,
  dropoutGraceHours = 24,
  loadError,
  videoQuizLoadError = false,
  finalExamLoadError = false,
  selectedCourseId,
}: TeacherAnalyticsClientProps): ReactElement {
  const courseId = selectedCourseId ?? "all";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const selectedCourse = courses.find((course) => course.courseId === courseId) ?? null;

  const visibleSummary: AnalyticsSummary = selectedCourse
    ? {
        uniqueStudents: selectedCourse.totalStudents,
        enrollments: selectedCourse.totalStudents,
        activeStudents: selectedCourse.activeStudents,
        averageProgress: selectedCourse.averageProgress,
        completionRate: selectedCourse.completionRate,
        averageScore: selectedCourse.averageScore,
        scoredStudents: selectedCourse.scoredStudents,
        totalRevenue: selectedCourse.revenue,
        notStarted: selectedCourse.notStarted,
        inProgress: selectedCourse.inProgress,
        completed: selectedCourse.completed,
      }
    : summary;

  const filteredCourses = courses.filter(course =>
    course.courseTitle.toLocaleLowerCase("th-TH").includes(search.trim().toLocaleLowerCase("th-TH")) &&
    (filter === "all" || (filter === "enrolled" ? course.totalStudents > 0 : course.totalStudents === 0))
  ).sort((a, b) => sort === "revenue" ? b.revenue - a.revenue : sort === "students" ? b.totalStudents - a.totalStudents : a.courseTitle.localeCompare(b.courseTitle, "th"));
  const pageCount = Math.max(1, Math.ceil(filteredCourses.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleCourses = filteredCourses.slice((currentPage - 1) * 10, currentPage * 10);
  const dropoffLessons = useMemo(
    () =>
      lessons
        .filter(
          (lesson) =>
            lesson.stoppedStudents > 0 && (courseId === "all" || lesson.courseId === courseId)
        )
        .sort((a, b) => b.stoppedStudents - a.stoppedStudents || b.stopRate - a.stopRate)
        .slice(0, 6),
    [courseId, lessons]
  );

  // [งานข้อ 11] บทเรียนที่มีคนตอบแบบทดสอบระหว่างวิดีโอแล้ว เรียงจากคะแนนเฉลี่ยต่ำสุดก่อน —
  // ช่วยครูเห็นจุดที่ผู้เรียนเข้าใจน้อยที่สุดชัดที่สุด (ตั้งใจแยกจาก dropoffLessons ข้างบน
  // ซึ่งเป็นคนละตัวชี้วัด: หยุดดูวิดีโอ ≠ ตอบควิซพลาด)
  const quizScoreLessons = useMemo(
    () =>
      lessons
        .filter(
          (lesson) =>
            (courseId === "all" || lesson.courseId === courseId)
        )
        .sort((a, b) => (a.videoQuizAverageScore ?? 101) - (b.videoQuizAverageScore ?? 101)),
    [courseId, lessons]
  );

  const totalStatuses = visibleSummary.notStarted + visibleSummary.inProgress + visibleSummary.completed;
  const completedAngle = totalStatuses ? visibleSummary.completed / totalStatuses * 360 : 0;
  const inProgressAngle = totalStatuses ? visibleSummary.inProgress / totalStatuses * 360 : 0;
  const statuses = [
    { label: "เรียนครบแล้ว", value: visibleSummary.completed, color: "bg-emerald-500" },
    { label: "กำลังเรียน", value: visibleSummary.inProgress, color: "bg-[#3157D5]" },
    { label: "ยังไม่เริ่ม", value: visibleSummary.notStarted, color: "bg-slate-200" },
  ];
  return (
    <div className="mx-auto max-w-[1200px] space-y-7 pb-8 text-slate-900">
      <header className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[#FF5A3C]">
            <BarChart3 size={15} strokeWidth={2.4} />
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.18em]">Learning analytics</p>
          </div>
          <h1 className="text-[28px] font-black tracking-[-0.035em] text-[#0F1B3D] sm:text-[32px]">{selectedCourse?.courseTitle ?? "ภาพรวมการสอน"}</h1>
          <p className="mt-2 max-w-xl text-[13px] leading-6 text-slate-500">ติดตามผลลัพธ์ผู้เรียน ค้นหาจุดที่ควรปรับปรุง และดูรายได้ของแต่ละคอร์สได้ในหน้าเดียว</p>
        </div>

        {selectedCourse && <Link href="/dashboard/teacher/analytics" className="text-sm font-medium text-blue-700 hover:underline">← กลับภาพรวมทุกคอร์ส</Link>}
      </header>

      {loadError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">{loadError}</p>}

      {courses.length === 0 ? (
        <section className={`${panelClass} px-6 py-16 text-center`}>
          <BarChart3 size={32} className="mx-auto text-blue-600" aria-hidden="true" />
          <h2 className="mt-5 text-lg font-semibold">ยังไม่มีข้อมูลสำหรับวิเคราะห์</h2>
          <p className="mt-2 text-sm text-slate-500">เริ่มสร้างคอร์ส แล้วติดตามผลเมื่อมีผู้เรียนลงทะเบียน</p>
          <Link href="/dashboard/teacher/courses/new" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">สร้างคอร์สใหม่ <ArrowUpRight size={16} /></Link>
        </section>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <section aria-label="สรุปภาพรวม" className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="ผู้เรียนทั้งหมด" value={visibleSummary.uniqueStudents.toLocaleString("th-TH")} description="จำนวนผู้เรียนไม่ซ้ำในคอร์สที่เลือก" icon={Users} tone="blue" />
              <MetricCard label="ผู้เรียนที่เข้าเรียนล่าสุด" value={visibleSummary.activeStudents.toLocaleString("th-TH")} description={`เข้าเรียนภายใน ${activeWindowDays} วันที่ผ่านมา`} icon={Activity} tone="teal" />
              <MetricCard label={selectedCourse ? "คะแนนสอบท้ายคอร์ส" : "รายการที่สอบท้ายคอร์สแล้ว"} value={finalExamLoadError ? "—" : selectedCourse ? formatPercent(visibleSummary.averageScore) : visibleSummary.scoredStudents.toLocaleString("th-TH")} description={finalExamLoadError ? "โหลดคะแนนไม่สำเร็จ กรุณาลองรีเฟรชหน้า" : selectedCourse ? `ใช้คะแนนครั้งล่าสุด · สอบแล้ว ${visibleSummary.scoredStudents} คน / ยังไม่สอบ ${Math.max(0, visibleSummary.enrollments - visibleSummary.scoredStudents)} คน` : "นับแยกตามการลงทะเบียนแต่ละคอร์ส"} icon={Award} tone="orange" />
              <MetricCard label="รายได้ยืนยันแล้ว" value={formatMoney(visibleSummary.totalRevenue)} description="จากรายการลงทะเบียนที่อนุมัติแล้ว" icon={DollarSign} tone="violet" />
            </section>

            <section className="flex min-w-0 flex-col rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/60 p-5 shadow-sm sm:p-6" aria-labelledby="learning-status-title">
              <h2 id="learning-status-title" className="text-base font-semibold text-[#0F1B3D]">สถานะการเรียน</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">นับแยกตามรายการลงทะเบียน ไม่ใช่จำนวนคน</p>
              <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 sm:flex-row sm:gap-8">
                <div role="img" aria-label={totalStatuses ? statuses.map(status => `${status.label} ${status.value} รายการ`).join(', ') : "ยังไม่มีรายการลงทะเบียน"} className="flex h-44 w-44 shrink-0 items-center justify-center rounded-full shadow-[0_8px_28px_rgba(49,87,213,0.12)] ring-8 ring-white/80" style={{ background: `conic-gradient(#10b981 0deg ${completedAngle}deg, #3157D5 ${completedAngle}deg ${completedAngle + inProgressAngle}deg, #e2e8f0 ${completedAngle + inProgressAngle}deg 360deg)` }}>
                  <div className="flex h-[140px] w-[140px] flex-col items-center justify-center rounded-full bg-white shadow-inner">
                    <span className="text-3xl font-semibold tracking-tight text-[#0F1B3D] tabular-nums">{totalStatuses ? formatPercent(visibleSummary.completionRate) : "—"}</span>
                    <span className="mt-1 text-xs text-slate-500">เรียนครบแล้ว</span>
                  </div>
                </div>
                <dl className="w-full min-w-0 space-y-4 sm:max-w-48">
                  {statuses.map(status => <div key={status.label} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-sm text-slate-600"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.color}`} />{status.label}</dt>
                    <dd className="text-base font-semibold text-[#0F1B3D] tabular-nums">{status.value.toLocaleString("th-TH")}</dd>
                  </div>)}
                </dl>
              </div>
              <p className="border-t border-indigo-100 pt-4 text-xs text-slate-500">รวม {visibleSummary.enrollments.toLocaleString("th-TH")} รายการลงทะเบียน</p>
            </section>
          </div>
          {!selectedCourse && <section className={panelClass} aria-labelledby="course-results-title">
            <div className={`${panelHeaderClass} flex items-center justify-between gap-4`}>
              <div><h2 id="course-results-title" className="text-base font-semibold">ผลลัพธ์รายคอร์ส</h2><p className="mt-1 text-sm text-slate-500">เปรียบเทียบการเรียนและผลสอบของแต่ละคอร์ส</p></div>
              <span className="shrink-0 text-sm text-slate-500">{filteredCourses.length} / {courses.length} คอร์ส</span>
            </div>
            <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-[2fr_1fr_1fr]">
              <label className="text-xs text-slate-600">ค้นหาคอร์ส<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="พิมพ์ชื่อคอร์ส…" className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-blue-600" /></label>
              <label className="text-xs text-slate-600">ผู้เรียน<select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-blue-600"><option value="all">ทุกคอร์ส</option><option value="enrolled">มีผู้เรียนแล้ว</option><option value="empty">ยังไม่มีผู้เรียน</option></select></label>
              <label className="text-xs text-slate-600">เรียงตาม<select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-blue-600"><option value="name">ชื่อคอร์ส</option><option value="students">ผู้เรียนมากที่สุด</option><option value="revenue">รายได้มากที่สุด</option></select></label>
            </div>
            <div className="overflow-x-auto" role="region" aria-label="ตารางผลลัพธ์รายคอร์ส เลื่อนแนวนอนเพื่อดูข้อมูลทั้งหมด" tabIndex={0}>
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">ผลลัพธ์รายคอร์สในมุมมองที่เลือก</caption>
                <thead className="border-b border-slate-100 bg-slate-50/80 text-xs text-slate-500"><tr>
                  <th scope="col" className="px-6 py-3 font-medium">คอร์ส</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">ผู้เรียน</th>
                  <th scope="col" className="px-4 py-3 font-medium">ความคืบหน้าเฉลี่ย</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">เรียนจบ</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">สอบแล้ว (รายการ)</th>
                  <th scope="col" className="px-6 py-3 text-right font-medium">รายได้</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleCourses.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">ไม่พบคอร์สที่ตรงกับการค้นหา <button type="button" onClick={() => { setSearch(""); setFilter("all"); setPage(1); }} className="ml-2 text-blue-700 underline">ล้างตัวกรอง</button></td></tr>}
                  {visibleCourses.map(course => <tr key={course.courseId} className="hover:bg-slate-50/60">
                    <th scope="row" className="max-w-80 px-6 py-5 font-medium"><Link href={`/dashboard/teacher/analytics/${course.courseId}`} className="inline-flex items-start gap-2 leading-6 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600"><span>{course.courseTitle}</span></Link><p className="mt-1 text-xs font-normal text-slate-500">เข้าเรียนใน {activeWindowDays} วัน: {course.activeStudents} คน</p></th>
                    <td className="px-4 py-5 text-right tabular-nums">{course.totalStudents}</td>
                    <td className="min-w-36 px-4 py-5"><span className="text-xs tabular-nums">{formatPercent(course.averageProgress)}</span><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${course.averageProgress}%` }} /></div></td>
                    <td className="px-4 py-5 text-right tabular-nums">{formatPercent(course.completionRate)}</td>
                    <td className="px-4 py-5 text-right tabular-nums">{finalExamLoadError ? "—" : course.scoredStudents}</td>
                    <td className="whitespace-nowrap px-6 py-5 text-right font-medium tabular-nums">{formatMoney(course.revenue)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 text-sm">
              <p aria-live="polite" className="text-slate-500">{filteredCourses.length} คอร์ส · หน้า {currentPage} / {pageCount}</p>
              <div className="flex gap-2"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">ก่อนหน้า</button><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">ถัดไป</button></div>
            </div>
          </section>}

          {selectedCourse && <div>
            <h2 className="text-lg font-semibold">เจาะลึกบทเรียน</h2>
            <p className="mt-1 text-sm text-slate-500">ดูจุดที่ผู้เรียนยังเรียนค้าง และผลจากคำถามระหว่างดูวิดีโอ</p>
            <div className="mt-4 grid items-start gap-5 xl:grid-cols-2">
              <section className={panelClass} aria-labelledby="unfinished-lessons-title">
                <div className={panelHeaderClass}>
                  <h3 id="unfinished-lessons-title" className="text-base font-semibold">บทเรียนที่ยังไม่ได้กลับมาเรียนต่อ</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">ยังเรียนไม่จบและไม่ได้กลับมาเกิน {dropoutGraceHours} ชั่วโมง</p>
                  <p className="mt-2 text-xs text-slate-500">สูงสุด 6 บทเรียน · เรียงตามจำนวนผู้เรียน</p>
                </div>
                {dropoffLessons.length === 0 ? <p className="px-6 py-10 text-sm leading-6 text-slate-500">{visibleSummary.enrollments === 0 ? "ยังไม่มีผู้เรียนสำหรับวิเคราะห์" : "ยังไม่มีบทเรียนที่ค้างเกินช่วงเวลาที่กำหนด"}</p> : (
                  <ul className="divide-y divide-slate-100">
                    {dropoffLessons.map(lesson => <li key={lesson.lessonId} className="flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
                      <div className="min-w-0"><p className="break-words text-sm font-medium leading-6">{lesson.lessonTitle}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{lesson.courseTitle}</p></div>
                      <div className="w-24 shrink-0 text-right"><p className="text-lg font-semibold tabular-nums">{lesson.stoppedStudents} <span className="text-xs font-normal text-slate-500">คน</span></p><p className="mt-1 text-xs leading-5 text-slate-500">จากผู้เริ่มเรียน {lesson.startedStudents} คน</p></div>
                    </li>)}
                  </ul>
                )}
              </section>
              <section className={panelClass} aria-labelledby="video-quiz-title">
                <div className={panelHeaderClass}>
                  <h3 id="video-quiz-title" className="text-base font-semibold">คะแนนแบบทดสอบระหว่างเรียน</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">เฉพาะคำถามในวิดีโอ ไม่ใช้ตัดสินการรับใบรับรอง</p>
                  <p className="mt-2 text-xs text-slate-500">ทุกบทเรียน · เรียงจากคะแนนเฉลี่ยน้อยไปมาก</p>
                </div>
                {videoQuizLoadError ? <p role="alert" className="px-6 py-6 text-sm leading-6 text-amber-800">โหลดคะแนนไม่สำเร็จ กรุณาลองรีเฟรชหน้าอีกครั้ง</p> : quizScoreLessons.length === 0 ? <p className="px-6 py-10 text-sm leading-6 text-slate-500">ยังไม่มีบทเรียนในคอร์สนี้</p> : (
                  <ul className="divide-y divide-slate-100">
                    {quizScoreLessons.map(lesson => <li key={lesson.lessonId} className="flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
                      <div className="min-w-0"><p className="break-words text-sm font-medium leading-6">{lesson.lessonTitle}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{lesson.courseTitle}</p><p className="mt-2 text-xs text-slate-500">ตอบแล้ว {lesson.videoQuizAttemptedStudents} คน</p></div>
                      <div className="w-24 shrink-0 text-right"><p className="text-lg font-semibold text-blue-700 tabular-nums">{formatPercent(lesson.videoQuizAverageScore)}</p><p className="mt-1 text-xs text-slate-500">คะแนนเฉลี่ย</p></div>
                    </li>)}
                  </ul>
                )}
              </section>
            </div>
          </div>}
        </>
      )}
    </div>
  );
}
