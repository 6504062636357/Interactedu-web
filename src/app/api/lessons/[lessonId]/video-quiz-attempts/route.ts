import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { loadSampledPopupQuestion } from '@/lib/courses/question-bank-sampling';
import { validateAnswer } from '@/lib/quiz/dispatcher';
import { validateMultiSelectByIndexes } from '@/lib/quiz/validators/multi-select';
import type {
  DragDropAnswerData,
  DragDropStudentAnswer,
  MatchingAnswerData,
  MatchingStudentAnswer,
  SequencingAnswerData,
  SequencingStudentAnswer,
} from '@/types/interaction';

interface ChoiceRow {
  id: string;
  is_correct: boolean;
  order_index: number;
}

interface QuestionRow {
  id: string;
  explanation: string | null;
  interaction_type: 'multiple_choice' | 'true_false' | 'multi_select' | 'drag_drop' | 'matching' | 'sequencing' | null;
  answer_data: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
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

  // ===== เพิ่มใหม่: studentAnswer (matching/sequencing) เป็น optional คู่กับ selectedChoiceIndex เดิม
  // (choice-based) — เส้นทางที่ 1 (quiz_questions/custom) ยังใช้แค่ selectedChoiceIndex เหมือนเดิมทุก
  // อย่าง (ยังเป็น choice-only ไม่เปลี่ยน) ส่วนเส้นทางที่ 2 (video_quiz_markers/bank_random) ตอนนี้รับ
  // studentAnswer เพิ่มได้แล้วสำหรับ matching ({pairs}) / sequencing ({order}) =====
  let body: {
    questionId?: string;
    selectedChoiceIndex?: number;
    // multi_select: index ของทุกตัวเลือกที่ติ๊ก (อิงลำดับ order_index ที่ส่งให้ client)
    selectedChoiceIndexes?: number[];
    studentAnswer?: MatchingStudentAnswer | SequencingStudentAnswer | DragDropStudentAnswer;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { questionId, selectedChoiceIndex, selectedChoiceIndexes, studentAnswer } = body;
  if (
    !questionId ||
    (typeof selectedChoiceIndex !== 'number' && !studentAnswer && !Array.isArray(selectedChoiceIndexes))
  ) {
    return NextResponse.json({ error: 'Missing questionId or answer' }, { status: 400 });
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

  // -------- เส้นทางที่ 1: ลอง quiz_questions ก่อน (custom / bank_manual — static ควิซระหว่างวิดีโอ) --------
  // ===== เพิ่มใหม่: เดิม select แค่ choice-based (id, explanation, quiz_choices, lesson_drafts) เลย
  // ตรวจแบบ sortedChoices[selectedChoiceIndex] อย่างเดียว — ตอนนี้ static quiz มี matching/sequencing
  // ด้วย (ผู้เรียนตรวจในเครื่องแล้วจาก generate.ts ฝั่ง client แต่ endpoint นี้ยังถูกยิงมาเพื่อ "เก็บ
  // สถิติ" คู่กันเสมอ — ต้อง select interaction_type/answer_data เพิ่ม แล้วตรวจผ่าน validateAnswer()
  // dispatcher เดียวกับเส้นทางที่ 2 เพื่อให้ is_correct ที่บันทึกลง DB ถูกต้อง ไม่ได้ default เป็น
  // choice-based เสมอไปแบบเดิม (ซึ่งจะพัง เพราะ matching/sequencing ไม่มี selectedChoiceIndex ส่งมา)
  const { data: question } = await supabase
    .from('quiz_questions')
    .select('id, explanation, interaction_type, answer_data, quiz_choices(id, is_correct, order_index), lesson_drafts(lesson_id)')
    .eq('id', questionId)
    .maybeSingle<QuestionRow>();

  if (question) {
    const draftLessonId = Array.isArray(question.lesson_drafts)
      ? question.lesson_drafts[0]?.lesson_id
      : question.lesson_drafts?.lesson_id;

    if (draftLessonId !== lessonId) {
      return NextResponse.json({ error: 'Question does not belong to this lesson' }, { status: 403 });
    }

    const isMatchingOrSequencingStatic =
      question.interaction_type === 'matching' ||
      question.interaction_type === 'sequencing' ||
      question.interaction_type === 'drag_drop';
    const isMultiSelectStatic = question.interaction_type === 'multi_select';
    // เก็บคำตอบของชนิดที่ไม่ใช่ปรนัยข้อเดียวลง student_answer (jsonb) — selected_choice_index ใส่ -1 (NOT NULL)
    const storedStudentAnswerStatic = isMultiSelectStatic
      ? { selectedChoiceIndexes: selectedChoiceIndexes ?? [] }
      : isMatchingOrSequencingStatic
      ? studentAnswer ?? null
      : null;

    let isCorrect: boolean;
    if (isMultiSelectStatic) {
      const sortedMulti = [...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index);
      const result = validateMultiSelectByIndexes(sortedMulti, selectedChoiceIndexes);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      isCorrect = result.is_correct;
    } else if (isMatchingOrSequencingStatic) {
      if (!studentAnswer) {
        return NextResponse.json({ error: 'Missing studentAnswer for matching/sequencing question' }, { status: 400 });
      }
      const result = validateAnswer(
        {
          id: question.id,
          // ★ narrow เป็น 'matching' | 'sequencing' ตรงๆ (แทน field เดิมที่ type รวม null ไว้ด้วย
          // เพราะ multiple_choice/true_false/แถวเก่าที่ไม่มี interaction_type เลย) — ตรงนี้อยู่ใน
          // branch ที่ isMatchingOrSequencingStatic เป็น true แล้วแน่นอน จึงไม่ใช่ null/MC/TF จริง
          interaction_type: question.interaction_type as 'matching' | 'sequencing' | 'drag_drop',
          answer_data: question.answer_data ?? null,
        },
        studentAnswer
      );
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      isCorrect = result.is_correct;
    } else {
      // choice-based (ปรนัย/ถูกผิด) ต้องมี selectedChoiceIndex เป็นตัวเลข — ถ้าไม่มี (เช่น ส่งแต่ studentAnswer มา) ตอบ 400
      if (typeof selectedChoiceIndex !== 'number') {
        return NextResponse.json({ error: 'Missing selectedChoiceIndex' }, { status: 400 });
      }
      const sortedChoices = [...(question.quiz_choices ?? [])].sort((a, b) => a.order_index - b.order_index);
      const chosen = sortedChoices[selectedChoiceIndex];
      isCorrect = Boolean(chosen?.is_correct);
    }

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
          selected_choice_index: isMatchingOrSequencingStatic || isMultiSelectStatic ? -1 : (selectedChoiceIndex ?? -1),
          student_answer: storedStudentAnswerStatic,
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

  // ===== เพิ่มใหม่: matching/sequencing ตรวจผ่าน validateAnswer() dispatcher เหมือนฝั่ง final exam
  // (gradeCourseFinalExam) — ใช้ answer_data จริงที่ loadSampledPopupQuestion คืนมา (server-only ไม่
  // เคยหลุดไปให้ client เห็นตอน GET /sample) selected_choice_index เป็น NOT NULL ในตาราง จึงใส่ -1
  // เป็นค่า sentinel เหมือนที่ course-final-exam.ts ทำไว้ คำตอบจริงเก็บอยู่ใน student_answer (jsonb)
  const isMatchingOrSequencing =
    sampled.interactionType === 'matching' ||
    sampled.interactionType === 'sequencing' ||
    sampled.interactionType === 'drag_drop';
  const isMultiSelect = sampled.interactionType === 'multi_select';
  const storedStudentAnswer = isMultiSelect
    ? { selectedChoiceIndexes: selectedChoiceIndexes ?? [] }
    : isMatchingOrSequencing
    ? studentAnswer ?? null
    : null;

  let isCorrect: boolean;
  if (isMultiSelect) {
    const sortedMulti = [...sampled.quiz_choices].sort((a, b) => a.order_index - b.order_index);
    const result = validateMultiSelectByIndexes(sortedMulti, selectedChoiceIndexes);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    isCorrect = result.is_correct;
  } else if (isMatchingOrSequencing) {
    if (!studentAnswer) {
      return NextResponse.json({ error: 'Missing studentAnswer for matching/sequencing question' }, { status: 400 });
    }
    const result = validateAnswer(
      { id: sampled.id, interaction_type: sampled.interactionType, answer_data: sampled.answerData ?? null },
      studentAnswer
    );
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    isCorrect = result.is_correct;
  } else {
    if (typeof selectedChoiceIndex !== 'number') {
      return NextResponse.json({ error: 'Missing selectedChoiceIndex' }, { status: 400 });
    }
    const sortedChoices = [...sampled.quiz_choices].sort((a, b) => a.order_index - b.order_index);
    const chosen = sortedChoices[selectedChoiceIndex];
    isCorrect = Boolean(chosen?.is_correct);
  }

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
        selected_choice_index: isMatchingOrSequencing || isMultiSelect ? -1 : (selectedChoiceIndex ?? -1),
        student_answer: storedStudentAnswer,
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
