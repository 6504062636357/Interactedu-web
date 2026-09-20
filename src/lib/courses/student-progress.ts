export interface StudentTracking {
  lesson_id: string;
  video_completed: boolean | null;
  lesson_status: string | null;
  last_accessed?: string | null;
  cmi_data?: { core?: { lesson_location?: unknown }; location?: unknown } | null;
}

export function isLessonComplete(tracking?: StudentTracking): boolean {
  return tracking?.video_completed === true;
}

export function getResumeSeconds(tracking?: StudentTracking): number {
  const location = tracking?.cmi_data?.core?.lesson_location ?? tracking?.cmi_data?.location;
  // Imported SCORM locations can be opaque strings; never interpret them as time.
  if (typeof location !== "string" && typeof location !== "number") return 0;
  const seconds = Number(location);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
}

export function summarizeStudentProgress<T extends { id: string }>(lessons: T[], tracking: StudentTracking[]) {
  const validIds = new Set(lessons.map((lesson) => lesson.id));
  const records = tracking.filter((row) => validIds.has(row.lesson_id));
  const byLesson = new Map(records.map((row) => [row.lesson_id, row]));
  const completed = lessons.filter((lesson) => isLessonComplete(byLesson.get(lesson.id))).length;
  const total = lessons.length;
  const allComplete = total > 0 && completed === total;
  const latest = [...records].filter((row) => row.last_accessed)
    .sort((a, b) => (b.last_accessed ?? "").localeCompare(a.last_accessed ?? ""))[0];
  const latestIndex = lessons.findIndex((lesson) => lesson.id === latest?.lesson_id);
  const firstIncomplete = lessons.find((lesson) => !isLessonComplete(byLesson.get(lesson.id)));
  const resumeLesson = latestIndex >= 0 && !isLessonComplete(latest)
    ? lessons[latestIndex]
    : lessons.slice(latestIndex + 1).find((lesson) => !isLessonComplete(byLesson.get(lesson.id)))
      ?? firstIncomplete ?? lessons[0] ?? null;
  return {
    total, completed, allComplete, byLesson, resumeLesson,
    // Don't label 199/200 completed lessons as 100%.
    percent: total === 0 ? 0 : allComplete ? 100 : Math.min(99, Math.round(completed / total * 100)),
    started: records.some((row) => !!row.last_accessed || getResumeSeconds(row) > 0 || isLessonComplete(row)),
  };
}
