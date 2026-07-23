// import { NextRequest, NextResponse } from "next/server";
// import { createClient } from "@/utils/supabase/server";
// import * as archiverModule from "archiver";
// import { PassThrough } from "stream";

// // Cast Type สำหรับ archiver ให้เรียกใช้งานเป็นฟังก์ชันได้โดยไม่มีปัญหา Type Error
// const archiver = archiverModule as unknown as (
//   format: string,
//   options?: archiverModule.ArchiverOptions
// ) => archiverModule.Archiver;
// interface QuizChoiceRow {
//   choice_text: string;
//   is_correct: boolean;
//   order_index: number;
// }

// interface QuizQuestionRow {
//   id: string;
//   question_text: string;
//   order_index: number;
//   quiz_choices: QuizChoiceRow[];
// }

// interface LessonDraftRow {
//   id: string;
//   course_id: string;
//   title: string;
//   video_url: string | null;
//   content_html: string | null;
//   status: string;
// }

// // escape ค่าก่อนแทรกลง JS/HTML string เพื่อกัน injection ในไฟล์ที่ generate
// function escapeForJs(value: string): string {
//   return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
// }

// function buildPlayerJs(draft: LessonDraftRow, questions: QuizQuestionRow[]): string {
//   const lessonData = {
//     title: draft.title,
//     videoUrl: draft.video_url ?? "",
//     contentHtml: draft.content_html ?? "",
//     questions: questions.map((q) => ({
//       questionText: q.question_text,
//       choices: q.quiz_choices
//         .sort((a, b) => a.order_index - b.order_index)
//         .map((c) => ({ text: c.choice_text, isCorrect: c.is_correct })),
//     })),
//   };

//   // ฝังข้อมูลจริงแทนก้อน LESSON_DATA hardcode เดิม
//   return `var LESSON_DATA = ${JSON.stringify(lessonData)};

// var quizAnswered = false;
// var quizScore = 0;

// function renderLesson() {
//   document.getElementById("lesson-title").textContent = LESSON_DATA.title;
//   document.getElementById("lesson-video").src = LESSON_DATA.videoUrl;
//   document.getElementById("lesson-content").innerHTML = LESSON_DATA.contentHtml;
//   renderQuiz();
// }

// function renderQuiz() {
//   var container = document.getElementById("quiz-container");
//   container.innerHTML = "";

//   LESSON_DATA.questions.forEach(function (q, qIndex) {
//     var qDiv = document.createElement("div");
//     qDiv.className = "quiz-question";

//     var qTitle = document.createElement("p");
//     qTitle.className = "quiz-question-text";
//     qTitle.textContent = (qIndex + 1) + ". " + q.questionText;
//     qDiv.appendChild(qTitle);

//     q.choices.forEach(function (c, cIndex) {
//       var label = document.createElement("label");
//       label.className = "quiz-choice";

//       var input = document.createElement("input");
//       input.type = "radio";
//       input.name = "question-" + qIndex;
//       input.value = cIndex;
//       input.dataset.correct = c.isCorrect;

//       label.appendChild(input);
//       label.appendChild(document.createTextNode(" " + c.text));
//       qDiv.appendChild(label);
//     });

//     container.appendChild(qDiv);
//   });
// }

// function submitQuiz() {
//   var total = LESSON_DATA.questions.length;
//   var correct = 0;

//   LESSON_DATA.questions.forEach(function (q, qIndex) {
//     var selected = document.querySelector('input[name="question-' + qIndex + '"]:checked');
//     if (selected && selected.dataset.correct === "true") {
//       correct++;
//     }
//   });

//   quizScore = total > 0 ? Math.round((correct / total) * 100) : 0;
//   quizAnswered = true;

//   document.getElementById("quiz-result").textContent =
//     "คุณได้คะแนน " + correct + "/" + total + " (" + quizScore + "%)";

//   ScormAPI.setValue("cmi.core.score.raw", String(quizScore));
//   ScormAPI.setValue("cmi.core.lesson_status", quizScore >= 60 ? "passed" : "failed");
//   ScormAPI.commit();
// }

// window.addEventListener("load", function () {
//   ScormAPI.initialize();
//   ScormAPI.setValue("cmi.core.lesson_status", "incomplete");
//   renderLesson();
//   document.getElementById("submit-quiz-btn").addEventListener("click", submitQuiz);
// });

// window.addEventListener("beforeunload", function () {
//   ScormAPI.commit();
//   ScormAPI.terminate();
// });
// `;
// }

// function buildManifestXml(draft: LessonDraftRow): string {
//   const identifier = `COM.INTERACTEDU.${draft.id.replace(/-/g, "").toUpperCase()}`;
//   const escapedTitle = draft.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

//   return `<?xml version="1.0" standalone="no" ?>
// <manifest identifier="${identifier}" version="1"
//   xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
//   xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
//   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
//   xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
//                        http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
//                        http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
//   <metadata>
//     <schema>ADL SCORM</schema>
//     <schemaversion>1.2</schemaversion>
//   </metadata>
//   <organizations default="ORG-${draft.id}">
//     <organization identifier="ORG-${draft.id}">
//       <title>${escapedTitle}</title>
//       <item identifier="ITEM-${draft.id}" identifierref="RES-${draft.id}">
//         <title>${escapedTitle}</title>
//       </item>
//     </organization>
//   </organizations>
//   <resources>
//     <resource identifier="RES-${draft.id}" type="webcontent" adlcp:scormtype="sco" href="index.html">
//       <file href="index.html" />
//       <file href="scorm-api.js" />
//       <file href="player.js" />
//       <file href="style.css" />
//     </resource>
//   </resources>
// </manifest>`;
// }

// const INDEX_HTML = `<!DOCTYPE html>
// <html lang="th">
// <head>
//   <meta charset="UTF-8" />
//   <title>Lesson</title>
//   <link rel="stylesheet" href="style.css" />
// </head>
// <body>
//   <div class="lesson-wrap">
//     <h1 id="lesson-title"></h1>
//     <video id="lesson-video" controls></video>
//     <div id="lesson-content" class="lesson-content"></div>
//     <div class="quiz-section">
//       <h2>แบบทดสอบท้ายบท</h2>
//       <div id="quiz-container"></div>
//       <button id="submit-quiz-btn">ส่งคำตอบ</button>
//       <p id="quiz-result" class="quiz-result"></p>
//     </div>
//   </div>
//   <script src="scorm-api.js"></script>
//   <script src="player.js"></script>
// </body>
// </html>`;

// const SCORM_API_JS = `var ScormAPI = (function () {
//   var apiHandle = null;
//   var findAttemptLimit = 500;

//   function scanForAPI(win) {
//     var attempts = 0;
//     while (win.API == null && win.parent != null && win.parent !== win && attempts < findAttemptLimit) {
//       attempts++;
//       win = win.parent;
//     }
//     return win.API || null;
//   }

//   function findAPI() {
//     var theAPI = null;
//     if (window.parent != null && window.parent !== window) {
//       theAPI = scanForAPI(window.parent);
//     }
//     if (theAPI == null && window.opener != null) {
//       theAPI = scanForAPI(window.opener);
//     }
//     return theAPI;
//   }

//   function getAPI() {
//     if (apiHandle == null) apiHandle = findAPI();
//     return apiHandle;
//   }

//   function initialize() {
//     var api = getAPI();
//     if (!api) { console.warn("SCORM API not found."); return false; }
//     return api.LMSInitialize("") === "true";
//   }

//   function setValue(key, value) {
//     var api = getAPI();
//     if (!api) return false;
//     return api.LMSSetValue(key, value) === "true";
//   }

//   function getValue(key) {
//     var api = getAPI();
//     if (!api) return "";
//     return api.LMSGetValue(key);
//   }

//   function commit() {
//     var api = getAPI();
//     if (!api) return false;
//     return api.LMSCommit("") === "true";
//   }

//   function terminate() {
//     var api = getAPI();
//     if (!api) return false;
//     return api.LMSFinish("") === "true";
//   }

//   return { initialize: initialize, setValue: setValue, getValue: getValue, commit: commit, terminate: terminate };
// })();`;

// const STYLE_CSS = `body { font-family: -apple-system, "Segoe UI", sans-serif; background: #f7f8fa; margin: 0; color: #0f1b3d; }
// .lesson-wrap { max-width: 720px; margin: 0 auto; padding: 24px; }
// h1 { font-size: 22px; margin-bottom: 16px; }
// video { width: 100%; border-radius: 12px; background: #000; }
// .lesson-content { margin: 20px 0; line-height: 1.6; font-size: 14px; }
// .quiz-section { margin-top: 32px; padding: 20px; background: #fff; border-radius: 16px; }
// .quiz-question { margin-bottom: 20px; }
// .quiz-question-text { font-weight: bold; margin-bottom: 8px; }
// .quiz-choice { display: block; padding: 8px 0; font-size: 14px; }
// #submit-quiz-btn { background: #ff5a3c; color: white; border: none; padding: 12px 24px; border-radius: 999px; font-weight: bold; cursor: pointer; }
// .quiz-result { margin-top: 12px; font-weight: bold; }`;

// export async function POST(request: NextRequest): Promise<NextResponse> {
//   const supabase = await createClient();

//   const {
//     data: { user },
//   } = await supabase.auth.getUser();

//   if (!user) {
//     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//   }

//   const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
//   if (profile?.role !== "admin") {
//     return NextResponse.json({ error: "Forbidden" }, { status: 403 });
//   }

//   const { draftId } = (await request.json()) as { draftId: string };

//   const { data: draft, error: draftError } = await supabase
//     .from("lesson_drafts")
//     .select("id, course_id, title, video_url, content_html, status")
//     .eq("id", draftId)
//     .single();

//   if (draftError || !draft) {
//     return NextResponse.json({ error: "Draft not found" }, { status: 404 });
//   }

//   const { data: questions, error: questionsError } = await supabase
//     .from("quiz_questions")
//     .select("id, question_text, order_index, quiz_choices(choice_text, is_correct, order_index)")
//     .eq("lesson_draft_id", draftId)
//     .order("order_index", { ascending: true });

//   if (questionsError) {
//     console.error("Failed to fetch questions:", questionsError.message);
//     return NextResponse.json({ error: "Failed to fetch quiz data" }, { status: 500 });
//   }

//   const typedDraft = draft as LessonDraftRow;
//   const typedQuestions = (questions ?? []) as unknown as QuizQuestionRow[];

//   // 1. เจนไฟล์ทั้งหมดในหน่วยความจำ
//   const manifestXml = buildManifestXml(typedDraft);
//   const playerJs = buildPlayerJs(typedDraft, typedQuestions);

//   // 2. zip ผ่าน stream แล้วรวบเป็น Buffer
//   const zipBuffer: Buffer = await new Promise((resolve, reject) => {
//     const archive = archiver("zip", { zlib: { level: 9 } });
//     const chunks: Buffer[] = [];
//     const passthrough = new PassThrough();

//     passthrough.on("data", (chunk) => chunks.push(chunk));
//     passthrough.on("end", () => resolve(Buffer.concat(chunks)));
//     archive.on("error", (err: Error) => reject(err));

//     archive.pipe(passthrough);

//     archive.append(manifestXml, { name: "imsmanifest.xml" });
//     archive.append(INDEX_HTML, { name: "index.html" });
//     archive.append(SCORM_API_JS, { name: "scorm-api.js" });
//     archive.append(playerJs, { name: "player.js" });
//     archive.append(STYLE_CSS, { name: "style.css" });

//     archive.finalize();
//   });

//   // 3. อัปโหลดเข้า Supabase Storage
//   const filePath = `${typedDraft.course_id}/${typedDraft.id}-${Date.now()}.zip`;

//   const { error: uploadError } = await supabase.storage
//     .from("scorm-packages")
//     .upload(filePath, zipBuffer, { contentType: "application/zip" });

//   if (uploadError) {
//     console.error("Failed to upload SCORM package:", uploadError.message);
//     return NextResponse.json({ error: "Failed to upload package" }, { status: 500 });
//   }

//   const {
//     data: { publicUrl },
//   } = supabase.storage.from("scorm-packages").getPublicUrl(filePath);

//   // 4. บันทึก record ใน scorm_packages
//   const { error: insertError } = await supabase.from("scorm_packages").insert({
//     lesson_id: null, // ยังไม่ link กับ lessons จนกว่าแอดมินจะ approve จริง
//     package_url: publicUrl,
//     version: "1.2",
//   });

//   if (insertError) {
//     console.error("Failed to record SCORM package:", insertError.message);
//   }

//   return NextResponse.json({ packageUrl: publicUrl });
// }
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { PassThrough } from "stream";

interface QuizChoiceRow {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface QuizQuestionRow {
  id: string;
  question_text: string;
  order_index: number;
  quiz_choices: QuizChoiceRow[];
}

interface LessonDraftRow {
  id: string;
  course_id: string;
  title: string;
  video_url: string | null;
  content_html: string | null;
  status: string;
}

function buildPlayerJs(draft: LessonDraftRow, questions: QuizQuestionRow[]): string {
  const lessonData = {
    title: draft.title,
    videoUrl: draft.video_url ?? "",
    contentHtml: draft.content_html ?? "",
    questions: questions.map((q) => ({
      questionText: q.question_text,
      choices: q.quiz_choices
        .sort((a, b) => a.order_index - b.order_index)
        .map((c) => ({ text: c.choice_text, isCorrect: c.is_correct })),
    })),
  };

  return `var LESSON_DATA = ${JSON.stringify(lessonData)};

var quizAnswered = false;
var quizScore = 0;

function renderLesson() {
  document.getElementById("lesson-title").textContent = LESSON_DATA.title;
  document.getElementById("lesson-video").src = LESSON_DATA.videoUrl;
  document.getElementById("lesson-content").innerHTML = LESSON_DATA.contentHtml;
  renderQuiz();
}

function renderQuiz() {
  var container = document.getElementById("quiz-container");
  container.innerHTML = "";

  LESSON_DATA.questions.forEach(function (q, qIndex) {
    var qDiv = document.createElement("div");
    qDiv.className = "quiz-question";

    var qTitle = document.createElement("p");
    qTitle.className = "quiz-question-text";
    qTitle.textContent = (qIndex + 1) + ". " + q.questionText;
    qDiv.appendChild(qTitle);

    q.choices.forEach(function (c, cIndex) {
      var label = document.createElement("label");
      label.className = "quiz-choice";

      var input = document.createElement("input");
      input.type = "radio";
      input.name = "question-" + qIndex;
      input.value = cIndex;
      input.dataset.correct = c.isCorrect;

      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + c.text));
      qDiv.appendChild(label);
    });

    container.appendChild(qDiv);
  });
}

function submitQuiz() {
  var total = LESSON_DATA.questions.length;
  var correct = 0;

  LESSON_DATA.questions.forEach(function (q, qIndex) {
    var selected = document.querySelector('input[name="question-' + qIndex + '"]:checked');
    if (selected && selected.dataset.correct === "true") {
      correct++;
    }
  });

  quizScore = total > 0 ? Math.round((correct / total) * 100) : 0;
  quizAnswered = true;

  document.getElementById("quiz-result").textContent =
    "คุณได้คะแนน " + correct + "/" + total + " (" + quizScore + "%)";

  ScormAPI.setValue("cmi.core.score.raw", String(quizScore));
  ScormAPI.setValue("cmi.core.lesson_status", quizScore >= 60 ? "passed" : "failed");
  ScormAPI.commit();
}

window.addEventListener("load", function () {
  ScormAPI.initialize();
  ScormAPI.setValue("cmi.core.lesson_status", "incomplete");
  renderLesson();
  document.getElementById("submit-quiz-btn").addEventListener("click", submitQuiz);
});

window.addEventListener("beforeunload", function () {
  ScormAPI.commit();
  ScormAPI.terminate();
});
`;
}

function buildManifestXml(draft: LessonDraftRow): string {
  const identifier = `COM.INTERACTEDU.${draft.id.replace(/-/g, "").toUpperCase()}`;
  const escapedTitle = draft.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
      <item identifier="ITEM-${draft.id}" identifierref="RES-${draft.id}">
        <title>${escapedTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-${draft.id}" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html" />
      <file href="scorm-api.js" />
      <file href="player.js" />
      <file href="style.css" />
    </resource>
  </resources>
</manifest>`;
}

const INDEX_HTML = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>Lesson</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="lesson-wrap">
    <h1 id="lesson-title"></h1>
    <video id="lesson-video" controls></video>
    <div id="lesson-content" class="lesson-content"></div>
    <div class="quiz-section">
      <h2>แบบทดสอบท้ายบท</h2>
      <div id="quiz-container"></div>
      <button id="submit-quiz-btn">ส่งคำตอบ</button>
      <p id="quiz-result" class="quiz-result"></p>
    </div>
  </div>
  <script src="scorm-api.js"></script>
  <script src="player.js"></script>
</body>
</html>`;

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

const STYLE_CSS = `body { font-family: -apple-system, "Segoe UI", sans-serif; background: #f7f8fa; margin: 0; color: #0f1b3d; }
.lesson-wrap { max-width: 720px; margin: 0 auto; padding: 24px; }
h1 { font-size: 22px; margin-bottom: 16px; }
video { width: 100%; border-radius: 12px; background: #000; }
.lesson-content { margin: 20px 0; line-height: 1.6; font-size: 14px; }
.quiz-section { margin-top: 32px; padding: 20px; background: #fff; border-radius: 16px; }
.quiz-question { margin-bottom: 20px; }
.quiz-question-text { font-weight: bold; margin-bottom: 8px; }
.quiz-choice { display: block; padding: 8px 0; font-size: 14px; }
#submit-quiz-btn { background: #ff5a3c; color: white; border: none; padding: 12px 24px; border-radius: 999px; font-weight: bold; cursor: pointer; }
.quiz-result { margin-top: 12px; font-weight: bold; }`;

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("🚀 [SCORM Generate API] Start processing...");

  // 1. Check Authentication
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error("❌ [SCORM Generate API] Auth Failed:", authError?.message);
    return NextResponse.json({ error: "Unauthorized: กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  }

  // 2. Check Admin Role
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") {
    console.error("❌ [SCORM Generate API] Role Forbidden for user:", user.id);
    return NextResponse.json({ error: "Forbidden: ต้องใช้สิทธิ์ Admin เท่านั้น" }, { status: 403 });
  }

  // 3. Parse Draft ID
  const { draftId } = (await request.json()) as { draftId: string };
  if (!draftId) {
    return NextResponse.json({ error: "Bad Request: ไม่ได้ส่ง draftId มา" }, { status: 400 });
  }

  // 4. Fetch Draft Data
  const { data: draft, error: draftError } = await supabase
    .from("lesson_drafts")
    .select("id, course_id, title, video_url, content_html, status")
    .eq("id", draftId)
    .single();

  if (draftError || !draft) {
    console.error("❌ [SCORM Generate API] Draft Fetch Error:", draftError?.message);
    return NextResponse.json({ error: `Draft not found: ไม่พบข้อมูลร่างบทเรียน ID ${draftId}` }, { status: 404 });
  }

  // 5. Fetch Quiz Questions Data
  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, question_text, order_index, quiz_choices(choice_text, is_correct, order_index)")
    .eq("lesson_draft_id", draftId)
    .order("order_index", { ascending: true });

  if (questionsError) {
    console.error("❌ [SCORM Generate API] Questions Fetch Error:", questionsError.message);
    return NextResponse.json({ error: `Failed to fetch quiz data: ${questionsError.message}` }, { status: 500 });
  }

  const typedDraft = draft as LessonDraftRow;
  const typedQuestions = (questions ?? []) as unknown as QuizQuestionRow[];

  // ⚡ 6. Dynamic Import 'archiver' แบบปลอดภัยรองรับทั้ง Webpack และ Turbopack
  console.log("📦 [SCORM Generate API] Bundling ZIP package with Archiver...");
  
  let archiverFn: any;
  try {
    const archiverModule = await import("archiver");
    const rawArchiver = (archiverModule as any).default || archiverModule;
    archiverFn = typeof rawArchiver === "function" ? rawArchiver : rawArchiver.default;

    if (typeof archiverFn !== "function") {
      throw new Error("Cannot resolve archiver module into a callable function");
    }
  } catch (importErr: any) {
    console.error("❌ [SCORM Generate API] Module Import Error:", importErr?.message);
    return NextResponse.json({ error: `Archiver Module Import Failed: ${importErr?.message}` }, { status: 500 });
  }

  const manifestXml = buildManifestXml(typedDraft);
  const playerJs = buildPlayerJs(typedDraft, typedQuestions);

  let zipBuffer: Buffer;
  try {
    zipBuffer = await new Promise((resolve, reject) => {
      const archive = archiverFn("zip", { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      const passthrough = new PassThrough();

      passthrough.on("data", (chunk) => chunks.push(chunk));
      passthrough.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", (err: Error) => reject(err));

      archive.pipe(passthrough);
      archive.append(manifestXml, { name: "imsmanifest.xml" });
      archive.append(INDEX_HTML, { name: "index.html" });
      archive.append(SCORM_API_JS, { name: "scorm-api.js" });
      archive.append(playerJs, { name: "player.js" });
      archive.append(STYLE_CSS, { name: "style.css" });
      archive.finalize();
    });
  } catch (zipErr: any) {
    console.error("❌ [SCORM Generate API] ZIP Archiver Error:", zipErr?.message);
    return NextResponse.json({ error: `ZIP Generation Failed: ${zipErr?.message}` }, { status: 500 });
  }

  // 7. Upload to Supabase Storage
  console.log("☁️ [SCORM Generate API] Uploading ZIP to Supabase Storage...");
  const filePath = `${typedDraft.course_id}/${typedDraft.id}-${Date.now()}.zip`;

  const { error: uploadError } = await supabase.storage
    .from("scorm-packages")
    .upload(filePath, zipBuffer, { contentType: "application/zip" });

  if (uploadError) {
    console.error("❌ [SCORM Generate API] Supabase Storage Upload Error:", uploadError.message);
    return NextResponse.json(
      { error: `Storage Upload Failed (เช็คการตั้งค่า Bucket 'scorm-packages'): ${uploadError.message}` },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("scorm-packages").getPublicUrl(filePath);

  // 8. Insert record to DB
  console.log("📝 [SCORM Generate API] Recording to scorm_packages table...");
  const { error: insertError } = await supabase.from("scorm_packages").insert({
    lesson_id: null,
    package_url: publicUrl,
    version: "1.2",
  });

  if (insertError) {
    console.error("⚠️ [SCORM Generate API] Database Record Error:", insertError.message);
    return NextResponse.json(
      { error: `Package generated but DB record failed: ${insertError.message}`, packageUrl: publicUrl },
      { status: 500 }
    );
  }

  console.log("✅ [SCORM Generate API] Success! Package URL:", publicUrl);
  return NextResponse.json({ success: true, packageUrl: publicUrl });
}