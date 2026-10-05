import { hasStartedLearning, isCourseInLibrary, loadLearningEnrollments, type LearningEnrollment } from "@/lib/courses/learning-enrollment";
import { loadSavedCourseEnrollments } from "@/lib/courses/course-library";
// app/courses/page.tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getActivePlusExpiry } from "@/lib/payments/active-plus";
import ProfileDropdown from "@/components/ProfileDropdown";
import CoursesExplorer, { type ExplorerCourse } from "@/components/CoursesExplorer";
import AppBrand from "@/components/AppBrand";

const navLinks: { label: string; href: string }[] = [
  { label: "คอร์สทั้งหมด", href: "/courses" },
  { label: "Interact Edu Plus", href: "/membership" },
  { label: "เส้นทางสายอาชีพ", href: "/#career-paths" },
  { label: "คอร์สฟรี", href: "/courses?price=free" },
];

function Navbar({ displayName, avatarUrl, plusExpiresAt }: { displayName: string | null; avatarUrl: string | null; plusExpiresAt: string | null }): ReactElement {
  return (
    <header className="app-topbar sticky top-0 z-50">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[74px] items-center justify-between">
          <AppBrand compact />

          <nav className="hidden xl:flex items-center gap-2">
            {navLinks.map((link) =>
              link.label === "คอร์สทั้งหมด" ? (
                <Link
                  key={link.label}
                  href={link.href}
                  className="rounded-xl bg-[#0F1B3D] px-4 py-2 text-[13px] font-bold text-white shadow-sm"
                >
                  {link.label}
                </Link>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className="rounded-xl px-4 py-2 text-[13px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0F1B3D]"
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/membership"
              className="inline-flex rounded-xl border border-slate-200 px-3 py-2 text-[12px] font-bold text-[#3157D5] transition-colors hover:bg-blue-50 xl:hidden"
            >
              ✦ Plus
            </Link>
            {displayName ? (
              <ProfileDropdown displayName={displayName} avatarUrl={avatarUrl} role="student" plusExpiresAt={plusExpiresAt} />
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
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6 lg:px-8">
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

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ price?: string }>;
}): Promise<ReactElement> {
  const { price } = await searchParams;
  const initialFreeOnly = price === "free";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle()
    : { data: null };

  const displayName = user
    ? (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "ผู้ใช้"
    : null;
  const plusExpiresAt = user ? await getActivePlusExpiry(supabase, user.id) : null;

  // ดึงคอร์สที่เผยแพร่แล้วทั้งหมด — กรอง/ค้นหาฝั่ง client ผ่าน CoursesExplorer
  // [แก้บั๊ก: ความยาวคอร์สค้าง 0] เดิมอ่าน courses.total_duration_seconds ตรงๆ แต่คอลัมน์นี้ไม่เคย
  // มีโค้ดจุดไหนอัปเดตเลย (ค้าง 0 ทุกคอร์ส) — ดึง video_duration_seconds ของแต่ละบทเรียนมาแทน
  // แล้วรวมยอด/นับจำนวนบทเรียนสดๆ ด้านล่าง (บทเรียนเก่าที่ยังไม่เคย resave/approve หลังแก้จุดบันทึก
  // ค่าจะนับเป็น 0 ไปก่อน ไม่ error แค่ยอดรวมคอร์สนั้นดูน้อยกว่าความจริงจนกว่าจะ resave/approve)
  const { data: courses, error } = await supabase
    .from("courses")
    .select(`
      id, title, slug, category, price, cover_image_url,
      lessons(video_duration_seconds)
    `)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch courses:", error.message);
  }

  // เช็คว่าคอร์สไหนที่ user คนนี้ลงทะเบียนอนุมัติแล้วบ้าง เอาไว้สลับปุ่ม "ลงทะเบียน" เป็น
  // "เข้าเรียนต่อ" ในการ์ดคอร์ส — ไม่ต้องล็อกอินก็ยังดูรายการคอร์สได้ตามปกติ แค่ enrolledCourseIds ว่าง
  let enrolledCourseIds: string[] = [];
  let accessibleCourseIds: string[] = [];
  let startedCourseIds: string[] = [];
  let membershipCourseIds: string[] = [];
  let savedCourseIds: string[] = [];
  let savingAvailable = false;
  if (user) {
    const { data: enrollmentRows } = await loadLearningEnrollments((includeStart) => supabase
      .from("enrollments")
      .select(`id, course_id, membership_order_id, ${includeStart ? "learning_started_at, " : ""}scorm_tracking(lesson_id, last_accessed, video_completed, lesson_status, completed_scos, cmi_data), student_study_time(total_seconds)`)
      .eq("student_id", user.id)
      .eq("status", "approved")
      .or(`access_expires_at.is.null,access_expires_at.gt.${new Date().toISOString()}`));
    const library = await loadSavedCourseEnrollments(supabase, user.id);
    savingAvailable = library.ready;
    const rows = (enrollmentRows ?? []) as unknown as (LearningEnrollment & { id: string; course_id: string })[];
    accessibleCourseIds = rows.map((e) => e.course_id);
    enrolledCourseIds = rows.filter((row) => isCourseInLibrary(row, library.enrollmentIds)).map((e) => e.course_id);
    startedCourseIds = rows.filter(hasStartedLearning).map((e) => e.course_id);
    membershipCourseIds = rows.filter((row) => row.membership_order_id).map((e) => e.course_id);
    savedCourseIds = rows.filter((row) => library.enrollmentIds.has(row.id)).map((e) => e.course_id);
  }

  const explorerCourses: ExplorerCourse[] = (courses ?? []).map((course) => ({
    id: course.id,
    title: course.title,
    slug: course.slug,
    category: course.category,
    price: course.price,
    cover_image_url: course.cover_image_url,
    total_duration_seconds: course.lessons.reduce((sum, l) => sum + (l.video_duration_seconds ?? 0), 0),
    lesson_count: course.lessons.length,
  }));

  return (
    <div className="min-h-screen w-full bg-white">
      <Navbar displayName={displayName} avatarUrl={profile?.avatar_url ?? null} plusExpiresAt={plusExpiresAt} />
      <ExplorerHero />
      <CoursesExplorer courses={explorerCourses} enrolledCourseIds={enrolledCourseIds} accessibleCourseIds={accessibleCourseIds} startedCourseIds={startedCourseIds} membershipCourseIds={membershipCourseIds} savedCourseIds={savedCourseIds} savingAvailable={savingAvailable} initialFreeOnly={initialFreeOnly} />
      <Footer />
    </div>
  );
}
