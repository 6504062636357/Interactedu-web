"use client";

import {
  Activity,
  ArrowUpRight,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle,
  Clock,
  DollarSign,
  Filter,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
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
}

interface TeacherAnalyticsClientProps {
  summary: AnalyticsSummary;
  courses: CourseAnalytics[];
  lessons: LessonAnalytics[];
  activeWindowDays?: number;
  dropoutGraceHours?: number;
  loadError?: string;
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

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  iconClassName,
  glowClassName,
}: {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  glowClassName: string;
}): ReactElement {
  return (
    <article className="group relative overflow-hidden rounded-[22px] border border-slate-200/70 bg-white p-5 shadow-[0_8px_30px_rgba(15,27,61,0.05)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_38px_rgba(15,27,61,0.09)]">
      <div className={`absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-60 blur-2xl ${glowClassName}`} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">{label}</p>
          <p className="mt-3 text-[27px] font-black tracking-[-0.04em] text-[#0F1B3D] tabular-nums">{value}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`}>
          <Icon size={19} strokeWidth={2.2} />
        </span>
      </div>
      <p className="relative mt-2 text-[11px] leading-5 text-slate-400">{description}</p>
    </article>
    
  );
}

function StatusPill({ label, value, tone }: { label: string; value: number; tone: string }): ReactElement {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${tone}`} />
        <span className="text-[10.5px] font-semibold text-slate-500">{label}</span>
      </div>
      <p className="mt-1.5 text-[18px] font-black text-[#0F1B3D] tabular-nums">{value.toLocaleString("th-TH")}</p>
    </div>
  );
}

export default function TeacherAnalyticsClient({
  summary,
  courses,
  lessons,
  activeWindowDays = 7,
  dropoutGraceHours = 24,
  loadError,
}: TeacherAnalyticsClientProps): ReactElement {
  const [courseId, setCourseId] = useState("all");
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

  const visibleCourses = selectedCourse ? [selectedCourse] : courses;
  const activeRate = percent(visibleSummary.activeStudents, visibleSummary.uniqueStudents);
  const topRevenueCourse = [...visibleCourses].sort((a, b) => b.revenue - a.revenue)[0] ?? null;
  const topCompletionCourse = [...visibleCourses]
    .filter((course) => course.totalStudents > 0)
    .sort((a, b) => b.completionRate - a.completionRate)[0] ?? null;
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

  return (
    <div className="mx-auto max-w-[1040px]">
      <header className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[#FF5A3C]">
            <BarChart3 size={15} strokeWidth={2.4} />
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.18em]">Learning analytics</p>
          </div>
          <h1 className="text-[28px] font-black tracking-[-0.035em] text-[#0F1B3D] sm:text-[32px]">ภาพรวมการสอน</h1>
          <p className="mt-2 max-w-xl text-[13px] leading-6 text-slate-500">ติดตามผลลัพธ์ผู้เรียน ค้นหาจุดที่ควรปรับปรุง และดูรายได้ของแต่ละคอร์สได้ในหน้าเดียว</p>
        </div>

        {courses.length > 0 && (
          <label className="relative block lg:w-[275px]">
            <span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400">มุมมองข้อมูล</span>
            <Filter className="pointer-events-none absolute bottom-3 left-3.5 text-slate-400" size={15} />
            <select
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              className="h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-white pl-10 pr-9 text-[12.5px] font-bold text-[#0F1B3D] shadow-sm outline-none transition focus:border-[#3157D5] focus:ring-4 focus:ring-[#3157D5]/10"
            >
              <option value="all">ทุกคอร์ส</option>
              {courses.map((course) => (
                <option key={course.courseId} value={course.courseId}>{course.courseTitle}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute bottom-[13px] right-4 text-[10px] text-slate-400">▼</span>
          </label>
        )}
      </header>

      {loadError && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3.5 text-[12px] font-medium leading-5 text-amber-800">
          <Clock className="mt-0.5 shrink-0" size={16} />
          <span>{loadError}</span>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="relative overflow-hidden rounded-[28px] border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/60 px-6 py-20 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#3157D5] shadow-[0_10px_30px_rgba(49,87,213,0.12)]">
            <BarChart3 size={25} />
          </div>
          <p className="mt-5 text-[16px] font-extrabold text-[#0F1B3D]">ยังไม่มีข้อมูลสำหรับวิเคราะห์</p>
          <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-6 text-slate-400">สร้างคอร์สก่อน แล้ว dashboard จะเริ่มแสดงเมื่อมีนักเรียนลงทะเบียน</p>
          <Link href="/dashboard/teacher/courses/new" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0F1B3D] px-5 py-3 text-[12px] font-bold text-white shadow-lg shadow-[#0F1B3D]/15 transition hover:-translate-y-0.5 hover:bg-[#192a57]">
            สร้างคอร์สใหม่ <ArrowUpRight size={15} />
          </Link>
        </div>
      ) : (
        <>
          <section className="relative mb-5 overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0F1B3D_0%,#162B60_58%,#3157D5_145%)] px-6 py-6 text-white shadow-[0_18px_45px_rgba(15,27,61,0.18)] sm:px-7">
            <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[45px] border-white/[0.04]" />
            <div className="absolute -bottom-16 right-28 h-36 w-36 rounded-full bg-[#FF5A3C]/10 blur-2xl" />
            <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="mb-3 flex items-center gap-2 text-blue-100">
                  <Sparkles size={14} />
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.13em]">Live course pulse</span>
                </div>
                <p className="text-[13px] font-medium text-blue-100">{selectedCourse?.courseTitle ?? "ภาพรวมทุกคอร์ส"}</p>
                <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <p className="text-[34px] font-black tracking-[-0.05em] sm:text-[40px]">{visibleSummary.uniqueStudents.toLocaleString("th-TH")}</p>
                  <p className="pb-1.5 text-[12px] text-blue-100">ผู้เรียนทั้งหมด · {visibleSummary.enrollments.toLocaleString("th-TH")} รายการลงทะเบียน</p>
                </div>
                <div className="mt-5 h-1.5 max-w-md overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#FF755C,#FFB36A)]" style={{ width: `${visibleSummary.averageProgress}%` }} />
                </div>
                <p className="mt-2 text-[10.5px] text-blue-200">ความคืบหน้าเฉลี่ย {formatPercent(visibleSummary.averageProgress)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[300px]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur-sm">
                  <Activity size={17} className="text-[#8EAAFF]" />
                  <p className="mt-3 text-[22px] font-black tabular-nums">{activeRate}%</p>
                  <p className="mt-1 text-[10.5px] text-blue-100">อัตรา Active {activeWindowDays} วัน</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur-sm">
                  <Award size={17} className="text-[#FF9E8C]" />
                  <p className="mt-3 truncate text-[13px] font-extrabold">{topCompletionCourse?.courseTitle ?? "ยังไม่มีข้อมูล"}</p>
                  <p className="mt-2 text-[10.5px] text-blue-100">เรียนจบสูงสุด {formatPercent(topCompletionCourse?.completionRate ?? null)}</p>
                </div>
              </div>
            </div>
          </section>

          <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard
              label="นักเรียน Active"
              value={visibleSummary.activeStudents.toLocaleString("th-TH")}
              description={`มีการเข้าเรียนภายใน ${activeWindowDays} วันที่ผ่านมา`}
              icon={Users}
              iconClassName="bg-blue-50 text-[#3157D5]"
              glowClassName="bg-blue-200"
            />
            <MetricCard
              label="อัตราเรียนจบ"
              value={formatPercent(visibleSummary.completionRate)}
              description={`${visibleSummary.completed.toLocaleString("th-TH")} รายการเรียนครบทุกบท`}
              icon={CheckCircle}
              iconClassName="bg-emerald-50 text-emerald-600"
              glowClassName="bg-emerald-200"
            />
            <MetricCard
              label="คะแนนเฉลี่ย"
              value={formatPercent(visibleSummary.averageScore)}
              description={`${visibleSummary.scoredStudents.toLocaleString("th-TH")} รายการมีคะแนนยืนยันแล้ว`}
              icon={Award}
              iconClassName="bg-orange-50 text-[#FF5A3C]"
              glowClassName="bg-orange-200"
            />
            <MetricCard
              label="รายได้ยืนยันแล้ว"
              value={formatMoney(visibleSummary.totalRevenue)}
              description={topRevenueCourse ? `สูงสุดจาก ${topRevenueCourse.courseTitle}` : "เฉพาะ enrollment ที่อนุมัติแล้ว"}
              icon={DollarSign}
              iconClassName="bg-violet-50 text-violet-600"
              glowClassName="bg-violet-200"
            />
          </div>

          <div className="mb-6 grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
            <section className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_8px_30px_rgba(15,27,61,0.045)] sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-extrabold text-[#0F1B3D]">Engagement</p>
                  <p className="mt-1 text-[11px] text-slate-400">สัดส่วนสถานะผู้เรียน</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{visibleSummary.enrollments} enrollments</span>
              </div>

              <div className="my-7 flex justify-center">
                <div
                  role="img"
                  aria-label={`อัตราเรียนจบ ${formatPercent(visibleSummary.completionRate)}`}
                  className="relative flex h-40 w-40 items-center justify-center rounded-full"
                  style={{ background: `conic-gradient(#3157D5 ${visibleSummary.completionRate * 3.6}deg, #EEF2FF 0deg)` }}
                >
                  <div className="flex h-[118px] w-[118px] flex-col items-center justify-center rounded-full bg-white shadow-inner">
                    <span className="text-[28px] font-black tracking-[-0.04em] text-[#0F1B3D]">{formatPercent(visibleSummary.completionRate)}</span>
                    <span className="mt-1 text-[10px] font-semibold text-slate-400">เรียนจบ</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <StatusPill label="ยังไม่เริ่ม" value={visibleSummary.notStarted} tone="bg-slate-300" />
                <StatusPill label="กำลังเรียน" value={visibleSummary.inProgress} tone="bg-[#3157D5]" />
                <StatusPill label="เรียนครบ" value={visibleSummary.completed} tone="bg-emerald-500" />
              </div>
            </section>

            <section className="overflow-hidden rounded-[24px] border border-slate-200/70 bg-white shadow-[0_8px_30px_rgba(15,27,61,0.045)]">
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
                <div>
                  <h2 className="text-[15px] font-extrabold text-[#0F1B3D]">ผลลัพธ์รายคอร์ส</h2>
                  <p className="mt-1 text-[11px] text-slate-400">ผู้เรียน ผลสำเร็จ และรายได้ในมุมมองเดียว</p>
                </div>
                <span className="rounded-xl bg-blue-50 px-3 py-1.5 text-[10.5px] font-extrabold text-[#3157D5]">{visibleCourses.length} คอร์ส</span>
              </div>

              <div className="divide-y divide-slate-100">
                {visibleCourses.map((course) => (
                  <div key={course.courseId} className="group px-5 py-4 transition hover:bg-slate-50/70 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <Link href={`/dashboard/teacher/courses/${course.courseId}`} className="inline-flex max-w-full items-center gap-1.5 text-[12.5px] font-extrabold text-[#0F1B3D] transition group-hover:text-[#3157D5]">
                          <span className="truncate">{course.courseTitle}</span>
                          <ArrowUpRight className="shrink-0 opacity-0 transition group-hover:opacity-100" size={13} />
                        </Link>
                        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-[linear-gradient(90deg,#3157D5,#7290F0)] transition-all duration-500" style={{ width: `${course.averageProgress}%` }} />
                        </div>
                        <p className="mt-1.5 text-[10px] text-slate-400">ความคืบหน้าเฉลี่ย {formatPercent(course.averageProgress)}</p>
                      </div>
                      <p className="shrink-0 text-[14px] font-black text-[#0F1B3D] tabular-nums">{formatMoney(course.revenue)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{course.totalStudents} ผู้เรียน</span>
                      <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-[#3157D5]">{course.activeStudents} active</span>
                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">จบ {formatPercent(course.completionRate)}</span>
                      <span className="rounded-lg bg-orange-50 px-2.5 py-1 text-[10px] font-semibold text-orange-700">คะแนน {formatPercent(course.averageScore)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="overflow-hidden rounded-[24px] border border-slate-200/70 bg-white shadow-[0_8px_30px_rgba(15,27,61,0.045)]">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-end sm:px-6">
              <div>
                <div className="flex items-center gap-2">
                  <BookOpen className="text-[#FF5A3C]" size={17} />
                  <h2 className="text-[15px] font-extrabold text-[#0F1B3D]">บทเรียนที่คนหยุดดูมากที่สุด</h2>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">เริ่มเรียนแล้วแต่ยังไม่จบ และไม่มี activity เกิน {dropoutGraceHours} ชั่วโมง</p>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><Clock size={12} /> เรียงตามจำนวนผู้เรียน</span>
            </div>

            {dropoffLessons.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle size={21} />
                </div>
                <p className="mt-4 text-[13px] font-bold text-emerald-700">
                  {visibleSummary.enrollments === 0 ? "ยังไม่มีผู้เรียนสำหรับวิเคราะห์" : "ยังไม่พบบทเรียนที่นักเรียนหยุดดู"}
                </p>
              </div>
            ) : (
              <div className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
                {dropoffLessons.map((lesson, index) => (
                  <div key={lesson.lessonId} className="group p-5 transition hover:bg-red-50/30 sm:p-6">
                    <div className="flex items-start gap-3.5">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-black ${index === 0 ? "bg-[#FF5A3C] text-white shadow-lg shadow-[#FF5A3C]/20" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-[12.5px] font-extrabold text-[#0F1B3D]">{lesson.lessonTitle}</p>
                            <p className="mt-1 line-clamp-1 text-[10.5px] text-slate-400">{lesson.courseTitle}</p>
                          </div>
                          <span className="shrink-0 text-[15px] font-black text-[#FF5A3C] tabular-nums">{lesson.stoppedStudents} คน</span>
                        </div>
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-red-100">
                          <div className="h-full rounded-full bg-[linear-gradient(90deg,#FF5A3C,#FF947F)]" style={{ width: `${lesson.stopRate}%` }} />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                          <span>เริ่มดู {lesson.startedStudents} คน · เรียนจบ {lesson.completedStudents} คน</span>
                          <span className="font-bold text-red-500">หยุด {formatPercent(lesson.stopRate)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
