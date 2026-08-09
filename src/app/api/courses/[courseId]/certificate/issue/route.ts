import { NextRequest, NextResponse } from "next/server";
import { ensureCertificateForCourse } from "@/lib/certificates/service";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let attemptId: string | null = null;
  try {
    const body = (await request.json()) as { attemptId?: unknown };
    if (body.attemptId !== undefined && body.attemptId !== null && typeof body.attemptId !== "string") {
      return NextResponse.json({ error: "attemptId must be a string" }, { status: 400 });
    }
    attemptId = typeof body.attemptId === "string" ? body.attemptId : null;
  } catch {
    // An empty body is valid; the service will use the latest trusted attempt.
  }

  try {
    const result = await ensureCertificateForCourse({ supabase, userId: user.id, courseId, attemptId });
    return NextResponse.json({
      score_percentage: result.scorePercentage,
      pass_percentage: result.passPercentage,
      passed: result.passed,
      certificate_issued: result.certificateIssued,
      certificate_id: result.certificate?.id ?? null,
      message: result.message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Certificate issuance failed";
    const status = /not found/i.test(message) ? 404 : /not enrolled|permission/i.test(message) ? 403 : 500;
    console.error("[certificate issue POST]", error);
    return NextResponse.json({ error: message }, { status });
  }
}

