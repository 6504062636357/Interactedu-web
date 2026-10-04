import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import "server-only";
import { withVolumeControls } from "@/lib/scorm/volume-controls";
// ===== เพิ่มใหม่: bake matching/sequencing (display แบบสลับลำดับ + answerData เฉลยจริง) ลงในแพ็กเกจ
// SCORM แบบ static เหมือนที่ทำกับ correctIndex ของ multiple_choice/true_false เดิม =====
import { buildDragDropDisplay, buildMatchingSequencingDisplay } from "@/lib/courses/question-bank-sampling";
import { seedFromString } from "@/lib/courses/seeded-random";
import type { DragDropAnswerData, MatchingAnswerData, SequencingAnswerData } from "@/types/interaction";
interface QuizChoiceRow { //interface เอาไว้กำหนดชนิดข้อมูลว่ามีอะไรบ้าง ถ้าเรียกใช้ต้องประกาศตัวแปรให้ครบห้ามขาดเกิน 
  choice_text: string;//ข้อความของชอยส์
  is_correct: boolean;
  order_index: number;//ลำดับของชอยส์ 
}

interface QuizQuestionRow {//คำถาม
  id: string;//ID ของคำถาม
  question_text: string;
  order_index: number;
  video_timestamp_seconds: number | null;//in quiz video
  explanation: string | null;
  image_url: string | null;//รูปประกอบคำถาม (ไม่บังคับมี)
  // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ (ไม่บังคับ ใช้ได้เมื่อมี image_url) =====
  image_caption: string | null;
  image_pins: ImagePin[] | null;
  // ===== เพิ่มใหม่: matching/sequencing สำหรับควิซ static ระหว่างวิดีโอ =====
  interaction_type: "multiple_choice" | "true_false" | "multi_select" | "drag_drop" | "matching" | "sequencing" | null;
  answer_data: MatchingAnswerData | SequencingAnswerData | DragDropAnswerData | null;
  quiz_choices: QuizChoiceRow[];
}

// ===== เพิ่มใหม่: หมุดตัวเลขชี้เป้าบนภาพประกอบคำถาม x/y เป็น % ของขนาดภาพ (0-100) =====
interface ImagePin {
  id: string;
  x: number;
  y: number;
}

interface LessonInfo {//ข้อมูลบทเรียน
  id: string;
  course_id: string;
  title: string;
}

interface LessonDraftRow {
  id: string;
  video_url: string | null;
  content_html: string | null;
  status: string;
  lessons: LessonInfo;
}

interface VideoQuizMarkerRow {//ควิซในวิดีโอ
  id: string;
  timestamp_seconds: number;
  random_difficulty: "easy" | "medium" | "hard";
}

interface VideoSegmentRow {
  id: string;
  title: string;
  summary: string | null;
  start_seconds: number;
  end_seconds: number;
  order_index: number;
}

interface GeneratedManifestItem {
  identifier: string;
  title: string;
  href: string | null;
  children: GeneratedManifestItem[];
  type: "lesson" | "quiz";
  startSeconds?: number;
  endSeconds?: number;
}

function formatGeneratedSubchapterTitle(title: string, index: number): string {
  const generatedPrefix = /^(?:บท|ช่วง|หัวข้อ(?:ย่อย)?)ที่\s*\d+/;
  return generatedPrefix.test(title.trim())
    ? title.trim().replace(generatedPrefix, `หัวข้อย่อยที่ ${index + 1}`)
    : title;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function buildLessonPlayerJs(//helper function อยู่บนสุดได้ ฟังชันนี้รับมา 5 พารา
  draft: LessonDraftRow,
  lessonId: string,
  videoQuizQuestions: QuizQuestionRow[],//arrayของคำถามที่มี video_timestamp_seconds (คำถามที่ถูกตรึงไว้ตายตัวแล้วว่าจะถามอะไร ตอนไหน)
  videoQuizMarkers: VideoQuizMarkerRow[],//บอกแค่ตำแหน่งเวลาที่จะสุ่ม ไม่มีคำถามตายตัว
  videoSegments: VideoSegmentRow[]//ช่วง/บทของวิดีโอ (chapters) สำหรับฟีเจอร์แบ่งช่วงวิดีโอ
): string {//return type เป็น string
  const staticQuizzes = videoQuizQuestions.map((q) => {//วน mapใน videoQuizQuestionsทุกตัว
    const sortedChoices = q.quiz_choices.sort((a, b) => a.order_index - b.order_index);
    const interactionType = q.interaction_type ?? "multiple_choice";
    // drag_drop ไม่ใช้ choices เหมือน matching/sequencing (เนื้อหา+เฉลยอยู่ใน answer_data) ส่วน multi_select ใช้ choices
    // ปกติแต่ฝัง correctIndexes (หลายตัว) แทน correctIndex — เหตุผลเดียวกับ correctIndex: ตรวจในเครื่องแบบ offline
    const isMatchingOrSequencing =
      interactionType === "matching" || interactionType === "sequencing" || interactionType === "drag_drop";
    const dragDropDisplay = interactionType === "drag_drop"
      ? buildDragDropDisplay(interactionType, q.answer_data, seedFromString(q.id), q.id)
      : null;
    // matching/sequencing: ใช้ seed คงที่จาก id คำถาม (ไม่ใช่ต่อนักเรียน/ต่อครั้งแบบ final exam หรือ
    // popup) เพราะแพ็กเกจ SCORM นี้ bake ครั้งเดียวตอน generate แล้วทุกคนที่เปิดแพ็กเกจนี้เห็นลำดับ
    // ที่สลับแล้วเหมือนกันหมด — สลับแค่เพื่อไม่ให้ตอบตามลำดับเดิมเป๊ะๆ ได้เฉยๆ
    const { matchingDisplay, sequencingDisplay } = isMatchingOrSequencing
      ? buildMatchingSequencingDisplay(interactionType, q.answer_data, seedFromString(q.id), q.id)
      : { matchingDisplay: null, sequencingDisplay: null };
    return {
      id: q.id,//ตัวใหม่
      timestampSeconds: q.video_timestamp_seconds,
      sourceType: "static" as const,
      questionText: q.question_text,
      imageUrl: q.image_url ?? null,
      imageCaption: q.image_caption ?? null,
      imagePins: q.image_pins ?? [],
      interactionType,
      choices: isMatchingOrSequencing ? [] : sortedChoices.map((c) => c.choice_text),//เรียง choice index จากน้อยไปมากและ ดึงเฉพาะ choice_text ออกมาจากแต่ละ choice object เหลือแค่ array ของ string ล้วนๆ
      // [ให้พกพา] ฝัง correctIndex + explanation ลงไปในแพ็กเกจเลย เพื่อให้ตรวจคำตอบในเครื่องได้
      // โดยไม่ต้องพึ่ง API ของเว็บเรา (ถ้าเปิดแพ็กเกจนี้ใน LMS อื่นที่เรียก API เราไม่ได้ ยังตอบได้
      // ปกติ) — เฉลยจะเห็นได้จาก F12 เหมือน SCORM ทั่วไปทุกตัว แต่ควิซกลางวิดีโอนี้เป็นแค่ตัวช่วย
      // ทบทวน (formative) ไม่ใช่คะแนนตัดสินใบรับรอง จึงยอมรับความเสี่ยงนี้ได้ (ห้ามทำแบบนี้กับ
      // final exam เด็ดขาด เพราะนั่นตัดสินใบรับรองจริง ต้องตรวจฝั่ง server เท่านั้น)
      correctIndex: isMatchingOrSequencing || interactionType === "multi_select" ? -1 : sortedChoices.findIndex((c) => c.is_correct),
      correctIndexes: interactionType === "multi_select"
        ? sortedChoices.flatMap((c, index) => (c.is_correct ? [index] : []))
        : null,
      explanation: q.explanation ?? null,
      // ===== เพิ่มใหม่: matching/sequencing — display แบบสลับลำดับ (ไม่มีเฉลย) + answerData
      // (เฉลยจริง ฝังไปด้วยเพื่อตรวจในเครื่อง เหตุผลเดียวกับ correctIndex ด้านบน) =====
      matching: matchingDisplay,
      sequencing: sequencingDisplay,
      dragDrop: dragDropDisplay,
      answerData: isMatchingOrSequencing ? q.answer_data ?? null : null,
    };
  });

  const randomQuizzes = videoQuizMarkers.map((m) => ({ //แปลง videoQuizMarkers แต่ละตัวเป็น object
    id: m.id,
    timestampSeconds: m.timestamp_seconds,
    sourceType: "random_bank" as const,
    // ไม่มี questionText/choices เพราะไม่รู้ว่าจะได้คำถามอะไร จะ fetch สดตอน openQuizModal
  }));

  const lessonData = {//ตัวแปรที่กำหนดข้อมูลที่ browserจะใช้
    lessonId,
    title: draft.lessons.title,
    videoUrl: draft.video_url ?? "",
    contentHtml: draft.content_html ?? "",
    quizzes: [...staticQuizzes, ...randomQuizzes].sort(
      (a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0)
    ),
    chapters: videoSegments
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((segment, index) => ({
        id: segment.id,
        title: formatGeneratedSubchapterTitle(segment.title, index),
        summary: segment.summary,
        startSeconds: segment.start_seconds,
        endSeconds: segment.end_seconds,
      })),
  };
  return `var LESSON_DATA = ${JSON.stringify(lessonData)};//แปลง object ทั้งก้อนเป็น string JSON
var REQUESTED_CHAPTER_ID = new URLSearchParams(window.location.search).get("chapter");
// คุมตัวเล่นวิดิโอ + ควิซในวิดีโอ (SCO)ในบทเรียน 
var REQUIRE_CORRECT_ANSWER = false;
var answeredQuestionIds = {};
var pendingQuestion = null;
// ===== เพิ่มใหม่: matching/sequencing ใน popup — เก็บฟังก์ชันล้าง listener ระดับ document ของ
// sequencing drag-and-drop ตัวที่กำลังทำงานอยู่ (ถ้ามี) ไว้ที่นี่ เพื่อให้ปิด/เปลี่ยนคำถามแล้วเคลียร์
// listener เก่าทิ้งได้ ไม่งั้น listener จะค้างสะสมทุกครั้งที่เปิดคำถาม sequencing ข้อใหม่
var activeDragCleanup = null;
var savePositionTimer = null;
var lastSavedPosition = 0;
var maxWatchedPosition = 0;
// [ยังเรียนอยู่ไหม] เช็คทุก 5 นาทีที่วิดีโอเล่นต่อเนื่อง (ไม่ถูก pause) — ถ้าไม่มีการโต้ตอบเลยจะ
// pause วิดีโอ + เด้ง popup ให้กดยืนยันก่อนเรียนต่อ กันเปิดทิ้งไว้เฉยๆ นับเป็นเวลาเรียนจริง
var stillWatchingTimer = null;
var STILL_WATCHING_INTERVAL_MS = 5 * 60 * 1000;
// [งานข้อ 22] จับเวลาเริ่ม session ตั้งแต่บรรทัดนี้ทำงาน (สคริปต์นี้ execute ตอน parse หน้าเว็บ ก่อน
// window "load" ด้วยซ้ำ) ไว้คำนวณ cmi.core.session_time ตอนจบ session — เดิมไม่เคย setValue ค่านี้
// เลยสักครั้ง รายงานเวลาเรียนของผู้เรียนที่ LMS/dashboard เห็นจึงเป็นศูนย์ตลอดไม่ว่าจะเรียนนานแค่ไหน
var sessionStartTime = Date.now();
// [งานข้อ 11] คะแนนควิซระหว่างวิดีโอ — ผู้เรียน/ครูเห็นตัวเลขจริงจาก DB (video_quiz_attempts)
// ผ่าน API คนละเส้นทาง (ดู page.tsx และ dashboard/teacher/analytics) สองตัวแปรนี้แค่ไว้เขียน
// คู่ขนานลง CMI (cmi.interactions.n.* / cmi.objectives.n.score) ให้ LMS ภายนอกอ่านได้ ไม่ใช่แหล่ง
// ความจริงหลัก — ตั้งใจแยกจาก cmi.core.score.raw ของ certificate โดยเด็ดขาด (formative คนละ
// ประเภทกับคะแนนตัดสินใบรับรอง)
var quizSummary = { correct: 0, total: 0 };
var interactionIndex = 0;

function apiUrl(path) { return path; }

function fetchJson(url, options) {
  return fetch(apiUrl(url), Object.assign({ credentials: "include" }, options || {}))
    .then(function (res) { if (!res.ok) throw new Error("Request failed: " + url); return res.json(); });
}

function loadInitialAttempts() {
  return fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/video-quiz-attempts")
    .then(function (data) {
      (data.attempts || []).forEach(function (a) {
        answeredQuestionIds[a.questionId] = true;
        // [งานข้อ 11] นับสถิติที่เคยตอบไปแล้ว (รอบก่อนหน้า/session อื่น) มารวมด้วย ไม่ใช่แค่ที่
        // ตอบใน session นี้ — ตัวเลขนี้มาจาก DB ตรงๆ (แหล่งความจริงเดียวกับที่ผู้เรียน/ครูเห็น)
        quizSummary.total++;
        if (a.isCorrect) quizSummary.correct++;
      });
      // [แก้บั๊ก SCORM 402: "Cannot set array element at index N. Current array length is 0,
      // expected index 0"] เดิมตั้ง interactionIndex จาก quizSummary.total (จำนวนที่ตอบไปแล้วใน DB)
      // ตรงๆ โดยสมมติว่า cmi.interactions เก่าถูก loadFromJSON คืนกลับเข้า CMI ครบแล้วก่อนหน้านี้เสมอ
      // (ฝั่ง page.tsx) — ถ้าเคสไหน restore ไม่ครบ (เช่นรอบก่อนไม่เคย commit ก้อน cmi เต็มๆ ไว้เลย)
      // array cmi.interactions จริงในเครื่อง LMS จะยังว่างอยู่ (length 0) แต่ interactionIndex ตั้งเป็น
      // ค่าจาก DB ทันที พอเขียน cmi.interactions.N.* ที่ N > 0 ก่อนมี index 0 จะชนกฎ SCORM ที่บังคับ
      // ว่า index ต้องเรียงต่อกันจาก 0 เสมอ
      //
      // ทางแก้: อ่านจำนวนจริงจาก cmi.interactions._count (data element มาตรฐานของ SCORM 1.2 —
      // scorm-again รองรับ) มาเป็นตัวตั้งต้นแทน รับประกันว่าเขียนต่อจาก index ที่ LMS มีอยู่จริง
      // ไม่ใช่ index ที่ DB "คิดว่า" ควรจะมี ถ้า LMS ที่เปิดอยู่ไม่รองรับ _count (คืนค่าว่าง/ไม่ใช่
      // ตัวเลข) ค่อย fallback กลับไปใช้ quizSummary.total เหมือนพฤติกรรมเดิม (ดีกว่าไม่มีค่าให้ใช้เลย)
      var actualInteractionCount = parseInt(ScormAPI.getValue("cmi.interactions._count"), 10);
      interactionIndex = isNaN(actualInteractionCount) ? quizSummary.total : actualInteractionCount;
      reportQuizSummaryToCmi();
    })
    .catch(function (err) { console.warn("Failed to load quiz attempts", err); });
}

// [งานข้อ 11] เขียนคะแนนควิซระหว่างวิดีโอ (formative) คู่ขนานลง cmi.objectives.0 — เป็น
// objective รวมของทั้งบทเรียน แยกจาก cmi.core.score.raw (คะแนนสอบปลายคอร์สที่ตัดสินใบรับรอง)
// โดยเจตนา ไม่เอามารวมกันเด็ดขาด
function reportQuizSummaryToCmi() {
  if (!LESSON_DATA.quizzes.length) return;
  var percent = quizSummary.total > 0 ? Math.round((quizSummary.correct / quizSummary.total) * 100) : 0;
  ScormAPI.setValue("cmi.objectives.0.id", "video-quiz-summary");
  ScormAPI.setValue("cmi.objectives.0.score.raw", String(percent));
  ScormAPI.setValue("cmi.objectives.0.score.min", "0");
  ScormAPI.setValue("cmi.objectives.0.score.max", "100");
}

// [งานข้อ 20] ย้ายจาก fetch("/api/lessons/.../watch-position") มาใช้ cmi.core.lesson_location
// ตรงตามที่ SCORM ออกแบบไว้ให้ทำอยู่แล้ว — เหตุผลที่ย้าย: ตัว REST endpoint เดิมมีเพดานเงื่อนไข
// resumeSeconds > 5 ที่ทำให้ผู้เรียนงงว่า "ทำไมไม่ resume" ตอนทดสอบสั้นๆ และที่สำคัญกว่านั้นคือ
// มันเป็นคนละแหล่งความจริงกับ CMI ที่งานข้อ 01/02 วางระบบ loadFromJSON/resume ไว้แล้วทั้งระบบ
// — เก็บผ่าน cmi.core.lesson_location ตัวเดียว ได้ resume ครบวงจรทั้งแพ็กเกจเราเองและมาตรฐาน
// SCORM ทั่วไปที่ LMS ภายนอกอ่านค่านี้ได้อยู่แล้วโดยไม่ต้องรู้จัก endpoint ของเราเลย
// ค่านี้ถูกใส่กลับเข้า API ผ่าน loadFromJSON ฝั่ง page.tsx ไปแล้วตั้งแต่ก่อน SCO นี้ initialize
// ด้วยซ้ำ (ดู Effect ที่ 2 ใน play/[courseId]/[lessonId]/page.tsx) อ่านค่าแบบ sync ได้เลย
// ไม่ต้อง fetch แยกอีกเส้นทางเหมือนเดิม
function loadResumePosition() {
  var raw = ScormAPI.getValue("cmi.core.lesson_location");
  var seconds = raw ? Number(raw) : 0;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

// เก็บแค่ setValue ไม่ commit ในนี้ — ผู้เรียกแต่ละจุด (interval ระหว่างเล่น, pause, ended,
// beforeunload) เป็นคนตัดสินเองว่าควร commit ตอนไหน กันยิง commit ถี่เกินจำเป็นตอน setValue
// ล้วนๆ หลายค่าติดกัน (เช่น ตอน ended ที่ setValue ทั้ง location และ lesson_status ก่อน commit
// รวบครั้งเดียว)
function savePosition(seconds) {
  ScormAPI.setValue("cmi.core.lesson_location", String(Math.floor(seconds)));
}

// [งานข้อ 22] แปลงเวลาที่ผ่านไปตั้งแต่ sessionStartTime เป็นฟอร์แมต CMITimespan ของ SCORM 1.2
// ("HHHH:MM:SS.SS" — ชั่วโมง 4 หลักตายตัว, นาที/วินาที 2 หลัก, เศษวินาที 2 หลักหน่วยเซนติวินาที
// ตามสเปกของ ADL RTE3 พอดี) ต้อง setValue ค่านี้ก่อน LMSFinish เสมอ ไม่งั้น LMS จะได้ session_time
// เป็นค่าว่าง/ศูนย์ (ปัญหาที่พบตอนนี้)
function formatSessionTime() {
  var elapsedMs = Date.now() - sessionStartTime;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) elapsedMs = 0;

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  var totalCentiseconds = Math.floor(elapsedMs / 10);
  var hundredths = totalCentiseconds % 100;
  var totalSeconds = Math.floor(totalCentiseconds / 100);
  var seconds = totalSeconds % 60;
  var totalMinutes = Math.floor(totalSeconds / 60);
  var minutes = totalMinutes % 60;
  var hours = Math.floor(totalMinutes / 60); // ไม่ mod เพราะ CMITimespan รองรับสูงสุด 9999 ชั่วโมง

  var hoursStr = String(hours);
  while (hoursStr.length < 4) hoursStr = "0" + hoursStr;

  return hoursStr + ":" + pad2(minutes) + ":" + pad2(seconds) + "." + pad2(hundredths);
}

// [งานข้อ 22] ตัดสินค่า cmi.core.exit ก่อน LMSFinish ตามสถานะบทเรียนตอนออกจากหน้า — ถ้ายังเรียนไม่จบ
// ("completed"/"passed") ต้องตั้งเป็น "suspend" เพื่อให้ LMS รู้ว่าต้อง resume (cmi.core.entry =
// "resume") ตอนกลับเข้ามาเรียนต่อรอบหน้า ตรงกับ flow ที่งานข้อ 01/02 วางไว้อยู่แล้ว — ถ้าจบแล้วจริง
// ตั้งเป็น "" (ค่าว่าง = จบ session ตามปกติ ตามสเปก SCORM 1.2 ไม่ใช่ "logout"/"time-out")
function determineExitValue() {
  var status = ScormAPI.getValue("cmi.core.lesson_status");
  return status === "completed" || status === "passed" ? "" : "suspend";
}

var quizIndexById = null;

function getQuizIndexMap() {
  if (!quizIndexById) {
    quizIndexById = {};
    LESSON_DATA.quizzes.forEach(function (q, i) { quizIndexById[q.id] = i; });
  }
  return quizIndexById;
}

// [งานข้อ 21] ย้ายชุดข้อที่ตอบแล้ว (answeredQuestionIds) จากที่เดิมพึ่งพา fetch REST
// ("/video-quiz-attempts") อย่างเดียว มาเก็บคู่ขนานลง cmi.suspend_data ด้วย — ตาราง
// video_quiz_attempts ใน DB ยังคงอยู่เหมือนเดิมสำหรับ analytics (ตัวเลขคะแนน/สถิติที่ครูเห็นใน
// dashboard) ไม่ได้ตัดออก แค่ไม่ใช่แหล่งเดียวที่ใช้ gate การเล่นวิดีโอ (findNextUnansweredAt/
// getMaxAllowedSeekTime) อีกต่อไป เหตุผลเดียวกับงานข้อ 20: ถ้าแพ็กเกจนี้ถูกนำไปเปิดใน LMS ภายนอก
// (งานข้อ 23) endpoint REST ของเราจะเรียกไม่ได้เลย (คนละโดเมน/ไม่มี cookie auth ของเรา) แต่
// cmi.suspend_data เป็นมาตรฐาน SCORM ที่ LMS ไหนก็ต้องอ่าน/เขียนให้ได้อยู่แล้ว จึงอ่านได้แบบ sync
// ทันทีตอนโหลดเหมือน loadResumePosition() โดยไม่ต้องรอ network เลย
//
// เก็บเป็น "ลำดับ index ใน LESSON_DATA.quizzes" ไม่ใช่ UUID ตรงๆ เพราะ cmi.suspend_data ของ
// SCORM 1.2 จำกัดไว้ที่ 4096 ตัวอักษร ถ้าเก็บ UUID (36 ตัวอักษร + comma คั่น) ตรงๆ จะรองรับได้แค่
// ราว 100 ข้อเท่านั้น ส่วนการเข้ารหัสเป็น bitmask แบบ hex (4 บิต/ตัวอักษร) รองรับได้หลักพันข้อสบายๆ
// ภายในเพดานเดียวกัน — ข้อควรระวัง: index อ้างอิงตามลำดับการ sort ตอน generate เท่านั้น ถ้าครูแก้ไข/
// เพิ่ม/ลบ/สลับลำดับคำถามแล้ว regenerate แพ็กเกจใหม่ ข้อมูล suspend_data เก่าที่ค้างใน LMS (ของ
// ผู้เรียนที่เคยเริ่มเรียนด้วยแพ็กเกจรุ่นก่อน) จะอ้างอิง index ผิดข้อไปทันที — ยอมรับความเสี่ยงนี้ตาม
// ที่ระบุไว้ใน task card เพราะเป็นทางเดียวที่จะพอเก็บได้ในเพดาน 4096 ตัวอักษร
function encodeAnsweredBitmask() {
  var indexMap = getQuizIndexMap();
  var total = LESSON_DATA.quizzes.length;
  var bits = [];
  for (var i = 0; i < total; i++) bits.push(0);
  Object.keys(answeredQuestionIds).forEach(function (id) {
    if (!answeredQuestionIds[id]) return;
    var idx = indexMap[id];
    if (idx !== undefined) bits[idx] = 1;
  });
  var hex = "";
  for (var i2 = 0; i2 < total; i2 += 4) {
    var nibble = (bits[i2] || 0) * 8 + (bits[i2 + 1] || 0) * 4 + (bits[i2 + 2] || 0) * 2 + (bits[i2 + 3] || 0);
    hex += nibble.toString(16);
  }
  return hex;
}

function saveAnsweredToSuspendData() {
  ScormAPI.setValue("cmi.suspend_data", encodeAnsweredBitmask());
}

function loadAnsweredFromSuspendData() {
  var raw = ScormAPI.getValue("cmi.suspend_data");
  if (!raw) return;
  for (var i = 0; i < LESSON_DATA.quizzes.length; i++) {
    var charIndex = Math.floor(i / 4);
    var hexChar = raw.charAt(charIndex);
    if (!hexChar) break;
    var nibble = parseInt(hexChar, 16);
    if (isNaN(nibble)) continue;
    var bitPos = 3 - (i % 4);
    var bit = (nibble >> bitPos) & 1;
    if (bit) answeredQuestionIds[LESSON_DATA.quizzes[i].id] = true;
  }
}

function findNextUnansweredAt(currentTime) {
  for (var i = 0; i < LESSON_DATA.quizzes.length; i++) {
    var q = LESSON_DATA.quizzes[i];
    if (!isTimeInRequestedChapter(q.timestampSeconds)) continue;
    if (!answeredQuestionIds[q.id] && q.timestampSeconds <= currentTime) return q;
  }
  return null;
}

function getMaxAllowedSeekTime() {
  var max = maxWatchedPosition;
  for (var i = 0; i < LESSON_DATA.quizzes.length; i++) {
    var q = LESSON_DATA.quizzes[i];
    if (!isTimeInRequestedChapter(q.timestampSeconds)) continue;
    if (!answeredQuestionIds[q.id]) max = Math.min(max, q.timestampSeconds);
  }
  return max;
}

// [งานข้อ 18] เดิม renderLesson() เอา LESSON_DATA.contentHtml ใส่ innerHTML ตรงๆ โดยไม่กรองอะไรเลย
// ตรวจสอบต้นทาง (lib/quiz/dispatcher.ts, lib/quiz/submit-*-answer.ts, และ save path ของ content_html
// ในตัวแก้ไขบทเรียนฝั่งครู) แล้วไม่พบว่ามีการ sanitize HTML ตอนบันทึกที่จุดใดเลย — content_html เก็บ
// HTML ดิบจาก rich text editor ของครูตรงๆ ถ้าบัญชีครูถูกขโมย/ครูวางโค้ดที่แฝง <script>/<iframe>/
// onerror= มาโดยไม่รู้ตัว (เช่น copy-paste จากเว็บอื่น) โค้ดนั้นจะถูก execute ทันทีตอนนักเรียนเปิดบทเรียน
// เพราะแพ็กเกจ SCORM เป็นไฟล์ static ที่โหลดจาก R2 ตรงๆ ไม่มี CSP ของแอปหลักมาช่วยกันอีกชั้น จึง sanitize
// ที่จุด render นี้เอง (defense-in-depth — ไม่พึ่งพาว่าต้นทางจะกรองให้ เพราะเป็นจุดสุดท้ายก่อน innerHTML
// จริง และไม่ต้องพึ่ง library ภายนอกเพราะแพ็กเกจนี้เป็นไฟล์ static ที่รันเดี่ยวๆ ไม่มี bundler ตอนรันจริง)
function sanitizeLessonHtml(html) {
  if (!html) return "";

  var ALLOWED_TAGS = {
    P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1, SPAN: 1, DIV: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, UL: 1, OL: 1, LI: 1,
    A: 1, IMG: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TD: 1, TH: 1,
    BLOCKQUOTE: 1, CODE: 1, PRE: 1, HR: 1, SUB: 1, SUP: 1, MARK: 1,
  };
  var ALLOWED_ATTRS = {
    A: ["href", "title"],
    IMG: ["src", "alt", "width", "height", "title"],
    "*": ["class"],
  };

  function isSafeUrl(value, forImage) {
    if (!value) return false;
    var v = String(value).trim().toLowerCase();
    if (v.indexOf("javascript:") === 0) return false;
    if (v.indexOf("vbscript:") === 0) return false;
    if (v.indexOf("data:") === 0) {
      // data: URL อนุญาตเฉพาะรูปภาพเท่านั้น (กัน data:text/html ที่รันโค้ดได้)
      return !!forImage && v.indexOf("data:image/") === 0;
    }
    return true;
  }

  function cleanNode(node) {
    var children = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.nodeType === 1) {
        var tag = child.tagName;
        if (!ALLOWED_TAGS[tag]) {
          // แท็กนอก allowlist (script, iframe, style, object, embed, form, link, meta, svg ฯลฯ) —
          // ลบทั้งแท็กและเนื้อหาข้างในทิ้งไปเลย ไม่ใช่แค่แกะแท็กออกแล้วเหลือเนื้อหาไว้
          child.parentNode.removeChild(child);
          continue;
        }
        // ลบ attribute ทุกตัวที่ไม่อยู่ใน allowlist ของแท็กนั้น (กัน onerror=/onclick=/style=/srcdoc= ฯลฯ)
        var attrs = Array.prototype.slice.call(child.attributes);
        var allowedForTag = (ALLOWED_ATTRS[tag] || []).concat(ALLOWED_ATTRS["*"]);
        for (var j = 0; j < attrs.length; j++) {
          var attrName = attrs[j].name.toLowerCase();
          if (allowedForTag.indexOf(attrName) === -1) {
            child.removeAttribute(attrs[j].name);
            continue;
          }
          if ((tag === "A" && attrName === "href") || (tag === "IMG" && attrName === "src")) {
            if (!isSafeUrl(attrs[j].value, tag === "IMG")) {
              child.removeAttribute(attrs[j].name);
            }
          }
        }
        if (tag === "A") {
          // กัน reverse tabnabbing จากลิงก์ที่เปิดแท็บใหม่
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer nofollow");
        }
        cleanNode(child);
      } else if (child.nodeType === 8) {
        // ลบ HTML comment ทิ้ง (กันเทคนิคซ่อนโค้ดในคอมเมนต์)
        child.parentNode.removeChild(child);
      }
      // nodeType 3 (text node) ปล่อยผ่านตามปกติ — DOMParser ไม่ execute สคริปต์ระหว่าง parse อยู่แล้ว
    }
  }

  try {
    var doc = new DOMParser().parseFromString(String(html), "text/html");
    cleanNode(doc.body);
    return doc.body.innerHTML;
  } catch (e) {
    console.error("[sanitizeLessonHtml] parse failed:", e);
    return "";
  }
}

function renderLesson() {
  var requestedChapter = getRequestedChapter();
  document.getElementById("lesson-title").textContent = requestedChapter ? requestedChapter.title : LESSON_DATA.title;
  var lessonContentEl = document.getElementById("lesson-content");
  lessonContentEl.innerHTML = sanitizeLessonHtml(LESSON_DATA.contentHtml);
  // ไม่มีเนื้อหาจริง (ว่าง หรือมีแค่แท็กเปล่าอย่าง p/br) = ซ่อนกล่องขาวทั้งอัน ไม่ให้เหลือกรอบว่างใต้วิดีโอ
  var hasLessonText = lessonContentEl.textContent.replace(/\s+/g, "") !== "";
  var hasLessonMedia = !!lessonContentEl.querySelector("img, video, audio, iframe, table, svg, canvas, object, embed");
  lessonContentEl.style.display = hasLessonText || hasLessonMedia ? "" : "none";
}

/* ---------------- Quiz modal (เหมือนเดิม) ---------------- */
function openQuizModal(question) { //เปิดคำถามใน modal
  pendingQuestion = question;

  if (question.sourceType === "random_bank" && !question.questionText) {
    var overlay = document.getElementById("quiz-overlay");
    var loadingBody = document.getElementById("quiz-modal-body");
    loadingBody.innerHTML = '<p class="quiz-modal-question">กำลังโหลดคำถาม...</p>';
    overlay.classList.add("open");
  //ยิงไปขอคำถามจาก server โดยใช้ fetchJson และส่ง lessonId และ question.id ไปด้วย
    fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/video-quiz-markers/" + question.id + "/sample")
      .then(function (sampled) {//ได้คำถามมาแล้ว ไปเซ็ตลงใน object question ตัวเดิม
        question.questionText = sampled.questionText;
        question.choices = sampled.choices;
        question.imageUrl = sampled.imageUrl ?? null;
        // ===== เพิ่มใหม่: คำบรรยายใต้ภาพ + หมุดตัวเลขชี้เป้าบนภาพ — renderQuizModalContent รองรับ
        // field นี้อยู่แล้ว (ใช้กับทางคำถามคงที่/per-timestamp) แค่ต้องเซ็ตให้ทาง random_bank ด้วย
        question.imageCaption = sampled.imageCaption ?? null;
        question.imagePins = sampled.imagePins ?? [];
        // ===== เพิ่มใหม่: matching/sequencing — ไม่มีเฉลยติดมา (ดู sample/route.ts) แค่ข้อมูล
        // แสดงผลที่สลับลำดับแล้ว interactionType ที่ไม่รู้จัก (MC/True-False) ถือเป็น undefined ปกติ
        question.interactionType = sampled.interactionType;
        question.matching = sampled.matching ?? null;
        question.sequencing = sampled.sequencing ?? null;
        question.dragDrop = sampled.dragDrop ?? null;
        renderQuizModalContent(question);
      })
      .catch(function () {
        // [งานข้อ 14] เดิมมีแค่ข้อความ ไม่มีปุ่มให้กด "ลองใหม่" จริงๆ สักปุ่ม (ข้อความบอกให้ลองใหม่
        // แต่กดอะไรไม่ได้เลยนอกจากปุ่มปิดที่เพิ่งเพิ่มด้านบน) — เพิ่มปุ่มลองโหลดคำถามเดิมซ้ำจริงๆ
        loadingBody.innerHTML = "";
        var errorMsg = document.createElement("p");
        errorMsg.className = "quiz-modal-error";
        errorMsg.textContent = "โหลดคำถามไม่สำเร็จ";
        loadingBody.appendChild(errorMsg);
        var retryLoadBtn = document.createElement("button");
        retryLoadBtn.type = "button";
        retryLoadBtn.className = "quiz-modal-continue-btn";
        retryLoadBtn.textContent = "ลองใหม่อีกครั้ง";
        retryLoadBtn.addEventListener("click", function () {
          question.questionText = null;
          openQuizModal(question);
        });
        loadingBody.appendChild(retryLoadBtn);
      });
    return;
  }

  renderQuizModalContent(question);//เรียกเพื่อแสดงคำถามลงใน modal วาด ui 
}

function renderQuizModalContent(question) {
  // เคลียร์ listener ของ drag-and-drop จากคำถาม sequencing ข้อก่อนหน้า (ถ้ามีค้างอยู่) ก่อน render
  // เนื้อหาใหม่ทับ ไม่งั้น listener ระดับ document จะค้างสะสมทุกครั้งที่เปิดคำถามใหม่
  if (typeof activeDragCleanup === "function") { activeDragCleanup(); }

  var overlay = document.getElementById("quiz-overlay");
  var body = document.getElementById("quiz-modal-body");
  body.innerHTML = "";

  // [ใส่รูปในคำถาม] แสดงเฉพาะข้อที่มี imageUrl ฝังมา (static quiz ที่ครูอัปโหลดรูปไว้) —
  // รูปมาจาก R2 เป็น public URL เหมือน videoUrl อยู่แล้ว โหลดตรงได้เลยไม่ต้องพึ่ง API
  // ของเว็บเรา เปิดจาก LMS ไหนก็เห็นรูปเหมือนกัน (ไม่กระทบเรื่องพกพา)
  if (question.imageUrl) {
    // ===== เพิ่มใหม่: ครอบรูปด้วย wrapper เพื่อวางหมุดตัวเลข (absolute position ตาม % ของรูป) ทับ
    // บนรูปได้ — เดิมมีแค่ <img> เปล่าๆ ไม่มี wrapper ให้ position: absolute อ้างอิง =====
    var imageWrap = document.createElement("div");
    imageWrap.className = "quiz-modal-image-wrap";

    var image = document.createElement("img");
    image.className = "quiz-modal-image";
    image.src = question.imageUrl;
    image.alt = "";
    imageWrap.appendChild(image);

    (question.imagePins || []).forEach(function (pin, pinIndex) {
      var pinBadge = document.createElement("span");
      pinBadge.className = "quiz-modal-image-pin";
      pinBadge.style.left = pin.x + "%";
      pinBadge.style.top = pin.y + "%";
      pinBadge.textContent = String(pinIndex + 1);
      imageWrap.appendChild(pinBadge);
    });

    body.appendChild(imageWrap);

    // [แคปชันใต้ภาพ] โชว์เฉพาะข้อที่ครูพิมพ์ไว้ (ไม่บังคับ)
    if (question.imageCaption) {
      var imageCaption = document.createElement("p");
      imageCaption.className = "quiz-modal-image-caption";
      imageCaption.textContent = question.imageCaption;
      body.appendChild(imageCaption);
    }
  }

  var title = document.createElement("p");
  title.className = "quiz-modal-question";
  title.textContent = question.questionText;
  body.appendChild(title);

  // ===== เพิ่มใหม่: matching/sequencing มี sub-text อธิบายวิธีตอบ (เหมือนที่ปรับใน Final Exam
  // ตาม feedback ของ UI/UX) MC/True-False (รวมถึง static quiz เดิม) ไม่ต้องมี ไม่เปลี่ยนพฤติกรรมเดิม
  if (question.interactionType === "matching" || question.interactionType === "sequencing" ||
      question.interactionType === "multi_select" || question.interactionType === "drag_drop") {
    var subText = document.createElement("p");
    subText.className = "quiz-modal-subtext";
    subText.textContent =
      question.interactionType === "matching"
        ? "เลือกจับคู่คำตอบที่ถูกต้อง"
        : question.interactionType === "multi_select"
        ? "เลือกได้หลายคำตอบ — ติ๊กทุกข้อที่ถูก (ต้องเลือกให้ครบจึงจะถูก)"
        : question.interactionType === "drag_drop"
        ? "ลากคำไปวางในช่องว่าง หรือแตะคำเพื่อเติมช่องว่างช่องแรก (แตะคำในช่องเพื่อเอาออก)"
        : "ลากเพื่อสลับลำดับจากน้อยไปมาก";
    body.appendChild(subText);
  }

  var feedback = document.createElement("div");
  feedback.id = "quiz-modal-feedback";
  feedback.className = "quiz-modal-feedback";

  // ===== เพิ่มใหม่: matching/sequencing มีปุ่ม "ส่งคำตอบ" ของตัวเอง — ส่ง feedback เข้าไปให้ฟังก์ชัน
  // render ควบคุมลำดับ DOM เอง (ต้องอยู่ "เหนือ" ปุ่มส่งคำตอบเสมอ: รายการ → ฟีดแบ็ก → ปุ่ม ไม่ใช่ต่อท้าย
  // ปุ่มแบบเดิม ซึ่งทำให้เห็นปุ่ม "ส่งคำตอบ" เทาค้างอยู่ใต้ฟีดแบ็กอีกที) MC/True-False ไม่มีปุ่มส่งแยก
  // (คลิกตัวเลือก = ส่งคำตอบทันที) ต่อท้ายแบบเดิมได้เลย ไม่กระทบ
  if (question.interactionType === "matching") {
    renderMatchingBody(question, body, feedback);
  } else if (question.interactionType === "sequencing") {
    renderSequencingBody(question, body, feedback);
  } else if (question.interactionType === "multi_select") {
    renderMultiSelectBody(question, body, feedback);
  } else if (question.interactionType === "drag_drop" && question.dragDrop) {
    renderDragDropBody(question, body, feedback);
  } else {
    // ทางเดิม: multiple_choice/true_false (และ static quiz เดิมที่ไม่มี interactionType เลย)
    renderChoicesBody(question, body);
    body.appendChild(feedback);
  }

  overlay.classList.add("open");
}

// เดิมโค้ดนี้ inline อยู่ใน renderQuizModalContent ตรงๆ — แยกออกมาเป็นฟังก์ชันเดียว เพื่อให้สลับ
// ไปเรียก renderMatchingBody/renderSequencingBody ตาม interactionType ได้ ไม่กระทบพฤติกรรมเดิมเลย
function renderChoicesBody(question, body) {
  var choicesWrap = document.createElement("div");
  choicesWrap.className = "quiz-modal-choices";

  question.choices.forEach(function (choiceText, idx) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-modal-choice-btn";
    btn.textContent = choiceText;
    btn.addEventListener("click", function () { submitAnswer(question, idx, choicesWrap); });
    choicesWrap.appendChild(btn);
  });

  body.appendChild(choicesWrap);
}

// ===== เพิ่มใหม่: matching (จับคู่) สำหรับ Pop-up Quiz — ฝั่งซ้ายเป็นการ์ด ฝั่งขวาเป็น dropdown ที่
// เปลี่ยนเป็นสีเขียวเมื่อเลือกแล้ว (ปรับสไตล์ dropdown เดิมให้สวยขึ้นตาม feedback ของ Final Exam
// ไม่ใช่ drag-and-drop เพราะจับคู่ด้วย dropdown ยังชัดเจน/ทำง่ายกว่าและเป็นตัวเลือกที่เลือกไว้แล้ว)
// เก็บคำตอบเป็น {pairs: [{left, right}]} shape เดียวกับ MatchingStudentAnswer ฝั่ง server
function renderMatchingBody(question, body, feedback) {
  var matching = question.matching; // { left: string[], rightOptions: string[] }
  var answers = {}; // leftIndex -> right text ที่เลือกไว้ (ใช้ index แทนข้อความกันกรณีข้อความฝั่งซ้ายซ้ำกัน)
  var rowRefs = []; // { row, select, leftIndex, leftText } — เก็บไว้ใช้ทั้งกันเลือกซ้ำและไฮไลต์ถูก/ผิด

  // ===== เพิ่มใหม่: หัวข้อ "จับคู่แล้ว N/4" + แถบ progress แบ่งเป็นช่องเท่าจำนวนคู่ ให้เห็นความคืบหน้า
  // ก่อนส่งคำตอบ (เดิมไม่มีอะไรบอกความคืบหน้าเลย)
  var progressWrap = document.createElement("div");
  progressWrap.className = "quiz-modal-matching-progress";
  var progressLabel = document.createElement("span");
  progressLabel.className = "quiz-modal-matching-progress-label";
  var progressBar = document.createElement("div");
  progressBar.className = "quiz-modal-matching-progress-bar";
  var progressSegs = matching.left.map(function () {
    var seg = document.createElement("span");
    seg.className = "quiz-modal-matching-progress-seg";
    progressBar.appendChild(seg);
    return seg;
  });
  progressWrap.appendChild(progressLabel);
  progressWrap.appendChild(progressBar);

  function updateProgress() {
    var answeredCount = Object.keys(answers).length;
    progressLabel.textContent = "จับคู่แล้ว " + answeredCount + "/" + matching.left.length;
    progressSegs.forEach(function (seg, i) { seg.classList.toggle("is-filled", i < answeredCount); });
  }

  var wrap = document.createElement("div");
  wrap.className = "quiz-modal-matching";

  // ===== เพิ่มใหม่: หมุดบนภาพ (ถ้ามี) — จับคู่กับแถวด้วยเลขที่แทรกอยู่ในข้อความฝั่งซ้าย (เช่น "หมุด 3"
  // คือหมุดเลข 3 บนภาพ) รูปถูกวาดไว้ใน body ไปแล้วก่อนเรียกฟังก์ชันนี้ (ดู renderQuizModalContent) จึง
  // querySelectorAll หาได้ตรงนี้เลย — ถ้าข้อความไม่มีเลข หรือภาพไม่มีหมุดพอ ก็ข้ามไปเงียบๆ ไม่พังอะไร
  // เป็นของเสริมให้ภาพกับรายการ "คุยกัน" (hover/focus แถว → หมุดเรืองแสง, กดหมุด → โฟกัส dropdown)
  var pinEls = body.querySelectorAll(".quiz-modal-image-pin");

  // ===== เพิ่มใหม่: กันเลือกคำตอบฝั่งขวาซ้ำกันข้ามแถว — ตัวเลือกที่แถวอื่นเลือกไปแล้วจะถูก disable พร้อม
  // ต่อท้ายข้อความ "(เลือกแล้ว)" ให้ชัดว่าทำไมกดไม่ได้ ใน <select> ของแถวอื่นทั้งหมด (ยกเว้นแถวที่เลือก
  // มันอยู่ตอนนี้) พอเปลี่ยน/ล้างค่าในแถวไหน ตัวเลือกเดิมจะกลับมาเลือกได้อีกทันที ไม่ต้องรอ submit
  function refreshOptionAvailability() {
    var chosenByIndex = {}; // rightValue -> leftIndex ที่เลือกค่านี้อยู่ตอนนี้
    rowRefs.forEach(function (ref) {
      if (ref.select.value) chosenByIndex[ref.select.value] = ref.leftIndex;
    });
    rowRefs.forEach(function (ref) {
      Array.prototype.forEach.call(ref.select.options, function (opt) {
        if (!opt.value) return; // ไม่แตะ placeholder "— เลือกคำตอบ —"
        var ownerIndex = chosenByIndex[opt.value];
        var isTakenByOther = ownerIndex !== undefined && ownerIndex !== ref.leftIndex;
        opt.disabled = isTakenByOther;
        opt.textContent = isTakenByOther ? opt.dataset.label + " (เลือกแล้ว)" : opt.dataset.label;
      });
    });
  }

  matching.left.forEach(function (leftText, leftIndex) {
    var row = document.createElement("div");
    row.className = "quiz-modal-matching-row";

    var pinMatch = /(\d+)\s*$/.exec(String(leftText).trim());
    var pinNumber = pinMatch ? parseInt(pinMatch[1], 10) : null;
    var pinEl = pinNumber ? pinEls[pinNumber - 1] || null : null;

    // ===== เพิ่มใหม่: วงกลมเลขสีส้ม สไตล์เดียวกับหมุดบนภาพ แทนกล่องขาวที่มีแต่ข้อความ (ตาจะได้ลิงก์
    // เลขบนรายการกับเลขหมุดบนภาพเข้าด้วยกันเอง)
    var badge = document.createElement("span");
    badge.className = "quiz-modal-matching-badge";
    badge.textContent = pinNumber ? String(pinNumber) : String(leftIndex + 1);
    row.appendChild(badge);

    var leftCard = document.createElement("div");
    leftCard.className = "quiz-modal-matching-left";
    leftCard.textContent = leftText;
    row.appendChild(leftCard);

    var connector = document.createElement("div");
    connector.className = "quiz-modal-matching-connector";
    row.appendChild(connector);

    var select = document.createElement("select");
    select.className = "quiz-modal-matching-select";

    var placeholderOpt = document.createElement("option");
    placeholderOpt.value = "";
    placeholderOpt.textContent = "— เลือกคำตอบ —";
    select.appendChild(placeholderOpt);

    matching.rightOptions.forEach(function (rightText) {
      var opt = document.createElement("option");
      opt.value = rightText;
      opt.dataset.label = rightText;
      opt.textContent = rightText;
      select.appendChild(opt);
    });

    if (pinEl) {
      pinEl.classList.add("is-linkable");
      pinEl.addEventListener("click", function () { select.focus(); });
    }

    function setActive(on) {
      row.classList.toggle("is-active", on);
      if (pinEl) pinEl.classList.toggle("is-active", on);
    }
    row.addEventListener("mouseenter", function () { setActive(true); });
    row.addEventListener("mouseleave", function () { setActive(false); });
    select.addEventListener("focus", function () { setActive(true); });
    select.addEventListener("blur", function () { setActive(false); });

    select.addEventListener("change", function () {
      if (select.value) {
        answers[leftIndex] = select.value;
      } else {
        delete answers[leftIndex];
      }
      var isFilled = Boolean(select.value);
      // ===== เพิ่มใหม่: "เลือกแล้ว" (ยังไม่ส่งคำตอบ) ใช้สี accent (navy) แทนเขียว — เขียว/แดงเก็บไว้
      // ใช้เฉพาะตอนเฉลยหลังส่งคำตอบเท่านั้น กันเข้าใจผิดว่า "ถูกแล้ว" ทั้งที่ยังไม่ได้ตรวจ
      select.classList.toggle("is-filled", isFilled);
      connector.classList.toggle("is-filled", isFilled);
      badge.classList.toggle("is-matched", isFilled);
      if (pinEl) pinEl.classList.toggle("is-matched", isFilled);
      updateProgress();
      refreshOptionAvailability();
    });

    rowRefs.push({ row: row, select: select, leftIndex: leftIndex, leftText: leftText });
    row.appendChild(select);
    wrap.appendChild(row);
  });

  updateProgress();
  body.appendChild(progressWrap);
  body.appendChild(wrap);
  // ===== เพิ่มใหม่: feedback ต้องอยู่ "เหนือ" ปุ่มส่งคำตอบเสมอ (รายการ → ฟีดแบ็ก → ปุ่มหลัก) —
  // renderQuizModalContent ส่ง feedback เข้ามาให้ตรงนี้แทนที่จะต่อท้ายปุ่มเองแบบเดิม
  body.appendChild(feedback);

  var submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "quiz-modal-continue-btn quiz-modal-submit-btn";
  submitBtn.textContent = "ส่งคำตอบ";

  // ===== เพิ่มใหม่: ปุ่มกดได้ตลอด ไม่ disable ตามความครบ (เดิม disable เฉยๆ ผู้เรียนไม่รู้ว่าต้องทำ
  // อะไรต่อ) — ถ้ายังตอบไม่ครบ ขึ้นข้อความแดง "เหลืออีก N หมุด" + สั่นเบาๆ ที่แถวที่ยังว่างแทน ใช้
  // .onclick (ไม่ใช่ addEventListener) เพื่อให้ applyContinueOrRetryToButton แทนที่ handler นี้ได้
  // สะอาดๆ หลังส่งคำตอบจริง ไม่ให้ยิงซ้ำสองชุดถ้ากดปุ่มอีกทีตอนเปลี่ยนสถานะเป็น "เรียนต่อ"/"ลองใหม่" แล้ว
  submitBtn.onclick = function () {
    var answeredCount = Object.keys(answers).length;
    if (answeredCount !== matching.left.length) {
      feedback.innerHTML = '<p class="quiz-modal-incomplete-warning">เหลืออีก ' + (matching.left.length - answeredCount) + ' หมุด</p>';
      rowRefs.forEach(function (ref) {
        if (answers[ref.leftIndex] !== undefined) return;
        ref.row.classList.remove("is-shake");
        void ref.row.offsetWidth; // force reflow ให้เล่น animation ซ้ำได้ ถ้าสั่นไปแล้วรอบก่อน
        ref.row.classList.add("is-shake");
      });
      return;
    }
    feedback.innerHTML = "";

    var pairs = matching.left.map(function (leftText, leftIndex) { return { left: leftText, right: answers[leftIndex] }; });

    // ===== ไฮไลต์ถูก/ผิดเป็นรายคู่ทันทีหลังกดส่งคำตอบ (บอกชัดว่าคู่ไหนผิดบ้าง ไม่ใช่แค่ข้อความสรุปรวม)
    // — ทำได้เฉพาะตอนมีเฉลยฝังมาในเครื่อง (question.answerData) ซึ่งควิซ static ระหว่างวิดีโอมีเฉลยฝังมา
    // เสมอ ยกเว้นมาร์กเกอร์สุ่มเก่าที่ยังเหลืออยู่ (ไม่มี answerData) จะไม่มีไฮไลต์รายคู่
    if (question.answerData && question.answerData.pairs) {
      var correctMap = {};
      question.answerData.pairs.forEach(function (p) { correctMap[p.left] = p.right; });
      rowRefs.forEach(function (ref) {
        var isRowCorrect = correctMap[ref.leftText] === answers[ref.leftIndex];
        ref.row.classList.add(isRowCorrect ? "is-row-correct" : "is-row-incorrect");
        var icon = document.createElement("span");
        icon.className = "quiz-modal-row-icon " + (isRowCorrect ? "is-correct" : "is-incorrect");
        icon.textContent = isRowCorrect ? "✓" : "✕";
        ref.row.appendChild(icon);
      });
    }

    submitStructuredAnswer(question, { pairs: pairs }, [wrap], submitBtn);
  };
  body.appendChild(submitBtn);
}

// ===== เพิ่มใหม่: sequencing (เรียงลำดับ) สำหรับ Pop-up Quiz — ลาก-วางจริงด้วย Pointer Events
// (รองรับทั้งเมาส์และทัสก์สกรีนในโค้ดชุดเดียว ไม่ต้องแยก touch/mouse listener) แทนปุ่มลูกศรขึ้น-ลง
// แบบเดิม ตาม feedback ของ Final Exam — จับที่ drag handle (ไอคอนจุด 6 จุด) เท่านั้น ลากผ่านแถวไหน
// ก็สลับตำแหน่งกับแถวนั้นทันที (swap-based reorder เหมือน SortableJS) ไม่มี @dnd-kit ให้ใช้ในแพ็กเกจ
// SCORM (ปลอด framework ทั้งหมด) เลยต้องเขียนเองด้วย vanilla JS
function renderSequencingBody(question, body, feedback) {
  var order = question.sequencing.map(function (item) { return item.id; });
  var textById = {};
  question.sequencing.forEach(function (item) { textById[item.id] = item.text; });

  var list = document.createElement("div");
  list.className = "quiz-modal-sequencing-list";
  var dragState = null; // { id, pointerId }

  function renderRows() {
    list.innerHTML = "";
    order.forEach(function (id, index) {
      var row = document.createElement("div");
      row.className = "quiz-modal-sequencing-row";
      row.setAttribute("data-id", id);

      var badge = document.createElement("span");
      badge.className = "quiz-modal-sequencing-badge";
      badge.textContent = String(index + 1);
      row.appendChild(badge);

      var text = document.createElement("span");
      text.className = "quiz-modal-sequencing-text";
      text.textContent = textById[id];
      row.appendChild(text);

      var handle = document.createElement("button");
      handle.type = "button";
      handle.className = "quiz-modal-sequencing-handle";
      handle.setAttribute("aria-label", "ลากเพื่อสลับลำดับ");
      handle.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
        '<circle cx="5" cy="3" r="1.4" fill="currentColor"></circle><circle cx="11" cy="3" r="1.4" fill="currentColor"></circle>' +
        '<circle cx="5" cy="8" r="1.4" fill="currentColor"></circle><circle cx="11" cy="8" r="1.4" fill="currentColor"></circle>' +
        '<circle cx="5" cy="13" r="1.4" fill="currentColor"></circle><circle cx="11" cy="13" r="1.4" fill="currentColor"></circle>' +
        '</svg>';
      row.appendChild(handle);

      // สำรองสำหรับคีย์บอร์ด (โฟกัสที่ handle แล้วกดลูกศรขึ้น/ลง) เผื่อลาก/แทะไม่ได้สะดวก
      handle.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        var from = order.indexOf(id);
        var to = e.key === "ArrowUp" ? from - 1 : from + 1;
        if (to < 0 || to >= order.length) return;
        order.splice(from, 1);
        order.splice(to, 0, id);
        renderRows();
        var movedRow = list.querySelector('[data-id="' + id + '"]');
        var movedHandle = movedRow && movedRow.querySelector(".quiz-modal-sequencing-handle");
        if (movedHandle) movedHandle.focus();
      });

      handle.addEventListener("pointerdown", function (e) {
        if (e.button != null && e.button !== 0) return; // เมาส์ต้องเป็นปุ่มซ้ายเท่านั้น (ทัสก์ไม่มี button)
        e.preventDefault();
        dragState = { id: id, pointerId: e.pointerId };
        row.classList.add("is-dragging");
        try { handle.setPointerCapture(e.pointerId); } catch (captureErr) { void captureErr; }
      });

      list.appendChild(row);
    });
  }

  function onPointerMove(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    var hoveredEl = document.elementFromPoint(e.clientX, e.clientY);
    var hoveredRow = hoveredEl && hoveredEl.closest ? hoveredEl.closest(".quiz-modal-sequencing-row") : null;
    if (!hoveredRow) return;
    var hoveredId = hoveredRow.getAttribute("data-id");
    if (hoveredId === dragState.id) return;
    var fromIndex = order.indexOf(dragState.id);
    var toIndex = order.indexOf(hoveredId);
    if (fromIndex === -1 || toIndex === -1) return;
    order.splice(fromIndex, 1);
    order.splice(toIndex, 0, dragState.id);
    renderRows();
    var draggedRow = list.querySelector('[data-id="' + dragState.id + '"]');
    if (draggedRow) draggedRow.classList.add("is-dragging");
  }

  function endDrag(e) {
    if (!dragState || (e && e.pointerId !== dragState.pointerId)) return;
    var draggedRow = list.querySelector('[data-id="' + dragState.id + '"]');
    if (draggedRow) draggedRow.classList.remove("is-dragging");
    dragState = null;
  }

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  activeDragCleanup = function () {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", endDrag);
    document.removeEventListener("pointercancel", endDrag);
    activeDragCleanup = null;
  };

  renderRows();
  body.appendChild(list);
  // ===== เพิ่มใหม่: feedback ต้องอยู่เหนือปุ่มส่งคำตอบเสมอ เหมือนที่ปรับใน renderMatchingBody ด้านบน
  body.appendChild(feedback);

  var submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "quiz-modal-continue-btn quiz-modal-submit-btn";
  submitBtn.textContent = "ส่งคำตอบ";
  // ===== เพิ่มใหม่: .onclick (ไม่ใช่ addEventListener) ให้ applyContinueOrRetryToButton แทนที่ handler
  // นี้ได้สะอาดๆ หลังส่งคำตอบจริง — กันปุ่มเดิมค้างเป็น handler ซ้อนอีกชุดหลังเปลี่ยนเป็น "เรียนต่อ"
  submitBtn.onclick = function () {
    if (typeof activeDragCleanup === "function") activeDragCleanup();

    // ===== เพิ่มใหม่: ไฮไลต์ถูก/ผิดเป็นรายข้อทันทีหลังกดส่งคำตอบ (ตามที่ขอ "เรียงลำดับ...อยากให้มัน
    // ขึ้นสีแดงตรงข้อที่ตอบผิด") — เทียบตำแหน่งปัจจุบันของแต่ละข้อกับ correct_order ทีละตำแหน่ง เหมือน
    // checkSequencingLocally() — ทำได้เฉพาะตอนมีเฉลยฝังมาในเครื่อง เช่นเดียวกับ matching ด้านบน
    if (question.answerData && question.answerData.correct_order) {
      var correctOrder = question.answerData.correct_order;
      order.forEach(function (id, index) {
        var rowEl = list.querySelector('[data-id="' + id + '"]');
        if (!rowEl) return;
        var isRowCorrect = id === correctOrder[index];
        rowEl.classList.add(isRowCorrect ? "is-row-correct" : "is-row-incorrect");
        var icon = document.createElement("span");
        icon.className = "quiz-modal-row-icon " + (isRowCorrect ? "is-correct" : "is-incorrect");
        icon.textContent = isRowCorrect ? "✓" : "✕";
        rowEl.appendChild(icon);
      });
    }

    submitStructuredAnswer(question, { order: order.slice() }, [list], submitBtn);
  };
  body.appendChild(submitBtn);
}
  
// ===== เพิ่มใหม่: multi_select (เลือกได้หลายคำตอบ) สำหรับ Pop-up Quiz — ตัวเลือกเป็นปุ่มติ๊กได้หลายข้อ
// แล้วกด "ส่งคำตอบ" (ต่างจาก MC ที่กดตัวเลือกแล้วส่งทันที) ถูกก็ต่อเมื่อติ๊กครบและไม่เกินเฉลยเป๊ะ
// คำตอบที่ส่งคือ { selectedChoiceIndexes: [...] } (index ตามลำดับตัวเลือกที่แสดง) =====
function renderMultiSelectBody(question, body, feedback) {
  var selected = {};
  var wrap = document.createElement("div");
  wrap.className = "quiz-modal-choices";
  var btns = [];

  var countEl = document.createElement("p");
  countEl.className = "quiz-modal-multi-count";

  function pickedIndexes() {
    var out = [];
    question.choices.forEach(function (_c, i) { if (selected[i]) out.push(i); });
    return out;
  }
  function updateCount() { countEl.textContent = "เลือกแล้ว " + pickedIndexes().length + " ข้อ"; }

  question.choices.forEach(function (choiceText, idx) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-modal-choice-btn quiz-modal-multi-btn";
    btn.setAttribute("role", "checkbox");
    btn.setAttribute("aria-checked", "false");

    var box = document.createElement("span");
    box.className = "quiz-modal-multi-box";
    btn.appendChild(box);

    var label = document.createElement("span");
    label.className = "quiz-modal-multi-label";
    label.textContent = choiceText;
    btn.appendChild(label);

    btn.addEventListener("click", function () {
      if (selected[idx]) { delete selected[idx]; } else { selected[idx] = true; }
      var on = Boolean(selected[idx]);
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
      box.textContent = on ? "✓" : "";
      feedback.innerHTML = "";
      updateCount();
    });
    btns.push(btn);
    wrap.appendChild(btn);
  });

  updateCount();
  body.appendChild(wrap);
  body.appendChild(countEl);
  body.appendChild(feedback);

  var submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "quiz-modal-continue-btn quiz-modal-submit-btn";
  submitBtn.textContent = "ส่งคำตอบ";
  submitBtn.onclick = function () {
    var picked = pickedIndexes();
    if (picked.length === 0) {
      feedback.innerHTML = '<p class="quiz-modal-incomplete-warning">กรุณาเลือกอย่างน้อย 1 ข้อ</p>';
      return;
    }
    feedback.innerHTML = "";
    // ไฮไลต์รายตัวเลือกได้เฉพาะตอนมีเฉลยฝังมาในเครื่อง (ควิซ static) — ข้อสุ่มจากคลังโชว์แค่ถูก/ผิดรวม
    if (Array.isArray(question.correctIndexes)) {
      btns.forEach(function (b, i) {
        b.classList.remove("is-selected");
        if (question.correctIndexes.indexOf(i) !== -1) { b.classList.add("correct"); }
        else if (selected[i]) { b.classList.add("incorrect"); }
      });
    }
    submitStructuredAnswer(question, { selectedChoiceIndexes: picked }, [wrap], submitBtn);
  };
  body.appendChild(submitBtn);
}

// ===== เพิ่มใหม่: drag_drop (เติมคำลงช่องว่าง) สำหรับ Pop-up Quiz — vanilla JS + Pointer Events
// (ไม่มี @dnd-kit ในแพ็กเกจ SCORM) ใช้ได้ 3 วิธี: ลากคำไปวางช่อง / แตะคำ (ลงช่องที่เลือกไว้หรือช่องว่างแรก)
// / คีย์บอร์ด (Tab + Enter) — ตรรกะ move/tap เหมือน lib/quiz/drag-drop-state.ts ฝั่งเว็บ (ถ้าแก้ต้องแก้คู่กัน)
// โจทย์: question.dragDrop = { template: "... {{b1}} ...", blankIds: [...], words: [{id, text}] } (ไม่มีเฉลย)
// คำตอบที่ส่งคือ { placements: { blankId: wordId } } =====
function ddSplitTemplate(template, blankIds) {
  var segs = [];
  var pos = 0;
  while (pos < template.length) {
    var open = template.indexOf("{{", pos);
    if (open === -1) { segs.push({ type: "text", text: template.slice(pos) }); break; }
    var close = template.indexOf("}}", open + 2);
    if (close === -1) { segs.push({ type: "text", text: template.slice(pos) }); break; }
    var id = template.slice(open + 2, close);
    if (blankIds.indexOf(id) === -1) {
      segs.push({ type: "text", text: template.slice(pos, close + 2) });
      pos = close + 2;
      continue;
    }
    if (open > pos) { segs.push({ type: "text", text: template.slice(pos, open) }); }
    segs.push({ type: "blank", id: id });
    pos = close + 2;
  }
  return segs;
}

function ddHoldingBlank(placements, wordId) {
  var keys = Object.keys(placements);
  for (var i = 0; i < keys.length; i++) { if (placements[keys[i]] === wordId) return keys[i]; }
  return null;
}

// วางคำลงช่อง: คำอยู่ช่องอื่น = ย้าย / ช่องปลายทางมีคำอื่น = สลับ (ถ้าคำมาจากช่อง) หรือคืนคำเดิมกลับคลัง (ถ้ามาจากคลัง)
function ddMoveWord(placements, wordId, targetBlankId) {
  var from = ddHoldingBlank(placements, wordId);
  if (from === targetBlankId) return placements;
  var displaced = placements[targetBlankId] !== undefined ? placements[targetBlankId] : null;
  var next = {};
  Object.keys(placements).forEach(function (k) { next[k] = placements[k]; });
  if (from) { delete next[from]; }
  next[targetBlankId] = wordId;
  if (from && displaced) { next[from] = displaced; }
  return next;
}

function renderDragDropBody(question, body, feedback) {
  var dd = question.dragDrop;
  var textById = {};
  dd.words.forEach(function (w) { textById[w.id] = w.text; });
  var placements = {};
  var activeBlank = null;
  var drag = null;
  var suppressClick = false;

  var wrap = document.createElement("div");
  wrap.className = "quiz-modal-dd";
  var sentence = document.createElement("div");
  sentence.className = "quiz-modal-dd-sentence";
  var bank = document.createElement("div");
  bank.className = "quiz-modal-dd-bank";
  bank.setAttribute("data-bank", "1");
  wrap.appendChild(sentence);
  wrap.appendChild(bank);

  var countEl = document.createElement("p");
  countEl.className = "quiz-modal-multi-count";

  function filledCount() {
    return dd.blankIds.filter(function (id) { return placements[id] !== undefined; }).length;
  }

  function firstEmptyBlank() {
    for (var i = 0; i < dd.blankIds.length; i++) { if (placements[dd.blankIds[i]] === undefined) return dd.blankIds[i]; }
    return null;
  }

  function tapWord(wordId) {
    if (ddHoldingBlank(placements, wordId)) return;
    var target = (activeBlank && dd.blankIds.indexOf(activeBlank) !== -1 && placements[activeBlank] === undefined)
      ? activeBlank
      : firstEmptyBlank();
    if (target) { placements = ddMoveWord(placements, wordId, target); }
    activeBlank = null;
  }

  function startDrag(e, el, wordId, fromBlank) {
    if (el.disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag = { wordId: wordId, fromBlank: fromBlank, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, moved: false, ghost: null, el: el, hover: null };
  }

  function targetBlankAt(x, y) {
    var hit = document.elementFromPoint(x, y);
    return hit && hit.closest ? hit.closest("[data-blank]") : null;
  }

  function clearHover() {
    if (drag && drag.hover) { drag.hover.classList.remove("is-over"); drag.hover = null; }
  }

  function removeGhost() {
    if (drag && drag.ghost && drag.ghost.parentNode) { drag.ghost.parentNode.removeChild(drag.ghost); }
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) < 6) return;
      drag.moved = true;
      drag.ghost = document.createElement("div");
      drag.ghost.className = "quiz-modal-dd-ghost";
      drag.ghost.textContent = textById[drag.wordId] || "";
      document.body.appendChild(drag.ghost);
      drag.el.classList.add("is-dragging");
    }
    drag.ghost.style.left = e.clientX + "px";
    drag.ghost.style.top = e.clientY + "px";
    var over = targetBlankAt(e.clientX, e.clientY);
    if (over !== drag.hover) {
      clearHover();
      if (over) { over.classList.add("is-over"); drag.hover = over; }
    }
    e.preventDefault();
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var d = drag;
    if (!d.moved) { drag = null; return; } // แตะเฉยๆ ไม่ได้ลาก — ให้ handler click จัดการ
    var overEl = targetBlankAt(e.clientX, e.clientY);
    clearHover();
    removeGhost();
    drag = null;
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 0);
    if (overEl) {
      placements = ddMoveWord(placements, d.wordId, overEl.getAttribute("data-blank"));
      activeBlank = null;
    } else if (d.fromBlank) {
      delete placements[d.fromBlank]; // ลากออกนอกช่อง = คืนคำกลับคลัง
    }
    render();
  }

  function onCancel(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    clearHover();
    removeGhost();
    drag = null;
    render();
  }

  document.addEventListener("pointermove", onMove, { passive: false });
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onCancel);
  activeDragCleanup = function () {
    if (drag) { removeGhost(); drag = null; }
    document.removeEventListener("pointermove", onMove, { passive: false });
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onCancel);
    activeDragCleanup = null;
  };

  function makeChip(wordId, fromBlank) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "quiz-modal-dd-chip";
    chip.textContent = textById[wordId] || "";
    chip.addEventListener("pointerdown", function (e) { startDrag(e, chip, wordId, fromBlank); });
    return chip;
  }

  function render() {
    sentence.innerHTML = "";
    bank.innerHTML = "";

    ddSplitTemplate(dd.template, dd.blankIds).forEach(function (seg) {
      if (seg.type === "text") {
        sentence.appendChild(document.createTextNode(seg.text));
        return;
      }
      var blankId = seg.id;
      var blankNumber = dd.blankIds.indexOf(blankId) + 1;
      var slot = document.createElement("span");
      slot.className = "quiz-modal-dd-blank";
      slot.setAttribute("data-blank", blankId);
      var wordId = placements[blankId];
      if (wordId !== undefined) {
        slot.classList.add("is-filled");
        var chip = makeChip(wordId, blankId);
        chip.classList.add("is-placed");
        chip.setAttribute("aria-label", "ช่องที่ " + blankNumber + ": " + (textById[wordId] || "") + " (กดเพื่อเอาออก)");
        chip.addEventListener("click", function () {
          if (suppressClick || chip.disabled) return;
          delete placements[blankId];
          activeBlank = blankId;
          render();
        });
        slot.appendChild(chip);
      } else {
        var emptyBtn = document.createElement("button");
        emptyBtn.type = "button";
        emptyBtn.className = "quiz-modal-dd-empty";
        emptyBtn.textContent = String(blankNumber);
        emptyBtn.setAttribute("aria-label", "ช่องว่างที่ " + blankNumber + " ยังว่าง");
        if (activeBlank === blankId) { slot.classList.add("is-active"); }
        emptyBtn.addEventListener("click", function () {
          if (suppressClick || emptyBtn.disabled) return;
          activeBlank = activeBlank === blankId ? null : blankId;
          render();
        });
        slot.appendChild(emptyBtn);
      }
      sentence.appendChild(slot);
    });

    var unused = dd.words.filter(function (w) { return !ddHoldingBlank(placements, w.id); });
    if (unused.length === 0) {
      var empty = document.createElement("span");
      empty.className = "quiz-modal-dd-bank-empty";
      empty.textContent = "เติมครบทุกช่องแล้ว — กดคำในช่องเพื่อเอาออก";
      bank.appendChild(empty);
    }
    unused.forEach(function (w) {
      var chip = makeChip(w.id, null);
      chip.addEventListener("click", function () {
        if (suppressClick || chip.disabled) return;
        tapWord(w.id);
        feedback.innerHTML = "";
        render();
      });
      bank.appendChild(chip);
    });

    countEl.textContent = "เติมแล้ว " + filledCount() + "/" + dd.blankIds.length + " ช่อง";
  }

  render();
  body.appendChild(wrap);
  body.appendChild(countEl);
  body.appendChild(feedback);

  var submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "quiz-modal-continue-btn quiz-modal-submit-btn";
  submitBtn.textContent = "ส่งคำตอบ";
  submitBtn.onclick = function () {
    var missing = dd.blankIds.length - filledCount();
    if (missing > 0) {
      feedback.innerHTML = '<p class="quiz-modal-incomplete-warning">เหลืออีก ' + missing + ' ช่อง</p>';
      return;
    }
    feedback.innerHTML = "";
    var answer = {};
    dd.blankIds.forEach(function (id) { answer[id] = placements[id]; });

    // ไฮไลต์ถูก/ผิดรายช่อง ทำได้เฉพาะตอนมีเฉลยฝังมาในเครื่อง (ควิซ static)
    if (question.answerData && question.answerData.correct_map) {
      Array.prototype.forEach.call(sentence.querySelectorAll("[data-blank]"), function (slot) {
        var id = slot.getAttribute("data-blank");
        slot.classList.add(answer[id] === question.answerData.correct_map[id] ? "is-row-correct" : "is-row-incorrect");
      });
    }
    submitStructuredAnswer(question, { placements: answer }, [wrap], submitBtn);
  };
  body.appendChild(submitBtn);
}

// [ให้พกพา] เฉลยของ static quiz ถูกฝังมาใน question.correctIndex ตั้งแต่ตอน generate แล้ว (ดู
// buildLessonPlayerJs) เลยตรวจในเครื่องได้ทันทีไม่ต้องรอ API — คืน null ถ้าไม่มีเฉลยฝังมา (เช่น
// random_bank ที่ยังต้องพึ่ง server สุ่ม+ตรวจอยู่ ณ ตอนนี้)
function computeLocalResult(question, choiceIndex) {
  if (typeof question.correctIndex !== "number" || question.correctIndex < 0) return null;
  return {
    isCorrect: choiceIndex === question.correctIndex,
    explanation: question.explanation || null,
  };
}

// ===== เพิ่มใหม่: ตรวจ matching/sequencing ในเครื่อง (offline) สำหรับควิซ static ระหว่างวิดีโอ —
// เขียนเลียนแบบ validateMatching()/validateSequencing() ฝั่ง server (src/lib/quiz/validators/) เป๊ะๆ
// แต่เป็น plain vanilla JS เพราะไฟล์นี้เป็น string template ไม่ใช่โมดูล import จริงไม่ได้ ต้อง copy
// ตรรกะมาเขียนซ้ำมือ — ถ้าแก้ตรงนี้ ต้องไปแก้ validateMatching/validateSequencing ให้ตรงกันด้วย
function checkMatchingLocally(answerData, studentAnswer) {
  if (!answerData || !answerData.pairs || answerData.pairs.length === 0) return false;
  if (!studentAnswer || !studentAnswer.pairs || !Array.isArray(studentAnswer.pairs)) return false;

  var correctPairs = answerData.pairs;
  var studentPairs = studentAnswer.pairs;
  if (studentPairs.length !== correctPairs.length) return false;

  var correctMap = {};
  correctPairs.forEach(function (p) { correctMap[p.left] = p.right; });

  var isCorrect = studentPairs.every(function (p) { return correctMap[p.left] === p.right; });

  var studentLeftSet = {};
  studentPairs.forEach(function (p) { studentLeftSet[p.left] = true; });
  var hasMissingLeft = correctPairs.some(function (p) { return !studentLeftSet[p.left]; });

  return isCorrect && !hasMissingLeft;
}

// multi_select: ถูกก็ต่อเมื่อชุด index ที่ติ๊ก "เท่ากับ" ชุดเฉลยเป๊ะ (เหมือน validateMultiSelect ฝั่ง server)
function checkMultiSelectLocally(correctIndexes, studentAnswer) {
  if (!Array.isArray(correctIndexes) || correctIndexes.length === 0) return false;
  var picked = studentAnswer && studentAnswer.selectedChoiceIndexes;
  if (!Array.isArray(picked) || picked.length !== correctIndexes.length) return false;
  var set = {};
  picked.forEach(function (i) { set[i] = true; });
  if (Object.keys(set).length !== picked.length) return false;
  return correctIndexes.every(function (i) { return set[i] === true; });
}

// drag_drop: ทุกช่องต้องมีคำ ห้ามใช้คำซ้ำ และต้องตรง correct_map ทุกช่อง (เหมือน validateDragDrop ฝั่ง server)
function checkDragDropLocally(answerData, studentAnswer) {
  if (!answerData || !answerData.blanks || !answerData.correct_map) return false;
  var placements = studentAnswer && studentAnswer.placements;
  if (!placements || typeof placements !== "object") return false;
  var used = {};
  for (var i = 0; i < answerData.blanks.length; i++) {
    var blankId = answerData.blanks[i].id;
    var wordId = placements[blankId];
    if (typeof wordId !== "string" || used[wordId]) return false;
    used[wordId] = true;
    if (wordId !== answerData.correct_map[blankId]) return false;
  }
  return true;
}

function checkSequencingLocally(answerData, studentAnswer) {
  if (!answerData || !answerData.correct_order || answerData.correct_order.length === 0) return false;
  if (!studentAnswer || !studentAnswer.order || !Array.isArray(studentAnswer.order)) return false;

  var correctOrder = answerData.correct_order;
  var studentOrder = studentAnswer.order;
  if (studentOrder.length !== correctOrder.length) return false;

  var correctIdSet = {};
  correctOrder.forEach(function (id) { correctIdSet[id] = true; });
  var hasInvalidId = studentOrder.some(function (id) { return !correctIdSet[id]; });
  if (hasInvalidId) return false;

  return studentOrder.every(function (id, index) { return id === correctOrder[index]; });
}

// [ให้พกพา] เหมือน computeLocalResult() ข้างบนแต่สำหรับ matching/sequencing — ใช้ question.answerData
// (เฉลยจริง ฝังมาจาก buildLessonPlayerJs ตอน generate เฉพาะควิซ static เท่านั้น) คืน null ถ้าไม่มี
// เฉลยฝังมา (เช่น random_bank ที่ยังต้องพึ่ง server ตรวจอยู่ ณ ตอนนี้)
function computeLocalStructuredResult(question, studentAnswer) {
  var isCorrect;
  if (question.interactionType === "multi_select") {
    if (!Array.isArray(question.correctIndexes)) return null;
    isCorrect = checkMultiSelectLocally(question.correctIndexes, studentAnswer);
  } else {
    if (!question.answerData) return null;
    isCorrect =
      question.interactionType === "matching"
        ? checkMatchingLocally(question.answerData, studentAnswer)
        : question.interactionType === "drag_drop"
        ? checkDragDropLocally(question.answerData, studentAnswer)
        : checkSequencingLocally(question.answerData, studentAnswer);
  }
  return {
    isCorrect: isCorrect,
    explanation: question.explanation || null,
  };
}

// [งานข้อ 11 + ให้พกพา] บันทึกผลตอบลง CMI (interactions/objective/suspend_data) — แยกออกมาจาก
// การ "แสดงผล" เพื่อให้ทั้งเส้นทางตรวจในเครื่อง (static) และเส้นทางเดิมที่รอ server (random_bank)
// เรียกใช้ร่วมกันได้ ไม่ต้องเขียนซ้ำสองที่
// ===== เพิ่มใหม่: interactionKind (พารามิเตอร์ที่ 4) ให้ระบุ cmi.interactions.n.type ตาม
// interaction_type จริงได้ (เดิม hardcode "choice" เสมอ) — ไม่ส่งมา (undefined) จะ fallback เป็น
// "choice" เหมือนเดิมทุกอย่าง ไม่กระทบทางเดิม (multiple_choice/true_false/static quiz)
// SCORM 1.2 cmi.interactions.n.type รับแค่ค่ามาตรฐาน (choice, fill-in, matching, sequencing ฯลฯ) และ
// student_response ยาวได้ไม่เกิน 255 ตัวอักษร — multi_select ถือเป็น "choice" (หลายคำตอบ), drag_drop เป็น "fill-in"
function scormInteractionKind(question) {
  if (question.interactionType === "multi_select") return "choice";
  if (question.interactionType === "drag_drop") return "fill-in";
  return question.interactionType;
}

function scormStudentResponse(question, studentAnswer) {
  var text;
  if (question.interactionType === "multi_select") {
    text = (studentAnswer.selectedChoiceIndexes || []).join(",");
  } else if (question.interactionType === "drag_drop" && question.dragDrop) {
    text = question.dragDrop.blankIds.map(function (id) { return (studentAnswer.placements || {})[id] || ""; }).join(",");
  } else {
    return JSON.stringify(studentAnswer);
  }
  return text.length > 250 ? text.slice(0, 250) : text;
}

// multi_select ส่งเป็น selectedChoiceIndexes ระดับบนสุด (ตรงกับ API) ส่วนชนิดอื่นส่งเป็น studentAnswer
function buildStructuredAttemptBody(question, studentAnswer) {
  if (question.interactionType === "multi_select") {
    return { questionId: question.id, selectedChoiceIndexes: studentAnswer.selectedChoiceIndexes };
  }
  return { questionId: question.id, studentAnswer: studentAnswer };
}

function recordAnswerLocally(question, responseValue, isCorrect, interactionKind) {
  // [งานข้อ 11] นับ/เขียน CMI เฉพาะครั้งแรกที่ตอบข้อนี้จริงๆ — กันนับซ้ำถ้าเผลอกดตอบซ้ำ
  var isNewAnswer = !answeredQuestionIds[question.id];

  answeredQuestionIds[question.id] = true;
  updateMarkerAnswered(question.id);

  if (isNewAnswer) {
    quizSummary.total++;
    if (isCorrect) quizSummary.correct++;

    // cmi.interactions.n.* — บันทึกคู่ขนานทีละข้อ (interaction แยกจาก objective รวม)
    ScormAPI.setValue("cmi.interactions." + interactionIndex + ".id", String(question.id));
    ScormAPI.setValue("cmi.interactions." + interactionIndex + ".type", interactionKind || "choice");
    ScormAPI.setValue("cmi.interactions." + interactionIndex + ".student_response", String(responseValue));
    ScormAPI.setValue("cmi.interactions." + interactionIndex + ".result", isCorrect ? "correct" : "wrong");
    interactionIndex++;

    reportQuizSummaryToCmi();
    // [งานข้อ 21] บันทึกชุดข้อที่ตอบแล้วลง cmi.suspend_data คู่ขนานไปกับ REST — commit
    // รวมไปกับ setValue อื่นๆ ข้างบนในจังหวะเดียวกันเลย ไม่ยิง commit แยกเพิ่ม
    saveAnsweredToSuspendData();
    ScormAPI.commit();
  }

  return isNewAnswer;
}

// เดิมโค้ดปุ่ม "เรียนต่อ"/"ลองใหม่" อยู่ท้าย renderAnswerFeedback ตรงๆ — แยกออกมาเพื่อให้
// renderStructuredFeedback (matching/sequencing เพิ่มใหม่ด้านล่าง) เรียกใช้ซ้ำได้ ไม่ต้องเขียนซ้ำ
function appendContinueOrRetryButton(feedback, question, result) {
  var canContinue = !REQUIRE_CORRECT_ANSWER || result.isCorrect;

  if (canContinue) {
    var continueBtn = document.createElement("button");
    continueBtn.type = "button";
    continueBtn.className = "quiz-modal-continue-btn";
    continueBtn.textContent = "เรียนต่อ";
    continueBtn.addEventListener("click", closeQuizModal);
    feedback.appendChild(continueBtn);
  } else {
    var retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "quiz-modal-continue-btn";
    retryBtn.textContent = "ลองใหม่";
    retryBtn.addEventListener("click", function () {
      answeredQuestionIds[question.id] = false;
      openQuizModal(question);
    });
    feedback.appendChild(retryBtn);
  }
}

// แสดงผลถูก/ผิด + ปุ่มเรียนต่อ/ลองใหม่ — ใช้ร่วมกันทั้งเส้นทางตรวจในเครื่องและเส้นทางรอ server
function renderAnswerFeedback(question, choiceIndex, choicesWrap, result) {
  var feedback = document.getElementById("quiz-modal-feedback");

  var chosenBtn = choicesWrap.children[choiceIndex];
  chosenBtn.classList.add(result.isCorrect ? "correct" : "incorrect");

  feedback.innerHTML = "";

  var resultText = document.createElement("p");
  resultText.className = "quiz-modal-result-text " + (result.isCorrect ? "is-correct" : "is-incorrect");
  resultText.textContent = result.isCorrect ? "ตอบถูกต้อง!" : "ตอบไม่ถูกต้อง";
  feedback.appendChild(resultText);

  if (result.explanation) {
    var explanation = document.createElement("p");
    explanation.className = "quiz-modal-explanation";
    explanation.textContent = result.explanation;
    feedback.appendChild(explanation);
  }

  appendContinueOrRetryButton(feedback, question, result);
}

// ===== เพิ่มใหม่: matching/sequencing มีปุ่ม "ส่งคำตอบ" ของตัวเองอยู่แล้วก่อนหน้านี้ (ไม่เหมือน MC/
// True-False ที่ "คลิกตัวเลือก" = ส่งคำตอบทันที ไม่มีปุ่มแยก) — เดิมพอส่งคำตอบแล้ว ปุ่มนั้นจะถูก
// disabled ค้างเป็นสีเทาอยู่ใต้ฟีดแบ็ก แล้วมีการสร้างปุ่ม "เรียนต่อ"/"ลองใหม่" ใหม่อีกตัวซ้อนขึ้นมา
// (เห็นเป็น 2 ปุ่มคนละขนาดคนละตำแหน่ง) ตอนนี้เปลี่ยนมา "เปลี่ยนปุ่มเดิมในที่เดิม" ให้กลายเป็น
// "เรียนต่อ"/"ลองใหม่" แทน (ขนาด/ตำแหน่งเดิมเป๊ะ เพราะยังเป็นปุ่มตัวเดียวกัน) ไม่มีปุ่มเทาค้างให้เห็นอีก
// — ใช้ได้เพราะปุ่มส่งคำตอบของ matching/sequencing ผูก handler ด้วย .onclick (ไม่ใช่ addEventListener)
// ไว้ตั้งแต่สร้าง ทำให้แทนที่ตรงนี้ได้สะอาดๆ ไม่มี handler เดิมค้างซ้อนอยู่
function applyContinueOrRetryToButton(btn, question, result) {
  var canContinue = !REQUIRE_CORRECT_ANSWER || result.isCorrect;
  btn.disabled = false;
  if (canContinue) {
    btn.textContent = "เรียนต่อ";
    btn.onclick = closeQuizModal;
  } else {
    btn.textContent = "ลองใหม่";
    btn.onclick = function () {
      answeredQuestionIds[question.id] = false;
      openQuizModal(question);
    };
  }
}

// ===== เพิ่มใหม่: matching/sequencing ไม่มี "ปุ่มตัวเลือกที่กด" ให้ไฮไลต์แบบ choicesWrap เดิม —
// แค่ disable ตัวควบคุมคำตอบ (answerEls — select/drag handle) แล้วโชว์ผลเหมือน renderAnswerFeedback
// ส่วนปุ่มส่งคำตอบ (submitBtn) ไม่ปนอยู่ใน answerEls แล้ว เพราะต้อง "เปลี่ยนสถานะ" ต่อ (ดูฟังก์ชัน
// applyContinueOrRetryToButton ด้านบน) ไม่ใช่แค่ disabled ทิ้งไว้เหมือนตัวควบคุมคำตอบตัวอื่น
function renderStructuredFeedback(question, answerEls, submitBtn, result) {
  answerEls.forEach(function (el) {
    if (!el) return;
    Array.prototype.forEach.call(el.querySelectorAll("select, button"), function (control) { control.disabled = true; });
  });

  var feedback = document.getElementById("quiz-modal-feedback");
  feedback.innerHTML = "";

  var resultText = document.createElement("p");
  resultText.className = "quiz-modal-result-text " + (result.isCorrect ? "is-correct" : "is-incorrect");
  resultText.textContent = result.isCorrect ? "ตอบถูกต้อง!" : "ตอบไม่ถูกต้อง";
  feedback.appendChild(resultText);

  if (result.explanation) {
    var explanation = document.createElement("p");
    explanation.className = "quiz-modal-explanation";
    explanation.textContent = result.explanation;
    feedback.appendChild(explanation);
  }

  applyContinueOrRetryToButton(submitBtn, question, result);
}

// ===== เพิ่มใหม่: ส่งคำตอบ matching/sequencing ไปตรวจ — แต่เดิม (Pop-up Quiz แบบสุ่มจากคลังข้อสอบ
// sourceType "random_bank") ไม่มีเฉลยฝังในเครื่อง ต้องรอ server ตรวจเสมอ ตอนนี้ควิซ static ระหว่าง
// วิดีโอ (quiz_questions) ฝัง answerData เฉลยจริงมาด้วยแล้ว (ดู buildLessonPlayerJs) เลยตรวจในเครื่อง
// ได้ทันทีเหมือน submitAnswer/computeLocalResult — ส่วน POST ไป server ยังยิงอยู่เหมือนเดิมแต่
// เปลี่ยนเป็น fire-and-forget (เก็บสถิติเฉยๆ ไม่รอผล ไม่ retry) พังก็ไม่กระทบผู้เรียน
function submitStructuredAnswer(question, studentAnswer, answerEls, submitBtn, attempt) {
  attempt = attempt || 0;
  answerEls.forEach(function (el) {
    if (!el) return;
    Array.prototype.forEach.call(el.querySelectorAll("select, button"), function (control) { control.disabled = true; });
  });
  // ===== เพิ่มใหม่: submitBtn ไม่ปนอยู่ใน answerEls อีกแล้ว (ต้องเปลี่ยนสถานะเป็น "เรียนต่อ"/"ลองใหม่"
  // ต่อ ไม่ใช่ disabled ค้างทิ้งไว้) — disable ไว้ชั่วคราวระหว่างรอผลเฉยๆ กันกดซ้ำ แล้วเปิดกลับคืนให้
  // เสมอตอนได้ผลแล้ว (ในฟังก์ชัน applyContinueOrRetryToButton) ไม่ว่าจะทางตรวจในเครื่องหรือรอ server
  submitBtn.disabled = true;

  var feedback = document.getElementById("quiz-modal-feedback");

  var localStructuredResult = computeLocalStructuredResult(question, studentAnswer);
  if (localStructuredResult) {
    recordAnswerLocally(question, scormStudentResponse(question, studentAnswer), localStructuredResult.isCorrect, scormInteractionKind(question));
    renderStructuredFeedback(question, answerEls, submitBtn, localStructuredResult);

    // เก็บสถิติไว้ให้ครูดูใน dashboard เฉยๆ — ไม่รอผล ไม่ retry ไม่บล็อก UI ถ้าเรียกไม่ได้
    fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/video-quiz-attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildStructuredAttemptBody(question, studentAnswer)),
    }).catch(function (err) {
      console.warn("[stats] บันทึกสถิติไม่สำเร็จ (ไม่กระทบผู้เรียน)", err);
    });
    return;
  }

  // ---- เส้นทางเดิม: ไม่มีเฉลยฝังในเครื่อง (ตอนนี้คือ random_bank) ต้องพึ่ง server ตรวจเหมือนเดิม ----
  if (attempt > 0) {
    feedback.innerHTML = '<p class="quiz-modal-hint">สัญญาณอินเทอร์เน็ตช้าไปนิด กำลังลองส่งคำตอบให้อีกครั้ง...</p>';
  }

  fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/video-quiz-attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildStructuredAttemptBody(question, studentAnswer)),
  })
    .then(function (result) {
      recordAnswerLocally(question, scormStudentResponse(question, studentAnswer), result.isCorrect, scormInteractionKind(question));
      renderStructuredFeedback(question, answerEls, submitBtn, result);
    })
    .catch(function (err) {
      console.error("Failed to submit structured answer (attempt " + (attempt + 1) + ")", err);
      if (attempt < 1) {
        setTimeout(function () {
          submitStructuredAnswer(question, studentAnswer, answerEls, submitBtn, attempt + 1);
        }, 1200);
        return;
      }
      feedback.innerHTML =
        '<p class="quiz-modal-error">เชื่อมต่อไม่สำเร็จ อินเทอร์เน็ตหรือระบบอาจไม่เสถียรชั่วคราว ลองส่งคำตอบอีกครั้ง หรือตรวจสอบสัญญาณอินเทอร์เน็ตของคุณ</p>';
      answerEls.forEach(function (el) {
        if (!el) return;
        Array.prototype.forEach.call(el.querySelectorAll("select, button"), function (control) { control.disabled = false; });
      });
      submitBtn.disabled = false;
    });
}

// [แก้บั๊ก: ส่งคำตอบไม่สำเร็จแล้วค้าง] ถ้า POST ล้มเหลวเพราะเน็ต/เซิร์ฟเวอร์สะดุดชั่วครู่ (เช่น Supabase
// free-tier หน่วงเป็นพักๆ) เดิมจะโชว์ error ทันทีรอบเดียว ผู้เรียนต้องกดตอบเองซ้ำทุกครั้ง — ถ้าจังหวะนั้น
// เน็ตแกว่งพอดีอาจต้องกดวนหลายรอบ กว่าจะหลุด ตอนนี้เพิ่ม retry อัตโนมัติให้ 1 ครั้งก่อน (หน่วง 1.2 วิ
// สั้นพอไม่ทำให้รอนาน และไม่ยิง request รัวจนหนักเซิร์ฟเวอร์) ถ้ายังไม่สำเร็จอีกถึงค่อยโชว์ error ให้กดเอง
// [ให้พกพา] ถ้าคำถามนี้ฝัง correctIndex มาด้วย (static quiz) ตัดจบด้วยการตรวจในเครื่องทันที ไม่ต้องรอ
// API เลย ส่วน POST ไป server ยังยิงอยู่เหมือนเดิมแต่เปลี่ยนเป็น "เก็บสถิติเฉยๆ แบบไม่รอผล" (fire-and-
// forget) — พังก็ไม่กระทบผู้เรียน ต่างจากเดิมที่ทุกคำตอบต้องรอ server ตัดสินก่อนเห็นผล
function submitAnswer(question, choiceIndex, choicesWrap, attempt) {
  attempt = attempt || 0;
  Array.prototype.forEach.call(choicesWrap.children, function (btn) { btn.disabled = true; });
  var feedback = document.getElementById("quiz-modal-feedback");

  var localResult = computeLocalResult(question, choiceIndex);
  if (localResult) {
    recordAnswerLocally(question, choiceIndex, localResult.isCorrect);
    renderAnswerFeedback(question, choiceIndex, choicesWrap, localResult);

    // เก็บสถิติไว้ให้ครูดูใน dashboard เฉยๆ — ไม่รอผล ไม่ retry ไม่บล็อก UI ถ้าเรียกไม่ได้
    // (เช่นเปิดแพ็กเกจนี้บน LMS อื่นที่เรียก API เว็บเราไม่ได้) ผู้เรียนก็ยังตอบคำถามได้ตามปกติ
    fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/video-quiz-attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, selectedChoiceIndex: choiceIndex }),
    }).catch(function (err) {
      console.warn("[stats] บันทึกสถิติไม่สำเร็จ (ไม่กระทบผู้เรียน)", err);
    });
    return;
  }

  // ---- เส้นทางเดิม: ไม่มีเฉลยฝังในเครื่อง (ตอนนี้คือ random_bank) ต้องพึ่ง server ตรวจเหมือนเดิม ----
  if (attempt > 0) {
    feedback.innerHTML = "<p class=\\"quiz-modal-hint\\">สัญญาณอินเทอร์เน็ตช้าไปนิด กำลังลองส่งคำตอบให้อีกครั้ง...</p>";
  }

  fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/video-quiz-attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId: question.id, selectedChoiceIndex: choiceIndex }),
  })
    .then(function (result) {
      recordAnswerLocally(question, choiceIndex, result.isCorrect);
      renderAnswerFeedback(question, choiceIndex, choicesWrap, result);
    })
    .catch(function (err) {
      console.error("Failed to submit answer (attempt " + (attempt + 1) + ")", err);
      // ลองส่งซ้ำอัตโนมัติแค่ 1 ครั้ง หน่วง 1.2 วิ (สั้นพอ ไม่ทำให้รอนาน และไม่ยิงรัวจนหนักเซิร์ฟเวอร์)
      // ก่อนจะยอมโชว์ error ให้ผู้เรียนกดเอง — เผื่อเป็นแค่เน็ตสะดุด/เซิร์ฟเวอร์หน่วงชั่วครู่เดียว
      if (attempt < 1) {
        setTimeout(function () {
          submitAnswer(question, choiceIndex, choicesWrap, attempt + 1);
        }, 1200);
        return;
      }
      feedback.innerHTML =
        "<p class=\\"quiz-modal-error\\">เชื่อมต่อไม่สำเร็จ อินเทอร์เน็ตหรือระบบอาจไม่เสถียรชั่วคราว ลองกดคำตอบอีกครั้ง หรือตรวจสอบสัญญาณอินเทอร์เน็ตของคุณ</p>";
      Array.prototype.forEach.call(choicesWrap.children, function (btn) { btn.disabled = false; });
    });
}

// [แก้บั๊ก: กดปิด (×) แล้ว modal เด้งขึ้นวนไม่จบ] เดิมฟังก์ชันนี้สั่ง video.play() เสมอไม่ว่าจะตอบ
// คำถามแล้วหรือยัง — พอกดปิดโดยยังไม่ตอบ วิดีโอจะเล่นต่อทันที แต่ currentTime แทบไม่ขยับเลย ยังคง
// >= timestamp ของคำถามเดิม (findNextUnansweredAt เช็คแบบ "ทุกจุดที่ผ่านมาแล้วแต่ยังไม่ตอบ" ไม่ใช่
// แค่จุดปัจจุบัน) ทำให้ timeupdate ยิงอีกครั้งแล้วเจอคำถามเดิมที่ยังไม่ตอบ พาไป pause + เปิด modal ซ้ำ
// ทันที กลายเป็น loop เปิด-ปิดไม่จบ — ตอนนี้ถ้ายังไม่ตอบ ปิดแล้วจะไม่เล่นวิดีโอต่ออัตโนมัติ (บล็อกไว้
// ไม่ให้เรียนต่อจนกว่าจะตอบ) ผู้เรียนต้องกด "เล่น" เองอีกทีถึงจะเจอคำถามเดิมขึ้นมาให้ตอบใหม่ ส่วนกรณี
// ตอบแล้ว (กดจากปุ่ม "เรียนต่อ") ยังคงเล่นวิดีโอต่อให้อัตโนมัติเหมือนเดิม ไม่กระทบพฤติกรรมเดิม
function closeQuizModal() {
  // ปิด modal ทั้งที่ sequencing drag listener อาจยังค้างอยู่ (เช่นกดปิดกลาง-ลาก) ต้องเคลียร์ทิ้งด้วย
  if (typeof activeDragCleanup === "function") { activeDragCleanup(); }
  var overlay = document.getElementById("quiz-overlay");
  overlay.classList.remove("open");
  var question = pendingQuestion;
  pendingQuestion = null;
  var video = document.getElementById("lesson-video");
  var wasAnswered = !question || answeredQuestionIds[question.id];
  if (video && wasAnswered) video.play();
}

/* ---------------- Progress bar + markers ---------------- */

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
}

function getRequestedChapter() {
  if (!REQUESTED_CHAPTER_ID) return null;
  for (var i = 0; i < LESSON_DATA.chapters.length; i++) {
    if (LESSON_DATA.chapters[i].id === REQUESTED_CHAPTER_ID) return LESSON_DATA.chapters[i];
  }
  return null;
}

function isTimeInRequestedChapter(seconds) {
  var requestedChapter = getRequestedChapter();
  if (!requestedChapter) return true;
  var lastChapter = LESSON_DATA.chapters[LESSON_DATA.chapters.length - 1];
  var isLast = lastChapter && lastChapter.id === requestedChapter.id;
  return seconds >= requestedChapter.startSeconds &&
    (seconds < requestedChapter.endSeconds || (isLast && seconds <= requestedChapter.endSeconds));
}

function getPlaybackBounds(video) {
  var requestedChapter = getRequestedChapter();
  if (!requestedChapter) return { start: 0, end: video.duration || 0 };
  return {
    start: Math.max(0, requestedChapter.startSeconds),
    end: Math.min(video.duration || requestedChapter.endSeconds, requestedChapter.endSeconds),
  };
}

function renderProgressMarkers(video) {
  var container = document.getElementById("progress-markers");
  container.innerHTML = "";
  if (!video.duration || !isFinite(video.duration)) return;

  var bounds = getPlaybackBounds(video);
  var playableDuration = Math.max(0.001, bounds.end - bounds.start);

  LESSON_DATA.quizzes.forEach(function (q) {
    if (!isTimeInRequestedChapter(q.timestampSeconds)) return;
    var pct = Math.min(100, Math.max(0, ((q.timestampSeconds - bounds.start) / playableDuration) * 100));
    var dot = document.createElement("div");
    dot.className = "progress-marker-dot" + (answeredQuestionIds[q.id] ? " answered" : "");
    dot.style.left = pct + "%";
    dot.dataset.questionId = q.id;
    container.appendChild(dot);
  });
}

function updateMarkerAnswered(questionId) {
  var dot = document.querySelector('.progress-marker-dot[data-question-id="' + questionId + '"]');
  if (dot) dot.classList.add("answered");
}

function updateProgressUI(video) {
  var bounds = getPlaybackBounds(video);
  var playableDuration = Math.max(0, bounds.end - bounds.start);
  var elapsed = Math.min(playableDuration, Math.max(0, video.currentTime - bounds.start));
  var pct = playableDuration ? (elapsed / playableDuration) * 100 : 0;
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("time-display").textContent =
    formatTime(elapsed) + " / " + formatTime(playableDuration);
}

/* ---------------- Custom controls wiring ---------------- */

function setupCustomControls(video) {
  var btnPlayPause = document.getElementById("btn-playpause");
  var iconPlay = document.getElementById("icon-play");
  var iconPause = document.getElementById("icon-pause");
  var speedSelect = document.getElementById("speed-select");
  var btnFullscreen = document.getElementById("btn-fullscreen");
  var progressTrack = document.querySelector(".progress-track");
  var videoWrap = document.getElementById("video-wrap");

  function syncPlayIcon() {
    var playing = !video.paused && !video.ended;
    iconPlay.style.display = playing ? "none" : "block";
    iconPause.style.display = playing ? "block" : "none";
  }

  btnPlayPause.addEventListener("click", function () {
    if (video.paused) video.play(); else video.pause();
  });
  video.addEventListener("play", syncPlayIcon);
  video.addEventListener("pause", syncPlayIcon);
  video.addEventListener("click", function () {
    if (video.paused) video.play(); else video.pause();
  });

  speedSelect.addEventListener("change", function () {
    video.playbackRate = parseFloat(speedSelect.value);
  });

  btnFullscreen.addEventListener("click", function () {
    if (videoWrap.requestFullscreen) videoWrap.requestFullscreen();
    else if (videoWrap.webkitRequestFullscreen) videoWrap.webkitRequestFullscreen();
  });

  // Seek โดยคลิก/ลากบน progress track — เคารพ maxAllowedSeekTime เดิม
  function seekFromEvent(e) {
    var rect = progressTrack.getBoundingClientRect();
    var ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    var bounds = getPlaybackBounds(video);
    var target = bounds.start + ratio * Math.max(0, bounds.end - bounds.start);
    var maxAllowed = getMaxAllowedSeekTime();
    video.currentTime = Math.min(target, maxAllowed);
  }
  progressTrack.addEventListener("click", seekFromEvent);

  video.addEventListener("timeupdate", updateProgressUI.bind(null, video));
  video.addEventListener("loadedmetadata", function () {
    updateProgressUI(video);
    renderProgressMarkers(video);
  });
  if (video.readyState >= 1) {
    updateProgressUI(video);
    renderProgressMarkers(video);
  }
}

/* ---------------- Resume confirm popup ---------------- */

function showResumePrompt(video, resumeSeconds) {
  return new Promise(function (resolve) {
    var overlay = document.getElementById("resume-overlay");
    document.getElementById("resume-time-label").textContent = formatTime(resumeSeconds);
    overlay.classList.add("open");

    function cleanup() {
      overlay.classList.remove("open");
      yesBtn.removeEventListener("click", onYes);
      noBtn.removeEventListener("click", onNo);
    }
    var yesBtn = document.getElementById("btn-resume-yes");
    var noBtn = document.getElementById("btn-resume-no");

    function onYes() { cleanup(); resolve(resumeSeconds); }
    function onNo() { cleanup(); resolve(0); }

    yesBtn.addEventListener("click", onYes);
    noBtn.addEventListener("click", onNo);
  });
}

/* ---------------- Still-watching check ---------------- */

// [ยังเรียนอยู่ไหม] ตั้ง timer ใหม่ทุกครั้งที่วิดีโอเริ่มเล่น (ทั้งกดเล่นครั้งแรกและกดเรียนต่อหลัง
// ปิด popup อื่นๆ เช่นควิซ/resume) ครบ 5 นาทีที่เล่นต่อเนื่องไม่มี pause คั่นเลย ถึงจะเด้งถาม
// ถ้าระหว่างทางถูก pause ด้วยเหตุอื่น (ควิซ, จบ chapter, ผู้เรียนกด pause เอง) timer จะถูกเคลียร์
// แล้วเริ่มนับใหม่ตอนกดเล่นต่อ — ไม่มีทางเด้งพร้อมกับ popup อื่นเพราะวิดีโอต้อง "เล่นอยู่" เท่านั้น
// ถึงจะนับเวลาได้
// [แก้: นับเวลาเล่นแบบสะสม] เดิม timer เริ่มนับ 0 ใหม่ทุกครั้งที่ pause (เช่นหยุดตอบควิซ) ทำให้บทที่มีควิซ
// ถี่ๆ ไม่เคยเล่นต่อเนื่องครบ 5 นาที กล่องเลยแทบไม่ขึ้น — ตอนนี้สะสมเฉพาะเวลาที่วิดีโอ "เล่นอยู่จริง"
// (pause ไม่ทำให้เสียเวลาที่สะสมไว้ และเวลาที่หยุดอยู่ไม่ถูกนับ) รีเซ็ตเป็น 0 เฉพาะตอนผู้เรียนกด "เรียนต่อ"
var stillWatchingAccumulatedMs = 0;
var stillWatchingPlayStartedAt = 0;

function startStillWatchingTimer(video) {
  stopStillWatchingTimer();
  stillWatchingPlayStartedAt = Date.now();
  var remaining = Math.max(1000, STILL_WATCHING_INTERVAL_MS - stillWatchingAccumulatedMs);
  stillWatchingTimer = setTimeout(function () {
    video.pause();
    showStillWatchingPrompt(video);
  }, remaining);
}

function stopStillWatchingTimer() {
  if (stillWatchingTimer) {
    clearTimeout(stillWatchingTimer);
    stillWatchingTimer = null;
    if (stillWatchingPlayStartedAt) {
      stillWatchingAccumulatedMs += Date.now() - stillWatchingPlayStartedAt;
    }
  }
  stillWatchingPlayStartedAt = 0;
}

function showStillWatchingPrompt(video) {
  var overlay = document.getElementById("still-watching-overlay");
  overlay.classList.add("open");

  var yesBtn = document.getElementById("btn-still-watching-yes");
  function onYes() {
    overlay.classList.remove("open");
    yesBtn.removeEventListener("click", onYes);
    stillWatchingAccumulatedMs = 0;
    video.play();
  }
  yesBtn.addEventListener("click", onYes);
}

/* ---------------- Video behavior ---------------- */

function attachVideoBehavior(video) {
  var chapterCompleted = false;

  video.addEventListener("timeupdate", function () {
    if (pendingQuestion) return;
    maxWatchedPosition = Math.max(maxWatchedPosition, video.currentTime);
    var next = findNextUnansweredAt(video.currentTime);
    if (next) { video.pause(); openQuizModal(next); return; }

    var requestedChapter = getRequestedChapter();
    if (requestedChapter && !chapterCompleted && video.currentTime >= requestedChapter.endSeconds - 0.1) {
      chapterCompleted = true;
      video.pause();
      video.currentTime = Math.min(video.duration || requestedChapter.endSeconds, requestedChapter.endSeconds);
      lastSavedPosition = video.currentTime;
      savePosition(video.currentTime);
      ScormAPI.setValue("cmi.core.lesson_status", "completed");
      ScormAPI.commit();
      return;
    }
  });

  video.addEventListener("seeking", function () {
    var bounds = getPlaybackBounds(video);
    var maxAllowed = getMaxAllowedSeekTime();
    var cappedMaximum = Math.min(bounds.end, maxAllowed);
    if (video.currentTime < bounds.start) video.currentTime = bounds.start;
    else if (video.currentTime > cappedMaximum) video.currentTime = cappedMaximum;
  });

  video.addEventListener("play", function () {
    startStillWatchingTimer(video);
    if (!savePositionTimer) {
      savePositionTimer = setInterval(function () {
        if (Math.abs(video.currentTime - lastSavedPosition) >= 1) {
          lastSavedPosition = video.currentTime;
          savePosition(video.currentTime);
          // [งานข้อ 20] เดิม savePosition ยิง fetch ของตัวเองแยกจาก CMI เลยไม่ต้อง commit ตรงนี้
          // ตอนนี้ savePosition แค่ setValue เข้า CMI เฉยๆ ต้อง commit เองถึงจะขึ้นเซิร์ฟเวอร์จริง
          // (เผื่อ browser/แท็บถูกปิดกะทันหันโดยไม่ทัน beforeunload)
          ScormAPI.commit();
        }
      }, 10000);
    }
  });

  // [งานข้อ 19] เดิม savePositionTimer ที่ตั้งด้วย setInterval ตอน "play" ไม่เคยถูก clearInterval
  // เลยสักที่ในไฟล์นี้ — ต่อให้วิดีโอ pause/เล่นจบ/ผู้เรียนออกจากหน้าไปแล้ว interval ก็ยังนับต่อ
  // ยิง savePosition() ทุก 10 วิไปเรื่อยๆ (เสียทรัพยากรเปล่าๆ) และที่ร้ายกว่านั้นคือถ้าผู้เรียนกด
  // เล่นซ้ำ (play ครั้งที่ 2 ขึ้นไป) เงื่อนไข "if (!savePositionTimer)" จะเช็คไม่ทันเพราะตัวแปรยังไม่ถูก
  // เคลียร์เป็น null เลย ทำให้บางเคสอาจไม่ตั้ง timer ใหม่ให้ถูกต้อง จึงต้อง clearInterval แล้ว set
  // กลับเป็น null ทุกจุดที่วิดีโอหยุดนับความคืบหน้า (pause/ended/beforeunload) ให้ครบ
  function stopSavePositionTimer() {
    if (savePositionTimer) {
      clearInterval(savePositionTimer);
      savePositionTimer = null;
    }
  }

  video.addEventListener("pause", function () {
    stopSavePositionTimer();
    stopStillWatchingTimer();
    lastSavedPosition = video.currentTime;
    savePosition(video.currentTime);
    ScormAPI.commit();
  });

  video.addEventListener("ended", function () {
    stopSavePositionTimer();
    stopStillWatchingTimer();
    // [แก้บั๊ก] เดิมเวลาเล่นสะสมของกล่อง "ยังเรียนอยู่ไหม" ไม่ถูกล้างตอนวิดีโอจบ พอกดเล่นซ้ำ
    // (replay) เวลาสะสมรอบเก่าจะค้างต่อ ทำให้กล่องขึ้นเร็วผิดปกติในรอบใหม่ (ไม่ครบ 5 นาทีจริง)
    stillWatchingAccumulatedMs = 0;
    lastSavedPosition = video.currentTime;
    savePosition(video.currentTime);
    ScormAPI.setValue("cmi.core.lesson_status", "completed");
    ScormAPI.commit();
  });

  window.addEventListener("beforeunload", function () {
    stopSavePositionTimer();
    stopStillWatchingTimer();
    savePosition(video.currentTime);
    // [งานข้อ 22] ต้อง setValue ทั้ง session_time และ exit ก่อน commit/LMSFinish เสมอ — LMSFinish
    // ไม่รับประกันว่าจะ commit ค่าที่ setValue ไว้ก่อนหน้าให้อัตโนมัติตามสเปก จึง commit เองให้ชัดเจน
    ScormAPI.setValue("cmi.core.session_time", formatSessionTime());
    ScormAPI.setValue("cmi.core.exit", determineExitValue());
    ScormAPI.commit();
    ScormAPI.terminate();
  });
}

window.addEventListener("load", function () {
  ScormAPI.initialize();
  // [แก้บั๊กข้อ 12] เดิมโค้ดตรงนี้ setValue("incomplete") แบบไม่มีเงื่อนไขทุกครั้งที่โหลด SCO —
  // ทับสถานะ "completed"/"passed" ที่เพิ่งถูก loadFromJSON คืนกลับมาจากฝั่ง page.tsx ทันที
  // ต้องเช็คก่อนว่ามีสถานะเดิมอยู่แล้วหรือยัง (ไม่ใช่ "not attempted"/ว่างเปล่า) ถ้ามีแล้วห้ามทับ
  var existingStatus = ScormAPI.getValue("cmi.core.lesson_status");
  if (REQUESTED_CHAPTER_ID || !existingStatus || existingStatus === "not attempted") {
    ScormAPI.setValue("cmi.core.lesson_status", "incomplete");
  }
  renderLesson();

  // [งานข้อ 14] ผูกปุ่มปิด modal ควิซตรงนี้ครั้งเดียวตอนโหลดหน้า — ใช้ closeQuizModal ตัวเดียวกับ
  // ปุ่ม "เรียนต่อ" (เคลียร์ pendingQuestion + สั่งวิดีโอเล่นต่อ) กดปิดได้เสมอไม่ว่า modal จะค้าง
  // อยู่ในสถานะไหน (กำลังโหลด/โหลดพลาด/กำลังตอบ/ตอบเสร็จแล้ว)
  var quizModalCloseBtn = document.getElementById("quiz-modal-close-btn");
  if (quizModalCloseBtn) quizModalCloseBtn.addEventListener("click", closeQuizModal);

  var video = document.getElementById("lesson-video");
  video.src = LESSON_DATA.videoUrl;
  setupCustomControls(video);

  // [งานข้อ 20] resumeSeconds อ่านจาก CMI แบบ sync ได้เลยตอนนี้ (ไม่ต้อง fetch แยก) เพราะ
  // cmi.core.lesson_location ถูก loadFromJSON เข้า API ไปแล้วตั้งแต่ก่อน SCO นี้ initialize —
  // เหลือแค่รอ loadInitialAttempts() (ยังต้อง fetch จริงจาก video-quiz-attempts) ก่อนเดินหน้าต่อ
  var resumeSeconds = loadResumePosition();

  // [งานข้อ 21] อ่านชุดข้อที่ตอบแล้วจาก cmi.suspend_data แบบ sync ก่อนเลย (เหมือน loadResumePosition
  // ด้านบน) เพื่อให้ findNextUnansweredAt/getMaxAllowedSeekTime/renderProgressMarkers gate/วาดจุดถูก
  // ตั้งแต่ก่อน loadInitialAttempts() (REST) จะ resolve ด้วยซ้ำ — ทำให้บทเรียนทำงานถูกต้องได้แม้ไม่มี
  // network เลยหรือถูกเปิดใน LMS ภายนอกที่เรียก endpoint ของเราไม่ได้ (ดูคอมเมนต์เต็มที่นิยาม
  // ฟังก์ชันนี้ด้านบน) — loadInitialAttempts() ด้านล่างยังคงเรียกอยู่เหมือนเดิมเพื่อรวมสถิติ
  // correct/total มาเขียน objectives.0 (ต้องอาศัย isCorrect ที่มีแค่ใน DB เท่านั้น) และเผื่อ merge
  // ชุดคำตอบที่ suspend_data อาจไม่มี (เช่นเบราว์เซอร์/LMS เดิมไม่เคยรองรับ suspend_data มาก่อน)
  loadAnsweredFromSuspendData();

  loadInitialAttempts().then(function () {
    // [งานข้อ 15] setupCustomControls ผูก renderProgressMarkers ไว้กับ "loadedmetadata" ซึ่งมัก
    // ยิงเสร็จไปแล้วก่อนที่ loadInitialAttempts() (ต้องรอ fetch จริง) จะ resolve — จุดควิซที่เคย
    // ตอบไปแล้วในรอบก่อนจึงถูกวาดเป็น "ยังไม่ตอบ" (answeredQuestionIds ยังว่างอยู่ตอนวาดรอบแรก)
    // ต้องสั่งวาดจุดซ้ำอีกทีตรงนี้ หลัง answeredQuestionIds มีข้อมูลครบแล้วจริงๆ — renderProgressMarkers
    // เองมี guard "ถ้ายังไม่รู้ duration ก็ข้าม" อยู่แล้ว จะเรียกซ้ำตอนนี้อย่างปลอดภัยไม่ว่า metadata
    // จะโหลดมาก่อนหรือหลัง loadInitialAttempts() ก็ตาม
    renderProgressMarkers(video);

    function proceedAfterMetadata() {
      // [บั๊กที่เจอตอนไล่ตรวจข้อ 20] เดิมเช็คแค่ resumeSeconds (จาก cmi.core.lesson_location)
      // อย่างเดียว ไม่เคยเช็ค cmi.core.entry เลย — ถ้ามีค่า location เก่าค้างอยู่ใน cmi_data
      // (เช่นเคยดูไปถึงวินาทีที่ 18 ในรอบก่อน แต่หลังจากนั้นสถานะถูกล้าง/reset จน entry
      // กลายเป็น "ab-initio" แล้วจริง) popup ก็ยังเด้งถามอยู่ดี ทั้งที่ตามสเปก SCORM ต้อง resume
      // เฉพาะตอน entry === "resume" เท่านั้น — เพิ่มเช็คนี้เป็นเงื่อนไขร่วม
      var entryValue = ScormAPI.getValue("cmi.core.entry");
      var requestedChapter = getRequestedChapter();
      var bounds = getPlaybackBounds(video);
      var canResumeRequestedChapter = !requestedChapter || (resumeSeconds > bounds.start && resumeSeconds < bounds.end - 2);
      if (entryValue === "resume" && resumeSeconds > 5 && resumeSeconds < video.duration - 2 && canResumeRequestedChapter) {
        showResumePrompt(video, resumeSeconds).then(function (seekTo) {
          maxWatchedPosition = seekTo > 0 ? seekTo : bounds.start;
          video.currentTime = maxWatchedPosition;
          attachVideoBehavior(video);
        });
      } else {
        if (requestedChapter) video.currentTime = bounds.start;
        maxWatchedPosition = requestedChapter ? bounds.start : 0;
        attachVideoBehavior(video);
      }
    }

    // readyState >= 1 (HAVE_METADATA) แปลว่า loadedmetadata อาจยิงไปแล้วก่อนที่ loadInitialAttempts()
    // (ซึ่งต้องรอ network) จะ resolve เสร็จ — ถ้าแนบ listener ตอนนี้จะไม่มีวันถูกเรียก
    // เช็ค readyState ก่อนเพื่อกัน race condition นี้
    if (video.readyState >= 1) {
      proceedAfterMetadata();
    } else {
      video.addEventListener("loadedmetadata", proceedAfterMetadata, { once: true });
    }
  });
});
`;
}
const LESSON_HTML = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>Lesson</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="lesson-wrap">
    <header class="lesson-header">
      <h1 id="lesson-title"></h1>
    </header>

    <div class="video-wrap" id="video-wrap">
      <video id="lesson-video" controlsList="nodownload" playsinline></video>

      <!-- Custom controls -->
      <div class="video-controls">
        <button id="btn-playpause" class="ctrl-btn" type="button" aria-label="Play">
          <svg id="icon-play" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <svg id="icon-pause" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>

        <span id="time-display" class="time-display">00:00 / 00:00</span>

        <div class="progress-wrap" id="progress-wrap">
          <div class="progress-track">
            <div id="progress-fill" class="progress-fill"></div>
            <div id="progress-markers" class="progress-markers"></div>
          </div>
        </div>

        <select id="speed-select" class="speed-select">
          <option value="0.75">0.75x</option>
          <option value="1" selected>1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>

        <button id="btn-fullscreen" class="ctrl-btn" type="button" aria-label="Fullscreen">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M3 16v3a2 2 0 002 2h3"/>
          </svg>
        </button>
      </div>
    </div>

    <div id="lesson-content" class="lesson-content"></div>
  </div>

  <!-- Quiz modal -->
  <!-- [งานข้อ 14] เดิม modal นี้ไม่มีปุ่มปิดเลย ถ้าโหลดคำถามสุ่มพลาด (network hiccup) ผู้เรียนจะติด
       อยู่ตรงนี้ถาวร วิดีโอ pause ค้าง ไม่มีทางออกนอกจาก refresh หน้าทั้งหน้า — เพิ่มปุ่ม × ที่กด
       ปิดได้เสมอไม่ว่าจะอยู่สถานะไหน (เรียก closeQuizModal ตัวเดียวกับปุ่ม "เรียนต่อ") -->
  <div id="quiz-overlay" class="quiz-overlay">
    <div class="quiz-modal">
      <button id="quiz-modal-close-btn" type="button" class="quiz-modal-close-btn" aria-label="ปิด">×</button>
      <div id="quiz-modal-body"></div>
    </div>
  </div>

  <!-- Resume confirm modal -->
  <!-- [ปรับดีไซน์] เดิมใช้ปุ่ม/ข้อความชุดเดียวกับ modal คำถาม (quiz-modal-continue-btn,
       quiz-modal-choice-btn) ทำให้ดูเป็นกล่องตัวเลือกคำถามมากกว่า dialog ยืนยันสั้นๆ — แยกสไตล์
       ของตัวเองออกมาให้เรียบ กระชับ ตัดกรอบ/ไอคอนที่ไม่จำเป็นออก เหลือแค่หัวข้อ, เวลาที่ค้างไว้
       เป็นข้อความรอง, ปุ่มหลักตันสีเดียว และปุ่มรอง (เริ่มใหม่) เป็นแค่ข้อความขีดเส้นใต้ -->
  <div id="resume-overlay" class="quiz-overlay">
    <div class="quiz-modal resume-modal">
      <p class="resume-title">เล่นต่อจากที่ค้างไว้ไหม?</p>
      <p class="resume-subtext">ครั้งที่แล้วดูถึงนาทีที่ <span id="resume-time-label"></span></p>
      <div class="resume-actions">
        <button id="btn-resume-yes" type="button" class="resume-primary-btn">เล่นต่อ</button>
        <button id="btn-resume-no" type="button" class="resume-secondary-btn">เริ่มใหม่ตั้งแต่ต้น</button>
      </div>
    </div>
  </div>

  <!-- ยังเรียนอยู่ไหม — เด้งทุก 5 นาทีที่วิดีโอเล่นต่อเนื่อง กันเปิดทิ้งไว้เฉยๆ -->
  <div id="still-watching-overlay" class="quiz-overlay">
    <div class="quiz-modal resume-modal">
      <p class="resume-title">ยังเรียนอยู่ไหม?</p>
      <p class="resume-subtext">กดเรียนต่อเพื่อดูวิดีโอต่อ</p>
      <div class="resume-actions">
        <button id="btn-still-watching-yes" type="button" class="resume-primary-btn">เรียนต่อ</button>
      </div>
    </div>
  </div>

  <script src="scorm-api.js"></script>
  <script src="lesson-player.js"></script>
</body>
</html>`;

// ============================================================
// Shared: SCORM API wrapper (ใช้ร่วมกันทั้งสอง SCO)
// ============================================================

const SCORM_API_JS = `var ScormAPI = (function () {
  var apiHandle = null;
  var findAttemptLimit = 500;

  function scanForAPI(win) {
    var attempts = 0;
    while (win.API == null && win.parent != null && win.parent !== win && attempts < findAttemptLimit) {
      attempts++;
      win = win.parent;
    }
    return win.API || null;
  }

  function findAPI() {
    var theAPI = null;
    if (window.parent != null && window.parent !== window) {
      theAPI = scanForAPI(window.parent);
    }
    if (theAPI == null && window.opener != null) {
      theAPI = scanForAPI(window.opener);
    }
    return theAPI;
  }

  function getAPI() {
    if (apiHandle == null) apiHandle = findAPI();
    return apiHandle;
  }

  function initialize() {
    var api = getAPI();
    if (!api) { console.warn("SCORM API not found."); return false; }
    return api.LMSInitialize("") === "true";
  }

  function setValue(key, value) {
    var api = getAPI();
    if (!api) return false;
    return api.LMSSetValue(key, value) === "true";
  }

  function getValue(key) {
    var api = getAPI();
    if (!api) return "";
    return api.LMSGetValue(key);
  }

  function commit() {
    var api = getAPI();
    if (!api) return false;
    return api.LMSCommit("") === "true";
  }

  function terminate() {
    var api = getAPI();
    if (!api) return false;
    return api.LMSFinish("") === "true";
  }

  return { initialize: initialize, setValue: setValue, getValue: getValue, commit: commit, terminate: terminate };
})();`;

const STYLE_CSS = `
${/* ... CSS เดิมทั้งหมดที่มีอยู่แล้วคงไว้ ... */""}
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap');

* { box-sizing: border-box; }

body {
  font-family: "Noto Sans Thai", "Noto Sans", -apple-system, "Segoe UI", sans-serif;
  background: #F7F8FA;
  margin: 0;
  color: #0F1B3D;
  line-height: 1.6;
}

.lesson-wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 60px; }
.lesson-header { margin-bottom: 20px; }
#lesson-title { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; margin: 0; color: #0F1B3D; }

.video-wrap {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: #000;
  box-shadow: 0 4px 16px rgba(15, 27, 61, 0.08);
}

video { width: 100%; display: block; background: #000; cursor: pointer; }

/* ---------- Custom controls ---------- */
.video-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(10, 14, 30, 0.92);
  padding: 8px 12px;
}

.ctrl-btn {
  background: transparent;
  border: none;
  color: #fff;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 8px;
  transition: background 0.15s ease;
}
.ctrl-btn:hover { background: rgba(255,255,255,0.12); }

.time-display {
  color: #cbd5e1;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.progress-wrap { flex: 1; display: flex; align-items: center; padding: 0 4px; }

.progress-track {
  position: relative;
  width: 100%;
  height: 5px;
  background: rgba(255,255,255,0.18);
  border-radius: 999px;
  cursor: pointer;
}

.progress-fill {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 0%;
  background: #FF5A3C;
  border-radius: 999px;
}

.progress-markers {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  pointer-events: none;
}

.progress-marker-dot {
  position: absolute;
  top: 50%;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #FFD166;
  border: 2px solid rgba(10,14,30,0.92);
  transform: translate(-50%, -50%);
}
.progress-marker-dot.answered { background: #34D399; }

.speed-select {
  background: rgba(255,255,255,0.1);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 11.5px;
  padding: 5px 6px;
  cursor: pointer;
}
.speed-select option { color: #0F1B3D; }

.lesson-content {
  margin: 28px 0;
  font-size: 15px;
  color: #0F1B3D;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(15, 27, 61, 0.06);
}
.lesson-content img { max-width: 100%; border-radius: 8px; }

/* ---------- Quiz / resume modal ---------- */
.quiz-overlay {
  display: none;
  position: fixed; inset: 0;
  background: rgba(10,14,30,0.55);
  /* เนื้อหายาวกว่าจอ → เลื่อนที่ overlay ได้ (กล่องใช้ margin:auto จัดกลางเมื่อสั้น ไม่ล้นบนเมื่อยาว) */
  align-items: flex-start; justify-content: center;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  z-index: 999;
  padding: 20px;
}
.quiz-overlay.open { display: flex; }

.quiz-modal {
  background: #fff;
  border-radius: 18px;
  max-width: 420px;
  width: 100%;
  padding: 26px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.25);
  position: relative;
  margin: auto;
}

/* [งานข้อ 14] ปุ่มปิด — วางมุมขวาบนของ modal เสมอ ไม่ว่า body ข้างในจะเป็นสถานะไหน */
.quiz-modal-close-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #94A3B8;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  border-radius: 8px;
}
.quiz-modal-close-btn:hover { background: #F1F5F9; color: #334155; }

.quiz-modal-image { display: block; width: 100%; max-height: 240px; object-fit: contain; border-radius: 12px; background: #F1F5F9; }
/* ===== เพิ่มใหม่: wrapper ครอบรูป+หมุดตัวเลข / คำบรรยายใต้ภาพ ===== */
.quiz-modal-image-wrap { position: relative; margin: 0 0 6px; }
.quiz-modal-image-pin { position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 999px; background: #FF5A3C; color: #fff; font-size: 11px; font-weight: 800; box-shadow: 0 0 0 2px #fff; transition: transform .15s ease, background .15s ease, box-shadow .15s ease; }
/* ===== เพิ่มใหม่: หมุดบนภาพ "คุยกับ" แถวในรายการ matching — เรืองแสง/ขยายตอน hover/focus แถวที่คู่กัน
(.is-active) เปลี่ยนจากส้มเป็นน้ำเงินตอนแถวนั้นถูกจับคู่แล้ว (.is-matched) และกดได้ถ้ามีแถวที่คู่กันอยู่
(.is-linkable) — ดู renderMatchingBody ===== */
.quiz-modal-image-pin.is-linkable { cursor: pointer; }
.quiz-modal-image-pin.is-active { transform: translate(-50%, -50%) scale(1.35); box-shadow: 0 0 0 3px #fff, 0 0 0 7px rgba(255,90,60,0.35); }
.quiz-modal-image-pin.is-matched { background: #0F1B3D; }
.quiz-modal-image-pin.is-matched.is-active { box-shadow: 0 0 0 3px #fff, 0 0 0 7px rgba(15,27,61,0.35); }
.quiz-modal-image-caption { font-size: 12px; color: rgba(15,27,61,0.5); margin: 0 0 16px; text-align: center; }
.quiz-modal-question { font-weight: 800; font-size: 16.5px; margin: 0 0 4px; color: #0F1B3D; }
/* ===== เพิ่มใหม่: sub-text อธิบายวิธีตอบของ matching/sequencing (เหมือน Final Exam) — เข้มขึ้นจากเดิม
(0.45 opacity, 12.5px) ให้อ่านชัดขึ้น ===== */
.quiz-modal-subtext { font-size: 13px; font-weight: 500; color: rgba(15,27,61,0.6); margin: 0 0 16px; }
.quiz-modal-choices { display: flex; flex-direction: column; gap: 8px; }
.quiz-modal-choice-btn {
  text-align: left;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1.5px solid #E5E7EB;
  background: #fff;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.quiz-modal-choice-btn:hover:not(:disabled) { border-color: #FF5A3C; background: #FFF7F5; }
.quiz-modal-choice-btn.correct { border-color: #34D399; background: #ECFDF5; font-weight: 600; }
.quiz-modal-choice-btn.incorrect { border-color: #F87171; background: #FEF2F2; font-weight: 600; }
.quiz-modal-choice-btn:disabled { cursor: default; opacity: 0.85; }

/* ===== เพิ่มใหม่: matching (จับคู่) — วงกลมเลข + การ์ดฝั่งซ้าย + เส้นประเชื่อม + dropdown ที่เป็นสี
accent (navy) เมื่อ "เลือกแล้ว" (ยังไม่ส่งคำตอบ) — เขียว/แดงเก็บไว้ใช้เฉพาะหลังส่งคำตอบเท่านั้น ===== */
.quiz-modal-matching { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
.quiz-modal-matching-row { display: flex; align-items: center; gap: 8px; }
/* ===== เพิ่มใหม่: วงกลมเลขสีส้ม สไตล์เดียวกับหมุดบนภาพ แทนกล่องขาวที่มีแต่เลข/ข้อความเฉยๆ — ตาจะได้
ลิงก์เลขบนแถวกับเลขหมุดบนภาพเข้าด้วยกันเอง เปลี่ยนเป็นน้ำเงินตอนแถวนั้นถูกจับคู่แล้ว ===== */
.quiz-modal-matching-badge {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: #FF5A3C;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .15s ease, box-shadow .15s ease;
}
.quiz-modal-matching-badge.is-matched { background: #0F1B3D; }
.quiz-modal-matching-left {
  flex: 1 1 40%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1.5px solid #E5E7EB;
  background: #F7F8FA;
  font-size: 13.5px;
  font-weight: 600;
  color: #0F1B3D;
  transition: border-color .15s ease;
}
/* ===== เพิ่มใหม่: เส้นประไม่มีความหมายตอนยังว่าง — กลายเป็นเส้นทึบมีจุดปลายสีเดียวกันตอนจับคู่แล้ว
เหมือนได้ "ต่อสาย" จริงๆ ===== */
.quiz-modal-matching-connector { position: relative; flex: 0 0 18px; height: 0; border-top: 2px dashed #CBD5E1; transition: border-color .15s ease; }
.quiz-modal-matching-connector::after { content: ""; position: absolute; right: -3px; top: -4px; width: 7px; height: 7px; border-radius: 999px; background: #CBD5E1; transition: background .15s ease; }
.quiz-modal-matching-connector.is-filled { border-top-style: solid; border-color: #0F1B3D; }
.quiz-modal-matching-connector.is-filled::after { background: #0F1B3D; }
.quiz-modal-matching-select {
  flex: 1 1 45%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1.5px solid #E5E7EB;
  background: #fff;
  font-family: inherit;
  font-size: 13.5px;
  color: #0F1B3D;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
/* ===== เพิ่มใหม่: "เลือกแล้ว" (ยังไม่ส่งคำตอบ) ใช้สี accent (navy) แทนเขียว กันเข้าใจผิดว่า "ถูกแล้ว"
ก่อนตรวจ ===== */
.quiz-modal-matching-select.is-filled { border-color: #0F1B3D; background: rgba(15,27,61,0.06); color: #0F1B3D; font-weight: 600; }
.quiz-modal-matching-select:disabled { cursor: default; opacity: 0.85; }
/* ===== เพิ่มใหม่: ขอบโฟกัสบางๆ สี accent แทนขอบดำหนาของ browser default ===== */
.quiz-modal-matching-select:focus { outline: none; box-shadow: 0 0 0 3px rgba(15,27,61,0.18); border-color: #0F1B3D; }
/* ===== เพิ่มใหม่: แถวที่ hover/focus อยู่ — ไฮไลต์เบาๆ ให้รู้ว่ากำลังโฟกัสแถวไหน (คู่กับหมุดบนภาพที่
เรืองแสงพร้อมกัน — ดู .quiz-modal-image-pin.is-active) ===== */
.quiz-modal-matching-row.is-active .quiz-modal-matching-left { border-color: rgba(15,27,61,0.35); }
.quiz-modal-matching-row.is-active .quiz-modal-matching-badge:not(.is-matched) { box-shadow: 0 0 0 3px rgba(255,90,60,0.25); }
/* ===== เพิ่มใหม่: ไฮไลต์ถูก/ผิดเป็นรายคู่หลังส่งคำตอบ (บอกชัดว่าคู่ไหนผิดบ้าง) — เขียว/แดงสงวนไว้ใช้
ตรงนี้เท่านั้น ===== */
.quiz-modal-matching-row.is-row-correct .quiz-modal-matching-left,
.quiz-modal-matching-row.is-row-correct .quiz-modal-matching-select { border-color: #6EE7B7; background: rgba(16,185,129,0.08); }
.quiz-modal-matching-row.is-row-incorrect .quiz-modal-matching-left,
.quiz-modal-matching-row.is-row-incorrect .quiz-modal-matching-select { border-color: #FCA5A5; background: rgba(239,68,68,0.08); color: #B91C1C; }
/* ===== เพิ่มใหม่: หัวข้อ "จับคู่แล้ว N/4" + แถบ progress แบ่งช่อง ===== */
.quiz-modal-matching-progress { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.quiz-modal-matching-progress-label { flex: 0 0 auto; font-size: 12px; font-weight: 700; color: rgba(15,27,61,0.55); white-space: nowrap; }
.quiz-modal-matching-progress-bar { flex: 1 1 auto; display: flex; gap: 4px; }
.quiz-modal-matching-progress-seg { flex: 1 1 0; height: 4px; border-radius: 999px; background: #E5E7EB; transition: background .15s ease; }
.quiz-modal-matching-progress-seg.is-filled { background: #0F1B3D; }
/* ===== เพิ่มใหม่: กดปุ่ม "ส่งคำตอบ" ทั้งที่ตอบไม่ครบ — ข้อความแดงเตือน + แถวว่างสั่นเบาๆ แทนการ
disable ปุ่มเฉยๆ ===== */
.quiz-modal-incomplete-warning { color: #DC2626; font-size: 13px; font-weight: 700; margin: 0; }
@keyframes quiz-modal-row-shake {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-4px); }
  40%, 60% { transform: translateX(4px); }
}
.quiz-modal-matching-row.is-shake { animation: quiz-modal-row-shake 0.4s ease; }

/* ===== เพิ่มใหม่: sequencing (เรียงลำดับ) — ลาก-วางจริงด้วย drag handle จุด 6 จุด ===== */
.quiz-modal-sequencing-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.quiz-modal-sequencing-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1.5px solid #E5E7EB;
  background: #fff;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.quiz-modal-sequencing-row.is-dragging { border-color: #FF5A3C; box-shadow: 0 6px 16px rgba(15,27,61,0.14); cursor: grabbing; }
.quiz-modal-sequencing-badge {
  flex: 0 0 24px;
  height: 24px;
  border-radius: 999px;
  border: 1.5px solid #FF5A3C;
  color: #FF5A3C;
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.quiz-modal-sequencing-text { flex: 1 1 auto; min-width: 0; font-size: 13.5px; color: #0F1B3D; }
.quiz-modal-sequencing-handle {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: none;
  background: #F1F5F9;
  color: #64748B;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
}
.quiz-modal-sequencing-handle:hover { background: #E5E7EB; color: #334155; }
/* ===== เพิ่มใหม่: ขอบโฟกัสบางๆ สี accent แทนขอบดำหนาของ browser default (เหมือนที่ปรับใน
.quiz-modal-matching-select) ===== */
.quiz-modal-sequencing-handle:focus { outline: none; box-shadow: 0 0 0 3px rgba(15,27,61,0.18); }
.quiz-modal-sequencing-handle:disabled { cursor: default; opacity: 0.6; }
/* ===== เพิ่มใหม่: ไฮไลต์ถูก/ผิดเป็นรายข้อหลังส่งคำตอบ (บอกชัดว่าข้อไหนผิดบ้าง) ===== */
.quiz-modal-sequencing-row.is-row-correct { border-color: #6EE7B7; background: rgba(16,185,129,0.08); }
.quiz-modal-sequencing-row.is-row-correct .quiz-modal-sequencing-badge { border-color: #10B981; color: #059669; }
.quiz-modal-sequencing-row.is-row-incorrect { border-color: #FCA5A5; background: rgba(239,68,68,0.08); }
.quiz-modal-sequencing-row.is-row-incorrect .quiz-modal-sequencing-badge { border-color: #EF4444; color: #DC2626; }
.quiz-modal-sequencing-row.is-row-incorrect .quiz-modal-sequencing-text { color: #B91C1C; }
/* ===== เพิ่มใหม่: ไอคอน ✓/✕ ท้ายแถว matching/sequencing หลังส่งคำตอบ ===== */
.quiz-modal-row-icon { flex: 0 0 auto; font-size: 15px; font-weight: 800; line-height: 1; }
.quiz-modal-row-icon.is-correct { color: #059669; }
.quiz-modal-row-icon.is-incorrect { color: #DC2626; }

/* ===== เพิ่มใหม่: ปุ่ม "ส่งคำตอบ" ของ matching/sequencing (ต้องรอเลือก/จัดเรียงครบก่อนถึงส่งได้) ===== */
.quiz-modal-submit-btn { width: 100%; text-align: center; }
.quiz-modal-submit-btn:disabled { opacity: 0.4; cursor: default; }

/* ===== เพิ่มใหม่: multi_select (เลือกได้หลายคำตอบ) — ปุ่มตัวเลือกมีช่องติ๊กทางซ้าย ===== */
.quiz-modal-multi-btn { display: flex; align-items: center; gap: 10px; width: 100%; }
.quiz-modal-multi-box {
  flex: 0 0 20px; width: 20px; height: 20px; border-radius: 6px; border: 2px solid #CBD5E1; background: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: #fff; line-height: 1;
}
.quiz-modal-multi-label { flex: 1 1 auto; min-width: 0; }
.quiz-modal-multi-btn.is-selected { border-color: #FF5A3C; background: #FFF7F5; }
.quiz-modal-multi-btn.is-selected .quiz-modal-multi-box { border-color: #FF5A3C; background: #FF5A3C; }
.quiz-modal-multi-btn.correct .quiz-modal-multi-box { border-color: #10B981; background: #10B981; }
.quiz-modal-multi-btn.correct .quiz-modal-multi-box:empty::after { content: "✓"; }
.quiz-modal-multi-btn.incorrect .quiz-modal-multi-box { border-color: #EF4444; background: #EF4444; }
.quiz-modal-multi-btn.incorrect .quiz-modal-multi-box:empty::after { content: "✕"; }
.quiz-modal-multi-count { font-size: 12px; font-weight: 600; color: rgba(15,27,61,0.45); margin: 8px 0 12px; }

/* ===== เพิ่มใหม่: drag_drop (เติมคำลงช่องว่าง) — คลังคำ + ช่องว่างในประโยค ธีม navy/ส้ม ===== */
.quiz-modal-dd-sentence {
  white-space: pre-wrap; font-size: 14.5px; line-height: 2.6; color: #0F1B3D;
  background: #fff; border: 1.5px solid #E5E7EB; border-radius: 12px; padding: 12px 14px;
}
.quiz-modal-dd-blank {
  display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;
  min-width: 84px; min-height: 36px; margin: 0 3px; padding: 0 4px;
  border: 2px dashed rgba(15,27,61,0.3); border-radius: 10px; background: #fff; transition: all .15s ease;
}
.quiz-modal-dd-blank.is-active { border-style: solid; border-color: #FF5A3C; background: rgba(255,90,60,0.06); }
.quiz-modal-dd-blank.is-over { border-style: solid; border-color: #FF5A3C; background: rgba(255,90,60,0.15); }
.quiz-modal-dd-blank.is-filled { border-style: solid; border-color: #FF5A3C; background: rgba(255,90,60,0.1); }
.quiz-modal-dd-blank.is-row-correct { border-color: #6EE7B7; background: rgba(16,185,129,0.1); }
.quiz-modal-dd-blank.is-row-incorrect { border-color: #FCA5A5; background: rgba(239,68,68,0.1); }
.quiz-modal-dd-empty {
  min-width: 76px; height: 30px; border: none; background: transparent; font-family: inherit;
  font-size: 12px; font-weight: 700; color: rgba(15,27,61,0.35); cursor: pointer; border-radius: 8px;
}
.quiz-modal-dd-bank {
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding: 12px; min-height: 58px;
  background: #F7F8FA; border-radius: 12px;
}
.quiz-modal-dd-bank-empty { align-self: center; font-size: 12.5px; color: rgba(15,27,61,0.4); }
.quiz-modal-dd-chip {
  padding: 6px 14px; border-radius: 9px; border: 1.5px solid rgba(15,27,61,0.15); background: #fff;
  font-family: inherit; font-size: 13.5px; font-weight: 700; color: #0F1B3D; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none; box-shadow: 0 1px 2px rgba(15,27,61,0.06);
}
.quiz-modal-dd-chip:hover:not(:disabled) { border-color: #FF5A3C; }
.quiz-modal-dd-chip.is-placed { border-color: transparent; background: transparent; box-shadow: none; }
.quiz-modal-dd-chip.is-dragging { opacity: 0.3; }
.quiz-modal-dd-chip:disabled, .quiz-modal-dd-empty:disabled { cursor: default; opacity: 0.85; }
.quiz-modal-dd-ghost {
  position: fixed; z-index: 100000; pointer-events: none; transform: translate(-50%, -50%);
  padding: 6px 14px; border-radius: 9px; background: #FF5A3C; color: #fff; font-size: 13.5px; font-weight: 700;
  box-shadow: 0 8px 20px rgba(15,27,61,0.25);
}

.quiz-modal-feedback { margin-top: 16px; }
.quiz-modal-result-text { font-weight: 700; font-size: 14.5px; margin: 0 0 6px; }
.quiz-modal-result-text.is-correct { color: #059669; }
.quiz-modal-result-text.is-incorrect { color: #DC2626; }
.quiz-modal-explanation { font-size: 13.5px; color: #475569; margin: 0 0 14px; }
.quiz-modal-error { color: #DC2626; font-size: 13px; }
.quiz-modal-hint { color: #64748B; font-size: 13px; }

.quiz-modal-continue-btn {
  background: #0F1B3D;
  color: #fff;
  border: none;
  padding: 11px 20px;
  border-radius: 999px;
  font-family: inherit;
  font-weight: 700;
  font-size: 13.5px;
  cursor: pointer;
}

.resume-modal { text-align: center; max-width: 300px; padding: 28px 24px 22px; border-radius: 16px; }
.resume-title { font-size: 15px; font-weight: 700; margin: 0 0 6px; color: #0F1B3D; }
.resume-subtext { font-size: 13px; margin: 0 0 22px; color: #94A3B8; }
.resume-actions { display: flex; flex-direction: column; gap: 10px; }
.resume-primary-btn { width: 100%; background: #0F1B3D; color: #fff; border: none; padding: 12px 20px; border-radius: 999px; font-family: inherit; font-weight: 700; font-size: 13.5px; cursor: pointer; }
.resume-primary-btn:hover { background: #1a2a52; }
.resume-secondary-btn { background: none; border: none; color: #94A3B8; font-family: inherit; font-weight: 600; font-size: 12.5px; cursor: pointer; padding: 8px; text-decoration: underline; text-underline-offset: 2px; }
.resume-secondary-btn:hover { color: #64748B; }

/* ---------- Quiz page (ท้ายบท) เดิม ---------- */
.quiz-section { margin-top: 0; padding: 28px 24px; background: #fff; border-radius: 20px; box-shadow: 0 1px 3px rgba(15, 27, 61, 0.06); }
.quiz-heading { font-size: 18px; font-weight: 700; margin: 0 0 20px; color: #0F1B3D; }
.quiz-question { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #F0F1F5; }
.quiz-question:last-of-type { border-bottom: none; }
.quiz-question-text { font-weight: 600; font-size: 14.5px; margin-bottom: 12px; color: #0F1B3D; }
.quiz-choice { display: flex; align-items: center; gap: 10px; padding: 10px 14px; font-size: 14px; border-radius: 10px; margin-bottom: 6px; cursor: pointer; transition: background 0.15s ease; }
.quiz-choice:hover { background: #F7F8FA; }
.quiz-choice input { accent-color: #FF5A3C; width: 16px; height: 16px; }
#submit-quiz-btn { background: #FF5A3C; color: #fff; border: none; padding: 13px 28px; border-radius: 999px; font-family: inherit; font-weight: 700; font-size: 14px; cursor: pointer; margin-top: 8px; transition: opacity 0.15s ease; }
#submit-quiz-btn:hover { opacity: 0.9; }
.quiz-result { margin-top: 14px; font-weight: 700; font-size: 14.5px; color: #0F1B3D; }
.quiz-choice.choice-correct {
  background: #ECFDF5;
  border-radius: 8px;
}

.quiz-choice.choice-correct::after {
  content: " ✓";
  color: #10B981;
  font-weight: 700;
}

.quiz-choice.choice-incorrect {
  background: #FEF2F2;
  border-radius: 8px;
}

.quiz-choice.choice-incorrect::after {
  content: " ✕";
  color: #EF4444;
  font-weight: 700;
}

.quiz-question-feedback {
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: 10px;
}

.quiz-question-feedback.is-correct { background: #ECFDF5; }
.quiz-question-feedback.is-incorrect { background: #FEF2F2; }

.quiz-question-result-text {
  font-weight: 700;
  font-size: 13px;
  margin: 0 0 4px;
}

.quiz-question-feedback.is-correct .quiz-question-result-text { color: #10B981; }
.quiz-question-feedback.is-incorrect .quiz-question-result-text { color: #EF4444; }

.quiz-question-explanation {
  font-size: 12.5px;
  color: #0F1B3D99;
  margin: 0;
  line-height: 1.5;
}`;

// ============================================================
// Manifest: ช่วงวิดีโอแต่ละช่วงเป็น SCO แยกกัน; ถ้าไม่แบ่งช่วงให้คง lesson SCO เดียวแบบเดิม
// ============================================================
//สร้างไฟล์ imsmanifest.xml
function buildManifestXml(
  draft: LessonDraftRow,
  hasQuiz: boolean,
  masteryScore: number,
  videoSegments: VideoSegmentRow[]
): string {
  const identifier = `COM.INTERACTEDU.${draft.id.replace(/-/g, "").toUpperCase()}`;//สร้าง unique ID ของ manifest
  const escapedTitle = draft.lessons.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sortedSegments = videoSegments.slice().sort((a, b) => a.order_index - b.order_index);

  // [งานข้อ 09] <adlcp:masteryscore> เป็น child ของ <item> ตามสเปก SCORM 1.2 CAM (ไม่ใช่ของ
  // <resource>) — ค่ามาจาก courses.certificate_pass_percentage เดียวกับที่ตัดสินใบรับรอง
  // ให้ SCO ที่ตรวจคะแนนตัวเองอ่านค่านี้จาก manifest แล้วเทียบกับ cmi.core.score.raw ได้เอง
  const lessonItems = sortedSegments.length > 0
    ? `<item identifier="ITEM-LESSON">
        <title>${escapedTitle}</title>
        ${sortedSegments.map((segment, index) => {
          const segmentIdentifier = segment.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
          const segmentTitle = formatGeneratedSubchapterTitle(segment.title, index)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return `<item identifier="ITEM-CHAPTER-${segmentIdentifier}" identifierref="RES-CHAPTER-${segmentIdentifier}">
          <title>${segmentTitle}</title>
          <adlcp:masteryscore>${masteryScore}</adlcp:masteryscore>
        </item>`;
        }).join("\n        ")}
      </item>`
    : `<item identifier="ITEM-LESSON" identifierref="RES-LESSON">
        <title>${escapedTitle}</title>
        <adlcp:masteryscore>${masteryScore}</adlcp:masteryscore>
      </item>`;

  const quizItem = hasQuiz
    ? `<item identifier="ITEM-QUIZ" identifierref="RES-QUIZ">
        <title>แบบทดสอบหลังเรียน</title>
        <adlcp:masteryscore>${masteryScore}</adlcp:masteryscore>
      </item>`
    : "";

  const lessonResources = sortedSegments.length > 0
    ? sortedSegments.map((segment) => {
        const segmentIdentifier = segment.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        const chapterHref = `lesson.html?chapter=${encodeURIComponent(segment.id)}`;
        return `<resource identifier="RES-CHAPTER-${segmentIdentifier}" type="webcontent" adlcp:scormtype="sco" href="${chapterHref}">
      <file href="lesson.html" />
      <file href="scorm-api.js" />
      <file href="lesson-player.js" />
      <file href="style.css" />
    </resource>`;
      }).join("\n    ")
    : `<resource identifier="RES-LESSON" type="webcontent" adlcp:scormtype="sco" href="lesson.html">
      <file href="lesson.html" />
      <file href="scorm-api.js" />
      <file href="lesson-player.js" />
      <file href="style.css" />
    </resource>`;

  const quizResource = hasQuiz
    ? `<resource identifier="RES-QUIZ" type="webcontent" adlcp:scormtype="sco" href="quiz.html">
      <file href="quiz.html" />
      <file href="scorm-api.js" />
      <file href="quiz-player.js" />
      <file href="style.css" />
    </resource>`
    : "";

  return `<?xml version="1.0" standalone="no" ?>
<manifest identifier="${identifier}" version="1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                       http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                       http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-${draft.id}">
    <organization identifier="ORG-${draft.id}">
      <title>${escapedTitle}</title>
      ${lessonItems}
      ${quizItem}
    </organization>
  </organizations>
  <resources>
    ${lessonResources}
    ${quizResource}
  </resources>
</manifest>`;
}

// ============================================================
// Manifest JSON ที่จะเก็บลง lessons.scorm_manifest ให้ player อ่าน
// โครงสร้างต้องตรงกับ ScormMenuItem ใน src/app/play/[courseId]/[lessonId]/page.tsx
// เพิ่ม field "type" เพื่อให้ player แยก render ควิซเป็นบล็อกต่างหากได้
// ============================================================

function buildManifestJson(
  draft: LessonDraftRow,
  hasQuiz: boolean,
  masteryScore: number,
  videoSegments: VideoSegmentRow[]
) { //สร้าง json เก็บลง db
  const items: GeneratedManifestItem[] = videoSegments.length > 0
    ? [{
      identifier: "ITEM-LESSON",
      title: draft.lessons.title,
      href: null,
      children: videoSegments
          .slice()
          .sort((a, b) => a.order_index - b.order_index)
          .map((segment, index) => ({
            identifier: `ITEM-CHAPTER-${segment.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`,
            title: formatGeneratedSubchapterTitle(segment.title, index),
            href: `lesson.html?chapter=${encodeURIComponent(segment.id)}`,
            children: [],
            type: "lesson" as const,
            startSeconds: segment.start_seconds,
            endSeconds: segment.end_seconds,
          })),
      type: "lesson",
    }]
    : [{
      identifier: "ITEM-LESSON",
      title: draft.lessons.title,
      href: "lesson.html",
      children: [],
      type: "lesson",
    }];

  if (hasQuiz) {
    items.push({
      identifier: "ITEM-QUIZ",
      title: "แบบทดสอบหลังเรียน",
      href: "quiz.html",
      children: [],
      type: "quiz",
    });
  }

  return {
    organizationTitle: draft.lessons.title,
    items,
    // [งานข้อ 09] เก็บไว้ให้ player อ่านต่อ (api/lessons/[lessonId]/scorm-info ส่ง manifest นี้
    // ผ่านตรงๆ) แล้วป้อนเป็น cmi.student_data.mastery_score ก่อน SCO initialize — ดู page.tsx
    masteryScore,
  };
}

// ============================================================
// Main
// ============================================================

export async function generateScormPackage(
  supabase: SupabaseClient,
  draftId: string,
  lessonId: string
): Promise<{ packageUrl: string } | { error: string }> {
  // Dynamic Import สำหรับ AWS SDK & R2 Config
  const [{ PutObjectCommand }, { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL }] =
    await Promise.all([
      import("@aws-sdk/client-s3"),
      import("@/lib/r2"),
    ]);

  // 1. ดึงข้อมูล Draft บทเรียน lessons(...) เป็นการ Join ตารางเพื่อดึงข้อมูลจากตาราง lessons ที่เชื่อมโยงกันอยู่ติดมาด้วย (โดยเอามาแค่ id, course_id, title)
  const { data: draft, error: draftError } = await supabase
    .from("lesson_drafts")
    .select("id, video_url, content_html, status, lessons(id, course_id, title)")
    .eq("id", draftId)
    .single();

  if (draftError || !draft || !draft.lessons) {
    console.error("[generateScormPackage] draft fetch failed:", draftError);
    return { error: "Draft not found" };
  }

  // [งานข้อ 13] เดิม select "status" มาจาก lesson_drafts แต่ไม่เคยเช็คเลยสักที่ในฟังก์ชันนี้ —
  // ปล่อยให้ draft ที่ยังไม่ผ่านการอนุมัติ (status "draft" หรือ "pending_review") ถูก generate
  // เป็นแพ็กเกจ SCORM จริงได้ตามปกติ และไม่เช็ค video_url เลยด้วย ถ้าว่าง video.src จะกลายเป็น ""
  // ทำให้ loadedmetadata ไม่มีวันยิง -> attachVideoBehavior ไม่ถูกเรียก -> ไม่มีควิซขึ้น ไม่มีการ
  // บันทึกความคืบหน้าใดๆ -> ผู้เรียนจบบทเรียนนั้นไม่ได้เลย แต่ท้ายฟังก์ชันนี้ (ดูด้านล่าง) ยังตั้ง
  // is_published: true ให้เหมือนบทเรียนพร้อมใช้งานแล้วอยู่ดี ต้องกันตั้งแต่ต้นทางก่อนจะเสียเวลา
  // generate/upload ไฟล์จริงไปเปล่าๆ (เช็คค่าจริงจาก DB — 'approved' คือสถานะเดียวที่มีทุกแถวใน
  // ข้อมูลจริงตอนนี้ที่มี video_url ครบ ส่วน 'draft'/'pending_review' ยังไม่ผ่านการตรวจของครู)
  if (draft.status !== "approved") {
    return {
      error: `บทเรียนนี้ยังไม่ได้รับการอนุมัติ (สถานะปัจจุบัน: "${draft.status}") ต้องอนุมัติ (approved) ก่อนถึงจะสร้างแพ็กเกจ SCORM ได้`,
    };
  }
  if (!draft.video_url || draft.video_url.trim() === "") {
    return {
      error: "บทเรียนนี้ยังไม่มีลิงก์วิดีโอ (video_url ว่าง) ต้องอัปโหลด/ใส่วิดีโอให้บทเรียนก่อนถึงจะสร้างแพ็กเกจ SCORM ได้",
    };
  }

  // 2. ดึงข้อมูลแบบทดสอบ (ทั้งสองประเภทมาพร้อมกัน แล้วค่อยแยกทีหลัง)
  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select(
      "id, question_text, order_index, video_timestamp_seconds, explanation, image_url, image_caption, image_pins, interaction_type, answer_data, quiz_choices(choice_text, is_correct, order_index)"
    )
    .eq("lesson_draft_id", draftId)
    .order("order_index", { ascending: true });

  if (questionsError) {
    console.error("[generateScormPackage] quiz questions fetch failed:", questionsError);
    return { error: "Failed to fetch quiz data" };
  }

  const typedDraft = draft as unknown as LessonDraftRow;
  const typedQuestions = (questions ?? []) as unknown as QuizQuestionRow[];

  // ควิซแทรกกลางวิดีโอ (มี timestamp) vs ควิซท้ายบทแบบเดิม (ไม่มี timestamp)
  const videoQuizQuestions = typedQuestions.filter((q) => q.video_timestamp_seconds != null);
  // คำถามที่ไม่มี timestamp จะถูกรวมเป็นข้อสอบหลังเรียนระดับคอร์สโดย API
  // ไม่สร้าง quiz SCO แยกในแต่ละบทอีก เพื่อให้มีคะแนนตัดสินใบรับรองเพียงชุดเดียว
  const hasQuiz = false;

  // ควิซแบบสุ่มจากคลัง (bank_random) — เก็บแยกจาก quiz_questions
  const { data: markers, error: markersError } = await supabase
    .from("video_quiz_markers")
    .select("id, timestamp_seconds, random_difficulty")
    .eq("lesson_draft_id", draftId)
    .order("order_index", { ascending: true });

  if (markersError) {
    console.error("[generateScormPackage] video quiz markers fetch failed:", markersError);
    return { error: "Failed to fetch video quiz markers" };
  }

  const typedMarkers = (markers ?? []) as unknown as VideoQuizMarkerRow[];

  const { data: segments, error: segmentsError } = await supabase
    .from("lesson_video_segments")
    .select("id, title, summary, start_seconds, end_seconds, order_index")
    .eq("lesson_draft_id", draftId)
    .order("order_index", { ascending: true });

  if (segmentsError) {
    console.error("[generateScormPackage] video segments fetch failed:", segmentsError);
    return { error: "Failed to fetch video segments" };
  }

  const typedSegments = (segments ?? []) as unknown as VideoSegmentRow[];

  const courseId = typedDraft.lessons.course_id;

  // [งานข้อ 09] เกณฑ์ผ่าน (mastery score) ของคอร์สนี้ — ใช้ค่าเดียวกับที่ตัดสินใบรับรองจริง
  // (courses.certificate_pass_percentage ผ่าน gradeCourseFinalExam — งานข้อ 03/05) ไม่ตั้งเกณฑ์
  // แยกต่างหากสำหรับ SCO เพราะจะเสี่ยงไม่ตรงกับเกณฑ์ใบรับรองจริงถ้าครูแก้ค่าใดค่าหนึ่งทีหลัง
  const { data: courseSettings, error: courseSettingsError } = await supabase
    .from("courses")
    .select("certificate_pass_percentage")
    .eq("id", courseId)
    .maybeSingle();
  if (courseSettingsError) {
    console.error("[generateScormPackage] fetch certificate_pass_percentage failed:", courseSettingsError);
  }
  const configuredMasteryScore = Number(courseSettings?.certificate_pass_percentage);
  // ตรงกับ DEFAULT_PASS_PERCENTAGE ใน lib/courses/course-final-exam.ts — คอร์สที่ยังไม่ตั้งค่านี้
  // (หรือ query พลาด) ควรได้ SCO ที่ใช้เกณฑ์เดียวกับที่ตัดสินใบรับรองอยู่ดี ไม่ใช่ไม่มีเกณฑ์เลย
  const masteryScore = Number.isFinite(configuredMasteryScore) ? configuredMasteryScore : 70;

  const manifestXml = buildManifestXml(typedDraft, hasQuiz, masteryScore, typedSegments);
  const lessonPlayerJs = buildLessonPlayerJs(
    typedDraft,
    lessonId,
    videoQuizQuestions,
    typedMarkers,
    typedSegments
  );
  const lessonHtml = withVolumeControls(LESSON_HTML);

  // 3. สร้างไฟล์ ZIP ด้วย JSZip
  let zipBuffer: Buffer;
  try {
    const zip = new JSZip();
    zip.file("imsmanifest.xml", manifestXml);
    zip.file("lesson.html", lessonHtml);//หน้าหลัก
    zip.file("scorm-api.js", SCORM_API_JS);//ตัวเชื่อมกับ LMSตัวอื่น
    zip.file("lesson-player.js", lessonPlayerJs);//logic การเล่นวิดิโอและควิซแทรกกลางบทเรียน
    zip.file("style.css", STYLE_CSS);

    zipBuffer = await zip.generateAsync({//ทำการบีบอัด ไฟล์ทั้งหมดที่ใส่ไว้ให้กลายเป็นไฟล์ zip
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
  } catch (error: unknown) {
    console.error("[generateScormPackage] JSZip creation failed:", error);
    return { error: `Failed to generate ZIP package: ${errorMessage(error)}` };
  }

  // 4. อัปโหลดเข้า Cloudflare R2 แยกไฟล์ ให้ตรงกับที่ /api/scorm/[...] proxy
  const basePath = `scorm-packages/${courseId}/${lessonId}`;

  const filesToUpload: { name: string; content: string; contentType: string }[] = [
    { name: "imsmanifest.xml", content: manifestXml, contentType: "application/xml" },
    { name: "lesson.html", content: lessonHtml, contentType: "text/html" },
    { name: "scorm-api.js", content: SCORM_API_JS, contentType: "application/javascript" },
    { name: "lesson-player.js", content: lessonPlayerJs, contentType: "application/javascript" },
    { name: "style.css", content: STYLE_CSS, contentType: "text/css" },
  ];

  // [งานข้อ 17] ลบไฟล์เก่าที่ตกค้างใน R2 ก่อนอัปทับไฟล์ชุดใหม่ — เดิมไม่มีขั้นตอนนี้เลย ถ้าโครงสร้าง
  // แพ็กเกจเปลี่ยนชื่อไฟล์ (เช่นรุ่นก่อนมี quiz.html/quiz-player.js ที่รุ่นปัจจุบันไม่ได้สร้างแล้ว)
  // ไฟล์เก่าจะค้างอยู่ใน R2 ตลอดไป เพราะ PutObjectCommand เขียนทับเฉพาะไฟล์ที่ชื่อตรงกันเท่านั้น ไฟล์ที่
  // manifest รุ่นปัจจุบันไม่อ้างถึงแล้วจะไม่มีวันถูกลบเอง — เปลืองพื้นที่และเสี่ยงสับสนว่าไฟล์ไหนคือของจริง
  // จึง list ไฟล์ทั้งหมดใต้ basePath นี้ก่อน แล้วลบไฟล์ที่ "ไม่อยู่ในชุดที่กำลังจะอัปโหลดรอบนี้" ทิ้งทั้งหมด
  // (คง package.zip ไว้ในชุด keepKeys เพราะยังอัปโหลดต่อด้านล่าง — ไม่ใช่ไฟล์เก่าที่ต้องลบ)
  try {
    const { ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
    const keepKeys = new Set([
      ...filesToUpload.map((file) => `${basePath}/${file.name}`),
      `${basePath}/package.zip`,
    ]);

    let continuationToken: string | undefined;
    const keysToDelete: string[] = [];
    do {
      const listResult = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: `${basePath}/`,
          ContinuationToken: continuationToken,
        })
      );
      for (const obj of listResult.Contents ?? []) {
        if (obj.Key && !keepKeys.has(obj.Key)) {
          keysToDelete.push(obj.Key);
        }
      }
      continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
    } while (continuationToken);

    if (keysToDelete.length > 0) {
      // DeleteObjectsCommand ลบได้สูงสุด 1000 keys ต่อ request (ข้อจำกัดของ S3 API) — วนลบทีละชุด
      for (let i = 0; i < keysToDelete.length; i += 1000) {
        const batch = keysToDelete.slice(i, i + 1000);
        await r2Client.send(
          new DeleteObjectsCommand({
            Bucket: R2_BUCKET_NAME,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          })
        );
      }
      console.log(
        `[generateScormPackage] ลบไฟล์เก่าที่ตกค้างใน R2 ก่อน regenerate (${keysToDelete.length} ไฟล์):`,
        keysToDelete
      );
    }
  } catch (error: unknown) {
    // ไม่ return error ตรงนี้ — การลบไฟล์เก่าล้มเหลวไม่ควรบล็อกการสร้างแพ็กเกจใหม่ (ไฟล์เก่าที่ตกค้าง
    // ไม่ทำให้แพ็กเกจใหม่พัง เพราะ manifest รุ่นใหม่ไม่อ้างถึงมันอยู่แล้ว) แค่ log ไว้ตรวจสอบทีหลัง
    console.error("[generateScormPackage] Failed to clean up stale R2 files:", error);
  }

  try {
    await Promise.all(
      filesToUpload.map((file) =>
        r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: `${basePath}/${file.name}`,
            Body: file.content,
            ContentType: file.contentType,
          })
        )
      )
    );
  } catch (error: unknown) {
    console.error("[generateScormPackage] Failed to upload SCORM files to R2:", error);
    return { error: "Failed to upload package to storage" };
  }

  // ยังเก็บ zip ไว้ด้วยเผื่อใช้ดาวน์โหลด/export ทีหลัง (optional)
  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: `${basePath}/package.zip`,
        Body: zipBuffer,
        ContentType: "application/zip",
      })
    );
  } catch (error: unknown) {
    console.error("[generateScormPackage] Failed to upload zip archive:", error);
    // ไม่ return error ตรงนี้ เพราะไฟล์ที่ต้องใช้เล่นจริงอัปโหลดสำเร็จแล้ว
  }

  const packageUrl = `${R2_PUBLIC_URL}/${basePath}/lesson.html`;

  // 5. บันทึก Record ลง Supabase (scorm_packages เดิม)
  const { error: insertError } = await supabase
    .from("scorm_packages")
    .upsert(
      {
        lesson_draft_id: typedDraft.id,
        lesson_id: lessonId,
        package_url: packageUrl,
        version: "1.2",
      },
      { onConflict: "lesson_id" }
    );

  if (insertError) {
    console.error("[generateScormPackage] Failed to record SCORM package:", insertError);
    return { error: `Failed to save package record: ${insertError.message}` };
  }

  // 6. อัปเดต lessons table ให้ player (/api/lessons/[lessonId]/scorm-info) อ่านได้ตรง
  //    entryPoint ชี้ไปช่วงแรกเมื่อมีการแบ่งวิดีโอ และ fallback เป็น lesson.html เมื่อไม่ได้แบ่ง
  //    manifest เก็บช่วงวิดีโอเป็นลูกของบทเรียน เพื่อให้ player วาดเป็นหัวข้อย่อยใต้บทหลัก
  const manifestJson = buildManifestJson(typedDraft, hasQuiz, masteryScore, typedSegments);
  const firstSegment = typedSegments.slice().sort((a, b) => a.order_index - b.order_index)[0];
  const entryPoint = firstSegment
    ? `lesson.html?chapter=${encodeURIComponent(firstSegment.id)}`
    : "lesson.html";

  const { error: lessonUpdateError } = await supabase
    .from("lessons")
    .update({
      is_scorm: true,
      scorm_entry_point: entryPoint,
      scorm_version: "1.2",
      scorm_manifest: manifestJson,
      is_published: true,
      // [งานข้อ 06] ระบุชัดว่าแพ็กเกจนี้มาจาก generator ของแพลตฟอร์มเอง (ไม่ใช่อัปโหลดของคนอื่น)
      // ระบุตรงๆ แทนที่จะพึ่ง default ของคอลัมน์ เผื่อกรณีบทเรียนนี้เคยเป็น imported มาก่อนแล้ว
      // ครูสร้างแพ็กเกจใหม่ทับด้วยตัว generator — ต้องสลับกลับมาเป็น generated ด้วย
      scorm_source: "generated",
    })
    .eq("id", lessonId);

  if (lessonUpdateError) {
    console.error("[generateScormPackage] Failed to update lessons row:", lessonUpdateError);
    return { error: `Failed to update lesson record: ${lessonUpdateError.message}` };
  }

  console.log("✅ SCORM Package Generated & Uploaded Successfully!", packageUrl);
  return { packageUrl };
}
