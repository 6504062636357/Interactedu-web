import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { loadSampledPopupQuestion } from "@/lib/courses/question-bank-sampling";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; markerId: string }> }
) {
  const { lessonId, markerId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "admin";

  const { data: lesson } = await supabase.from("lessons").select("course_id").eq("id", lessonId).maybeSingle();
  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  // Admin preview: ข้าม enrollment check (เหมือน pattern เดิมของ video-quiz-attempts)
  let enrollmentId: string | null = null;
  if (!isAdmin) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", lesson.course_id)
      .maybeSingle();
    if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
    enrollmentId = enrollment.id;
  }

  const { data: marker, error: markerError } = await supabase
    .from("video_quiz_markers")
    .select("id, lesson_id, random_difficulty")
    .eq("id", markerId)
    .maybeSingle();
  if (markerError || !marker) return NextResponse.json({ error: "Marker not found" }, { status: 404 });
  if (marker.lesson_id !== lessonId) {
    return NextResponse.json({ error: "Marker does not belong to this lesson" }, { status: 403 });
  }

  // Admin ไม่มี enrollment → ใช้ seed คงที่แยกต่างหาก เพื่อให้ preview ได้ (ไม่ผูกกับ enrollment จริง)
  const seed = isAdmin ? `admin-preview-${markerId}` : `${enrollmentId}-${markerId}`;

  try {
    const sampled = await loadSampledPopupQuestion(supabase, {
      lessonId,
      difficulty: marker.random_difficulty,
      seed,
    });

    return NextResponse.json({
      markerId: marker.id,
      questionText: sampled.question_text,
      // ห้ามส่ง isCorrect ออกไปเด็ดขาด — ตรวจคำตอบทำที่ POST /video-quiz-attempts เท่านั้น
      choices: [...sampled.quiz_choices]
        .sort((a, b) => a.order_index - b.order_index)
        .map((choice) => choice.choice_text),
    });
  } catch (sampleError) {
    const message = sampleError instanceof Error ? sampleError.message : "สุ่มคำถามไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: /ไม่พอ/.test(message) ? 404 : 500 });
  }
}