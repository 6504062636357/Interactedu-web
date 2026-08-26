import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import TeacherStudentsClient, {
  type TeacherCourseOption,
  type TeacherStudentProgressRow,
} from "@/components/teacher/TeacherStudentsClient";
import { createClient } from "@/utils/supabase/server";

interface CourseRow {
  id: string;
  title: string;
}

interface EnrollmentRow {
  id: string;
  student_id: string;
  course_id: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  university: string | null;
  faculty: string | null;
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
}

function isCompleted(row: TrackingRow | undefined): boolean {
  return Boolean(
    row &&
      (row.video_completed === true || row.lesson_status === "completed" || row.lesson_status === "passed")
  );
}

function scoreFromTracking(rows: TrackingRow[]): {
  score: number | null;
  label: string | null;
} {
  const scoredRows = rows
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
    });

  const latest = scoredRows[0];
  if (!latest) return { score: null, label: null };

  const numericScore = Number(latest.score_raw);
  if (!Number.isFinite(numericScore)) return { score: null, label: null };

  return {
    score: Math.max(0, Math.min(100, Math.round(numericScore * 100) / 100)),
    label: latest.course_final_exam_recorded ? "ข้อสอบท้ายคอร์ส" : "ควิซล่าสุด",
  };
}

export default async function TeacherStudentsPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/dashboard/teacher/students");

  const { data: courseData, error: courseError } = await supabase
    .from("courses")
    .select("id, title")
    .eq("created_by", user.id)
    .order("title", { ascending: true });

  const courses = (courseData ?? []) as CourseRow[];
  const courseOptions: TeacherCourseOption[] = courses.map((course) => ({
    id: course.id,
    title: course.title,
  }));

  if (courseError) {
    return (
      <TeacherStudentsClient
        courses={[]}
        rows={[]}
        loadError="โหลดข้อมูลคอร์สไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      />
    );
  }

  if (courses.length === 0) {
    return <TeacherStudentsClient courses={[]} rows={[]} />;
  }

  const courseIds = courses.map((course) => course.id);
  const { data: enrollmentData, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("id, student_id, course_id, created_at")
    .in("course_id", courseIds)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (enrollmentError) {
    return (
      <TeacherStudentsClient
        courses={courseOptions}
        rows={[]}
        loadError="โหลดรายชื่อนักเรียนไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ฐานข้อมูลแล้วลองใหม่"
      />
    );
  }

  const enrollments = (enrollmentData ?? []) as EnrollmentRow[];
  if (enrollments.length === 0) {
    return <TeacherStudentsClient courses={courseOptions} rows={[]} />;
  }

  const studentIds = [...new Set(enrollments.map((enrollment) => enrollment.student_id))];
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);

  const [profilesResult, modulesResult, trackingResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, university, faculty")
      .in("id", studentIds),
    supabase
      .from("modules")
      .select("id, course_id, order_index, lessons(id, title, order_index)")
      .in("course_id", courseIds)
      .order("order_index", { ascending: true }),
    supabase
      .from("scorm_tracking")
      .select(
        "enrollment_id, lesson_id, lesson_status, video_completed, score_raw, quiz_score_recorded, course_final_exam_recorded, quiz_attempted_at"
      )
      .in("enrollment_id", enrollmentIds),
  ]);

  const queryErrors = [profilesResult.error, modulesResult.error, trackingResult.error].filter(Boolean);

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const modules = (modulesResult.data ?? []) as unknown as ModuleRow[];
  const trackingRows = (trackingResult.data ?? []) as TrackingRow[];

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const lessonsByCourse = new Map<string, LessonRow[]>();
  const trackingByEnrollment = new Map<string, TrackingRow[]>();

  for (const moduleRow of modules) {
    const existingLessons = lessonsByCourse.get(moduleRow.course_id) ?? [];
    const orderedLessons = [...(moduleRow.lessons ?? [])].sort(
      (a, b) => a.order_index - b.order_index
    );
    existingLessons.push(...orderedLessons);
    lessonsByCourse.set(moduleRow.course_id, existingLessons);
  }

  for (const tracking of trackingRows) {
    const existingRows = trackingByEnrollment.get(tracking.enrollment_id) ?? [];
    existingRows.push(tracking);
    trackingByEnrollment.set(tracking.enrollment_id, existingRows);
  }

  const rows: TeacherStudentProgressRow[] = enrollments.flatMap((enrollment) => {
    const course = courseById.get(enrollment.course_id);
    if (!course) return [];

    const profile = profileById.get(enrollment.student_id);
    const lessons = lessonsByCourse.get(enrollment.course_id) ?? [];
    const enrollmentTracking = trackingByEnrollment.get(enrollment.id) ?? [];
    const trackingByLesson = new Map(
      enrollmentTracking.map((tracking) => [tracking.lesson_id, tracking])
    );
    const completedLessons = lessons.filter((lesson) =>
      isCompleted(trackingByLesson.get(lesson.id))
    ).length;
    const totalLessons = lessons.length;
    const progress =
      totalLessons > 0 ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;
    const nextLesson = lessons.find((lesson) => !isCompleted(trackingByLesson.get(lesson.id)));
    const latestScore = scoreFromTracking(enrollmentTracking);

    return [
      {
        enrollmentId: enrollment.id,
        studentId: enrollment.student_id,
        studentName: profile?.full_name?.trim() || `นักเรียน ${enrollment.student_id.slice(0, 8)}`,
        avatarUrl: profile?.avatar_url ?? null,
        university: profile?.university ?? null,
        faculty: profile?.faculty ?? null,
        courseId: course.id,
        courseTitle: course.title,
        enrolledAt: enrollment.created_at,
        progress,
        completedLessons,
        totalLessons,
        latestScore: latestScore.score,
        scoreLabel: latestScore.label,
        nextLessonTitle: nextLesson?.title ?? null,
        status:
          totalLessons > 0 && progress === 100
            ? "completed"
            : progress > 0
              ? "in_progress"
              : "not_started",
      },
    ];
  });

  return (
    <TeacherStudentsClient
      courses={courseOptions}
      rows={rows}
      loadError={
        queryErrors.length > 0
          ? "ข้อมูลบางส่วนโหลดไม่สำเร็จ กรุณารัน migration ล่าสุดหรือตรวจสอบ RLS ของ Supabase"
          : undefined
      }
    />
  );
}
