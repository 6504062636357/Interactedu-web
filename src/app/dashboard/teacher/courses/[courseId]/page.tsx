// app/teacher/courses/[courseId]/page.tsx
import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

interface LessonRow {
  id: string;
  title: string;
  order_index: number;
  lesson_drafts: { status: string; created_at: string }[] | null;
}

const statusLabel: Record<string, { text: string; color: string }> = {
  draft: { text: "ฉบับร่าง", color: "text-[#0F1B3D]/40" },
  pending_review: { text: "รอตรวจสอบ", color: "text-[#FF5A3C]" },
  approved: { text: "เผยแพร่แล้ว", color: "text-[#00B37E]" },
  rejected: { text: "ถูกตีกลับ", color: "text-[#EB4A2D]" },
};

export default async function CourseDetailPage({ params }: PageProps): Promise<ReactElement> {
  const { courseId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirect=/teacher/courses/${courseId}`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") redirect("/");

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, status, created_by")
    .eq("id", courseId)
    .maybeSingle();

  if (!course) notFound();
  if (profile.role === "teacher" && course.created_by !== user.id) redirect("/dashboard/teacher")

  // ดึงบทเรียนทั้งหมดของคอร์สนี้ พร้อม draft ล่าสุดของแต่ละบทเรียน (เพื่อโชว์สถานะ)
  const { data: lessonsData } = await supabase
    .from("lessons")
    .select(
      `id, title, order_index,
       lesson_drafts ( status, created_at )`
    )
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });

  const lessons = (lessonsData ?? []) as LessonRow[];

  // หา draft ล่าสุดของแต่ละ lesson (เผื่อมีหลาย draft เก่าสะสมอยู่)
  const lessonsWithStatus = lessons.map((lesson) => {
    const drafts = lesson.lesson_drafts ?? [];
    const latestDraft = [...drafts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
    return {
      id: lesson.id,
      title: lesson.title,
      status: latestDraft?.status ?? null,
    };
  });

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <main className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            href="/dashboard/teacher"
            className="text-[12.5px] font-semibold text-[#0F1B3D]/40 hover:text-[#0F1B3D] mb-2 inline-block"
          >
            ← กลับไปหน้ารวมคอร์ส
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
              {course.title}
            </h1>
            <Link
              href={`/teacher/courses/${course.id}/lessons/new`}
              className="text-[13px] font-bold text-white bg-[#FF5A3C] hover:bg-[#EB4A2D] px-5 py-2.5 rounded-full transition-colors shrink-0"
            >
              + เพิ่มบทเรียนใหม่
            </Link>
          </div>
        </div>

        {lessonsWithStatus.length > 0 ? (
          <div className="space-y-3">
            {lessonsWithStatus.map((lesson, index) => (
              <div
                key={lesson.id}
                className="flex items-center justify-between bg-white rounded-2xl border border-[#0F1B3D]/[0.06] p-5"
              >
                <div className="flex items-center gap-4">
                  <span className="text-[13px] font-bold text-[#0F1B3D]/30 shrink-0">
                    {index + 1}
                  </span>
                  <div>
                    <span className="text-[15px] font-bold text-[#0F1B3D] block">{lesson.title}</span>
                    <span
                      className={`text-[12px] font-bold ${
                        lesson.status ? statusLabel[lesson.status]?.color ?? "text-[#0F1B3D]/40" : "text-[#0F1B3D]/30"
                      }`}
                    >
                      {lesson.status ? statusLabel[lesson.status]?.text ?? lesson.status : "ยังไม่มีฉบับร่าง"}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/teacher/courses/${course.id}/lessons/new?lessonId=${lesson.id}`}
                  className="text-[13px] font-bold text-[#FF5A3C] hover:underline shrink-0"
                >
                  แก้ไข
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
            <p className="text-[14px] text-[#0F1B3D]/40 font-medium mb-4">คอร์สนี้ยังไม่มีบทเรียน</p>
            <Link
              href={`/teacher/courses/${course.id}/lessons/new`}
              className="text-[13px] font-bold text-[#FF5A3C] hover:underline"
            >
              เริ่มเพิ่มบทเรียนแรก
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}