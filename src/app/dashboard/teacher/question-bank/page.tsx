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
      {/* ★ แก้ UI: เพิ่มไอคอน + เส้นแบ่งใต้หัวข้อ ให้ดูเป็นส่วนหัวของหน้าที่จริงจังขึ้น
          (ตรรกะ/ข้อมูลเดิมทั้งหมด แก้แค่หน้าตา) */}
      <div className="mb-8 flex flex-col gap-5 border-b border-[#0F1B3D]/[0.06] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FF5A3C]/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF5A3C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3.5h6a1.5 1.5 0 0 1 1.5 1.5v14.5L12 17l-4.5 2.5V5A1.5 1.5 0 0 1 9 3.5Z" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Question Bank</p>
            <h1 className="mt-0.5 text-[24px] font-extrabold tracking-[-0.02em] text-[#0F1B3D] sm:text-[26px]">คลังข้อสอบ</h1>
            <p className="mt-1 text-[13.5px] text-[#0F1B3D]/50">สร้าง จัดหมวดหมู่ และแบ่งปันคำถามข้อสอบ</p>
          </div>
        </div>
        <Link
          href="/dashboard/teacher/question-bank/new"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#FF5A3C] px-5 py-2.5 text-[13px] font-extrabold text-white shadow-[0_8px_20px_-8px_rgba(255,90,60,0.6)] transition-all hover:-translate-y-0.5 hover:bg-[#EB4A2D]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          เพิ่มคำถาม
        </Link>
      </div>

      {error && (
        <p className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
          โหลดคลังข้อสอบไม่สำเร็จ: {error.message}
        </p>
      )}
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

