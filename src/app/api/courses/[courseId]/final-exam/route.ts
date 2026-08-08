import { NextRequest, NextResponse } from "next/server";
import { ensureCertificateForCourse } from "@/lib/certificates/service";
import { getCourseFinalExam, gradeCourseFinalExam } from "@/lib/courses/course-final-exam";
import type { FinalQuizAnswer } from "@/lib/scorm/grade-final-quiz";
import { createClient } from "@/utils/supabase/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getCourseFinalExam(supabase, user.id, courseId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load final exam";
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : /required/i.test(message) ? 403 : 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { answers?: FinalQuizAnswer[] };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.answers)) return NextResponse.json({ error: "answers must be an array" }, { status: 400 });

  try {
    const grade = await gradeCourseFinalExam(supabase, user.id, courseId, body.answers);
    let certificateIssued = false;
    let certificateId: string | null = null;
    let certificateDownloadUrl: string | null = null;
    let message = grade.passed ? "สอบผ่านแล้ว" : "คะแนนยังไม่ถึงเกณฑ์ สามารถลองทำใหม่ได้";
    if (grade.passed) {
      try {
        const certificate = await ensureCertificateForCourse({ supabase, userId: user.id, courseId, attemptId: grade.attemptId });
        certificateIssued = certificate.certificateIssued;
        certificateId = certificate.certificate?.id ?? null;
        certificateDownloadUrl = certificate.certificate ? `/api/me/certificates/${certificate.certificate.id}/download` : null;
        message = certificate.message;
      } catch (certificateError) {
        console.warn("[course final exam] Certificate skipped:", certificateError);
        message = "สอบผ่านแล้ว แต่ระบบใบรับรองยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ";
      }
    }
    return NextResponse.json({
      total_questions: grade.totalQuestions,
      correct_answers: grade.correctAnswers,
      score_percentage: grade.scorePercentage,
      pass_percentage: grade.passPercentage,
      passed: grade.passed,
      details: grade.details,
      certificate_issued: certificateIssued,
      certificate_id: certificateId,
      certificate_download_url: certificateDownloadUrl,
      message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Final exam submission failed";
    const status = /not found/i.test(message) ? 404 : /required|invalid|answer every|complete every/i.test(message) ? 400 : 500;
    console.error("[course final exam]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
