// app/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import ProfileDropdown from "@/components/ProfileDropdown";
import { redirect } from "next/navigation";
import FavoriteHeartButton from "@/components/FavoriteHeartButton";
import AppBrand from "@/components/AppBrand";
import { DEFAULT_COURSE_COVER_URL } from "@/lib/constants/course-cover";
interface Course {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  price: number;
  cover_image_url: string | null;
  // [แก้บั๊ก: ความยาวคอร์สค้าง 0] เดิมอ่านจาก courses.total_duration_seconds ตรงๆ แต่คอลัมน์นี้
  // ไม่เคยมีโค้ดจุดไหนอัปเดตเลย (ค้าง 0 ทุกคอร์ส) — เปลี่ยนมารวมจาก video_duration_seconds ของ
  // แต่ละบทเรียนแบบสดๆ แทน (ดูฟังก์ชัน courseTotalDurationSeconds ด้านล่าง)
  lessons: { video_duration_seconds: number | null }[];
  // คะแนนรีวิวเฉลี่ย/จำนวนรีวิว — คอร์สที่ยังไม่มีรีวิวจะเป็น 0 ทั้งคู่
  avgRating: number;
  reviewCount: number;
  // ลงทะเบียนแล้วหรือยัง (approved) — ใช้สลับปุ่ม "ลงทะเบียน" เป็น "เข้าเรียนต่อ"
  isEnrolled: boolean;
}

// จำกัดสีให้เหลือแค่ 4 สีหลักของแบรนด์ (นำ/น้ำเงิน/ส้ม/ทอง)
const tagColors: Record<string, string> = {
  Development: "bg-[#FF5A3C] text-white",
  Design: "bg-[#0F1B3D] text-white",
  "Data Science": "bg-[#3157D5] text-white",
  Marketing: "bg-[#FFCB47] text-[#0F1B3D]",
};

// ข้อความสีของแท็บหมวดหมู่ (ใช้กับการ์ด "เลือกเส้นทางของคุณ" ให้ดูเป็นระบบเดียวกับแท็บคอร์ส
// แทนการสุ่มไล่สีรุ้งทีละใบ)
const tagTextColors: Record<string, string> = {
  Development: "text-[#FF5A3C]",
  Design: "text-[#0F1B3D]",
  "Data Science": "text-[#3157D5]",
  Marketing: "text-[#B9860A]",
};

// [แก้บั๊ก: ความยาวคอร์สค้าง 0] รวมความยาวคอร์สจาก video_duration_seconds ของบทเรียนจริงๆ แบบสด
// แทนการอ่าน courses.total_duration_seconds ที่ไม่เคยถูกอัปเดต — บทเรียนเก่าที่ video_duration_seconds
// ยังเป็น null/0 อยู่ (เพราะยังไม่เคยถูก save/approve ใหม่หลังแก้จุดบันทึกค่า) จะถูกนับเป็น 0 ไปก่อน
// ไม่ได้ทำให้ error แค่ยอดรวมคอร์สนั้นๆ จะดูน้อยกว่าความจริงจนกว่าจะ resave/approve
function courseTotalDurationSeconds(lessons: { video_duration_seconds: number | null }[]): number {
  return lessons.reduce((sum, l) => sum + (l.video_duration_seconds ?? 0), 0);
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชั่วโมง`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes} นาที ${secs} วินาที` : `${minutes} นาที`;
  }
  return `${secs} วินาที`;
}

function formatPrice(price: number): string {
  return `฿${price.toLocaleString("th-TH")}`;
}

function StarIcon({ size = 12, color = "#FFCB47" }: { size?: number; color?: string }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6.2 6.7.7-5 4.6 1.4 6.6L12 17.6 6 20.6l1.4-6.6-5-4.6 6.7-.7L12 2.5z"
        fill={color}
      />
    </svg>
  );
}

// แถวคะแนนรีวิว ใช้ในการ์ดคอร์สหน้าแรก — ไม่มีรีวิวก็โชว์ 0.0 พร้อมดาวจาง ๆ
function RatingChip({ avgRating, reviewCount }: { avgRating: number; reviewCount: number }): ReactElement {
  const hasReviews = reviewCount > 0;
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <StarIcon size={13} color={hasReviews ? "#FFCB47" : "#0F1B3D33"} />
      <span className={`text-[13px] font-extrabold ${hasReviews ? "text-[#0F1B3D]" : "text-[#0F1B3D]/35"}`}>
        {avgRating.toFixed(1)}
      </span>
      <span className="text-[11.5px] text-[#0F1B3D]/35 font-medium">({reviewCount})</span>
    </div>
  );
}

const navLinks: { label: string; href: string }[] = [
  { label: "คอร์สทั้งหมด", href: "/courses" },
  { label: "เส้นทางสายอาชีพ", href: "#career-paths" },
  { label: "คอร์สฟรี", href: "/courses?price=free" },
];

const marqueeTags: string[] = [
  "WEB DEVELOPMENT",
  "UI/UX DESIGN",
  "DATA ANALYTICS",
  "DIGITAL MARKETING",
  "PRODUCT MANAGEMENT",
  "AI & MACHINE LEARNING",
];

// สลับสีจุดคั่นระหว่างคำ ให้แถบดูมีสีสันขึ้นกว่าเดิม (เดิมใช้สีส้มอย่างเดียวทั้งแถบ)
const marqueeDotColors = ["#FF5A3C", "#FFCB47", "#3157D5"];

// สีไอคอนของแท็บหมวดหมู่ (hex ตรงตัว) ใช้ทำพื้นหลังจางๆ ของไอคอนในการ์ด "เลือกเส้นทางของคุณ"
// ให้มีสีสันขึ้นนิดนึงแทนที่จะเป็นการ์ดขาวล้วน
const categoryAccentHex: Record<string, string> = {
  Development: "#FF5A3C",
  Design: "#0F1B3D",
  "Data Science": "#3157D5",
  Marketing: "#E0A400",
};

const avatarStack: { initial: string; bg: string }[] = [
  { initial: "A", bg: "#FF5A3C" },
  { initial: "K", bg: "#3157D5" },
  { initial: "N", bg: "#FFCB47" },
  { initial: "P", bg: "#0F1B3D" },
];

function Navbar({ displayName }: { displayName: string | null }): ReactElement {
  return (
    <header className="app-topbar sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex h-[72px] items-center justify-between">
          <AppBrand compact />

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-lg px-4 py-2 text-[13.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0F1B3D]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {displayName ? (
              // role เป็น "student" เสมอตรงนี้ เพราะ teacher/admin ถูก redirect ออกไปแล้วก่อนถึงจุดนี้
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

// แถบหมวดหมู่เลื่อนอัตโนมัติ — กลับมาใช้แบบเดิม (เอียงเล็กน้อย พื้นหลังเข้ม เลื่อนวนไม่หยุด)
// เพิ่มสีสันขึ้นจากเดิม: พื้นหลังไล่เฉด + จุดคั่นสลับสีแบรนด์แทนสีส้มสีเดียวทั้งแถบ
function Marquee(): ReactElement {
  const doubled = [...marqueeTags, ...marqueeTags];
  return (
    <div className="relative -rotate-1 bg-gradient-to-r from-[#0F1B3D] via-[#1c2c5c] to-[#0F1B3D] py-3.5 overflow-hidden shadow-[0_10px_30px_-10px_rgba(15,27,61,0.5)] my-[-6px] z-10">
      <div className="flex whitespace-nowrap animate-[marquee_28s_linear_infinite] motion-reduce:animate-none">
        {doubled.map((tag, i) => (
          <span key={`${tag}-${i}`} className="flex items-center text-[12.5px] font-bold tracking-[0.08em] text-white/85 mx-4">
            {tag}
            <span
              className="mx-4 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: marqueeDotColors[i % marqueeDotColors.length] }}
            />
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

function HeroPreviewCard(): ReactElement {
  return (
    <div className="relative rounded-2xl bg-[#0F1B3D] p-6 shadow-[0_24px_48px_-24px_rgba(15,27,61,0.45)]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5A3C]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#FFCB47]" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/25" />
        </div>
        <span className="text-[11px] font-semibold text-white/45 tracking-[0.08em]">คอร์สยอดนิยม</span>
      </div>

      {/* วิดีโอพรีวิว */}
      <div className="relative rounded-xl bg-white/[0.06] border border-white/10 overflow-hidden aspect-video mb-3">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-white/95 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M8 6.5v11l9-5.5-9-5.5z" fill="#0F1B3D" />
            </svg>
          </div>
        </div>
        <div className="absolute bottom-3 left-3 right-3 h-1 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full w-2/5 rounded-full bg-[#FF5A3C]" />
        </div>
      </div>

      {/* ผู้เรียน + คะแนน */}
      <div className="flex items-center justify-between rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3.5 mb-3">
        <div className="flex items-center -space-x-2">
          {avatarStack.map((avatar) => (
            <span
              key={avatar.initial}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-[#0F1B3D]"
              style={{ backgroundColor: avatar.bg }}
            >
              {avatar.initial}
            </span>
          ))}
          <span className="w-7 h-7 rounded-full bg-white/10 ring-2 ring-[#0F1B3D] flex items-center justify-center text-[9.5px] font-semibold text-white/70">
            +2k
          </span>
        </div>
        <div className="flex items-center gap-1">
          <StarIcon size={13} />
          <span className="text-[13px] font-bold text-white">4.8</span>
        </div>
      </div>

      {/* อัตราความสำเร็จ — วางเป็นแถวในการ์ดเดียวกัน ไม่ลอยทับขอบการ์ดแบบเอียง */}
      <div className="flex items-center justify-between rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3.5">
        <span className="text-[12.5px] text-white/45 font-medium">เรียนจบคอร์ส</span>
        <span className="text-[14px] font-bold text-white">98% อัตราความสำเร็จ</span>
      </div>
    </div>
  );
}

function Hero(): ReactElement {
  return (
    <section className="relative">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-16 pb-16 lg:pt-20 lg:pb-20">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-12 items-center">
          <div>
            <p className="text-[13px] font-semibold text-[#FF5A3C] tracking-[0.04em] mb-4">
              แพลตฟอร์มเรียนรู้ออนไลน์
            </p>

            <h1 className="text-[40px] sm:text-[54px] leading-[1.08] font-extrabold text-[#0F1B3D] tracking-[-0.02em] text-balance">
              เก่งขึ้นได้จริง
              <br />
              ใน<span className="text-[#3157D5]">โลกที่เปลี่ยนไว</span>
            </h1>

            <p className="mt-6 text-[16px] leading-relaxed text-[#0F1B3D]/60 max-w-[440px]">
              เรียนกับผู้สอนตัวจริงในสายงาน ลงมือทำโปรเจกต์จริง พร้อมใบรับรองที่บริษัทชั้นนำให้การยอมรับ
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/courses"
                className="inline-flex items-center gap-2 text-[15px] font-bold text-white bg-[#0F1B3D] hover:bg-[#182852] px-7 py-4 rounded-full transition-all hover:-translate-y-0.5 shadow-[0_12px_28px_-10px_rgba(15,27,61,0.55)]"
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

            <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-5">
              <div>
                <p className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">120+</p>
                <p className="text-[13px] text-[#0F1B3D]/50 font-medium">คอร์สจากผู้เชี่ยวชาญ</p>
              </div>
              <div className="w-px h-10 bg-[#0F1B3D]/10" />
              <div className="flex items-center gap-3">
                <div className="flex items-center -space-x-2.5">
                  {avatarStack.map((avatar) => (
                    <span
                      key={avatar.initial}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[10.5px] font-bold text-white ring-2 ring-white"
                      style={{ backgroundColor: avatar.bg }}
                    >
                      {avatar.initial}
                    </span>
                  ))}
                </div>
                <div>
                  <p className="text-[14.5px] font-bold text-[#0F1B3D] tracking-[-0.01em]">40k+ ผู้เรียน</p>
                  <p className="flex items-center gap-1 text-[12px] text-[#0F1B3D]/50 font-medium">
                    <StarIcon size={11} />
                    ให้คะแนน 4.8/5
                  </p>
                </div>
              </div>
            </div>
          </div>

          <HeroPreviewCard />
        </div>
      </div>
      <Marquee />
    </section>
  );
}

interface PathCourse {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  description: string | null;
}

function PathCard({ course }: { course: PathCourse }): ReactElement {
  const accent = tagTextColors[course.category ?? ""] ?? "text-[#0F1B3D]";
  const accentHex = categoryAccentHex[course.category ?? ""] ?? "#0F1B3D";
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex min-h-[224px] flex-col justify-between rounded-2xl border border-[#0F1B3D]/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(15,27,61,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-18px_rgba(15,27,61,0.22)]"
    >
      <div>
        {/* ไอคอนสีตามหมวดหมู่ พื้นหลังจางๆ — เพิ่มความมีสีสันให้การ์ดแทนที่จะเป็นขาวล้วน */}
        <span
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4"
          style={{ backgroundColor: `${accentHex}17` }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke={accentHex} strokeWidth="1.8" strokeLinejoin="round" />
            <path
              d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5"
              stroke={accentHex}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.55"
            />
          </svg>
        </span>
        <p className={`text-[12px] font-bold uppercase tracking-[0.06em] ${accent}`}>
          {course.category ?? "คอร์สแนะนำ"}
        </p>
        <h3 className="mt-2 text-[16.5px] font-bold leading-snug text-[#0F1B3D] line-clamp-2">{course.title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-[#0F1B3D]/50 line-clamp-2">
          {course.description?.trim() || "เริ่มต้นเรียนรู้ทักษะใหม่ไปกับคอร์สนี้ได้เลยวันนี้"}
        </p>
      </div>

      <span className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-[#0F1B3D]/40 transition-colors group-hover:text-[#0F1B3D]">
        ดูรายละเอียด
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="transition-transform group-hover:translate-x-0.5">
          <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}

// เส้นทางสายอาชีพ — ดึงคอร์สที่เผยแพร่แล้วมาแสดงจริง ลิงก์เข้าคอร์สจริงแต่ละใบ
function CareerPaths({ courses }: { courses: PathCourse[] }): ReactElement | null {
  if (courses.length === 0) return null;

  return (
    <section id="career-paths" className="scroll-mt-24 max-w-7xl mx-auto px-6 lg:px-8 pt-14 lg:pt-20 pb-10 lg:pb-14">
      <div className="mb-10">
        <p className="text-[12.5px] font-bold text-[#3157D5] tracking-[0.04em] mb-2.5">
          เลือกเส้นทางของคุณ
        </p>
        <h2 className="text-[26px] sm:text-[32px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] leading-tight max-w-xl">
          เริ่มต้นสายอาชีพที่ใช่ ตั้งแต่วันนี้
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {courses.map((course) => (
          <PathCard key={course.id} course={course} />
        ))}
      </div>
    </section>
  );
}

function CourseCard({ course }: { course: Course }): ReactElement {
  const tagColor = tagColors[course.category ?? ""] ?? "bg-[#0F1B3D] text-white";
  return (
    <div className="group bg-white rounded-3xl border border-[#0F1B3D]/[0.06] shadow-[0_1px_2px_rgba(15,27,61,0.04)] hover:shadow-[0_24px_48px_-20px_rgba(15,27,61,0.24)] hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col">
      <div className="relative h-40 bg-gradient-to-br from-[#0F1B3D]/[0.04] to-[#0F1B3D]/[0.09] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={course.cover_image_url ?? DEFAULT_COURSE_COVER_URL}
          alt={course.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {course.category && (
          <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm ${tagColor}`}>
            {course.category}
          </span>
        )}
        <div className="absolute top-2 right-2 bg-white/90 rounded-full shadow-sm">
          <FavoriteHeartButton courseId={course.id} />
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-[15.5px] font-bold text-[#0F1B3D] leading-snug mb-1.5 line-clamp-2 min-h-[2.6em]">
          {course.title}
        </h3>

        <RatingChip avgRating={course.avgRating} reviewCount={course.reviewCount} />

        <p className="text-[13px] text-[#0F1B3D]/50 mb-4 font-medium">
          {course.lessons.length} บทเรียน · {formatDuration(courseTotalDurationSeconds(course.lessons))}
        </p>

        <div className="mt-auto pt-4 border-t border-[#0F1B3D]/[0.06] flex items-center justify-between">
          <span className={`text-[17px] font-extrabold ${course.price === 0 ? "text-[#3157D5]" : "text-[#0F1B3D]"}`}>
            {course.price === 0 ? "ฟรี" : formatPrice(course.price)}
          </span>
          <Link
            href={course.isEnrolled ? `/dashboard/student/courses/${course.id}` : `/courses/${course.slug}`}
            className="text-[13px] font-bold text-white bg-[#0F1B3D] group-hover:bg-[#FF5A3C] px-4 py-2.5 rounded-full transition-colors"
          >
            {course.isEnrolled ? "เข้าเรียนต่อ" : "ลงทะเบียน"}
          </Link>
        </div>
      </div>
    </div>
  );
}

function CourseCatalog({ courses }: { courses: Course[] }): ReactElement {
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-8 pt-10 lg:pt-14 pb-20 lg:pb-28">
      <div className="mb-14 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
        <div>
          <p className="text-[12.5px] font-bold text-[#FF5A3C] tracking-[0.04em] mb-2.5">
            เลือกเรียนได้เลย
          </p>
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
        <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
          <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ยังไม่มีคอร์สที่เปิดให้ลงทะเบียนตอนนี้</p>
        </div>
      )}
    </section>
  );
}

function CtaBanner(): ReactElement {
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-8 pb-20 lg:pb-28">
      <div className="rounded-2xl bg-[#0F1B3D] px-8 py-14 sm:px-16 sm:py-16 text-center">
        <h2 className="text-[28px] sm:text-[36px] font-extrabold text-white tracking-[-0.02em] leading-tight max-w-xl mx-auto text-balance">
          พร้อมเริ่มต้นเส้นทางใหม่แล้วหรือยัง?
        </h2>
        <p className="mt-4 text-[15px] text-white/60 max-w-md mx-auto">
          สมัครวันนี้ รับส่วนลดคอร์สแรก 20% พร้อมที่ปรึกษาด้านการเรียนฟรี
        </p>
        <button
          type="button"
          className="mt-8 inline-flex items-center gap-2 text-[15px] font-bold text-[#0F1B3D] bg-[#FFCB47] hover:bg-white px-7 py-4 rounded-full transition-all hover:-translate-y-0.5"
        >
          เริ่มเรียนฟรีวันนี้
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="mt-7 flex items-center justify-center gap-2.5">
          <div className="flex items-center -space-x-2">
            {avatarStack.map((avatar) => (
              <span
                key={avatar.initial}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-[#0F1B3D]"
                style={{ backgroundColor: avatar.bg }}
              >
                {avatar.initial}
              </span>
            ))}
          </div>
          <p className="text-[12.5px] text-white/45 font-medium">ร่วมเรียนกับผู้เรียนกว่า 40,000 คนแล้ววันนี้</p>
        </div>
      </div>
    </section>
  );
}

function Footer(): ReactElement {
  return (
    <footer className="border-t border-[#0F1B3D]/[0.06] bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="flex flex-col items-center sm:items-start gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0F1B3D] flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="#FF5A3C" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[14.5px] font-extrabold text-[#0F1B3D]">Interact Edu</span>
          </div>
          <p className="text-[12.5px] text-[#0F1B3D]/40 font-medium">แพลตฟอร์มเรียนรู้ออนไลน์</p>
        </div>

        <nav className="flex items-center gap-5">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[12.5px] font-semibold text-[#0F1B3D]/45 hover:text-[#0F1B3D] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="text-[12.5px] text-[#0F1B3D]/40 font-medium">
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

  // ถ้า login แล้วเป็นครู/แอดมิน ให้เด้งไปหน้าของตัวเองแทน ไม่โชว์หน้านี้
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

    if (profile?.role === "teacher") redirect("/dashboard/teacher")
    if (profile?.role === "admin") redirect("/dashboard/admin");
  }

  const displayName = user
    ? (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "ผู้ใช้"
    : null;

  const { data: courses, error } = await supabase
    .from("courses")
    .select(`
      id, title, slug, category, price, cover_image_url,
      lessons(video_duration_seconds)
    `)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(4);

  if (error) {
    console.error("Failed to fetch courses:", error.message);
  }

  // ดึงคะแนนรีวิวของคอร์สที่โชว์ในหน้านี้ แล้วคำนวณเฉลี่ย/นับจำนวนเอง
  // (course_reviews อ่านสาธารณะได้สำหรับคอร์สที่เผยแพร่แล้วอยู่แล้วตาม RLS)
  const courseIds = (courses ?? []).map((c) => c.id);
  const ratingByCourse = new Map<string, { sum: number; count: number }>();

  if (courseIds.length > 0) {
    const { data: reviewRows, error: reviewsError } = await supabase
      .from("course_reviews")
      .select("course_id, rating")
      .in("course_id", courseIds);

    if (reviewsError) {
      console.error("Failed to fetch course ratings:", reviewsError.message);
    }

    for (const row of reviewRows ?? []) {
      const entry = ratingByCourse.get(row.course_id) ?? { sum: 0, count: 0 };
      entry.sum += row.rating;
      entry.count += 1;
      ratingByCourse.set(row.course_id, entry);
    }
  }

  // เช็คว่าคอร์สไหนที่ user คนนี้ลงทะเบียนอนุมัติแล้วบ้าง เอาไว้สลับปุ่ม "ลงทะเบียน" เป็น
  // "เข้าเรียนต่อ" ในการ์ดคอร์ส — ไม่ต้องล็อกอินก็ยังดูรายการคอร์สได้ตามปกติ แค่ enrolledCourseIds ว่าง
  const enrolledCourseIds = new Set<string>();
  if (user && courseIds.length > 0) {
    const { data: enrollmentRows } = await supabase
      .from("enrollments")
      .select("course_id")
      .eq("student_id", user.id)
      .eq("status", "approved")
      .in("course_id", courseIds);
    for (const row of enrollmentRows ?? []) enrolledCourseIds.add(row.course_id as string);
  }

  const coursesWithRatings: Course[] = (courses ?? []).map((c) => {
    const stats = ratingByCourse.get(c.id);
    return {
      ...c,
      avgRating: stats ? stats.sum / stats.count : 0,
      reviewCount: stats?.count ?? 0,
      isEnrolled: enrolledCourseIds.has(c.id),
    };
  });

  // ดึงคอร์สที่เผยแพร่แล้วมาใส่ในการ์ด "เลือกเส้นทางของคุณ" — เอาชื่อ/คำอธิบาย/หมวดหมู่
  // จริงจากฐานข้อมูล ไม่ได้ผูก career-path มั่วๆ ที่ไม่ตรงกับคอร์สจริง ลิงก์ตรงไปหน้าคอร์สนั้นเลย
  const { data: pathCoursesData, error: pathCoursesError } = await supabase
    .from("courses")
    .select("id, title, slug, category, description")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(8);

  if (pathCoursesError) {
    console.error("Failed to fetch career path courses:", pathCoursesError.message);
  }

  return (
    <div className="min-h-screen w-full app-canvas">
      <Navbar displayName={displayName} />
      <Hero />
      <CareerPaths courses={pathCoursesData ?? []} />
      <CourseCatalog courses={coursesWithRatings} />
      <CtaBanner />
      <Footer />
    </div>
  );
}
