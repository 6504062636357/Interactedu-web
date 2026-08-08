// app/teacher/courses/[courseId]/materials/page.tsx
import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import CourseMaterialsUpload from "@/components/teacher/CourseMaterialsUpload";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export async function CourseMaterialsWorkspacePage({ params, workspace = "teacher" }: PageProps & { workspace?: "teacher" | "admin" }): Promise<ReactElement> {
  const { courseId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/${workspace}/courses/${courseId}/materials`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") redirect("/");

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, created_by")
    .eq("id", courseId)
    .maybeSingle();

  if (!course) notFound();
  if (profile.role === "teacher" && course.created_by !== user.id) redirect(`/dashboard/${workspace}`);

  const { data: materials } = await supabase
    .from("course_materials")
    .select("id, file_name, file_url")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <main className="max-w-3xl mx-auto">
        <Link
          href={`/dashboard/${workspace}/courses/${course.id}`}
          className="text-[12.5px] font-semibold text-[#0F1B3D]/40 hover:text-[#0F1B3D] mb-2 inline-block"
        >
          ← กลับไปที่คอร์ส
        </Link>
        <p className="text-[13px] font-bold text-[#FF5A3C] mb-1">{course.title}</p>
        <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] mb-6">
          เอกสารประกอบคอร์ส
        </h1>

        <CourseMaterialsUpload courseId={course.id} initialMaterials={materials ?? []} />
      </main>
    </div>
  );
}

export default async function CourseMaterialsPage(props: PageProps): Promise<ReactElement> {
  return CourseMaterialsWorkspacePage({ ...props, workspace: "teacher" });
}
