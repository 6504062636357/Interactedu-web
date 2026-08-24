import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { loadSampledPopupQuestion } from '@/lib/courses/question-bank-sampling';

interface ChoiceRow {
  id: string;
  is_correct: boolean;
  order_index: number;
}

interface QuestionRow {
  id: string;
  explanation: string | null;
  lesson_drafts: { lesson_id: string } | { lesson_id: string }[] | null;
  quiz_choices: ChoiceRow[];
}

// ดึงรายการที่ตอบไปแล้วทั้งหมดของเลสสันนี้ (ใช้ init state ตอนโหลดวิดีโอ กันเด้งซ้ำ)
// รวมทั้ง quiz_questions เดิม (custom/bank_manual) และ video_quiz_markers ใหม่ (bank_random)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'admin') {
    return NextResponse.json({ attempts: [] });
  }

  const { data: attempts } = await supabase
    .from('video_quiz_attempts')
    .select('question_id, marker_id, selected_choice_index, is_correct')
    .eq('student_id', user.id)
    .eq('lesson_id', lessonId);

  return NextResponse.json({
    attempts: (attempts ?? []).map((a) => ({
      // ฝั่ง client (lesson-player.js) ใช้ questionId เป็น key เดียวกันไม่ว่าจะมาจากแหล่งไหน
      // (marker.id ทำหน้าที่แทน questionId ในกรณี bank_random)
      questionId: a.question_id ?? a.marker_id,
      selectedChoiceIndex: a.selected_choice_index,
      isCorrect: a.is_correct,
    })),
  });
}

// บันทึกคำตอบ 1 ข้อ — เช็คความถูกต้อง "ฝั่ง server" เท่านั้น ห้ามเชื่อ client ว่าถูกหรือผิด
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin';

  let body: { questionId?: string; selectedChoiceIndex?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { questionId, selectedChoiceIndex } = body;
  if (!questionId || typeof selectedChoiceIndex !== 'number') {
    return NextResponse.json({ error: 'Missing questionId or selectedChoiceIndex' }, { status: 400 });
  }

  const { data: lesson } = await supabase
    .from('lessons')
    .select('course_id')
    .eq('id', lessonId)
    .maybeSingle();

  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

  let enrollmentId: string | null = null;
  if (!isAdmin) {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('student_id', user.id)
      .eq('course_id', lesson.course_id)
      .maybeSingle();

    if (!enrollment) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    enrollmentId = enrollment.id;
  }

  // -------- เส้นทางที่ 1: ลอง quiz_questions ก่อน (custom / bank_manual — เหมือนเดิมทุกอย่าง) --------
  const { data: question } = await supabase
    .from('quiz_questions')
    .select('id, explanation, quiz_choices(id, is_correct, order_index), lesson_drafts(lesson_id)')
    .eq('id', questionId)
    .maybeSingle<QuestionRow>();

  if (question) {
    const draftLessonId = Array.isArray(question.lesson_drafts)
      ? question.lesson_drafts[0]?.lesson_id
      : question.lesson_drafts?.lesson_id;

    if (draftLessonId !== lessonId) {
      return NextResponse.json({ error: 'Question does not belong to this lesson' }, { status: 403 });
    }

    const sortedChoices = [...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index);
    const chosen = sortedChoices[selectedChoiceIndex];
    const isCorrect = Boolean(chosen?.is_correct);

    if (isAdmin) {
      return NextResponse.json({ isCorrect, explanation: question.explanation ?? null });
    }

    const { error: upsertError } = await supabase
      .from('video_quiz_attempts')
      .upsert(
        {
          student_id: user.id,
          lesson_id: lessonId,
          question_id: questionId,
          marker_id: null,
          selected_choice_index: selectedChoiceIndex,
          is_correct: isCorrect,
          attempted_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,question_id' }
      );

    if (upsertError) {
      console.error('[video-quiz-attempts POST] upsert failed:', upsertError.message);
      return NextResponse.json({ error: 'Failed to save attempt' }, { status: 500 });
    }

    return NextResponse.json({ isCorrect, explanation: question.explanation ?? null });
  }

  // -------- เส้นทางที่ 2: ไม่เจอใน quiz_questions → ลอง video_quiz_markers (bank_random) --------
  const { data: marker, error: markerError } = await supabase
    .from('video_quiz_markers')
    .select('id, lesson_id, random_difficulty')
    .eq('id', questionId)
    .maybeSingle();

  if (markerError || !marker) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }
  if (marker.lesson_id !== lessonId) {
    return NextResponse.json({ error: 'Question does not belong to this lesson' }, { status: 403 });
  }

  // สูตร seed ต้องตรงกับที่ใช้ตอน GET /sample เป๊ะ ไม่งั้นจะ re-sample ได้คนละข้อ
  const seed = isAdmin ? `admin-preview-${marker.id}` : `${enrollmentId}-${marker.id}`;

  let sampled;
  try {
    sampled = await loadSampledPopupQuestion(supabase, {
      lessonId,
      difficulty: marker.random_difficulty,
      seed,
    });
  } catch (sampleError) {
    const message = sampleError instanceof Error ? sampleError.message : 'สุ่มคำถามไม่สำเร็จ';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const sortedChoices = [...sampled.quiz_choices].sort((a, b) => a.order_index - b.order_index);
  const chosen = sortedChoices[selectedChoiceIndex];
  const isCorrect = Boolean(chosen?.is_correct);

  if (isAdmin) {
    return NextResponse.json({ isCorrect, explanation: sampled.explanation ?? null });
  }

  const { error: upsertError } = await supabase
    .from('video_quiz_attempts')
    .upsert(
      {
        student_id: user.id,
        lesson_id: lessonId,
        question_id: null,
        marker_id: marker.id,
        selected_choice_index: selectedChoiceIndex,
        is_correct: isCorrect,
        attempted_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,marker_id' }
    );

  if (upsertError) {
    console.error('[video-quiz-attempts POST] marker upsert failed:', upsertError.message);
    return NextResponse.json({ error: 'Failed to save attempt' }, { status: 500 });
  }

  return NextResponse.json({ isCorrect, explanation: sampled.explanation ?? null });
}
// import { NextRequest, NextResponse } from 'next/server';
// import { createClient } from '@/utils/supabase/server';

// interface ChoiceRow {
//   id: string;
//   is_correct: boolean;
//   order_index: number;
// }

// interface QuestionRow {
//   id: string;
//   explanation: string | null;
//   lesson_drafts: { lesson_id: string } | { lesson_id: string }[] | null;
//   quiz_choices: ChoiceRow[];
// }

// // ดึงรายการที่ตอบไปแล้วทั้งหมดของเลสสันนี้ (ใช้ init state ตอนโหลดวิดีโอ กันเด้งซ้ำ)
// export async function GET(
//   request: NextRequest,
//   { params }: { params: Promise<{ lessonId: string }> }
// ) {
//   const { lessonId } = await params;
//   const supabase = await createClient();

//   const { data: { user } } = await supabase.auth.getUser();
//   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

//   const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
//   if (profile?.role === 'admin') {
//     return NextResponse.json({ attempts: [] });
//   }

//   const { data: attempts } = await supabase
//     .from('video_quiz_attempts')
//     .select('question_id, selected_choice_index, is_correct')
//     .eq('student_id', user.id)
//     .eq('lesson_id', lessonId);

//   return NextResponse.json({
//     attempts: (attempts ?? []).map((a) => ({
//       questionId: a.question_id,
//       selectedChoiceIndex: a.selected_choice_index,
//       isCorrect: a.is_correct,
//     })),
//   });
// }

// // บันทึกคำตอบ 1 ข้อ — เช็คความถูกต้อง "ฝั่ง server" เท่านั้น ห้ามเชื่อ client ว่าถูกหรือผิด
// export async function POST(
//   request: NextRequest,
//   { params }: { params: Promise<{ lessonId: string }> }
// ) {
//   const { lessonId } = await params;
//   const supabase = await createClient();

//   const { data: { user } } = await supabase.auth.getUser();
//   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

//   const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
//   const isAdmin = profile?.role === 'admin';

//   let body: { questionId?: string; selectedChoiceIndex?: number };
//   try {
//     body = await request.json();
//   } catch {
//     return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
//   }

//   const { questionId, selectedChoiceIndex } = body;
//   if (!questionId || typeof selectedChoiceIndex !== 'number') {
//     return NextResponse.json({ error: 'Missing questionId or selectedChoiceIndex' }, { status: 400 });
//   }

//   const { data: lesson } = await supabase
//     .from('lessons')
//     .select('course_id')
//     .eq('id', lessonId)
//     .maybeSingle();

//   if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

//   // Admin ข้ามการเช็ค enrollment ไปเลย (เพราะ admin ไม่ enroll คอร์สอยู่แล้ว แค่ preview เฉยๆ)
//   if (!isAdmin) {
//     const { data: enrollment } = await supabase
//       .from('enrollments')
//       .select('id')
//       .eq('student_id', user.id)
//       .eq('course_id', lesson.course_id)
//       .maybeSingle();

//     if (!enrollment) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
//   }

//   const { data: question, error: questionError } = await supabase
//     .from('quiz_questions')
//     .select('id, explanation, quiz_choices(id, is_correct, order_index), lesson_drafts(lesson_id)')
//     .eq('id', questionId)
//     .maybeSingle<QuestionRow>();

//   if (questionError || !question) {
  
//   return NextResponse.json({ error: 'Question not found' }, { status: 404 });
// }

//   const draftLessonId = Array.isArray(question.lesson_drafts)
//     ? question.lesson_drafts[0]?.lesson_id
//     : question.lesson_drafts?.lesson_id;

//   if (draftLessonId !== lessonId) {
//     return NextResponse.json({ error: 'Question does not belong to this lesson' }, { status: 403 });
//   }

//   const sortedChoices = [...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index);
//   const chosen = sortedChoices[selectedChoiceIndex];
//   const isCorrect = Boolean(chosen?.is_correct);

//   // Admin: แค่เช็คถูก/ผิดแล้วส่งกลับ ไม่บันทึกลง video_quiz_attempts เลย (preview เฉยๆ ไม่นับเป็นข้อมูลจริง)
//   if (isAdmin) {
//     return NextResponse.json({
//       isCorrect,
//       explanation: question.explanation ?? null,
//     });
//   }

//   const { error: upsertError } = await supabase
//     .from('video_quiz_attempts')
//     .upsert(
//       {
//         student_id: user.id,
//         lesson_id: lessonId,
//         question_id: questionId,
//         selected_choice_index: selectedChoiceIndex,
//         is_correct: isCorrect,
//         attempted_at: new Date().toISOString(),
//       },
//       { onConflict: 'student_id,question_id' }
//     );

//   if (upsertError) {
//     console.error('[video-quiz-attempts POST] upsert failed:', upsertError.message);
//     return NextResponse.json({ error: 'Failed to save attempt' }, { status: 500 });
//   }

//   return NextResponse.json({
//     isCorrect,
//     explanation: question.explanation ?? null,
//   });
// }