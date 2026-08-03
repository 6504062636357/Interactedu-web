// // import type { SupabaseClient } from "@supabase/supabase-js";
// // import { PassThrough } from "stream";
// // import "server-only"; // ป้องกันไม่ให้โค้ดไฟล์นี้หลุดไปฝั่ง Client แน่นอน

// // interface QuizChoiceRow {
// //   choice_text: string;
// //   is_correct: boolean;
// //   order_index: number;
// // }

// // interface QuizQuestionRow {
// //   id: string;
// //   question_text: string;
// //   order_index: number;
// //   quiz_choices: QuizChoiceRow[];
// // }

// // interface LessonInfo {
// //   id: string;
// //   course_id: string;
// //   title: string;
// // }

// // interface LessonDraftRow {
// //   id: string;
// //   video_url: string | null;
// //   content_html: string | null;
// //   status: string;
// //   lessons: LessonInfo;
// // }

// // function buildPlayerJs(draft: LessonDraftRow, questions: QuizQuestionRow[]): string {
// //   const lessonData = {
// //     title: draft.lessons.title,
// //     videoUrl: draft.video_url ?? "",
// //     contentHtml: draft.content_html ?? "",
// //     questions: questions.map((q) => ({
// //       questionText: q.question_text,
// //       choices: q.quiz_choices
// //         .sort((a, b) => a.order_index - b.order_index)
// //         .map((c) => ({ text: c.choice_text, isCorrect: c.is_correct })),
// //     })),
// //   };

// //   return `var LESSON_DATA = ${JSON.stringify(lessonData)};

// // var quizAnswered = false;
// // var quizScore = 0;

// // function renderLesson() {
// //   document.getElementById("lesson-title").textContent = LESSON_DATA.title;
// //   document.getElementById("lesson-video").src = LESSON_DATA.videoUrl;
// //   document.getElementById("lesson-content").innerHTML = LESSON_DATA.contentHtml;
// //   renderQuiz();
// // }

// // function renderQuiz() {
// //   var container = document.getElementById("quiz-container");
// //   container.innerHTML = "";

// //   LESSON_DATA.questions.forEach(function (q, qIndex) {
// //     var qDiv = document.createElement("div");
// //     qDiv.className = "quiz-question";

// //     var qTitle = document.createElement("p");
// //     qTitle.className = "quiz-question-text";
// //     qTitle.textContent = (qIndex + 1) + ". " + q.questionText;
// //     qDiv.appendChild(qTitle);

// //     q.choices.forEach(function (c, cIndex) {
// //       var label = document.createElement("label");
// //       label.className = "quiz-choice";

// //       var input = document.createElement("input");
// //       input.type = "radio";
// //       input.name = "question-" + qIndex;
// //       input.value = cIndex;
// //       input.dataset.correct = c.isCorrect;

// //       label.appendChild(input);
// //       label.appendChild(document.createTextNode(" " + c.text));
// //       qDiv.appendChild(label);
// //     });

// //     container.appendChild(qDiv);
// //   });
// // }

// // function submitQuiz() {
// //   var total = LESSON_DATA.questions.length;
// //   var correct = 0;

// //   LESSON_DATA.questions.forEach(function (q, qIndex) {
// //     var selected = document.querySelector('input[name="question-' + qIndex + '"]:checked');
// //     if (selected && selected.dataset.correct === "true") {
// //       correct++;
// //     }
// //   });

// //   quizScore = total > 0 ? Math.round((correct / total) * 100) : 0;
// //   quizAnswered = true;

// //   document.getElementById("quiz-result").textContent =
// //     "คุณได้คะแนน " + correct + "/" + total + " (" + quizScore + "%)";

// //   ScormAPI.setValue("cmi.core.score.raw", String(quizScore));
// //   ScormAPI.setValue("cmi.core.lesson_status", quizScore >= 60 ? "passed" : "failed");
// //   ScormAPI.commit();
// // }

// // window.addEventListener("load", function () {
// //   ScormAPI.initialize();
// //   ScormAPI.setValue("cmi.core.lesson_status", "incomplete");
// //   renderLesson();
// //   document.getElementById("submit-quiz-btn").addEventListener("click", submitQuiz);
// // });

// // window.addEventListener("beforeunload", function () {
// //   ScormAPI.commit();
// //   ScormAPI.terminate();
// // });
// // `;
// // }

// // function buildManifestXml(draft: LessonDraftRow): string {
// //   const identifier = `COM.INTERACTEDU.${draft.id.replace(/-/g, "").toUpperCase()}`;
// //   const escapedTitle = draft.lessons.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// //   return `<?xml version="1.0" standalone="no" ?>
// // <manifest identifier="${identifier}" version="1"
// //   xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
// //   xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
// //   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
// //   xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
// //                        http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
// //                        http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
// //   <metadata>
// //     <schema>ADL SCORM</schema>
// //     <schemaversion>1.2</schemaversion>
// //   </metadata>
// //   <organizations default="ORG-${draft.id}">
// //     <organization identifier="ORG-${draft.id}">
// //       <title>${escapedTitle}</title>
// //       <item identifier="ITEM-${draft.id}" identifierref="RES-${draft.id}">
// //         <title>${escapedTitle}</title>
// //       </item>
// //     </organization>
// //   </organizations>
// //   <resources>
// //     <resource identifier="RES-${draft.id}" type="webcontent" adlcp:scormtype="sco" href="index.html">
// //       <file href="index.html" />
// //       <file href="scorm-api.js" />
// //       <file href="player.js" />
// //       <file href="style.css" />
// //     </resource>
// //   </resources>
// // </manifest>`;
// // }

// // const INDEX_HTML = `<!DOCTYPE html>
// // <html lang="th">
// // <head>
// //   <meta charset="UTF-8" />
// //   <title>Lesson</title>
// //   <link rel="stylesheet" href="style.css" />
// // </head>
// // <body>
// //   <div class="lesson-wrap">
// //     <h1 id="lesson-title"></h1>
// //     <video id="lesson-video" controls></video>
// //     <div id="lesson-content" class="lesson-content"></div>
// //     <div class="quiz-section">
// //       <h2>แบบทดสอบท้ายบท</h2>
// //       <div id="quiz-container"></div>
// //       <button id="submit-quiz-btn">ส่งคำตอบ</button>
// //       <p id="quiz-result" class="quiz-result"></p>
// //     </div>
// //   </div>
// //   <script src="scorm-api.js"></script>
// //   <script src="player.js"></script>
// // </body>
// // </html>`;

// // const SCORM_API_JS = `var ScormAPI = (function () {
// //   var apiHandle = null;
// //   var findAttemptLimit = 500;

// //   function scanForAPI(win) {
// //     var attempts = 0;
// //     while (win.API == null && win.parent != null && win.parent !== win && attempts < findAttemptLimit) {
// //       attempts++;
// //       win = win.parent;
// //     }
// //     return win.API || null;
// //   }

// //   function findAPI() {
// //     var theAPI = null;
// //     if (window.parent != null && window.parent !== window) {
// //       theAPI = scanForAPI(window.parent);
// //     }
// //     if (theAPI == null && window.opener != null) {
// //       theAPI = scanForAPI(window.opener);
// //     }
// //     return theAPI;
// //   }

// //   function getAPI() {
// //     if (apiHandle == null) apiHandle = findAPI();
// //     return apiHandle;
// //   }

// //   function initialize() {
// //     var api = getAPI();
// //     if (!api) { console.warn("SCORM API not found."); return false; }
// //     return api.LMSInitialize("") === "true";
// //   }

// //   function setValue(key, value) {
// //     var api = getAPI();
// //     if (!api) return false;
// //     return api.LMSSetValue(key, value) === "true";
// //   }

// //   function getValue(key) {
// //     var api = getAPI();
// //     if (!api) return "";
// //     return api.LMSGetValue(key);
// //   }

// //   function commit() {
// //     var api = getAPI();
// //     if (!api) return false;
// //     return api.LMSCommit("") === "true";
// //   }

// //   function terminate() {
// //     var api = getAPI();
// //     if (!api) return false;
// //     return api.LMSFinish("") === "true";
// //   }

// //   return { initialize: initialize, setValue: setValue, getValue: getValue, commit: commit, terminate: terminate };
// // })();`;

// // const STYLE_CSS = `body { font-family: -apple-system, "Segoe UI", sans-serif; background: #f7f8fa; margin: 0; color: #0f1b3d; }
// // .lesson-wrap { max-width: 720px; margin: 0 auto; padding: 24px; }
// // h1 { font-size: 22px; margin-bottom: 16px; }
// // video { width: 100%; border-radius: 12px; background: #000; }
// // .lesson-content { margin: 20px 0; line-height: 1.6; font-size: 14px; }
// // .quiz-section { margin-top: 32px; padding: 20px; background: #fff; border-radius: 16px; }
// // .quiz-question { margin-bottom: 20px; }
// // .quiz-question-text { font-weight: bold; margin-bottom: 8px; }
// // .quiz-choice { display: block; padding: 8px 0; font-size: 14px; }
// // #submit-quiz-btn { background: #ff5a3c; color: white; border: none; padding: 12px 24px; border-radius: 999px; font-weight: bold; cursor: pointer; }
// // .quiz-result { margin-top: 12px; font-weight: bold; }`;

// // export async function generateScormPackage(
// //   // eslint-disable-next-line @typescript-eslint/no-explicit-any
// //   supabase: SupabaseClient<any>,
// //   draftId: string,
// //   lessonId: string
// // ): Promise<{ packageUrl: string } | { error: string }> {
// //   // ⚡ DYNAMIC IMPORTS: โหลดเฉพาะตอนที่ฟังก์ชันถูกเรียกใช้จริงเท่านั้น
// //  const [archiverModule, { PutObjectCommand }, { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL }] =
// //     await Promise.all([
// //       import("archiver"),
// //       import("@aws-sdk/client-s3"),
// //       import("@/lib/r2"),
// //     ]);

// //   // ใส่ (archiverModule as any) ตรงนี้เพื่อแก้ TS2339
// //   const archiverFn = ((archiverModule as any).default || archiverModule) as unknown as (
// //     format: string,
// //     options?: import("archiver").ArchiverOptions
// //   ) => import("archiver").Archiver;

// //   const { data: draft, error: draftError } = await supabase
// //     .from("lesson_drafts")
// //     .select("id, video_url, content_html, status, lessons(id, course_id, title)")
// //     .eq("id", draftId)
// //     .single();

// //   if (draftError || !draft || !draft.lessons) {
// //     console.error("[generateScormPackage] draft fetch failed", draftError);
// //     return { error: "Draft not found" };
// //   }

// //   const { data: questions, error: questionsError } = await supabase
// //     .from("quiz_questions")
// //     .select("id, question_text, order_index, quiz_choices(choice_text, is_correct, order_index)")
// //     .eq("lesson_draft_id", draftId)
// //     .order("order_index", { ascending: true });

// //   if (questionsError) {
// //     return { error: "Failed to fetch quiz data" };
// //   }

// //   const typedDraft = draft as unknown as LessonDraftRow;
// //   const typedQuestions = (questions ?? []) as unknown as QuizQuestionRow[];

// //   const courseId = typedDraft.lessons.course_id;

// //   const manifestXml = buildManifestXml(typedDraft);
// //   const playerJs = buildPlayerJs(typedDraft, typedQuestions);

// //   const zipBuffer: Buffer = await new Promise((resolve, reject) => {
// //     const archive = archiverFn("zip", { zlib: { level: 9 } });
// //     const chunks: Buffer[] = [];
// //     const passthrough = new PassThrough();

// //     passthrough.on("data", (chunk) => chunks.push(chunk));
// //     passthrough.on("end", () => resolve(Buffer.concat(chunks)));
// //     archive.on("error", (err: Error) => reject(err));
// //     archive.pipe(passthrough);
// //     archive.append(manifestXml, { name: "imsmanifest.xml" });
// //     archive.append(INDEX_HTML, { name: "index.html" });
// //     archive.append(SCORM_API_JS, { name: "scorm-api.js" });
// //     archive.append(playerJs, { name: "player.js" });
// //     archive.append(STYLE_CSS, { name: "style.css" });
// //     archive.finalize();
// //   });

// //   const key = `scorm-packages/${courseId}/${lessonId}/package.zip`;

// //   try {
// //     await r2Client.send(
// //       new PutObjectCommand({
// //         Bucket: R2_BUCKET_NAME,
// //         Key: key,
// //         Body: zipBuffer,
// //         ContentType: "application/zip",
// //       })
// //     );
// //   } catch (err) {
// //     console.error("Failed to upload SCORM package to R2:", err);
// //     return { error: "Failed to upload package" };
// //   }

// //   const packageUrl = `${R2_PUBLIC_URL}/${key}`;

// //   const { error: insertError } = await supabase
// //     .from("scorm_packages")
// //     .upsert(
// //       {
// //         lesson_draft_id: typedDraft.id,
// //         lesson_id: lessonId,
// //         package_url: packageUrl,
// //         version: "1.2",
// //       },
// //       { onConflict: "lesson_id" }
// //     );

// //   if (insertError) {
// //     console.error("Failed to record SCORM package:", insertError.message);
// //     return { error: "Failed to save package record" };
// //   }

// //   return { packageUrl };
// // }

// import type { SupabaseClient } from "@supabase/supabase-js";
// import { PassThrough } from "stream";
// import "server-only";

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

// interface LessonInfo {
//   id: string;
//   course_id: string;
//   title: string;
// }

// interface LessonDraftRow {
//   id: string;
//   video_url: string | null;
//   content_html: string | null;
//   status: string;
//   lessons: LessonInfo;
// }

// function buildPlayerJs(draft: LessonDraftRow, questions: QuizQuestionRow[]): string {
//   const lessonData = {
//     title: draft.lessons.title,
//     videoUrl: draft.video_url ?? "",
//     contentHtml: draft.content_html ?? "",
//     questions: questions.map((q) => ({
//       questionText: q.question_text,
//       choices: q.quiz_choices
//         .sort((a, b) => a.order_index - b.order_index)
//         .map((c) => ({ text: c.choice_text, isCorrect: c.is_correct })),
//     })),
//   };

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
//   const escapedTitle = draft.lessons.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

// export async function generateScormPackage(
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   supabase: SupabaseClient<any>,
//   draftId: string,
//   lessonId: string
// ): Promise<{ packageUrl: string } | { error: string }> {
//   // ⚡ 1. โหลด AWS SDK และ R2 Config แบบ Dynamic Import
//   const [{ PutObjectCommand }, { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL }] =
//     await Promise.all([
//       import("@aws-sdk/client-s3"),
//       import("@/lib/r2"),
//     ]);

//   // 🛠️ 2. โหลด archiver (เมื่อตั้ง serverExternalPackages แล้ว จะโหลดเป็น Native Node Module ได้สมบูรณ์ 100%)
//   let archiverFn: any;
//   try {
//     const archiverModule = await import("archiver");
//     const mod = archiverModule as any;
//     archiverFn =
//       (typeof mod === "function" ? mod : null) ||
//       (typeof mod?.default === "function" ? mod.default : null) ||
//       (typeof mod?.create === "function" ? mod.create : null) ||
//       (typeof mod?.default?.create === "function" ? mod.default.create : null);
//   } catch (e) {
//     console.error("[generateScormPackage] Error importing archiver:", e);
//   }

//   if (typeof archiverFn !== "function") {
//     try {
//       const raw = require("archiver");
//       archiverFn = typeof raw === "function" ? raw : raw?.default || raw?.create;
//     } catch {}
//   }

//   if (typeof archiverFn !== "function") {
//     console.error("[generateScormPackage] Failed to resolve archiver. Check serverExternalPackages in next.config.");
//     return { error: "Failed to initialize SCORM archiver module" };
//   }

//   // 3. ดึงข้อมูล Draft บทเรียน
//   const { data: draft, error: draftError } = await supabase
//     .from("lesson_drafts")
//     .select("id, video_url, content_html, status, lessons(id, course_id, title)")
//     .eq("id", draftId)
//     .single();

//   if (draftError || !draft || !draft.lessons) {
//     console.error("[generateScormPackage] draft fetch failed:", draftError);
//     return { error: "Draft not found" };
//   }

//   // 4. ดึงข้อมูลแบบทดสอบท้ายบท
//   const { data: questions, error: questionsError } = await supabase
//     .from("quiz_questions")
//     .select("id, question_text, order_index, quiz_choices(choice_text, is_correct, order_index)")
//     .eq("lesson_draft_id", draftId)
//     .order("order_index", { ascending: true });

//   if (questionsError) {
//     console.error("[generateScormPackage] quiz questions fetch failed:", questionsError);
//     return { error: "Failed to fetch quiz data" };
//   }

//   const typedDraft = draft as unknown as LessonDraftRow;
//   const typedQuestions = (questions ?? []) as unknown as QuizQuestionRow[];

//   const courseId = typedDraft.lessons.course_id;

//   const manifestXml = buildManifestXml(typedDraft);
//   const playerJs = buildPlayerJs(typedDraft, typedQuestions);

//   // 5. บีบอัดไฟล์ทั้งหมดเป็น ZIP Buffer ในหน่วยความจำ
//   let zipBuffer: Buffer;
//   try {
//     zipBuffer = await new Promise((resolve, reject) => {
//       const archive = archiverFn("zip", { zlib: { level: 9 } });
//       const chunks: Buffer[] = [];
//       const passthrough = new PassThrough();

//       passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));
//       passthrough.on("end", () => resolve(Buffer.concat(chunks)));
//       archive.on("error", (err: Error) => reject(err));

//       archive.pipe(passthrough);
//       archive.append(manifestXml, { name: "imsmanifest.xml" });
//       archive.append(INDEX_HTML, { name: "index.html" });
//       archive.append(SCORM_API_JS, { name: "scorm-api.js" });
//       archive.append(playerJs, { name: "player.js" });
//       archive.append(STYLE_CSS, { name: "style.css" });
//       archive.finalize();
//     });
//   } catch (err: any) {
//     console.error("[generateScormPackage] ZIP creation failed:", err);
//     return { error: `Failed to generate ZIP package: ${err?.message || err}` };
//   }

//   // 6. อัปโหลดไฟล์ ZIP เข้า Cloudflare R2
//   const key = `scorm-packages/${courseId}/${lessonId}/package.zip`;

//   try {
//     await r2Client.send(
//       new PutObjectCommand({
//         Bucket: R2_BUCKET_NAME,
//         Key: key,
//         Body: zipBuffer,
//         ContentType: "application/zip",
//       })
//     );
//   } catch (err: any) {
//     console.error("[generateScormPackage] Failed to upload SCORM package to R2:", err);
//     return { error: "Failed to upload package to storage" };
//   }

//   const packageUrl = `${R2_PUBLIC_URL}/${key}`;

//   // 7. บันทึก / อัปเดตข้อมูลลง Supabase
//   const { error: insertError } = await supabase
//     .from("scorm_packages")
//     .upsert(
//       {
//         lesson_draft_id: typedDraft.id,
//         lesson_id: lessonId,
//         package_url: packageUrl,
//         version: "1.2",
//       },
//       { onConflict: "lesson_id" }
//     );

//   if (insertError) {
//     console.error("[generateScormPackage] Failed to record SCORM package:", insertError.message);
//     return { error: "Failed to save package record" };
//   }

//   console.log("✅ SCORM Package Generated & Uploaded Successfully!", packageUrl);
//   return { packageUrl };
// }

import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import "server-only";

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

interface QuizChoiceRow {
  choice_text: string;
  is_correct: boolean;
  order_index: number;
}

interface QuizQuestionRow {
  id: string;
  question_text: string;
  order_index: number;
  video_timestamp_seconds: number | null;
  explanation: string | null;
  quiz_choices: QuizChoiceRow[];
}

interface LessonInfo {
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

// ============================================================
// LESSON SCO (วิดีโอ + เนื้อหา) — ไม่มีควิซแล้ว
// ============================================================

// function buildLessonPlayerJs(draft: LessonDraftRow): string {
//   const lessonData = {
//     title: draft.lessons.title,
//     videoUrl: draft.video_url ?? "",
//     contentHtml: draft.content_html ?? "",
//   };

//   return `var LESSON_DATA = ${JSON.stringify(lessonData)};

// function renderLesson() {
//   document.getElementById("lesson-title").textContent = LESSON_DATA.title;
//   document.getElementById("lesson-video").src = LESSON_DATA.videoUrl;
//   document.getElementById("lesson-content").innerHTML = LESSON_DATA.contentHtml;
// }

// window.addEventListener("load", function () {
//   ScormAPI.initialize();
//   ScormAPI.setValue("cmi.core.lesson_status", "incomplete");
//   renderLesson();

//   var video = document.getElementById("lesson-video");
//   if (video) {
//     // ดูวิดีโอจบ = ถือว่าเรียนบทนี้เสร็จ (ไม่เกี่ยวกับควิซ ซึ่งเป็นคนละ SCO แล้ว)
//     video.addEventListener("ended", function () {
//       ScormAPI.setValue("cmi.core.lesson_status", "completed");
//       ScormAPI.commit();
//     });
//   }
// });

// window.addEventListener("beforeunload", function () {
//   ScormAPI.commit();
//   ScormAPI.terminate();
// });
// `;
// }
function buildLessonPlayerJs(
  draft: LessonDraftRow,
  lessonId: string,
  videoQuizQuestions: QuizQuestionRow[]
): string {
  const lessonData = {
    lessonId,
    title: draft.lessons.title,
    videoUrl: draft.video_url ?? "",
    contentHtml: draft.content_html ?? "",
    quizzes: videoQuizQuestions
      .slice()
      .sort((a, b) => (a.video_timestamp_seconds ?? 0) - (b.video_timestamp_seconds ?? 0))
      .map((q) => ({
        id: q.id,
        timestampSeconds: q.video_timestamp_seconds,
        questionText: q.question_text,
        choices: q.quiz_choices.sort((a, b) => a.order_index - b.order_index).map((c) => c.choice_text),
      })),
  };

  return `var LESSON_DATA = ${JSON.stringify(lessonData)};

var REQUIRE_CORRECT_ANSWER = false;
var answeredQuestionIds = {};
var pendingQuestion = null;
var savePositionTimer = null;
var lastSavedPosition = 0;

function apiUrl(path) { return path; }

function fetchJson(url, options) {
  return fetch(apiUrl(url), Object.assign({ credentials: "include" }, options || {}))
    .then(function (res) { if (!res.ok) throw new Error("Request failed: " + url); return res.json(); });
}

function loadInitialAttempts() {
  return fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/video-quiz-attempts")
    .then(function (data) {
      (data.attempts || []).forEach(function (a) { answeredQuestionIds[a.questionId] = true; });
    })
    .catch(function (err) { console.warn("Failed to load quiz attempts", err); });
}

function loadResumePosition() {
  return fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/watch-position")
    .then(function (data) { return data.lastPositionSeconds || 0; })
    .catch(function (err) { console.warn("Failed to load resume position", err); return 0; });
}

function savePosition(seconds) {
  fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/watch-position", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ positionSeconds: seconds }),
  }).catch(function (err) { console.warn("Failed to save position", err); });
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

function renderLesson() {
  document.getElementById("lesson-title").textContent = LESSON_DATA.title;
  document.getElementById("lesson-content").innerHTML = LESSON_DATA.contentHtml;
}

/* ---------------- Quiz modal (เหมือนเดิม) ---------------- */

function openQuizModal(question) {
  pendingQuestion = question;
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

function submitAnswer(question, choiceIndex, choicesWrap) {
  Array.prototype.forEach.call(choicesWrap.children, function (btn) { btn.disabled = true; });

  fetchJson("/api/lessons/" + LESSON_DATA.lessonId + "/video-quiz-attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId: question.id, selectedChoiceIndex: choiceIndex }),
  })
    .then(function (result) {
      answeredQuestionIds[question.id] = true;
      updateMarkerAnswered(question.id);

      var chosenBtn = choicesWrap.children[choiceIndex];
      chosenBtn.classList.add(result.isCorrect ? "correct" : "incorrect");

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
      console.error("Failed to submit answer", err);
      var feedback = document.getElementById("quiz-modal-feedback");
      feedback.innerHTML = "<p class=\\"quiz-modal-error\\">ส่งคำตอบไม่สำเร็จ ลองใหม่อีกครั้ง</p>";
      Array.prototype.forEach.call(choicesWrap.children, function (btn) { btn.disabled = false; });
    });
}

function closeQuizModal() {
  var overlay = document.getElementById("quiz-overlay");
  overlay.classList.remove("open");
  pendingQuestion = null;
  var video = document.getElementById("lesson-video");
  if (video) video.play();
}

/* ---------------- Progress bar + markers ---------------- */

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
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
  video.addEventListener("loadedmetadata", function () {
    updateProgressUI(video);
    renderProgressMarkers(video);
  });
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
        }
      }, 10000);
    }
  });

  video.addEventListener("pause", function () {
    lastSavedPosition = video.currentTime;
    savePosition(video.currentTime);
  });

  video.addEventListener("ended", function () {
    lastSavedPosition = video.currentTime;
    savePosition(video.currentTime);
    ScormAPI.setValue("cmi.core.lesson_status", "completed");
    ScormAPI.commit();
  });

  window.addEventListener("beforeunload", function () {
    savePosition(video.currentTime);
    ScormAPI.commit();
    ScormAPI.terminate();
  });
}

window.addEventListener("load", function () {
  ScormAPI.initialize();
  ScormAPI.setValue("cmi.core.lesson_status", "incomplete");
  renderLesson();

  var video = document.getElementById("lesson-video");
  video.src = LESSON_DATA.videoUrl;
  setupCustomControls(video);

  Promise.all([loadInitialAttempts(), loadResumePosition()]).then(function (results) {
    var resumeSeconds = results[1];

    function proceedAfterMetadata() {
      if (resumeSeconds > 5 && resumeSeconds < video.duration - 2) {
        showResumePrompt(video, resumeSeconds).then(function (seekTo) {
          if (seekTo > 0) video.currentTime = seekTo;
          attachVideoBehavior(video);
        });
      } else {
        attachVideoBehavior(video);
      }
    }

    // readyState >= 1 (HAVE_METADATA) แปลว่า loadedmetadata อาจยิงไปแล้วก่อนที่ Promise.all
    // (ซึ่งต้องรอ network 2 ตัว) จะ resolve เสร็จ — ถ้าแนบ listener ตอนนี้จะไม่มีวันถูกเรียก
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

// const LESSON_HTML = `<!DOCTYPE html>
// <html lang="th">
// <head>
//   <meta charset="UTF-8" />
//   <title>Lesson</title>
//   <link rel="preconnect" href="https://fonts.googleapis.com" />
//   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
//   <link
//     href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap"
//     rel="stylesheet"
//   />
//   <link rel="stylesheet" href="style.css" />
// </head>
// <body>
//   <div class="lesson-wrap">
//     <header class="lesson-header">
//       <h1 id="lesson-title"></h1>
//     </header>
//     <div class="video-wrap">
//       <video id="lesson-video" controls></video>
//     </div>
//     <div id="lesson-content" class="lesson-content"></div>
//   </div>
//   <script src="scorm-api.js"></script>
//   <script src="lesson-player.js"></script>
// </body>
// </html>`;

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
  <div id="quiz-overlay" class="quiz-overlay">
    <div class="quiz-modal">
      <div id="quiz-modal-body"></div>
    </div>
  </div>

  <!-- Resume confirm modal -->
  <div id="resume-overlay" class="quiz-overlay">
    <div class="quiz-modal resume-modal">
      <p class="resume-text">ต้องการเล่นต่อจากนาทีที่ <span id="resume-time-label"></span> หรือไม่?</p>
      <div class="resume-actions">
        <button id="btn-resume-yes" type="button" class="quiz-modal-continue-btn">เล่นต่อ</button>
        <button id="btn-resume-no" type="button" class="quiz-modal-choice-btn">เริ่มใหม่ตั้งแต่ต้น</button>
      </div>
    </div>
  </div>

  <script src="scorm-api.js"></script>
  <script src="lesson-player.js"></script>
</body>
</html>`;

// ============================================================
// QUIZ SCO (แบบทดสอบอย่างเดียว) — แยกไฟล์ต่างหาก
// ============================================================

// function buildQuizPlayerJs(draft: LessonDraftRow, questions: QuizQuestionRow[]): string {
//   const quizData = {
//     title: draft.lessons.title,
//     questions: questions.map((q) => ({
//       questionText: q.question_text,
//       choices: q.quiz_choices
//         .sort((a, b) => a.order_index - b.order_index)
//         .map((c) => ({ text: c.choice_text, isCorrect: c.is_correct })),
//     })),
//   };
function buildQuizPlayerJs(draft: LessonDraftRow, questions: QuizQuestionRow[]): string {
  const quizData = {
    title: draft.lessons.title,
    questions: questions.map((q) => ({
      questionText: q.question_text,
      explanation: q.explanation ?? null,
      choices: q.quiz_choices
        .sort((a, b) => a.order_index - b.order_index)
        .map((c) => ({ text: c.choice_text, isCorrect: c.is_correct })),
    })),
  };
  return `var QUIZ_DATA = ${JSON.stringify(quizData)};

function renderQuiz() {
  var container = document.getElementById("quiz-container");
  container.innerHTML = "";

  QUIZ_DATA.questions.forEach(function (q, qIndex) {
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
  var total = QUIZ_DATA.questions.length;
  var correct = 0;

  QUIZ_DATA.questions.forEach(function (q, qIndex) {
    var selected = document.querySelector('input[name="question-' + qIndex + '"]:checked');
    var isCorrect = !!(selected && selected.dataset.correct === "true");
    if (isCorrect) correct++;

    // โชว์เฉลย + คำอธิบายต่อข้อ หลังส่งคำตอบ
    var qDiv = document.querySelectorAll(".quiz-question")[qIndex];
    if (qDiv) {
      // ไฮไลต์ตัวเลือกที่ถูก/ที่เลือกผิด
      var labels = qDiv.querySelectorAll(".quiz-choice");
      labels.forEach(function (label) {
        var input = label.querySelector("input");
        if (input.dataset.correct === "true") {
          label.classList.add("choice-correct");
        } else if (input.checked) {
          label.classList.add("choice-incorrect");
        }
        input.disabled = true;
      });

      var feedback = document.createElement("div");
      feedback.className = "quiz-question-feedback " + (isCorrect ? "is-correct" : "is-incorrect");

      var resultLine = document.createElement("p");
      resultLine.className = "quiz-question-result-text";
      resultLine.textContent = isCorrect ? "ตอบถูกต้อง" : "ตอบไม่ถูกต้อง";
      feedback.appendChild(resultLine);

      if (q.explanation) {
        var explanationText = document.createElement("p");
        explanationText.className = "quiz-question-explanation";
        explanationText.textContent = q.explanation;
        feedback.appendChild(explanationText);
      }

      qDiv.appendChild(feedback);
    }
  });

  var score = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById("quiz-result").textContent =
    "คุณได้คะแนน " + correct + "/" + total + " (" + score + "%)";

  document.getElementById("submit-quiz-btn").disabled = true;

  ScormAPI.setValue("cmi.core.score.raw", String(score));
  ScormAPI.setValue("cmi.core.lesson_status", score >= 60 ? "passed" : "failed");
  ScormAPI.commit();
}

window.addEventListener("load", function () {
  ScormAPI.initialize();
  ScormAPI.setValue("cmi.core.lesson_status", "incomplete");
  document.getElementById("quiz-title").textContent = "แบบทดสอบหลังเรียน: " + QUIZ_DATA.title;
  renderQuiz();
  document.getElementById("submit-quiz-btn").addEventListener("click", submitQuiz);
});

window.addEventListener("beforeunload", function () {
  ScormAPI.commit();
  ScormAPI.terminate();
});
`;
}

const QUIZ_HTML = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>Quiz</title>
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
    <div class="quiz-section">
      <h2 id="quiz-title" class="quiz-heading">แบบทดสอบหลังเรียน</h2>
      <div id="quiz-container"></div>
      <button id="submit-quiz-btn">ส่งคำตอบ</button>
      <p id="quiz-result" class="quiz-result"></p>
    </div>
  </div>
  <script src="scorm-api.js"></script>
  <script src="quiz-player.js"></script>
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
}

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

.quiz-modal-continue-btn {
  background: #0F1B3D;
  color: #fff;
  border: none;
  padding: 11px 20px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 13.5px;
  cursor: pointer;
}

.resume-modal { text-align: center; }
.resume-text { font-size: 15px; font-weight: 600; margin: 0 0 20px; color: #0F1B3D; }
.resume-actions { display: flex; flex-direction: column; gap: 10px; }

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

function buildManifestXml(draft: LessonDraftRow, hasQuiz: boolean): string {
  const identifier = `COM.INTERACTEDU.${draft.id.replace(/-/g, "").toUpperCase()}`;
  const escapedTitle = draft.lessons.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lessonItem = `<item identifier="ITEM-LESSON" identifierref="RES-LESSON">
        <title>${escapedTitle}</title>
      </item>`;

  const quizItem = hasQuiz
    ? `<item identifier="ITEM-QUIZ" identifierref="RES-QUIZ">
        <title>แบบทดสอบหลังเรียน</title>
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
// เพิ่ม field "kind" เพื่อให้ player แยก render ควิซเป็นบล็อกต่างหากได้
// ============================================================

function buildManifestJson(draft: LessonDraftRow, hasQuiz: boolean) {
  const items: Array<{
    identifier: string;
    title: string;
    href: string;
    children: never[];
    kind: "lesson" | "quiz";
  }> = [
    {
      identifier: "ITEM-LESSON",
      title: draft.lessons.title,
      href: "lesson.html",
      children: [],
      kind: "lesson",
    },
  ];

  if (hasQuiz) {
    items.push({
      identifier: "ITEM-QUIZ",
      title: "แบบทดสอบหลังเรียน",
      href: "quiz.html",
      children: [],
      kind: "quiz",
    });
  }

  return {
    organizationTitle: draft.lessons.title,
    items,
  };
}

// ============================================================
// Main
// ============================================================

export async function generateScormPackage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  draftId: string,
  lessonId: string
): Promise<{ packageUrl: string } | { error: string }> {
  // ⚡ Dynamic Import สำหรับ AWS SDK & R2 Config
  const [{ PutObjectCommand }, { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL }] =
    await Promise.all([
      import("@aws-sdk/client-s3"),
      import("@/lib/r2"),
    ]);

  // 1. ดึงข้อมูล Draft บทเรียน
  const { data: draft, error: draftError } = await supabase
    .from("lesson_drafts")
    .select("id, video_url, content_html, status, lessons(id, course_id, title)")
    .eq("id", draftId)
    .single();

  if (draftError || !draft || !draft.lessons) {
    console.error("[generateScormPackage] draft fetch failed:", draftError);
    return { error: "Draft not found" };
  }

  // // 2. ดึงข้อมูลแบบทดสอบ
  // const { data: questions, error: questionsError } = await supabase
  //   .from("quiz_questions")
  //   .select("id, question_text, order_index, quiz_choices(choice_text, is_correct, order_index)")
  //   .eq("lesson_draft_id", draftId)
  //   .order("order_index", { ascending: true });

  // if (questionsError) {
  //   console.error("[generateScormPackage] quiz questions fetch failed:", questionsError);
  //   return { error: "Failed to fetch quiz data" };
  // }

  // const typedDraft = draft as unknown as LessonDraftRow;
  // const typedQuestions = (questions ?? []) as unknown as QuizQuestionRow[];
  // const hasQuiz = typedQuestions.length > 0;
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
  const postExamQuestions = typedQuestions.filter((q) => q.video_timestamp_seconds == null);
  const hasQuiz = postExamQuestions.length > 0; // ตัดสินใจสร้าง quiz.html จาก post-exam เท่านั้น

  const courseId = typedDraft.lessons.course_id;

  const manifestXml = buildManifestXml(typedDraft, hasQuiz);
  const lessonPlayerJs = buildLessonPlayerJs(typedDraft, lessonId, videoQuizQuestions);
  const quizPlayerJs = hasQuiz ? buildQuizPlayerJs(typedDraft, postExamQuestions) : null;

  // 3. สร้างไฟล์ ZIP ด้วย JSZip (เสถียร 100% บน Next.js / Turbopack)
  let zipBuffer: Buffer;
  try {
    const zip = new JSZip();
    zip.file("imsmanifest.xml", manifestXml);
    zip.file("lesson.html", LESSON_HTML);
    zip.file("scorm-api.js", SCORM_API_JS);
    zip.file("lesson-player.js", lessonPlayerJs);
    zip.file("style.css", STYLE_CSS);

    if (hasQuiz && quizPlayerJs) {
      zip.file("quiz.html", QUIZ_HTML);
      zip.file("quiz-player.js", quizPlayerJs);
    }

    zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
  } catch (err: any) {
    console.error("[generateScormPackage] JSZip creation failed:", err);
    return { error: `Failed to generate ZIP package: ${err?.message || err}` };
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

  if (hasQuiz && quizPlayerJs) {
    filesToUpload.push(
      { name: "quiz.html", content: QUIZ_HTML, contentType: "text/html" },
      { name: "quiz-player.js", content: quizPlayerJs, contentType: "application/javascript" }
    );
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
  } catch (err: any) {
    console.error("[generateScormPackage] Failed to upload SCORM files to R2:", err);
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
  } catch (err: any) {
    console.error("[generateScormPackage] Failed to upload zip archive:", err);
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
  //    manifest เป็น JSON ที่มี item ควิซแยกออกมา (kind: "quiz") ให้ page.tsx แสดงเป็นบล็อกต่างหาก
  const manifestJson = buildManifestJson(typedDraft, hasQuiz);

  const { error: lessonUpdateError } = await supabase
    .from("lessons")
    .update({
      is_scorm: true,
      scorm_entry_point: "lesson.html",
      scorm_version: "1.2",
      scorm_manifest: manifestJson,
      is_published: true,
    })
    .eq("id", lessonId);

  if (lessonUpdateError) {
    console.error("[generateScormPackage] Failed to update lessons row:", lessonUpdateError);
    return { error: `Failed to update lesson record: ${lessonUpdateError.message}` };
  }

  console.log("✅ SCORM Package Generated & Uploaded Successfully!", packageUrl);
  return { packageUrl };
}