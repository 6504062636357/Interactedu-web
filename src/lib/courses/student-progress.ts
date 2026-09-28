export interface StudentTracking {
  lesson_id: string;
  video_completed: boolean | null;
  lesson_status: string | null;
  last_accessed?: string | null;
  completed_scos?: string[] | null;
  cmi_data?: { core?: { lesson_location?: unknown }; location?: unknown } | null;
}

interface ProgressManifestItem {
  identifier?: string;
  href?: string | null;
  type?: "lesson" | "quiz";
  kind?: "lesson" | "quiz";
  children?: ProgressManifestItem[];
}

export interface StudentProgressLesson {
  id: string;
  scorm_source?: string | null;
  scorm_manifest?: { items?: ProgressManifestItem[] } | null;
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

function collectProgressScos(items: ProgressManifestItem[], includeQuizzes: boolean): string[] {
  const hrefs: string[] = [];
  for (const item of items) {
    const isQuiz = item.type === "quiz" || item.kind === "quiz" || item.identifier?.includes("QUIZ") === true;
    if (item.href && (includeQuizzes || !isQuiz)) hrefs.push(item.href);
    if (item.children?.length) hrefs.push(...collectProgressScos(item.children, includeQuizzes));
  }
  return hrefs;
}

export function getLessonProgress(lesson: StudentProgressLesson, tracking?: StudentTracking): number {
  if (isLessonComplete(tracking)) return 1;

  const items = lesson.scorm_manifest?.items ?? [];
  const scos = [...new Set(collectProgressScos(items, lesson.scorm_source === "imported"))];
  if (scos.length === 0) return 0;

  const completedScos = new Set(Array.isArray(tracking?.completed_scos) ? tracking.completed_scos : []);
  const completed = scos.filter((href) => completedScos.has(href)).length;
  return completed / scos.length;
}

export function summarizeStudentProgress<T extends StudentProgressLesson>(lessons: T[], tracking: StudentTracking[]) {
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
    // Each lesson has equal weight, while completed SCORM items provide the
    // partial value inside an unfinished lesson (for example 2/3 = 67%).
    // Keep 100% reserved for a fully completed course so exam gates remain exact.
    percent: total === 0
      ? 0
      : allComplete
        ? 100
        : Math.min(99, Math.round(
            lessons.reduce((sum, lesson) => sum + getLessonProgress(lesson, byLesson.get(lesson.id)), 0) / total * 100
          )),
    started: records.some((row) =>
      !!row.last_accessed ||
      getResumeSeconds(row) > 0 ||
      isLessonComplete(row) ||
      (Array.isArray(row.completed_scos) && row.completed_scos.length > 0)
    ),
  };
}
