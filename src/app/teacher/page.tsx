// app/teacher/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

interface OwnedCourse {
  id: string;
  title: string;
  status: string;
}

export default async function TeacherHomePage(): Promise<ReactElement> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/teacher");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "teacher" && profile?.role !== "admin") redirect("/");

  const { data } = await supabase
    .from("courses")
    .select("id, title, status")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  const ownedCourses = (data ?? []) as OwnedCourse[];

  const statusLabel: Record<string, { text: string; color: string }> = {
    draft: { text: "ฉบับร่าง", color: "text-[#0F1B3D]/40" },
    pending: { text: "รอตรวจสอบ", color: "text-[#FF5A3C]" },
    published: { text: "เผยแพร่แล้ว", color: "text-[#00B37E]" },
  };

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
            พื้นที่ครูผู้สอน
          </h1>
          <Link
            href="/teacher/courses/new"
            className="text-[13px] font-bold text-white bg-[#FF5A3C] hover:bg-[#EB4A2D] px-5 py-2.5 rounded-full transition-colors"
          >
            + สร้างคอร์สใหม่
          </Link>
        </div>

        <div className="flex items-center gap-1 mb-8 border-b border-[#0F1B3D]/[0.08]">
          <div className="px-4 py-3 text-[14px] font-bold text-[#0F1B3D] border-b-2 border-[#FF5A3C]">
            คอร์สของคุณ
          </div>
        </div>

        {ownedCourses.length > 0 ? (
          <div className="space-y-3">
            {ownedCourses.map((course) => (
              <Link
                key={course.id}
                href={`/teacher/courses/${course.id}/lessons/new`}
                className="flex items-center justify-between bg-white rounded-2xl border border-[#0F1B3D]/[0.06] p-5 hover:shadow-[0_15px_35px_-15px_rgba(15,27,61,0.2)] transition-shadow"
              >
                <div>
                  <span className="text-[15px] font-bold text-[#0F1B3D] block">{course.title}</span>
                  <span className={`text-[12px] font-bold ${statusLabel[course.status]?.color ?? "text-[#0F1B3D]/40"}`}>
                    {statusLabel[course.status]?.text ?? course.status}
                  </span>
                </div>
                <span className="text-[13px] font-bold text-[#FF5A3C]">+ เพิ่มบทเรียน</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
            <p className="text-[14px] text-[#0F1B3D]/40 font-medium mb-4">คุณยังไม่มีคอร์สในระบบ</p>
            <Link href="/teacher/courses/new" className="text-[13px] font-bold text-[#FF5A3C] hover:underline">
              เริ่มสร้างคอร์สแรกของคุณ
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}