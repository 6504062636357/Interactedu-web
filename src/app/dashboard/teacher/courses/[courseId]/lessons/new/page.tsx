// app/teacher/courses/[courseId]/lessons/new/page.tsx
import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import LessonDraftForm from "@/components/teacher/LessonDraftForm";
import { getLessonDraftForEdit } from "./actions";
import RegenerateScormButton from "@/components/RegenerateScormButton";

interface PageProps {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ lessonId?: string }>;
}

export default async function NewLessonPage({ params, searchParams }: PageProps): Promise<ReactElement> {
  const { courseId } = await params;
  const { lessonId } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirect=/dashboard/teacher/courses/${courseId}/lessons/new`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") redirect("/");

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, created_by")
    .eq("id", courseId)
    .maybeSingle();

  if (!course) notFound();
  if (profile.role === "teacher" && course.created_by !== user.id) redirect("/dashboard/teacher")

  let { data: courseModule } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!courseModule) {
    const { data: newModule, error: newModuleError } = await supabase
      .from("modules")
      .insert({ course_id: courseId, title: "บทเรียนทั่วไป", order_index: 0 })
      .select("id")
      .single();

    if (newModuleError || !newModule) {
      throw new Error("ไม่สามารถเตรียมหมวดบทเรียนได้ กรุณาติดต่อแอดมิน");
    }
    courseModule = newModule;
  }

  // ---- เพิ่มใหม่: ถ้ามี lessonId ใน query ให้โหลด draft เดิมมา pre-fill ----
  let initialData = null;
  if (lessonId) {
    const result = await getLessonDraftForEdit(lessonId);
    if (result.data) initialData = result.data;
    // ถ้า error (เช่นยังไม่มี draft) ปล่อยให้ initialData เป็น null → ฟอร์มเปิดเป็นโหมดสร้างใหม่ตามปกติ
  }

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <main className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/dashboard/teacher/courses/${course.id}`}
            className="text-[12.5px] font-semibold text-[#0F1B3D]/40 hover:text-[#0F1B3D] mb-2 inline-block"
            >
              ← กลับไปที่คอร์ส
          </Link>
          <p className="text-[13px] font-bold text-[#FF5A3C] mb-1">{course.title}</p>
          <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
            {initialData ? "แก้ไขบทเรียน" : "เพิ่มบทเรียนใหม่"}
          </h1>
          <p className="mt-1.5 text-[14px] text-[#0F1B3D]/50">
            {initialData
              ? "แก้ไขข้อมูลบทเรียน วิดีโอ และแบบทดสอบ แล้วส่งให้แอดมินตรวจสอบอีกครั้ง"
              : "กรอกข้อมูลบทเรียนพร้อมวิดีโอและแบบทดสอบ แล้วส่งให้แอดมินตรวจสอบก่อนเผยแพร่"}
          </p>
        </div>

        <LessonDraftForm courseId={course.id} moduleId={courseModule.id} initialData={initialData} />
      </main>
    </div>
  );
}