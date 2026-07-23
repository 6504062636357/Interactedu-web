// import type { ReactElement } from "react";
// import { notFound, redirect } from "next/navigation";
// import { createClient } from "@/utils/supabase/server";
// import ReviewActions from "@/components/ReviewActions";

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

// interface RawDraftDetail {
//   id: string;
//   video_url: string | null;
//   content_html: string | null;
//   status: string;
//   lessons: {
//     title: string;
//     courses: { title: string } | { title: string }[];
//   } | null;
// }

// export default async function AdminReviewDetailPage({
//   params,
// }: {
//   params: Promise<{ draftId: string }>;
// }): Promise<ReactElement> {
//   const { draftId } = await params;
//   const supabase = await createClient();

//   const {
//     data: { user },
//   } = await supabase.auth.getUser();

//   if (!user) redirect(`/login?redirect=/admin/review/${draftId}`);

//   const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
//   if (profile?.role !== "admin") redirect("/");

//   const { data: draft, error } = await supabase
//     .from("lesson_drafts")
//     .select("id, video_url, content_html, status, lessons(title, courses(title))")
//     .eq("id", draftId)
//     .single();

//   console.log("[admin/review/detail] draft:", JSON.stringify(draft, null, 2));
//   console.log("[admin/review/detail] error:", error);

//   if (error || !draft) notFound();

//   const rawDraft = draft as unknown as RawDraftDetail;
//   const lesson = rawDraft.lessons;
//   const course = lesson ? (Array.isArray(lesson.courses) ? lesson.courses[0] : lesson.courses) : null;

//   const typedDraft = {
//     id: rawDraft.id,
//     title: lesson?.title ?? "ไม่พบชื่อบทเรียน",
//     videoUrl: rawDraft.video_url,
//     contentHtml: rawDraft.content_html,
//     status: rawDraft.status,
//     courseTitle: course?.title ?? "ไม่พบชื่อคอร์ส",
//   };

//   const { data: questions } = await supabase
//     .from("quiz_questions")
//     .select("id, question_text, order_index, quiz_choices(choice_text, is_correct, order_index)")
//     .eq("lesson_draft_id", draftId)
//     .order("order_index", { ascending: true });

//   const typedQuestions = (questions ?? []) as unknown as QuizQuestionRow[];

//   return (
//     <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
//       <div className="max-w-3xl mx-auto">
//         <p className="text-[13px] font-bold text-[#FF5A3C] mb-2">{typedDraft.courseTitle}</p>
//         <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] mb-8">
//           {typedDraft.title}
//         </h1>

//         {typedDraft.videoUrl && (
//           <div className="mb-8 rounded-2xl overflow-hidden bg-black">
//             <video src={typedDraft.videoUrl} controls className="w-full" />
//           </div>
//         )}

//         {typedDraft.contentHtml && (
//           <div className="mb-8 bg-white rounded-2xl border border-[#0F1B3D]/[0.06] p-6">
//             <h2 className="text-[15px] font-bold text-[#0F1B3D] mb-3">เนื้อหา</h2>
//             <p className="text-[14px] text-[#0F1B3D]/70 leading-relaxed whitespace-pre-line">
//               {typedDraft.contentHtml}
//             </p>
//           </div>
//         )}

//         <div className="mb-8 bg-white rounded-2xl border border-[#0F1B3D]/[0.06] p-6">
//           <h2 className="text-[15px] font-bold text-[#0F1B3D] mb-4">
//             แบบทดสอบ ({typedQuestions.length} ข้อ)
//           </h2>
//           <div className="space-y-5">
//             {typedQuestions.map((q, i) => (
//               <div key={q.id}>
//                 <p className="text-[14px] font-bold text-[#0F1B3D] mb-2">
//                   {i + 1}. {q.question_text}
//                 </p>
//                 <ul className="space-y-1.5 pl-4">
//                   {q.quiz_choices
//                     .sort((a, b) => a.order_index - b.order_index)
//                     .map((c, ci) => (
//                       <li
//                         key={ci}
//                         className={`text-[13.5px] flex items-center gap-2 ${
//                           c.is_correct ? "text-[#00B37E] font-bold" : "text-[#0F1B3D]/60"
//                         }`}
//                       >
//                         {c.is_correct && "✓"} {c.choice_text}
//                       </li>
//                     ))}
//                 </ul>
//               </div>
//             ))}
//           </div>
//         </div>

//         <ReviewActions draftId={typedDraft.id} />
//       </div>
//     </div>
//   );
// }

import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import ReviewActions from "@/components/ReviewActions";

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

interface RawDraftDetail {
  id: string;
  video_url: string | null;
  content_html: string | null;
  status: string;
  lessons: {
    title: string;
    courses: { title: string } | { title: string }[];
  } | null;
}

export default async function AdminReviewDetailPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}): Promise<ReactElement> {
  const { draftId } = await params;
  const supabase = await createClient();

  // Step 1: เช็ค Auth User ก่อน
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirect=/admin/review/${draftId}`);

  // ⚡ Step 2: ยิง 3 Query พร้อมกันด้วย Promise.all (ขนานกันแทนที่จะรอต่อคิว)
  const [profileRes, draftRes, questionsRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("lesson_drafts")
      .select("id, video_url, content_html, status, lessons(title, courses(title))")
      .eq("id", draftId)
      .single(),
    supabase
      .from("quiz_questions")
      .select("id, question_text, order_index, quiz_choices(choice_text, is_correct, order_index)")
      .eq("lesson_draft_id", draftId)
      .order("order_index", { ascending: true }),
  ]);

  // เช็ค Role Admin
  if (profileRes.data?.role !== "admin") redirect("/");

  const draft = draftRes.data;
  const error = draftRes.error;

  console.log("[admin/review/detail] draft:", JSON.stringify(draft, null, 2));
  console.log("[admin/review/detail] error:", error);

  if (error || !draft) notFound();

  const rawDraft = draft as unknown as RawDraftDetail;
  const lesson = rawDraft.lessons;
  const course = lesson ? (Array.isArray(lesson.courses) ? lesson.courses[0] : lesson.courses) : null;

  const typedDraft = {
    id: rawDraft.id,
    title: lesson?.title ?? "ไม่พบชื่อบทเรียน",
    videoUrl: rawDraft.video_url,
    contentHtml: rawDraft.content_html,
    status: rawDraft.status,
    courseTitle: course?.title ?? "ไม่พบชื่อคอร์ส",
  };

  const typedQuestions = (questionsRes.data ?? []) as unknown as QuizQuestionRow[];

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <p className="text-[13px] font-bold text-[#FF5A3C] mb-2">{typedDraft.courseTitle}</p>
        <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] mb-8">
          {typedDraft.title}
        </h1>

        {typedDraft.videoUrl && (
          <div className="mb-8 rounded-2xl overflow-hidden bg-black">
            <video src={typedDraft.videoUrl} controls className="w-full" />
          </div>
        )}

        {typedDraft.contentHtml && (
          <div className="mb-8 bg-white rounded-2xl border border-[#0F1B3D]/[0.06] p-6">
            <h2 className="text-[15px] font-bold text-[#0F1B3D] mb-3">เนื้อหา</h2>
            <p className="text-[14px] text-[#0F1B3D]/70 leading-relaxed whitespace-pre-line">
              {typedDraft.contentHtml}
            </p>
          </div>
        )}

        <div className="mb-8 bg-white rounded-2xl border border-[#0F1B3D]/[0.06] p-6">
          <h2 className="text-[15px] font-bold text-[#0F1B3D] mb-4">
            แบบทดสอบ ({typedQuestions.length} ข้อ)
          </h2>
          <div className="space-y-5">
            {typedQuestions.map((q, i) => (
              <div key={q.id}>
                <p className="text-[14px] font-bold text-[#0F1B3D] mb-2">
                  {i + 1}. {q.question_text}
                </p>
                <ul className="space-y-1.5 pl-4">
                  {q.quiz_choices
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((c, ci) => (
                      <li
                        key={ci}
                        className={`text-[13.5px] flex items-center gap-2 ${
                          c.is_correct ? "text-[#00B37E] font-bold" : "text-[#0F1B3D]/60"
                        }`}
                      >
                        {c.is_correct && "✓"} {c.choice_text}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <ReviewActions draftId={typedDraft.id} />
      </div>
    </div>
  );
}