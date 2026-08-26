import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import TeacherAnalyticsClient, {
  type AnalyticsSummary,
  type CourseAnalytics,
  type LessonAnalytics,
} from "@/components/teacher/TeacherAnalyticsClient";
import { createClient } from "@/utils/supabase/server";

const ACTIVE_WINDOW_DAYS = 7;
const DROPOFF_GRACE_HOURS = 24;

interface CourseRow {
  id: string;
  title: string;
  price: number | string | null;
}

interface EnrollmentRow {
  id: string;
  student_id: string;
  course_id: string;
  paid_amount: number | string | null;
  payment_slip_url: string | null;
}

interface LessonRow {
  id: string;
  title: string;
  order_index: number;
}

interface ModuleRow {
  id: string;
  course_id: string;
  order_index: number;
  lessons: LessonRow[];
}

interface TrackingRow {
  enrollment_id: string;
  lesson_id: string;
  lesson_status: string | null;
  video_completed: boolean | null;
  score_raw: number | string | null;
  quiz_score_recorded: boolean | null;
  course_final_exam_recorded: boolean | null;
  quiz_attempted_at: string | null;
  last_accessed: string | null;
}

interface EnrollmentMetric {
  studentId: string;
  progress: number;
  completed: boolean;
  score: number | null;
  active: boolean;
  revenue: number;
}

const EMPTY_SUMMARY: AnalyticsSummary = {
  uniqueStudents: 0,
  enrollments: 0,
  activeStudents: 0,
  averageProgress: 0,
  completionRate: 0,
  averageScore: null,
  scoredStudents: 0,
  totalRevenue: 0,
  notStarted: 0,
  inProgress: 0,
  completed: 0,
};

function isLessonCompleted(row: TrackingRow | undefined): boolean {
  return Boolean(
    row &&
      (row.video_completed === true || row.lesson_status === "completed" || row.lesson_status === "passed")
  );
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function percentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function safeMoney(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

function currentTimestamp(): number {
  return Date.now();
}

function latestTimestamp(rows: TrackingRow[]): string | null {
  let latest: string | null = null;
  let latestTime = 0;

  for (const row of rows) {
    const timestamp = row.last_accessed ?? row.quiz_attempted_at;
    if (!timestamp) continue;
    const time = new Date(timestamp).getTime();
    if (Number.isFinite(time) && time > latestTime) {
      latest = timestamp;
      latestTime = time;
    }
  }

  return latest;
}

function latestScore(rows: TrackingRow[]): number | null {
  const latest = rows
    .filter(
      (row) =>
        row.score_raw !== null &&
        (row.course_final_exam_recorded === true || row.quiz_score_recorded === true)
    )
    .sort((a, b) => {
      const dateDiff =
        new Date(b.quiz_attempted_at ?? 0).getTime() - new Date(a.quiz_attempted_at ?? 0).getTime();
      if (dateDiff !== 0) return dateDiff;
      return Number(b.course_final_exam_recorded) - Number(a.course_final_exam_recorded);
    })[0];

  if (!latest) return null;
  const score = Number(latest.score_raw);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score * 10) / 10)) : null;
}

function buildSummary(metrics: EnrollmentMetric[]): AnalyticsSummary {
  const completed = metrics.filter((metric) => metric.completed).length;
  const notStarted = metrics.filter((metric) => metric.progress === 0).length;
  const inProgress = metrics.length - completed - notStarted;
  const scores = metrics.flatMap((metric) => (metric.score === null ? [] : [metric.score]));
  const activeStudents = new Set(
    metrics.filter((metric) => metric.active).map((metric) => metric.studentId)
  ).size;

  return {
    uniqueStudents: new Set(metrics.map((metric) => metric.studentId)).size,
    enrollments: metrics.length,
    activeStudents,
    averageProgress: average(metrics.map((metric) => metric.progress)),
    completionRate: percentage(completed, metrics.length),
    averageScore: scores.length > 0 ? average(scores) : null,
    scoredStudents: scores.length,
    totalRevenue: Math.round(metrics.reduce((sum, metric) => sum + metric.revenue, 0) * 100) / 100,
    notStarted,
    inProgress,
    completed,
  };
}

export default async function TeacherAnalyticsPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/dashboard/teacher/analytics");

  const { data: courseData, error: courseError } = await supabase
    .from("courses")
    .select("id, title, price")
    .eq("created_by", user.id)
    .order("title", { ascending: true });

  if (courseError) {
    return (
      <TeacherAnalyticsClient
        summary={EMPTY_SUMMARY}
        courses={[]}
        lessons={[]}
        loadError="โหลดข้อมูลคอร์สไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      />
    );
  }

  const courses = (courseData ?? []) as CourseRow[];
  if (courses.length === 0) {
    return <TeacherAnalyticsClient summary={EMPTY_SUMMARY} courses={[]} lessons={[]} />;
  }

  const courseIds = courses.map((course) => course.id);
  const [enrollmentWithRevenue, modulesResult] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, student_id, course_id, paid_amount, payment_slip_url")
      .in("course_id", courseIds)
      .eq("status", "approved"),
    supabase
      .from("modules")
      .select("id, course_id, order_index, lessons(id, title, order_index)")
      .in("course_id", courseIds)
      .order("order_index", { ascending: true }),
  ]);

  let enrollmentData = (enrollmentWithRevenue.data ?? []) as EnrollmentRow[];
  let enrollmentError = enrollmentWithRevenue.error;
  let revenueSnapshotUnavailable = false;

  // Keep analytics usable before the paid_amount migration reaches production.
  if (enrollmentError) {
    const legacyEnrollmentResult = await supabase
      .from("enrollments")
      .select("id, student_id, course_id, payment_slip_url")
      .in("course_id", courseIds)
      .eq("status", "approved");

    if (legacyEnrollmentResult.error) {
      enrollmentError = legacyEnrollmentResult.error;
      enrollmentData = [];
    } else {
      enrollmentError = null;
      revenueSnapshotUnavailable = true;
      enrollmentData = (legacyEnrollmentResult.data ?? []).map((enrollment) => ({
        ...enrollment,
        paid_amount: null,
      })) as EnrollmentRow[];
    }
  }

  const enrollments = enrollmentData;
  const modules = (modulesResult.data ?? []) as unknown as ModuleRow[];
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
  const trackingWithScores = enrollmentIds.length
    ? await supabase
        .from("scorm_tracking")
        .select(
          "enrollment_id, lesson_id, lesson_status, video_completed, score_raw, quiz_score_recorded, course_final_exam_recorded, quiz_attempted_at, last_accessed"
        )
        .in("enrollment_id", enrollmentIds)
    : { data: [] as TrackingRow[], error: null };

  let trackingData = (trackingWithScores.data ?? []) as TrackingRow[];
  let trackingError = trackingWithScores.error;
  let scoreColumnsUnavailable = false;

  // Older databases may not yet have the score metadata columns.
  if (trackingError && enrollmentIds.length > 0) {
    const legacyTrackingResult = await supabase
      .from("scorm_tracking")
      .select("enrollment_id, lesson_id, lesson_status, video_completed, score_raw, last_accessed")
      .in("enrollment_id", enrollmentIds);

    if (legacyTrackingResult.error) {
      trackingError = legacyTrackingResult.error;
      trackingData = [];
    } else {
      trackingError = null;
      scoreColumnsUnavailable = true;
      trackingData = (legacyTrackingResult.data ?? []).map((row) => ({
        ...row,
        quiz_score_recorded: row.score_raw !== null,
        course_final_exam_recorded: false,
        quiz_attempted_at: null,
      })) as TrackingRow[];
    }
  }

  const trackingRows = trackingData;
  const lessonsByCourse = new Map<string, LessonRow[]>();
  const trackingByEnrollment = new Map<string, TrackingRow[]>();
  const coursePriceById = new Map(courses.map((course) => [course.id, safeMoney(course.price)]));

  for (const moduleRow of modules) {
    const lessons = lessonsByCourse.get(moduleRow.course_id) ?? [];
    lessons.push(...[...(moduleRow.lessons ?? [])].sort((a, b) => a.order_index - b.order_index));
    lessonsByCourse.set(moduleRow.course_id, lessons);
  }

  for (const row of trackingRows) {
    const rows = trackingByEnrollment.get(row.enrollment_id) ?? [];
    rows.push(row);
    trackingByEnrollment.set(row.enrollment_id, rows);
  }

  const now = currentTimestamp();
  const activeThreshold = now - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const dropoutThreshold = now - DROPOFF_GRACE_HOURS * 60 * 60 * 1000;
  const enrollmentMetrics = new Map<string, EnrollmentMetric>();

  for (const enrollment of enrollments) {
    const lessons = lessonsByCourse.get(enrollment.course_id) ?? [];
    const tracking = trackingByEnrollment.get(enrollment.id) ?? [];
    const trackingByLesson = new Map(tracking.map((row) => [row.lesson_id, row]));
    const completedLessons = lessons.filter((lesson) =>
      isLessonCompleted(trackingByLesson.get(lesson.id))
    ).length;
    const progress = lessons.length > 0 ? Math.min(100, Math.round((completedLessons / lessons.length) * 100)) : 0;
    const latestActivity = latestTimestamp(tracking);
    const latestActivityTime = latestActivity ? new Date(latestActivity).getTime() : 0;
    const storedRevenue = safeMoney(enrollment.paid_amount);
    const fallbackRevenue = enrollment.payment_slip_url ? coursePriceById.get(enrollment.course_id) ?? 0 : 0;

    enrollmentMetrics.set(enrollment.id, {
      studentId: enrollment.student_id,
      progress,
      completed: lessons.length > 0 && progress === 100,
      score: latestScore(tracking),
      active: latestActivityTime >= activeThreshold,
      revenue: storedRevenue || fallbackRevenue,
    });
  }

  const courseAnalytics: CourseAnalytics[] = courses.map((course) => {
    const courseEnrollments = enrollments.filter((enrollment) => enrollment.course_id === course.id);
    const metrics = courseEnrollments
      .map((enrollment) => enrollmentMetrics.get(enrollment.id))
      .filter((metric): metric is EnrollmentMetric => Boolean(metric));
    const courseSummary = buildSummary(metrics);

    return {
      courseId: course.id,
      courseTitle: course.title,
      totalStudents: courseSummary.uniqueStudents,
      activeStudents: courseSummary.activeStudents,
      averageProgress: courseSummary.averageProgress,
      completionRate: courseSummary.completionRate,
      averageScore: courseSummary.averageScore,
      scoredStudents: courseSummary.scoredStudents,
      revenue: courseSummary.totalRevenue,
      notStarted: courseSummary.notStarted,
      inProgress: courseSummary.inProgress,
      completed: courseSummary.completed,
    };
  });

  const lessonAnalytics: LessonAnalytics[] = courses.flatMap((course) => {
    const courseEnrollments = enrollments.filter((enrollment) => enrollment.course_id === course.id);

    return (lessonsByCourse.get(course.id) ?? []).map((lesson) => {
      const lessonRows = courseEnrollments.flatMap((enrollment) => {
        const row = (trackingByEnrollment.get(enrollment.id) ?? []).find(
          (tracking) => tracking.lesson_id === lesson.id
        );
        return row ? [row] : [];
      });
      const completedStudents = lessonRows.filter((row) => isLessonCompleted(row)).length;
      const stoppedStudents = lessonRows.filter((row) => {
        if (isLessonCompleted(row) || !row.last_accessed) return false;
        const lastAccessed = new Date(row.last_accessed).getTime();
        return Number.isFinite(lastAccessed) && lastAccessed < dropoutThreshold;
      }).length;

      return {
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        courseId: course.id,
        courseTitle: course.title,
        totalStudents: courseEnrollments.length,
        startedStudents: lessonRows.length,
        completedStudents,
        stoppedStudents,
        stopRate: percentage(stoppedStudents, lessonRows.length),
        completionRate: percentage(completedStudents, courseEnrollments.length),
      };
    });
  });

  const summary = buildSummary([...enrollmentMetrics.values()]);
  const hasQueryError = Boolean(enrollmentError || modulesResult.error || trackingError);
  const usesLegacySchema = revenueSnapshotUnavailable || scoreColumnsUnavailable;

  return (
    <TeacherAnalyticsClient
      summary={summary}
      courses={courseAnalytics}
      lessons={lessonAnalytics}
      activeWindowDays={ACTIVE_WINDOW_DAYS}
      dropoutGraceHours={DROPOFF_GRACE_HOURS}
      loadError={
        hasQueryError
          ? "ข้อมูลบางส่วนโหลดไม่สำเร็จ กรุณารัน migration ล่าสุดหรือตรวจสอบ RLS ของ Supabase"
          : usesLegacySchema
            ? "กำลังใช้โหมดรองรับฐานข้อมูลเดิม รายได้จะคำนวณจากราคาคอร์สปัจจุบันจนกว่าจะรัน migration ล่าสุด"
            : undefined
      }
    />
  );
}
