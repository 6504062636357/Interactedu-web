// app/dashboard/teacher/courses/[courseId]/lessons/new/page.tsx
import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import LessonDraftForm from "@/components/teacher/LessonDraftForm";
import { getLessonDraftForEdit } from "./actions";

interface PageProps {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ lessonId?: string }>;
}

export async function CourseLessonEditorPage({
  params,
  searchParams,
  workspace = "teacher",
}: PageProps & { workspace?: "teacher" | "admin" }): Promise<ReactElement> {
  const { courseId } = await params;
  const { lessonId } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirect=/dashboard/${workspace}/courses/${courseId}/lessons/new`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") redirect("/");

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, title, created_by")
    .eq("id", courseId)
    .maybeSingle();

  // ★ เพิ่มใหม่: ถ้าไม่มี courseError แต่ course ก็ยังเป็น null — อาจเป็นเพราะ auth.uid() resolve
  // พลาดชั่วคราวตอน Supabase โหลดสูง (RLS กรองแถวออกเงียบๆ โดยไม่คืน error เลย) ก่อนจะฟันธงว่า
  // "ไม่พบคอร์ส" ให้ลอง query ซ้ำอีกครั้งแบบเงียบๆ ก่อน — ทุกจุดหลังจากนี้ใช้ confirmedCourse แทน
  let confirmedCourse = course;
  if (!courseError && !confirmedCourse) {
    const retryResult = await supabase
      .from("courses")
      .select("id, title, created_by")
      .eq("id", courseId)
      .maybeSingle();
    confirmedCourse = retryResult.data;
    if (retryResult.error) {
      console.error("[lessons/new] retry course fetch failed:", courseId, retryResult.error.message);
    }
  }

  if (courseError) {
    console.error("[lessons/new] failed to load course:", courseId, courseError.message);
    return (
      <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
        <main className="max-w-3xl mx-auto text-center py-20">
          <p className="text-[15px] font-bold text-red-500 mb-2">โหลดข้อมูลคอร์สไม่สำเร็จ</p>
          <p className="text-[13.5px] text-[#0F1B3D]/50 mb-6">
            อาจเกิดจากปัญหาการเชื่อมต่อชั่วคราว กรุณาลองใหม่อีกครั้ง
          </p>
          <Link
            href={`/dashboard/${workspace}/courses/${courseId}/lessons/new`}
            className="inline-block px-5 py-2.5 rounded-xl bg-[#0F1B3D] text-white text-[13.5px] font-bold hover:bg-[#0F1B3D]/90 transition-colors"
          >
            ลองใหม่
          </Link>
        </main>
      </div>
    );
  }
  if (!confirmedCourse) notFound();
  if (profile.role === "teacher" && confirmedCourse.created_by !== user.id) redirect(`/dashboard/${workspace}`);

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
  }

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <main className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/dashboard/${workspace}/courses/${confirmedCourse.id}`}
            className="text-[12.5px] font-semibold text-[#0F1B3D]/40 hover:text-[#0F1B3D] mb-2 inline-block"
          >
            ← กลับไปที่คอร์ส
          </Link>
          <p className="text-[13px] font-bold text-[#FF5A3C] mb-1">{confirmedCourse.title}</p>
          <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
            {initialData ? "แก้ไขบทเรียน" : "เพิ่มบทเรียนใหม่"}
          </h1>
          <p className="mt-1.5 text-[14px] text-[#0F1B3D]/50">
            {initialData
              ? "แก้ไขข้อมูลบทเรียน วิดีโอ และแบบทดสอบ แล้วส่งให้แอดมินตรวจสอบอีกครั้ง"
              : "กรอกข้อมูลบทเรียนพร้อมวิดีโอและแบบทดสอบ แล้วส่งให้แอดมินตรวจสอบก่อนเผยแพร่"}
          </p>
        </div>

        <LessonDraftForm
          courseId={confirmedCourse.id}
          moduleId={courseModule.id}
          initialData={initialData}
          workspace={workspace}
        />
      </main>
    </div>
  );
}

export default async function NewLessonPage(props: PageProps): Promise<ReactElement> {
  return CourseLessonEditorPage({ ...props, workspace: "teacher" });
}