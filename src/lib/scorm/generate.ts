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

function buildPlayerJs(draft: LessonDraftRow, questions: QuizQuestionRow[]): string {
  const lessonData = {
    title: draft.lessons.title,
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
  const escapedTitle = draft.lessons.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
    <div class="video-wrap">
      <video id="lesson-video" controls></video>
    </div>
    <div id="lesson-content" class="lesson-content"></div>
    <div class="quiz-section">
      <h2 class="quiz-heading">แบบทดสอบท้ายบท</h2>
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

const STYLE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap');

* { box-sizing: border-box; }

body {
  font-family: "Noto Sans Thai", "Noto Sans", -apple-system, "Segoe UI", sans-serif;
  background: #F7F8FA;
  margin: 0;
  color: #0F1B3D;
  line-height: 1.6;
}

.lesson-wrap {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 20px 60px;
}

.lesson-header {
  margin-bottom: 20px;
}

#lesson-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0;
  color: #0F1B3D;
}

.video-wrap {
  border-radius: 16px;
  overflow: hidden;
  background: #000;
  box-shadow: 0 4px 16px rgba(15, 27, 61, 0.08);
}

video {
  width: 100%;
  display: block;
  background: #000;
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

.quiz-section {
  margin-top: 24px;
  padding: 28px 24px;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 1px 3px rgba(15, 27, 61, 0.06);
}

.quiz-heading {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 20px;
  color: #0F1B3D;
}

.quiz-question {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #F0F1F5;
}

.quiz-question:last-of-type {
  border-bottom: none;
}

.quiz-question-text {
  font-weight: 600;
  font-size: 14.5px;
  margin-bottom: 12px;
  color: #0F1B3D;
}

.quiz-choice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  font-size: 14px;
  border-radius: 10px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.quiz-choice:hover {
  background: #F7F8FA;
}

.quiz-choice input {
  accent-color: #FF5A3C;
  width: 16px;
  height: 16px;
}

#submit-quiz-btn {
  background: #FF5A3C;
  color: #fff;
  border: none;
  padding: 13px 28px;
  border-radius: 999px;
  font-family: inherit;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  margin-top: 8px;
  transition: opacity 0.15s ease;
}

#submit-quiz-btn:hover {
  opacity: 0.9;
}

.quiz-result {
  margin-top: 14px;
  font-weight: 700;
  font-size: 14.5px;
  color: #0F1B3D;
}
`;

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

  // 2. ดึงข้อมูลแบบทดสอบ
  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, question_text, order_index, quiz_choices(choice_text, is_correct, order_index)")
    .eq("lesson_draft_id", draftId)
    .order("order_index", { ascending: true });

  if (questionsError) {
    console.error("[generateScormPackage] quiz questions fetch failed:", questionsError);
    return { error: "Failed to fetch quiz data" };
  }

  const typedDraft = draft as unknown as LessonDraftRow;
  const typedQuestions = (questions ?? []) as unknown as QuizQuestionRow[];

  const courseId = typedDraft.lessons.course_id;

  const manifestXml = buildManifestXml(typedDraft);
  const playerJs = buildPlayerJs(typedDraft, typedQuestions);

  // 3. สร้างไฟล์ ZIP ด้วย JSZip (เสถียร 100% บน Next.js / Turbopack)
  let zipBuffer: Buffer;
  try {
    const zip = new JSZip();
    zip.file("imsmanifest.xml", manifestXml);
    zip.file("index.html", INDEX_HTML);
    zip.file("scorm-api.js", SCORM_API_JS);
    zip.file("player.js", playerJs);
    zip.file("style.css", STYLE_CSS);

    zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
  } catch (err: any) {
    console.error("[generateScormPackage] JSZip creation failed:", err);
    return { error: `Failed to generate ZIP package: ${err?.message || err}` };
  }

  // 4. อัปโหลดเข้า Cloudflare R2 และแยกไฟล์ออกเป็น 5 ตัวตามมาตรฐานของ SCORM
  // อัปโหลดแยกไฟล์ ให้ตรงกับที่ /api/scorm/[...] proxy 
const basePath = `scorm-packages/${courseId}/${lessonId}`;

const filesToUpload: { name: string; content: string; contentType: string }[] = [
  { name: "imsmanifest.xml", content: manifestXml, contentType: "application/xml" },
  { name: "index.html", content: INDEX_HTML, contentType: "text/html" },
  { name: "scorm-api.js", content: SCORM_API_JS, contentType: "application/javascript" },
  { name: "player.js", content: playerJs, contentType: "application/javascript" },
  { name: "style.css", content: STYLE_CSS, contentType: "text/css" },
];

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

const packageUrl = `${R2_PUBLIC_URL}/${basePath}/index.html`;

  // 5. บันทึก Record ลง Supabase
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
    // ⚡ ปรับตรงนี้: ส่ง error message จริงจาก Supabase ออกมาโชว์บนหน้าเว็บเลย
    return { error: `Failed to save package record: ${insertError.message}` };
  }

  console.log("✅ SCORM Package Generated & Uploaded Successfully!", packageUrl);
  return { packageUrl };
}