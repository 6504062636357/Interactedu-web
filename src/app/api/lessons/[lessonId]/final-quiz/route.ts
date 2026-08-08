import { NextRequest, NextResponse } from "next/server";
import { ensureCertificateForCourse } from "@/lib/certificates/service";
import { gradeFinalQuiz, type FinalQuizAnswer } from "@/lib/scorm/grade-final-quiz";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { answers?: FinalQuizAnswer[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.answers)) {
    return NextResponse.json({ error: "answers must be an array" }, { status: 400 });
  }

  try {
    const grade = await gradeFinalQuiz(supabase, user.id, lessonId, body.answers);
    let certificateIssued = false;
    let certificateId: string | null = null;
    let certificateDownloadUrl: string | null = null;
    let certificateMessage = "Quiz graded successfully";

    // การออก Certificate เป็นขั้นเสริม ต้องไม่ทำให้ผลสอบที่ตรวจแล้วกลายเป็น 500
    try {
      const certificate = await ensureCertificateForCourse({
        supabase,
        userId: user.id,
        courseId: grade.courseId,
        attemptId: grade.attemptId,
      });
      certificateIssued = certificate.certificateIssued;
      certificateId = certificate.certificate?.id ?? null;
      certificateDownloadUrl = certificate.certificate
        ? `/api/me/certificates/${certificate.certificate.id}/download`
        : null;
      certificateMessage = certificate.message;
    } catch (certificateError) {
      certificateMessage = "ตรวจคะแนนสำเร็จ แต่ระบบใบประกาศยังไม่พร้อม";
      console.warn("[final-quiz POST] Certificate skipped:", certificateError);
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
      message: certificateMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Final quiz submission failed";
    const status = /not found/i.test(message) ? 404 : /required|invalid|answer every/i.test(message) ? 400 : 500;
    console.error("[final-quiz POST]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
