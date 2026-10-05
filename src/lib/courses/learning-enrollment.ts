import { getResumeSeconds, isLessonComplete, type StudentTracking } from "./student-progress";

// Membership enrollments grant access automatically; activity makes them a
// learner's chosen course. Keep direct purchases/free registrations visible.
export interface LearningEnrollment {
  membership_order_id: string | null;
  learning_started_at?: string | null;
  scorm_tracking?: StudentTracking[] | null;
  student_study_time?: { total_seconds: number } | null;
}

export function isLearningEnrollment(enrollment: LearningEnrollment): boolean {
  return !enrollment.membership_order_id
    || hasStartedLearning(enrollment);
}

export function hasStartedLearning(enrollment: LearningEnrollment): boolean {
  return Boolean(enrollment.learning_started_at)
    || (enrollment.scorm_tracking ?? []).some((row) =>
      Boolean(row.last_accessed) || getResumeSeconds(row) > 0
      || isLessonComplete(row) || (row.completed_scos?.length ?? 0) > 0)
    || (enrollment.student_study_time?.total_seconds ?? 0) > 0;
}

export function isCourseInLibrary(enrollment: LearningEnrollment & { id: string }, savedEnrollmentIds: ReadonlySet<string>): boolean {
  return isLearningEnrollment(enrollment) || savedEnrollmentIds.has(enrollment.id);
}

export type LearningCourseStatus = "not_started" | "in_progress" | "completed";

export function getLearningCourseStatus(enrollment: LearningEnrollment, allComplete: boolean): LearningCourseStatus {
  if (allComplete) return "completed";
  return hasStartedLearning(enrollment) ? "in_progress" : "not_started";
}

// Keep existing libraries available if the app is deployed before the database
// migration. Retry only a missing start marker, never access/network failures.
export async function loadLearningEnrollments<T extends {
  error: { code: string; message: string } | null;
}>(load: (includeStart: boolean) => PromiseLike<T>): Promise<T> {
  const result = await load(true);
  if (result.error
    && ["42703", "PGRST204"].includes(result.error.code)
    && /\blearning_started_at\b/.test(result.error.message)) {
    return await load(false);
  }
  return result;
}
