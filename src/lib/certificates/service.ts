import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateCertificatePdf } from "./pdf";
import type { CertificateRecord, EnsureCertificateResult } from "./types";

const CERTIFICATE_BUCKET = "certificates";

interface EnsureCertificateInput {
  supabase: SupabaseClient;
  userId: string;
  courseId: string;
  attemptId?: string | null;
}

interface CourseRow {
  id: string;
  title: string;
  slug: string | null;
  certificate_enabled: boolean;
  certificate_pass_percentage: number;
  certificate_title: string | null;
}

interface TrackingRow {
  id: string;
  lesson_id: string;
  score_raw: number | string | null;
  video_completed: boolean;
  quiz_score_recorded: boolean;
  course_final_exam_recorded: boolean;
  quiz_attempted_at: string | null;
}

function asCertificateRecord(value: unknown): CertificateRecord {
  const row = value as CertificateRecord;
  return {
    ...row,
    score_percentage: Number(row.score_percentage),
    pass_percentage: Number(row.pass_percentage),
  };
}

function certificateNumber(userId: string, course: CourseRow, issuedAt: Date): string {
  const date = issuedAt.toISOString().slice(0, 10).replaceAll("-", "");
  const courseCode = (course.slug || course.id.slice(0, 8))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10)
    .toUpperCase() || course.id.slice(0, 8).toUpperCase();
  const suffix = createHash("sha256")
    .update(`${userId}:${course.id}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  return `CERT-${date}-${courseCode}-${suffix}`;
}

export async function ensureCertificateForCourse({
  supabase,
  userId,
  courseId,
  attemptId,
}: EnsureCertificateInput): Promise<EnsureCertificateResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error("Permission denied");

  const { data: existing, error: existingError } = await supabase
    .from("certificates")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) {
    const certificate = asCertificateRecord(existing);
    return {
      passed: certificate.status === "issued",
      scorePercentage: certificate.score_percentage,
      passPercentage: certificate.pass_percentage,
      certificateIssued: certificate.status === "issued",
      certificate,
      reason: "already_issued",
      message: "Certificate already issued",
    };
  }

  const [{ data: courseData, error: courseError }, { data: enrollment, error: enrollmentError }] =
    await Promise.all([
      supabase
        .from("courses")
        .select("id, title, slug, certificate_enabled, certificate_pass_percentage, certificate_title")
        .eq("id", courseId)
        .maybeSingle(),
      supabase
        .from("enrollments")
        .select("id, status")
        .eq("student_id", userId)
        .eq("course_id", courseId)
        .eq("status", "approved")
        .maybeSingle(),
    ]);

  if (courseError) throw new Error(courseError.message);
  if (!courseData) throw new Error("Course not found");
  if (enrollmentError) throw new Error(enrollmentError.message);
  if (!enrollment) throw new Error("User is not enrolled in this course");

  const course = courseData as CourseRow;
  const passPercentage = Number(course.certificate_pass_percentage);
  if (!course.certificate_enabled) {
    return {
      passed: false,
      scorePercentage: 0,
      passPercentage,
      certificateIssued: false,
      certificate: null,
      reason: "disabled",
      message: "Certificates are disabled for this course",
    };
  }

  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id")
    .eq("course_id", courseId);
  if (lessonsError) throw new Error(lessonsError.message);

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id as string);
  if (lessonIds.length === 0) throw new Error("Course has no lessons");

  const { data: trackingData, error: trackingError } = await supabase
    .from("scorm_tracking")
    .select("id, lesson_id, score_raw, video_completed, quiz_score_recorded, course_final_exam_recorded, quiz_attempted_at")
    .eq("enrollment_id", enrollment.id)
    .in("lesson_id", lessonIds);
  if (trackingError) throw new Error(trackingError.message);

  const tracking = (trackingData ?? []) as TrackingRow[];
  const completedLessonIds = new Set(tracking.filter((row) => row.video_completed).map((row) => row.lesson_id));
  const scoredRows = tracking.filter(
    (row) => row.quiz_score_recorded && row.course_final_exam_recorded && row.score_raw !== null
  );
  const trustedAttempt = attemptId
    ? scoredRows.find((row) => row.id === attemptId)
    : [...scoredRows].sort((a, b) =>
        (b.quiz_attempted_at ?? "").localeCompare(a.quiz_attempted_at ?? "")
      )[0];
  const scorePercentage = trustedAttempt ? Number(trustedAttempt.score_raw) : 0;

  if (completedLessonIds.size < lessonIds.length || scoredRows.length === 0) {
    return {
      passed: false,
      scorePercentage,
      passPercentage,
      certificateIssued: false,
      certificate: null,
      reason: "course_incomplete",
      message: "Complete every lesson and post-test first",
    };
  }

  if (scorePercentage < passPercentage) {
    return {
      passed: false,
      scorePercentage,
      passPercentage,
      certificateIssued: false,
      certificate: null,
      reason: "score_below_threshold",
      message: "Your score does not meet the certificate threshold yet",
    };
  }

  if (!trustedAttempt) throw new Error("Trusted quiz attempt not found");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const issuedAt = new Date();
  const number = certificateNumber(userId, course, issuedAt);
  const pdfPath = `${courseId}/${userId}/${number}.pdf`;
  const learnerName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Learner";
  const pdf = await generateCertificatePdf({
    certificateNo: number,
    certificateTitle: course.certificate_title,
    courseTitle: course.title,
    learnerName,
    scorePercentage,
    passPercentage,
    issuedAt,
  });

  const { error: uploadError } = await supabase.storage
    .from(CERTIFICATE_BUCKET)
    .upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(`Certificate PDF upload failed: ${uploadError.message}`);

  const { data: issuedData, error: issueError } = await supabase.rpc("issue_course_certificate", {
    p_course_id: courseId,
    p_attempt_id: trustedAttempt.id,
    p_certificate_no: number,
    p_pdf_path: pdfPath,
  });
  if (issueError) throw new Error(issueError.message);
  if (!issuedData) throw new Error("Certificate issuance did not return a record");

  const certificate = asCertificateRecord(issuedData);
  return {
    passed: true,
    scorePercentage: certificate.score_percentage,
    passPercentage: certificate.pass_percentage,
    certificateIssued: true,
    certificate,
    reason: "issued",
    message: "Passed and certificate issued",
  };
}
