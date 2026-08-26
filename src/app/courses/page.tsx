// app/courses/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import ProfileDropdown from "@/components/ProfileDropdown";
import CoursesExplorer, { type ExplorerCourse } from "@/components/CoursesExplorer";
import AppBrand from "@/components/AppBrand";

const navLinks: string[] = ["คอร์สทั้งหมด", "เกี่ยวกับเรา", "บทความ"];

function Navbar({ displayName }: { displayName: string | null }): ReactElement {
  return (
    <header className="app-topbar sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex h-[74px] items-center justify-between">
          <AppBrand compact />

          <nav className="hidden md:flex items-center gap-2">
            {navLinks.map((link) =>
              link === "คอร์สทั้งหมด" ? (
                <Link
                  key={link}
                  href="/courses"
                  className="rounded-xl bg-[#0F1B3D] px-4 py-2 text-[13px] font-bold text-white shadow-sm"
                >
                  {link}
                </Link>
              ) : (
                <Link
                  key={link}
                  href="#"
                  className="rounded-xl px-4 py-2 text-[13px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0F1B3D]"
                >
                  {link}
                </Link>
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            {displayName ? (
              <ProfileDropdown displayName={displayName} role="student" />
            ) : (
              <>
                <Link
                  href="/signup"
                  className="hidden rounded-xl px-4 py-2.5 text-[13px] font-bold text-[#0F1B3D] transition-colors hover:bg-slate-100 sm:inline-flex"
                >
                  สมัครสมาชิก
                </Link>
                <Link
                  href="/login"
                  className="inline-flex rounded-xl bg-[#FF5A3C] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(255,90,60,0.7)] transition-all hover:-translate-y-0.5 hover:bg-[#EB4A2D]"
                >
                  เข้าสู่ระบบ
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function ExplorerHero(): ReactElement {
  return (
    <section className="relative overflow-hidden bg-[#0F1B3D] pt-16 pb-28 lg:pt-20 lg:pb-32">
      <div className="absolute -top-20 -right-24 w-72 h-72 rounded-full bg-[#FF5A3C]/20 blur-3xl" />
      <div className="absolute -bottom-24 -left-20 w-72 h-72 rounded-full bg-[#7C5CFF]/20 blur-3xl" />
      <div className="relative max-w-5xl mx-auto px-6 lg:px-8 text-center">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#0F1B3D] bg-[#FFCB47] px-3.5 py-1.5 rounded-full mb-6 rotate-[-1.5deg]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0F1B3D]" />
          คอร์สทั้งหมด
        </span>
        <h1 className="text-[36px] sm:text-[48px] leading-[1.05] font-extrabold text-white tracking-[-0.03em]">
          หาคอร์สที่ใช่ ในหมวดที่คุณสนใจ
        </h1>
        <p className="mt-5 text-[15.5px] leading-relaxed text-white/55 max-w-lg mx-auto">
          ค้นหาด้วยชื่อคอร์ส หรือเลือกกรองตามหมวดหมู่ เพื่อเจอคอร์สที่ตอบโจทย์การเรียนรู้ของคุณ
        </p>
      </div>
    </section>
  );
}

function Footer(): ReactElement {
  return (
    <footer className="border-t border-[#0F1B3D]/[0.06] bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0F1B3D] flex items-center justify-center rotate-[-4deg]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="#FF5A3C" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-[14.5px] font-extrabold text-[#0F1B3D]">Interact Edu</span>
        </div>
        <p className="text-[13px] text-[#0F1B3D]/40 font-medium">
          © {new Date().getFullYear()} Interact Edu. สงวนลิขสิทธิ์ทุกประการ
        </p>
      </div>
    </footer>
  );
}

export default async function CoursesPage(): Promise<ReactElement> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = user
    ? (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "ผู้ใช้"
    : null;

  // ดึงคอร์สที่เผยแพร่แล้วทั้งหมด — กรอง/ค้นหาฝั่ง client ผ่าน CoursesExplorer
  const { data: courses, error } = await supabase
    .from("courses")
    .select(`
      id, title, slug, category, price, cover_image_url, total_duration_seconds,
      lessons(count)
    `)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch courses:", error.message);
  }

  const explorerCourses: ExplorerCourse[] = (courses ?? []).map((course) => ({
    id: course.id,
    title: course.title,
    slug: course.slug,
    category: course.category,
    price: course.price,
    cover_image_url: course.cover_image_url,
    total_duration_seconds: course.total_duration_seconds,
    lesson_count: course.lessons[0]?.count ?? 0,
  }));

  return (
    <div className="min-h-screen w-full bg-white">
      <Navbar displayName={displayName} />
      <ExplorerHero />
      <CoursesExplorer courses={explorerCourses} />
      <Footer />
    </div>
  );
}
