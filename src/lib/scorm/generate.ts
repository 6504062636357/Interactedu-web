import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import "server-only";
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
  quiz_choices: QuizChoiceRow[];
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
  const staticQuizzes = videoQuizQuestions.map((q) => ({//วน mapใน videoQuizQuestionsทุกตัว 
    id: q.id,//ตัวใหม่
    timestampSeconds: q.video_timestamp_seconds,
    sourceType: "static" as const,
    questionText: q.question_text,
    choices: q.quiz_choices.sort((a, b) => a.order_index - b.order_index).map((c) => c.choice_text),
  }));//เรียง choice index จากน้อยไปมากและ ดึงเฉพาะ choice_text ออกมาจากแต่ละ choice object เหลือแค่ array ของ string ล้วนๆ

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
      .map((segment) => ({
        id: segment.id,
        title: segment.title,
        summary: segment.summary,
        startSeconds: segment.start_seconds,
        endSeconds: segment.end_seconds,
      })),
  };
  return `var LESSON_DATA = ${JSON.stringify(lessonData)};//แปลง object ทั้งก้อนเป็น string JSON
// คุมตัวเล่นวิดิโอ + ควิซในวิดีโอ (SCO)ในบทเรียน 
var REQUIRE_CORRECT_ANSWER = false;
var answeredQuestionIds = {};
var pendingQuestion = null;
var savePositionTimer = null;
var lastSavedPosition = 0;
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
    if (!answeredQuestionIds[q.id] && q.timestampSeconds <= currentTime) return q;
  }
  return null;
}

function getMaxAllowedSeekTime() {
  var max = Infinity;
  for (var i = 0; i < LESSON_DATA.quizzes.length; i++) {
    var q = LESSON_DATA.quizzes[i];
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
  document.getElementById("lesson-title").textContent = LESSON_DATA.title;
  document.getElementById("lesson-content").innerHTML = sanitizeLessonHtml(LESSON_DATA.contentHtml);
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
  var overlay = document.getElementById("quiz-overlay");
  var body = document.getElementById("quiz-modal-body");
  body.innerHTML = "";

  var title = document.createElement("p");
  title.className = "quiz-modal-question";
  title.textContent = question.questionText;
  body.appendChild(title);

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

  var feedback = document.createElement("div");
  feedback.id = "quiz-modal-feedback";
  feedback.className = "quiz-modal-feedback";
  body.appendChild(feedback);

  overlay.classList.add("open");
}
  
// [แก้บั๊ก: ส่งคำตอบไม่สำเร็จแล้วค้าง] ถ้า POST ล้มเหลวเพราะเน็ต/เซิร์ฟเวอร์สะดุดชั่วครู่ (เช่น Supabase
// free-tier หน่วงเป็นพักๆ) เดิมจะโชว์ error ทันทีรอบเดียว ผู้เรียนต้องกดตอบเองซ้ำทุกครั้ง — ถ้าจังหวะนั้น
// เน็ตแกว่งพอดีอาจต้องกดวนหลายรอบ กว่าจะหลุด ตอนนี้เพิ่ม retry อัตโนมัติให้ 1 ครั้งก่อน (หน่วง 1.2 วิ
// สั้นพอไม่ทำให้รอนาน และไม่ยิง request รัวจนหนักเซิร์ฟเวอร์) ถ้ายังไม่สำเร็จอีกถึงค่อยโชว์ error ให้กดเอง
function submitAnswer(question, choiceIndex, choicesWrap, attempt) {
  attempt = attempt || 0;
  Array.prototype.forEach.call(choicesWrap.children, function (btn) { btn.disabled = true; });
  var feedback = document.getElementById("quiz-modal-feedback");
  if (attempt > 0) {
    feedback.innerHTML = "<p class=\\"quiz-modal-hint\\">สัญญาณอินเทอร์เน็ตช้าไปนิด กำลังลองส่งคำตอบให้อีกครั้ง...</p>";
  }

  fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/video-quiz-attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId: question.id, selectedChoiceIndex: choiceIndex }),
  })
    .then(function (result) {
      // [งานข้อ 11] นับ/เขียน CMI เฉพาะครั้งแรกที่ตอบข้อนี้จริงๆ — กันนับซ้ำถ้าเผลอกดตอบซ้ำ
      // (video_quiz_attempts ก็ upsert คีย์เดียวกันนี้ ไม่สร้างแถวซ้ำเหมือนกัน)
      var isNewAnswer = !answeredQuestionIds[question.id];

      answeredQuestionIds[question.id] = true;
      updateMarkerAnswered(question.id);

      if (isNewAnswer) {
        quizSummary.total++;
        if (result.isCorrect) quizSummary.correct++;

        // cmi.interactions.n.* — บันทึกคู่ขนานทีละข้อ (interaction แยกจาก objective รวม)
        ScormAPI.setValue("cmi.interactions." + interactionIndex + ".id", String(question.id));
        ScormAPI.setValue("cmi.interactions." + interactionIndex + ".type", "choice");
        ScormAPI.setValue("cmi.interactions." + interactionIndex + ".student_response", String(choiceIndex));
        ScormAPI.setValue("cmi.interactions." + interactionIndex + ".result", result.isCorrect ? "correct" : "wrong");
        interactionIndex++;

        reportQuizSummaryToCmi();
        // [งานข้อ 21] บันทึกชุดข้อที่ตอบแล้วลง cmi.suspend_data คู่ขนานไปกับ REST — commit
        // รวมไปกับ setValue อื่นๆ ข้างบนในจังหวะเดียวกันเลย ไม่ยิง commit แยกเพิ่ม
        saveAnsweredToSuspendData();
        ScormAPI.commit();
      }

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

function findChapterAtTime(seconds) {
  for (var i = 0; i < LESSON_DATA.chapters.length; i++) {
    var chapter = LESSON_DATA.chapters[i];
    var isLast = i === LESSON_DATA.chapters.length - 1;
    if (seconds >= chapter.startSeconds && (seconds < chapter.endSeconds || (isLast && seconds <= chapter.endSeconds))) {
      return chapter;
    }
  }
  return null;
}

function updateActiveChapter(video) {
  var chapter = findChapterAtTime(video.currentTime);
  var label = document.getElementById("current-chapter-label");
  if (label) label.textContent = chapter ? chapter.title : "";

  var buttons = document.querySelectorAll(".chapter-button");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle("active", !!chapter && buttons[i].dataset.chapterId === chapter.id);
  }
}

function renderChapters(video) {
  var nav = document.getElementById("chapter-nav");
  var list = document.getElementById("chapter-list");
  if (!nav || !list || !LESSON_DATA.chapters.length) return;

  nav.hidden = false;
  list.innerHTML = "";
  LESSON_DATA.chapters.forEach(function (chapter) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-button";
    button.dataset.chapterId = chapter.id;

    var title = document.createElement("span");
    title.className = "chapter-button-title";
    title.textContent = chapter.title;
    button.appendChild(title);

    var time = document.createElement("span");
    time.className = "chapter-button-time";
    time.textContent = formatTime(chapter.startSeconds) + "–" + formatTime(chapter.endSeconds);
    button.appendChild(time);

    button.addEventListener("click", function () {
      video.currentTime = Math.min(chapter.startSeconds, getMaxAllowedSeekTime());
      video.play();
    });
    list.appendChild(button);
  });
  updateActiveChapter(video);
}

function renderProgressMarkers(video) {
  var container = document.getElementById("progress-markers");
  container.innerHTML = "";
  if (!video.duration || !isFinite(video.duration)) return;

  LESSON_DATA.quizzes.forEach(function (q) {
    var pct = Math.min(100, (q.timestampSeconds / video.duration) * 100);
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
  var pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("time-display").textContent =
    formatTime(video.currentTime) + " / " + formatTime(video.duration);
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
    var target = ratio * (video.duration || 0);
    var maxAllowed = getMaxAllowedSeekTime();
    video.currentTime = Math.min(target, maxAllowed);
  }
  progressTrack.addEventListener("click", seekFromEvent);

  video.addEventListener("timeupdate", updateProgressUI.bind(null, video));
  video.addEventListener("timeupdate", updateActiveChapter.bind(null, video));
  video.addEventListener("loadedmetadata", function () {
    updateProgressUI(video);
    renderProgressMarkers(video);
    renderChapters(video);
  });
  if (video.readyState >= 1) {
    updateProgressUI(video);
    renderProgressMarkers(video);
    renderChapters(video);
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

/* ---------------- Video behavior ---------------- */

function attachVideoBehavior(video) {
  video.addEventListener("timeupdate", function () {
    if (pendingQuestion) return;
    var next = findNextUnansweredAt(video.currentTime);
    if (next) { video.pause(); openQuizModal(next); }
  });

  video.addEventListener("seeking", function () {
    var maxAllowed = getMaxAllowedSeekTime();
    if (video.currentTime > maxAllowed) video.currentTime = maxAllowed;
  });

  video.addEventListener("play", function () {
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
    lastSavedPosition = video.currentTime;
    savePosition(video.currentTime);
    ScormAPI.commit();
  });

  video.addEventListener("ended", function () {
    stopSavePositionTimer();
    lastSavedPosition = video.currentTime;
    savePosition(video.currentTime);
    ScormAPI.setValue("cmi.core.lesson_status", "completed");
    ScormAPI.commit();
  });

  window.addEventListener("beforeunload", function () {
    stopSavePositionTimer();
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
  if (!existingStatus || existingStatus === "not attempted") {
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
      if (entryValue === "resume" && resumeSeconds > 5 && resumeSeconds < video.duration - 2) {
        showResumePrompt(video, resumeSeconds).then(function (seekTo) {
          if (seekTo > 0) video.currentTime = seekTo;
          attachVideoBehavior(video);
        });
      } else {
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

    <section id="chapter-nav" class="chapter-nav" hidden>
      <div class="chapter-nav-header">
        <div>
          <p class="chapter-nav-kicker">บทของวิดีโอ</p>
          <p id="current-chapter-label" class="current-chapter-label"></p>
        </div>
        <span class="chapter-nav-hint">เลือกเพื่อข้ามไปยังบท</span>
      </div>
      <div id="chapter-list" class="chapter-list"></div>
    </section>

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

/* ---------- Video chapters ---------- */
.chapter-nav {
  margin-top: 16px;
  border: 1px solid rgba(124, 92, 255, 0.16);
  border-radius: 16px;
  background: #F7F5FF;
  padding: 16px;
}
.chapter-nav[hidden] { display: none; }
.chapter-nav-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.chapter-nav-kicker { margin: 0; color: #0F1B3D; font-size: 12px; font-weight: 700; }
.current-chapter-label { margin: 2px 0 0; color: #5D45C7; font-size: 13px; font-weight: 700; }
.chapter-nav-hint { color: rgba(15, 27, 61, 0.42); font-size: 10.5px; }
.chapter-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.chapter-button {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.68);
  padding: 10px 12px;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}
.chapter-button:hover { border-color: rgba(124, 92, 255, 0.25); background: #fff; transform: translateY(-1px); }
.chapter-button.active { border-color: rgba(124, 92, 255, 0.48); background: #fff; box-shadow: 0 4px 14px rgba(93, 69, 199, 0.08); }
.chapter-button-title { overflow: hidden; color: #0F1B3D; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.chapter-button-time { color: #7C5CFF; font-size: 10.5px; font-weight: 600; }

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

@media (max-width: 560px) {
  .chapter-list { grid-template-columns: 1fr; }
  .chapter-nav-header { align-items: flex-start; flex-direction: column; gap: 4px; }
}

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
  align-items: center; justify-content: center;
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

.quiz-modal-question { font-weight: 700; font-size: 16px; margin: 0 0 16px; color: #0F1B3D; }
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
// Manifest: 2 items / 2 resources (lesson.html, quiz.html)
// ============================================================
//สร้างไฟล์ imsmanifest.xml
function buildManifestXml(draft: LessonDraftRow, hasQuiz: boolean, masteryScore: number): string {
  const identifier = `COM.INTERACTEDU.${draft.id.replace(/-/g, "").toUpperCase()}`;//สร้าง unique ID ของ manifest
  const escapedTitle = draft.lessons.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // [งานข้อ 09] <adlcp:masteryscore> เป็น child ของ <item> ตามสเปก SCORM 1.2 CAM (ไม่ใช่ของ
  // <resource>) — ค่ามาจาก courses.certificate_pass_percentage เดียวกับที่ตัดสินใบรับรอง
  // ให้ SCO ที่ตรวจคะแนนตัวเองอ่านค่านี้จาก manifest แล้วเทียบกับ cmi.core.score.raw ได้เอง
  const lessonItem = `<item identifier="ITEM-LESSON" identifierref="RES-LESSON">
        <title>${escapedTitle}</title>
        <adlcp:masteryscore>${masteryScore}</adlcp:masteryscore>
      </item>`;

  const quizItem = hasQuiz
    ? `<item identifier="ITEM-QUIZ" identifierref="RES-QUIZ">
        <title>แบบทดสอบหลังเรียน</title>
        <adlcp:masteryscore>${masteryScore}</adlcp:masteryscore>
      </item>`
    : "";

  const lessonResource = `<resource identifier="RES-LESSON" type="webcontent" adlcp:scormtype="sco" href="lesson.html">
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
      ${lessonItem}
      ${quizItem}
    </organization>
  </organizations>
  <resources>
    ${lessonResource}
    ${quizResource}
  </resources>
</manifest>`;
}

// ============================================================
// Manifest JSON ที่จะเก็บลง lessons.scorm_manifest ให้ player อ่าน
// โครงสร้างต้องตรงกับ ScormMenuItem ใน src/app/play/[courseId]/[lessonId]/page.tsx
// เพิ่ม field "type" เพื่อให้ player แยก render ควิซเป็นบล็อกต่างหากได้
// ============================================================

function buildManifestJson(draft: LessonDraftRow, hasQuiz: boolean, masteryScore: number) { //สร้าง json เก็บลง db
  const items: Array<{
    identifier: string;
    title: string;
    href: string;
    children: never[];
    type: "lesson" | "quiz";
  }> = [
    {
      identifier: "ITEM-LESSON",
      title: draft.lessons.title,
      href: "lesson.html",
      children: [],
      type: "lesson",
    },
  ];

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
      "id, question_text, order_index, video_timestamp_seconds, explanation, quiz_choices(choice_text, is_correct, order_index)"
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

  const manifestXml = buildManifestXml(typedDraft, hasQuiz, masteryScore);
  const lessonPlayerJs = buildLessonPlayerJs(
    typedDraft,
    lessonId,
    videoQuizQuestions,
    typedMarkers,
    typedSegments
  );

  // 3. สร้างไฟล์ ZIP ด้วย JSZip
  let zipBuffer: Buffer;
  try {
    const zip = new JSZip();
    zip.file("imsmanifest.xml", manifestXml);
    zip.file("lesson.html", LESSON_HTML);//หน้าหลัก
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
    { name: "lesson.html", content: LESSON_HTML, contentType: "text/html" },
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
  //    entryPoint ต้องชี้ไป lesson.html (SCO แรก) ไม่ใช่ quiz.html
  //    manifest เป็น JSON ที่มี item ควิซแยกออกมา (type: "quiz") ให้ page.tsx แสดงเป็นบล็อกต่างหาก
  const manifestJson = buildManifestJson(typedDraft, hasQuiz, masteryScore);

  const { error: lessonUpdateError } = await supabase
    .from("lessons")
    .update({
      is_scorm: true,
      scorm_entry_point: "lesson.html",
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
