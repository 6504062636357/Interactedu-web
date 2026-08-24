import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import QuestionBankList from "@/components/teacher/QuestionBankList";

type TopicTagRow = {
  course_id: string | null;
  lesson_id: string | null;
  courses: { title: string } | null;
  lessons: { order_index: number } | null;
};

function getTopicLabel(tags: TopicTagRow[], category: string | null): string {
  if (tags.length > 0) {
    return tags
      .map((tag) => {
        const courseTitle = tag.courses?.title ?? "";
        // เลือกทั้งคอร์ส + บทเรียน
        if (tag.lesson_id && tag.lessons) {
          return `${courseTitle} / บทที่ ${tag.lessons.order_index + 1}`;
        }
        // เลือกคอร์สอย่างเดียว
        return courseTitle;
      })
      .join(", ");
  }
  // ไม่ผูกคอร์ส/บทเรียนเลย → ใช้ category แทน ถ้าไม่มีก็เว้นว่าง
  return category ?? "";
}

export default async function QuestionBankPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/teacher/question-bank");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") redirect("/");

  // RLS จัดการ scope ให้อยู่แล้ว (owner + public + department ที่ match category)
  const { data, error } = await supabase
    .from("question_bank")
    .select(`
      id, question_text, category, difficulty, usage_type, privacy_scope, owner_teacher_id,
      question_bank_topic_tags (
        course_id,
        lesson_id,
        courses ( title ),
        lessons ( order_index )
      )
    `)
    .order("created_at", { ascending: false });

  const questions = (data ?? []).map((question) => ({
    id: question.id,
    questionText: question.question_text,
    category: question.category,
    difficulty: question.difficulty,
    usageType: question.usage_type,
    privacyScope: question.privacy_scope,
    isOwner: question.owner_teacher_id === user.id,
    topicLabel: getTopicLabel(
      (question.question_bank_topic_tags ?? []) as unknown as TopicTagRow[],
      question.category
    ),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Question Bank</p>
          <h1 className="mt-1 text-[26px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">คลังข้อสอบ</h1>
          <p className="mt-1 text-sm text-[#0F1B3D]/50">สร้าง จัดหมวดหมู่ และแบ่งปันคำถามข้อสอบ</p>
        </div>
        <Link href="/dashboard/teacher/question-bank/new" className="shrink-0 rounded-full bg-[#FF5A3C] px-5 py-2.5 text-[13px] font-extrabold text-white">+ เพิ่มคำถาม</Link>
      </div>

      {error && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">โหลดคลังข้อสอบไม่สำเร็จ: {error.message}</p>}
      <QuestionBankList questions={questions} />
    </div>
  );
}
// import type { ReactElement } from "react";
// import Link from "next/link";
// import { redirect } from "next/navigation";
// import { createClient } from "@/utils/supabase/server";
// import QuestionBankList from "@/components/teacher/QuestionBankList";

// export default async function QuestionBankPage(): Promise<ReactElement> {
//   const supabase = await createClient();
//   const { data: { user } } = await supabase.auth.getUser();
//   if (!user) redirect("/login?redirect=/dashboard/teacher/question-bank");

//   const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
//   if (profile?.role !== "teacher" && profile?.role !== "admin") redirect("/");

//   // RLS จัดการ scope ให้อยู่แล้ว (owner + public + department ที่ match category)
//   const { data, error } = await supabase
//     .from("question_bank")
//     .select("id, question_text, category, difficulty, usage_type, privacy_scope, owner_teacher_id")
//     .order("created_at", { ascending: false });

//   const questions = (data ?? []).map((question) => ({
//     id: question.id,
//     questionText: question.question_text,
//     category: question.category,
//     difficulty: question.difficulty,
//     usageType: question.usage_type,
//     privacyScope: question.privacy_scope,
//     isOwner: question.owner_teacher_id === user.id,
//   }));

//   return (
//     <div className="mx-auto max-w-4xl">
//       <div className="mb-6 flex items-start justify-between gap-4">
//         <div>
//           <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Question Bank</p>
//           <h1 className="mt-1 text-[26px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">คลังข้อสอบ</h1>
//           <p className="mt-1 text-sm text-[#0F1B3D]/50">สร้าง จัดหมวดหมู่ และแบ่งปันคำถามข้อสอบ</p>
//         </div>
//         <Link href="/dashboard/teacher/question-bank/new" className="shrink-0 rounded-full bg-[#FF5A3C] px-5 py-2.5 text-[13px] font-extrabold text-white">+ เพิ่มคำถาม</Link>
//       </div>

//       {error && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">โหลดคลังข้อสอบไม่สำเร็จ: {error.message}</p>}
//       <QuestionBankList questions={questions} />
//     </div>
//   );
// }

