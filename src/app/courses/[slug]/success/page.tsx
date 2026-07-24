// src/app/courses/[slug]/success/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import PaymentSuccessIllustration from "@/components/PaymentSuccessIllustration";
import ProfileDropdown from "@/components/ProfileDropdown";

interface Course {
  id: string;
  title: string;
  slug: string;
}

interface LessonRef {
  id: string;
  order_index: number;
}

interface ModuleWithLessons {
  id: string;
  order_index: number;
  lessons: LessonRef[];
}

export default async function EnrollSuccessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactElement> {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/courses/${slug}/success`);
  }

  const { data: course, error } = await supabase
    .from("courses")
    .select("id, title, slug")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !course) {
    notFound();
  }

  const typedCourse = course as Course;

  // กันคนพิมพ์ URL เข้ามาตรงๆ ทั้งที่ยังไม่ได้ enroll / จ่ายเงินสำเร็จจริง
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, status")
    .eq("student_id", user.id)
    .eq("course_id", typedCourse.id)
    .eq("status", "approved")
    .maybeSingle();

  if (!enrollment) {
    redirect(`/courses/${slug}/enroll`);
  }

  // หา role ของ user ไปให้ ProfileDropdown (แก้ TS error: Property 'role' is missing)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "ผู้ใช้";
  const role = profile?.role ?? "student";

  // หาบทเรียนแรกของคอร์ส เพราะ /play ต้องการ courseId + lessonId (แก้ 404)
  const { data: modulesData } = await supabase
    .from("modules")
    .select("id, order_index, lessons(id, order_index)")
    .eq("course_id", typedCourse.id)
    .order("order_index", { ascending: true });

  let firstLessonId: string | null = null;
  for (const m of (modulesData ?? []) as ModuleWithLessons[]) {
    const lessons = [...(m.lessons ?? [])].sort((a, b) => a.order_index - b.order_index);
    if (lessons.length > 0) {
      firstLessonId = lessons[0].id;
      break;
    }
  }

  const enterClassroomHref = firstLessonId
    ? `/play/${typedCourse.id}/${firstLessonId}`
    : `/dashboard/student/courses/${typedCourse.id}`;

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] flex flex-col">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#0F1B3D]/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#0F1B3D] flex items-center justify-center rotate-[-4deg]">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="#FF5A3C" strokeWidth="1.8" strokeLinejoin="round" />
                  <path
                    d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="text-[19px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">Interact Edu</span>
            </div>
            <ProfileDropdown displayName={displayName} role={role} />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <PaymentSuccessIllustration />

        <h1 className="mt-8 text-[26px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
          ชำระเงินสำเร็จ!
        </h1>
        <p className="mt-3 text-[16px] font-bold text-[#0F1B3D]">{typedCourse.title}</p>
        <p className="mt-1 text-[14px] text-[#0F1B3D]/50 font-medium">
          คุณสามารถเริ่มเรียนคอร์สนี้ได้เลย
        </p>

        <Link
          href={enterClassroomHref}
          className="mt-8 inline-flex items-center justify-center text-[15px] font-bold text-white bg-[#FFCB47] hover:bg-[#f0bc3a] px-8 py-4 rounded-full transition-colors"
        >
          เข้าสู่ห้องเรียน
        </Link>
      </main>

     <footer className="border-t border-[#0F1B3D]/[0.06] bg-white py-6">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center gap-3">
        <span className="text-[13px] text-[#0F1B3D]/50 font-medium">ติดตามเราได้ที่</span>
        
        <a
          href="#"
          className="w-8 h-8 rounded-full bg-[#0F1B3D]/[0.06] flex items-center justify-center hover:bg-[#0F1B3D]/10 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#0F1B3D">
            <path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z" />
          </svg>
        </a>
      </div>
    </footer>
  </div>
);
}