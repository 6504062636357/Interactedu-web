// app/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import ProfileDropdown from "@/components/ProfileDropdown";
import { redirect } from "next/navigation";
import FavoriteHeartButton from "@/components/FavoriteHeartButton";
import AuraBackground from "@/components/AuraBackground";
interface Course {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  price: number;
  cover_image_url: string | null;
  total_duration_seconds: number;
  lessons: { count: number }[];
}

const tagColors: Record<string, string> = {
  Development: "bg-[#FF5A3C] text-white",
  Design: "bg-[#7C5CFF] text-white",
  "Data Science": "bg-[#00B37E] text-white",
  Marketing: "bg-[#FFCB47] text-[#0F1B3D]",
};

function formatDuration(seconds: number): string {
  const hours = Math.round(seconds / 3600);
  return `${hours} ชั่วโมง`;
}

function formatPrice(price: number): string {
  return `฿${price.toLocaleString("th-TH")}`;
}

const navLinks: { label: string; href: string }[] = [
  { label: "คอร์สทั้งหมด", href: "/courses" },
  { label: "เกี่ยวกับเรา", href: "#" },
  { label: "บทความ", href: "#" },
];

const marqueeTags: string[] = [
  "WEB DEVELOPMENT",
  "UI/UX DESIGN",
  "DATA ANALYTICS",
  "DIGITAL MARKETING",
  "PRODUCT MANAGEMENT",
  "AI & MACHINE LEARNING",
];

function Navbar({ displayName }: { displayName: string | null }): ReactElement {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#0F1B3D]/8">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#0F1B3D] flex items-center justify-center rotate-[-4deg]">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="#FF5A3C" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[19px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">Interact Edu</span>
          </div>

          <nav className="hidden md:flex items-center gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="..."
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {displayName ? (
              // ✅ role เป็น "student" เสมอตรงนี้ เพราะ teacher/admin ถูก redirect ออกไปแล้วก่อนถึงจุดนี้
              <ProfileDropdown displayName={displayName} role="student" />
            ) : (
              <>
                <Link
                  href="/signup"
                  className="hidden sm:inline-flex text-[14px] font-bold text-[#0F1B3D] px-4 py-2.5 rounded-full hover:bg-[#0F1B3D]/[0.04] transition-colors"
                >
                  สมัครสมาชิก
                </Link>
                <Link
                  href="/login"
                  className="inline-flex text-[14px] font-bold text-white bg-[#FF5A3C] hover:bg-[#EB4A2D] px-6 py-2.5 rounded-full transition-colors shadow-[0_6px_16px_-6px_rgba(255,90,60,0.6)]"
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


function Marquee(): ReactElement {
  const doubled = [...marqueeTags, ...marqueeTags];
  return (
    <div className="relative -rotate-2 bg-[#0F1B3D] py-3.5 overflow-hidden shadow-[0_10px_30px_-10px_rgba(15,27,61,0.5)] my-[-8px] z-10">
      <div className="flex whitespace-nowrap animate-[marquee_28s_linear_infinite] motion-reduce:animate-none">
        {doubled.map((tag, i) => (
          <span key={`${tag}-${i}`} className="flex items-center text-[13px] font-bold tracking-[0.08em] text-white/90 mx-4">
            {tag}
            <span className="mx-4 w-1.5 h-1.5 rounded-full bg-[#FF5A3C]" />
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function Hero(): ReactElement {
  return (
    <section className="relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-16 pb-24 lg:pt-20 lg:pb-28">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-8 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#0F1B3D] bg-[#FFCB47] px-3.5 py-1.5 rounded-full mb-7 rotate-[-1.5deg]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0F1B3D]" />
              แพลตฟอร์มเรียนรู้แห่งอนาคต
            </span>
            <h1 className="text-[42px] sm:text-[58px] leading-[1.03] font-extrabold text-[#0F1B3D] tracking-[-0.03em]">
              เก่งขึ้นได้จริง
              <br />
              ใน{" "}
              <span className="relative inline-block">
                <span className="relative z-10">โลกที่เปลี่ยนไว</span>
                <span className="absolute left-0 right-0 bottom-1.5 h-4 bg-[#FF5A3C]/25 -rotate-1 z-0" />
              </span>
            </h1>
            <p className="mt-6 text-[16.5px] leading-relaxed text-[#0F1B3D]/60 max-w-[440px]">
              เรียนกับผู้สอนตัวจริงในสายงาน ลงมือทำโปรเจกต์จริง พร้อมใบรับรองที่บริษัทชั้นนำให้การยอมรับ
            </p>
            <div className="mt-9 flex items-center gap-3">
            <Link
              href="/courses"
              className="inline-flex items-center gap-2 text-[15px] font-bold text-white bg-[#0F1B3D] hover:bg-[#182852] px-7 py-4 rounded-full transition-colors shadow-[0_12px_28px_-10px_rgba(15,27,61,0.55)]"
            >
              สำรวจคอร์สเรียน
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
              <button
                type="button"
                className="text-[15px] font-bold text-[#0F1B3D] px-4 py-4 hover:underline underline-offset-4 decoration-2 decoration-[#FF5A3C]"
              >
                ดูวิธีการเรียน
              </button>
            </div>

            <div className="mt-12 flex items-center gap-8">
              <div>
                <p className="text-[26px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">120+</p>
                <p className="text-[13px] text-[#0F1B3D]/50 font-medium">คอร์สจากผู้เชี่ยวชาญ</p>
              </div>
              <div className="w-px h-10 bg-[#0F1B3D]/10" />
              <div>
                <p className="text-[26px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">40k+</p>
                <p className="text-[13px] text-[#0F1B3D]/50 font-medium">ผู้เรียนที่ใช้งานอยู่</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-[28px] bg-[#0F1B3D] aspect-[4/3.3] p-6 shadow-[0_35px_70px_-25px_rgba(15,27,61,0.5)] overflow-hidden rotate-[1.5deg]">
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#FF5A3C]/20 blur-2xl" />
              <div className="absolute -bottom-14 -left-10 w-48 h-48 rounded-full bg-[#7C5CFF]/20 blur-2xl" />
              <div className="relative h-full flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF5A3C]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FFCB47]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-white/25" />
                  </div>
                  <span className="text-[11px] font-bold text-white/50 tracking-[0.1em]">LIVE SESSION</span>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/[0.07] border border-white/10 p-4 flex flex-col justify-between">
                    <div className="w-9 h-9 rounded-xl bg-[#FF5A3C]" />
                    <div>
                      <div className="h-2 w-16 bg-white/30 rounded-full mb-2" />
                      <div className="h-2 w-10 bg-white/15 rounded-full" />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/[0.07] border border-white/10 p-4 flex flex-col justify-between">
                    <div className="w-9 h-9 rounded-xl bg-[#FFCB47]" />
                    <div>
                      <div className="h-2 w-14 bg-white/30 rounded-full mb-2" />
                      <div className="h-2 w-8 bg-white/15 rounded-full" />
                    </div>
                  </div>
                  <div className="col-span-2 rounded-2xl bg-white/[0.07] border border-white/10 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="h-2 w-24 bg-white/30 rounded-full" />
                      <div className="h-2 w-8 bg-[#FF5A3C] rounded-full" />
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full w-2/3 bg-[#FF5A3C] rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-7 -left-7 bg-white rounded-2xl shadow-[0_16px_36px_-10px_rgba(15,27,61,0.22)] border border-[#0F1B3D]/[0.06] px-5 py-4 hidden sm:block rotate-[-2deg]">
              <p className="text-[12px] text-[#0F1B3D]/50 mb-1 font-medium">เรียนจบคอร์ส</p>
              <p className="text-[18px] font-extrabold text-[#0F1B3D]">98% อัตราความสำเร็จ</p>
            </div>
          </div>
        </div>
      </div>
      <Marquee />
    </section>
  );
}

function CourseCard({ course }: { course: Course }): ReactElement {
  const tagColor = tagColors[course.category ?? ""] ?? "bg-[#0F1B3D] text-white";
  const lessonCount = course.lessons[0]?.count ?? 0;
  return (
    <div className="group bg-white rounded-3xl border border-[#0F1B3D]/[0.06] shadow-[0_1px_2px_rgba(15,27,61,0.04)] hover:shadow-[0_20px_40px_-18px_rgba(15,27,61,0.22)] hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col">
      <div className="relative h-40 bg-gradient-to-br from-[#0F1B3D]/[0.04] to-[#0F1B3D]/[0.09] overflow-hidden">
        {course.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.cover_image_url} alt={course.title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="#0F1B3D" strokeWidth="1.5" />
                <path d="M8 9H16M8 13H13" stroke="#0F1B3D" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        )}
        {course.category && (
          <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full ${tagColor}`}>
            {course.category}
          </span>
        )}
        <div className="absolute top-2 right-2 bg-white/90 rounded-full">
          <FavoriteHeartButton courseId={course.id} />
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-[15.5px] font-bold text-[#0F1B3D] leading-snug mb-1.5 line-clamp-2">{course.title}</h3>
        <p className="text-[13px] text-[#0F1B3D]/50 mb-4 font-medium">
          {course.lessons[0]?.count || 0} บทเรียน · {formatDuration(course.total_duration_seconds)}
        </p>

        <div className="mt-auto pt-4 border-t border-[#0F1B3D]/[0.06] flex items-center justify-between">
          <span className={`text-[17px] font-extrabold ${course.price === 0 ? "text-[#00B37E]" : "text-[#0F1B3D]"}`}>
            {course.price === 0 ? "ฟรี" : formatPrice(course.price)}
          </span>
          <Link
            href={`/courses/${course.slug}`}
            className="text-[13px] font-bold text-white bg-[#0F1B3D] group-hover:bg-[#FF5A3C] px-4 py-2.5 rounded-full transition-colors"
          >
            ลงทะเบียน
          </Link>
        </div>
      </div>
    </div>
  );
}

function CourseCatalog({ courses }: { courses: Course[] }): ReactElement {
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-8 py-20 lg:py-28">
      <div className="mb-14 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
        <div>
          <span className="text-[13px] font-bold text-[#FF5A3C] tracking-[0.08em] mb-2 block">เลือกเรียนได้เลย</span>
          <h2 className="text-[30px] sm:text-[36px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] leading-tight">
            คอร์สแนะนำสำหรับคุณ
          </h2>
        </div>
        <p className="text-[15px] text-[#0F1B3D]/50 max-w-sm font-medium">
          คัดสรรคอร์สคุณภาพที่ช่วยให้คุณสร้างสกิลที่ตลาดต้องการได้จริง
        </p>
      </div>

      {courses.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
          <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ยังไม่มีคอร์สที่เปิดให้ลงทะเบียนตอนนี้</p>
        </div>
      )}
    </section>
  );
}

function CtaBanner(): ReactElement {
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-20 lg:pb-28">
      <div className="relative rounded-[32px] bg-[#0F1B3D] px-8 py-14 sm:px-16 sm:py-16 overflow-hidden text-center">
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-[#FF5A3C]/20 blur-3xl" />
        <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full bg-[#7C5CFF]/20 blur-3xl" />
        <div className="relative">
          <h2 className="text-[28px] sm:text-[38px] font-extrabold text-white tracking-[-0.02em] leading-tight max-w-xl mx-auto">
            พร้อมเริ่มต้นเส้นทางใหม่แล้วหรือยัง?
          </h2>
          <p className="mt-4 text-[15.5px] text-white/60 max-w-md mx-auto">
            สมัครวันนี้ รับส่วนลดคอร์สแรก 20% พร้อมที่ปรึกษาด้านการเรียนฟรี
          </p>
          <button
            type="button"
            className="mt-8 inline-flex items-center gap-2 text-[15px] font-bold text-[#0F1B3D] bg-[#FFCB47] hover:bg-white px-7 py-4 rounded-full transition-colors"
          >
            เริ่มเรียนฟรีวันนี้
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
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

export default async function Page(): Promise<ReactElement> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ✅ ถ้า login แล้วเป็นครู/แอดมิน ให้เด้งไปหน้าของตัวเองแทน ไม่โชว์หน้านี้
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

    if (profile?.role === "teacher") redirect("/dashboard/teacher")
    if (profile?.role === "admin") redirect("/dashboard/admin");
  }

  const displayName = user
    ? (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "ผู้ใช้"
    : null;

  // ✅ ลบ console.log debug ที่ยิงซ้ำออก เหลือแค่ error handling ปกติ
  const { data: courses, error } = await supabase
    .from("courses")
    .select(`
      id, title, slug, category, price, cover_image_url, total_duration_seconds,
      lessons(count)
    `)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(4);

  if (error) {
    console.error("Failed to fetch courses:", error.message);
  }

  return (
    <div className="min-h-screen w-full bg-white">
      <Navbar displayName={displayName} />
      <Hero />
      <CourseCatalog courses={courses ?? []} />
      <CtaBanner />
      <Footer />
    </div>
  );
}