import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import QuestionBankForm from "@/components/teacher/QuestionBankForm";

export default async function NewQuestionBankPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/teacher/question-bank/new");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") redirect("/");

  // ดึงบทเรียนของครูคนนี้ทุกคอร์ส เพื่อผูก tag
  const { data: lessonsData } = await supabase
  .from("lessons")
  .select("id, order_index, course_id, courses!inner(title, created_by)")
  .eq("courses.created_by", user.id)
  .order("order_index", { ascending: true });

    const lessons = (lessonsData ?? []).map((lesson) => ({
    id: lesson.id,
    courseId: lesson.course_id,
    courseTitle: (lesson.courses as unknown as { title: string }).title,
    orderIndex: lesson.order_index,
    title: `บทที่ ${lesson.order_index + 1}`,
    }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/teacher/question-bank" className="mb-2 inline-block text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">← กลับไปคลังข้อสอบ</Link>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5A3C]">Question Bank</p>
      <h1 className="mt-1 mb-6 text-[26px] font-extrabold tracking-[-0.02em] text-[#0F1B3D]">เพิ่มคำถามลงคลัง</h1>
      <QuestionBankForm lessons={lessons} />
    </div>
  );
}