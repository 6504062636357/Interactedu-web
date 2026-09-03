// app/teacher/courses/actions.ts
"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyAdmins } from "@/lib/notifications/service";
import { loadSampledFinalExamQuestions, loadSampledPopupQuestion } from "@/lib/courses/question-bank-sampling";

interface CreateCourseInput {
  title: string;
  courseCode: string;
  category: string;
  description: string | null;
  isFree: boolean;
  price: number;
  coverImageUrl: string | null;
  certificateEnabled: boolean;
  certificatePassPercentage: number;
}

interface CreateCourseResult {
  courseId?: string;
  moduleId?: string;
  error?: string;
}

function slugify(input: string): string {
  return input
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createCourse(input: CreateCourseInput): Promise<CreateCourseResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") {
    return { error: "ไม่มีสิทธิ์สร้างคอร์ส" };
  }

  if (!input.title.trim()) return { error: "กรุณาใส่ชื่อคอร์ส" };
  if (!input.courseCode.trim()) return { error: "กรุณาใส่รหัสวิชา" };
  // เช็คฟอร์แมตซ้ำฝั่ง server เผื่อมี request ยิงตรงเข้ามาข้าม client validation (เช่นผ่าน DevTools/API)
  if (!/^[A-Za-z0-9_-]+$/.test(input.courseCode.trim())) {
    return { error: "รหัสวิชาต้องเป็นตัวอักษรภาษาอังกฤษและตัวเลขเท่านั้น (เช่น CS101)" };
  }
  if (!input.category.trim()) return { error: "กรุณาระบุหมวดวิชา" };

  const priceValue = input.isFree ? 0 : input.price;
  if (Number.isNaN(priceValue) || priceValue < 0) {
    return { error: "ราคาต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0" };
  }
  if (
    !Number.isFinite(input.certificatePassPercentage) ||
    input.certificatePassPercentage < 0 ||
    input.certificatePassPercentage > 100
  ) {
    return { error: "คะแนนผ่านต้องอยู่ระหว่าง 0 ถึง 100" };
  }

  const slug = `${slugify(input.courseCode)}-${Date.now().toString(36)}`;

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .insert({
      title: input.title.trim(),
      slug,
      description: input.description?.trim() || null,
      category: input.category.trim(),
      price: priceValue,
      cover_image_url: input.coverImageUrl,
      course_code: input.courseCode.trim().toUpperCase(),
      status: "draft",
      created_by: user.id,
      certificate_enabled: input.certificateEnabled,
      certificate_pass_percentage: input.certificatePassPercentage,
    })
    .select("id")
    .single();

  if (courseError || !course) {
    console.error("Failed to create course:", courseError?.message);
    // รหัสวิชาซ้ำ (unique constraint: courses_course_code_key) — บอกผู้ใช้ตรงๆ แทนโชว์ error ดิบจาก Postgres
    if (courseError?.code === "23505" && courseError.message.toLowerCase().includes("course_code")) {
      return { error: "รหัสวิชานี้มีอยู่ในระบบแล้ว กรุณาตรวจสอบและใช้รหัสวิชาอื่น" };
    }
    return { error: "ระบบขัดข้องชั่วคราว ไม่สามารถบันทึกข้อมูลคอร์สได้ กรุณาลองใหม่อีกครั้งในภายหลัง" };
  }

  const { data: courseModule, error: moduleError } = await supabase
    .from("modules")
    .insert({ course_id: course.id, title: "บทเรียนทั่วไป", order_index: 0 })
    .select("id")
    .single();

  if (moduleError || !courseModule) {
    console.error("Failed to create default module:", moduleError?.message);
    return { error: "สร้างคอร์สสำเร็จ แต่สร้างหมวดบทเรียนไม่สำเร็จ กรุณาติดต่อแอดมิน" };
  }

  return { courseId: course.id, moduleId: courseModule.id };
}

// ============================================================
// เช็คความพร้อมของคอร์สก่อนส่งตรวจ — ใช้ทั้งแสดงป้ายเตือนในหน้า course detail
// และเป็นตัวเช็คจริงก่อน submitCourseForReview จะยอมส่งตรวจ
// ============================================================

interface ReadinessLessonDraftRow {
  id: string;
  status: string;
  created_at: string;
  video_url: string | null;
  video_quiz_markers: { id: string; timestamp_seconds: number; random_difficulty: "easy" | "medium" | "hard" }[];
}

interface ReadinessLessonRow {
  id: string;
  title: string;
  lesson_drafts: ReadinessLessonDraftRow[] | null;
}

export interface LessonReadinessIssue {
  lessonId: string;
  title: string;
  missingVideo: boolean;
  insufficientMarkers: { timestampSeconds: number; difficulty: string; message: string }[];
}

export interface CourseReadiness {
  ready: boolean;
  hasLessons: boolean;
  lessonIssues: LessonReadinessIssue[];
  examConfigured: boolean;
  examIssue: string | null;
}

export async function checkCourseReadiness(courseId: string): Promise<CourseReadiness> {
  const supabase = await createClient();

  // ดึง lessons + exam config พร้อมกัน ไม่ต้องรอทีละอย่าง
  const [{ data: lessonsData }, { data: examConfig }, { data: courseLessonIdsData }] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        `id, title,
         lesson_drafts (
           id, status, created_at, video_url,
           video_quiz_markers ( id, timestamp_seconds, random_difficulty )
         )`
      )
      .eq("course_id", courseId)
      .order("order_index", { ascending: true }),
    supabase
      .from("course_exam_configs")
      .select("build_mode, total_questions, preset_type, custom_constraints")
      .eq("course_id", courseId)
      .maybeSingle(),
    supabase.from("lessons").select("id").eq("course_id", courseId),
  ]);

  const lessons = (lessonsData ?? []) as unknown as ReadinessLessonRow[];

  // เช็คทุก lesson พร้อมกัน (แต่ละ lesson เช็ค marker ของตัวเองพร้อมกันด้วย) แทนการรอทีละตัว
  const lessonIssueResults = await Promise.all(
    lessons.map(async (lesson): Promise<LessonReadinessIssue | null> => {
      const drafts = lesson.lesson_drafts ?? [];
      const latest = [...drafts].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      const missingVideo = !latest || !latest.video_url;
      const markers = latest?.video_quiz_markers ?? [];

      const markerResults = await Promise.all(
        markers.map(async (marker): Promise<LessonReadinessIssue["insufficientMarkers"][number] | null> => {
          try {
            await loadSampledPopupQuestion(supabase, {
              lessonId: lesson.id,
              difficulty: marker.random_difficulty,
              seed: `readiness-check-${marker.id}`,
            });
            return null;
          } catch (err) {
            // ★ ประกาศ type ของ object นี้ให้ตรงกับ LessonReadinessIssue["insufficientMarkers"]
            // (difficulty: string) ไม่งั้น TS จะ infer literal union "easy"|"medium"|"hard" จาก
            // marker.random_difficulty แคบกว่า interface ทำให้ type predicate ข้างล่างพังตอน build
            return {
              timestampSeconds: marker.timestamp_seconds,
              difficulty: marker.random_difficulty,
              message: err instanceof Error ? err.message : "คลังข้อสอบไม่พอสำหรับควิซสุ่มช่วงนี้",
            };
          }
        })
      );

      const insufficientMarkers = markerResults.filter(
        (m): m is NonNullable<typeof m> => m !== null
      );

      if (missingVideo || insufficientMarkers.length > 0) {
        return { lessonId: lesson.id, title: lesson.title, missingVideo, insufficientMarkers };
      }
      return null;
    })
  );

  const lessonIssues: LessonReadinessIssue[] = lessonIssueResults.filter(
    (issue): issue is LessonReadinessIssue => issue !== null
  );

  // ★ โหมด "กำหนดข้อสอบเอง" (custom) ไม่มีแถวใน course_exam_configs เลยโดยตั้งใจ
  // (saveCourseFinalExam ลบ config เดิมทิ้งเสมอ) เพราะคำถามจริงถูกเก็บตรงเป็น
  // quiz_questions ที่ lesson_draft_id ของบทใดบทหนึ่ง และ video_timestamp_seconds เป็น null
  // (แยกจากควิซแทรกวิดีโอที่มี timestamp) — ต้องเช็คจุดนี้ก่อนสรุปว่า "ยังไม่ได้ตั้งค่า"
  const courseLessonIds = (courseLessonIdsData ?? []).map((l) => l.id);
  let hasCustomExamQuestions = false;
  if (courseLessonIds.length > 0) {
    const { data: draftsForCourse } = await supabase
      .from("lesson_drafts")
      .select("id")
      .in("lesson_id", courseLessonIds);
    const draftIds = (draftsForCourse ?? []).map((d) => d.id);
    if (draftIds.length > 0) {
      const { count } = await supabase
        .from("quiz_questions")
        .select("id", { count: "exact", head: true })
        .in("lesson_draft_id", draftIds)
        .is("video_timestamp_seconds", null);
      hasCustomExamQuestions = (count ?? 0) > 0;
    }
  }

  let examIssue: string | null = null;
  if (hasCustomExamQuestions) {
    // โหมดพิมพ์เอง มีคำถามจริงบันทึกไว้แล้ว ถือว่าพร้อม ไม่ต้องเช็คคลังข้อสอบเพิ่ม
    examIssue = null;
  } else if (!examConfig) {
    examIssue = "ยังไม่ได้เพิ่มบททดสอบท้ายคอร์ส";
  } else {
    try {
      await loadSampledFinalExamQuestions(supabase, {
        courseId,
        seed: `readiness-check-${courseId}`,
        buildMode: examConfig.build_mode,
        totalQuestions: examConfig.total_questions,
        presetType: examConfig.preset_type,
        customConstraints: examConfig.custom_constraints,
      });
    } catch (err) {
      examIssue = err instanceof Error ? err.message : "คลังข้อสอบท้ายคอร์สไม่เพียงพอ";
    }
  }

  return {
    ready: lessons.length > 0 && lessonIssues.length === 0 && !examIssue,
    hasLessons: lessons.length > 0,
    lessonIssues,
    examConfigured: !!examConfig || hasCustomExamQuestions,
    examIssue,
  };
}

// ============================================================
// ส่งทั้งคอร์สเข้าตรวจ — เช็คความครบถ้วนก่อนเสมอ (เรียก checkCourseReadiness ซ้ำ
// ที่ฝั่ง server เพื่อกันกรณี client ส่งมาทั้งที่ข้อมูลจริงยังไม่ครบ)
// ============================================================

export async function submitCourseForReview(courseId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, title, created_by")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError || !course) return { error: "ไม่พบคอร์สนี้" };
  if (course.created_by !== user.id) return { error: "ไม่มีสิทธิ์ส่งคอร์สนี้เข้าตรวจ" };

  const readiness = await checkCourseReadiness(courseId);

  if (!readiness.hasLessons) {
    return { error: "คอร์สนี้ยังไม่มีบทเรียน กรุณาเพิ่มบทเรียนก่อนส่งตรวจ" };
  }

  const firstLessonIssue = readiness.lessonIssues[0];
  if (firstLessonIssue) {
    if (firstLessonIssue.missingVideo) {
      return { error: `บทเรียน "${firstLessonIssue.title}" ยังไม่มีวิดีโอ กรุณาอัปโหลดก่อนส่งตรวจ` };
    }
    const marker = firstLessonIssue.insufficientMarkers[0];
    if (marker) {
      return { error: `บทเรียน "${firstLessonIssue.title}": ${marker.message}` };
    }
  }

  if (readiness.examIssue) {
    return { error: readiness.examIssue };
  }

  // ผ่านครบทุกเงื่อนไข -> set draft ล่าสุดของทุกบท (ที่ยังไม่ approved) เป็น pending_review
  const { data: lessonsData } = await supabase
    .from("lessons")
    .select("id, lesson_drafts(id, status, created_at)")
    .eq("course_id", courseId);

  const draftIdsToSubmit: string[] = [];
  for (const lesson of lessonsData ?? []) {
    const drafts =
      (lesson as unknown as { lesson_drafts: { id: string; status: string; created_at: string }[] })
        .lesson_drafts ?? [];
    const latest = [...drafts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
    if (latest && latest.status !== "approved") {
      draftIdsToSubmit.push(latest.id);
    }
  }

  const submittedAt = new Date().toISOString();
  if (draftIdsToSubmit.length > 0) {
    const { error: draftUpdateError } = await supabase
      .from("lesson_drafts")
      .update({ status: "pending_review", submitted_at: submittedAt })
      .in("id", draftIdsToSubmit);
    if (draftUpdateError) return { error: "อัปเดตสถานะบทเรียนไม่สำเร็จ" };
  }

  const { error: courseUpdateError } = await supabase
    .from("courses")
    .update({ status: "pending" })
    .eq("id", courseId);
  if (courseUpdateError) return { error: "อัปเดตสถานะคอร์สไม่สำเร็จ" };

  await notifyAdmins({
    type: "course_review_pending",
    title: "มีคอร์สใหม่รอตรวจสอบ",
    message: `คอร์ส ${course.title} ครบถ้วนและถูกส่งตรวจแล้ว`,
    relatedType: "course",
    relatedId: courseId,
    actionUrl: `/dashboard/admin/courses/${courseId}/review`,
    dedupeKey: `course_review_pending:${courseId}:${submittedAt}`,
  });

  revalidatePath(`/dashboard/teacher/courses/${courseId}`);
  revalidatePath("/dashboard/teacher/courses");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/courses");
  revalidatePath("/admin/review");

  return {};
}

// ============================================================
// ลบบทเรียนย่อยทิ้ง — draft/คำถาม/ตัวเลือก/marker/segment ผูก cascade ลบตามอัตโนมัติ
// ยกเว้น scorm_attempts (ON DELETE NO ACTION โดยตั้งใจ กันข้อมูลความคืบหน้าของนักเรียนหายเงียบๆ)
// ถ้ามีนักเรียนเรียนบทนี้ไปแล้วจริง จะลบไม่ได้ ต้องแจ้งครูตรงๆ ไม่ใช่ทำ silent cascade เอง
// ============================================================
export async function deleteLesson(lessonId: string, courseId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบก่อน" };

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, created_by")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError || !course) return { error: "ไม่พบคอร์สนี้" };
  if (course.created_by !== user.id) return { error: "ไม่มีสิทธิ์ลบบทเรียนของคอร์สนี้" };

  const { data: lesson, error: lessonFetchError } = await supabase
    .from("lessons")
    .select("id, course_id, title")
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonFetchError || !lesson) return { error: "ไม่พบบทเรียนนี้" };
  if (lesson.course_id !== courseId) return { error: "บทเรียนนี้ไม่ได้อยู่ในคอร์สนี้" };

  const { error: deleteError } = await supabase.from("lessons").delete().eq("id", lessonId);

  if (deleteError) {
    console.error("Failed to delete lesson:", deleteError.message);
    // เคสที่พบบ่อยที่สุดคือ scorm_attempts ยังผูกอยู่ (มีนักเรียนเรียนไปแล้วจริง)
    if (deleteError.message.toLowerCase().includes("scorm_attempts") || deleteError.code === "23503") {
      return { error: "ลบบทเรียนนี้ไม่ได้ เพราะมีนักเรียนเรียน/ทำแบบทดสอบไปแล้ว กรุณาติดต่อแอดมินหากต้องการลบ" };
    }
    return { error: "ลบบทเรียนไม่สำเร็จ กรุณาลองใหม่" };
  }

  revalidatePath(`/dashboard/teacher/courses/${courseId}`);
  revalidatePath("/dashboard/teacher/courses");

  return {};
}
