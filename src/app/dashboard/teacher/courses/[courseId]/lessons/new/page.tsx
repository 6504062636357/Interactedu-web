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

  // ★ บั๊กเดิม: ถ้า query ล้มเหลวจริงๆ (เน็ตหลุด/timeout/RLS ผิดพลาดชั่วคราว — ปัญหาที่เจอบ่อยมา
  // ตลอดทั้ง session นี้) courseError จะไม่เป็น null แต่ course ก็จะเป็น null ไปด้วย โค้ดเดิมเช็คแค่
  // `if (!course) notFound()` เลยตีความ error ชั่วคราวว่า "ไม่พบคอร์สนี้" แล้วโชว์หน้า 404 แบบถาวร
  // ทั้งที่คอร์สมีอยู่จริง กด refresh ใหม่บ่อยๆ ก็หายเพราะรอบถัดไป query สำเร็จ — นี่คือสาเหตุที่
  // หน้านี้ "404 บ่อย" ตามที่รายงานมา ไม่ใช่ปัญหาสิทธิ์หรือ URL ผิด
  // แก้โดยแยกเคส: มี courseError จริง (query ล้มเหลว ไม่ใช่ "ไม่พบ") ให้โชว์ข้อความแจ้งเตือนพร้อมปุ่ม
  // "ลองใหม่" แทนการ throw หรือ notFound() ตรงๆ — เพราะโปรเจกต์นี้ยังไม่มี error.tsx boundary ที่ไหน
  // เลย (เช็คแล้วทั้ง src/app/dashboard/teacher และ src/app root) การ throw ตรงนี้จะไปโชว์หน้า
  // error กลางๆ ของ Next.js แทน ซึ่งดูแย่กว่าการเรนเดอร์ข้อความที่เข้าใจง่ายเองในหน้านี้
  // ส่วน notFound() (404 จริง) จะเกิดเฉพาะตอนไม่มี error และคอร์สไม่มีอยู่จริงเท่านั้น
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
  if (!course) notFound();
  if (profile.role === "teacher" && course.created_by !== user.id) redirect(`/dashboard/${workspace}`)

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
            href={`/dashboard/${workspace}/courses/${course.id}`}
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

        <LessonDraftForm
          courseId={course.id}
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
