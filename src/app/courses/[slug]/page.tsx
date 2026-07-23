import type { ReactElement } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CourseTabs from "@/components/CourseTabs";

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  category: string | null;
  price: number;
  course_code: string | null;
}

interface LessonRow {
  id: string;
  title: string;
  video_duration_seconds: number;
  order_index: number;
}

interface ModuleRow {
  id: string;
  title: string;
  order_index: number;
  lessons: LessonRow[];
}

const categoryColors: Record<string, string> = {
  Development: "bg-[#FF5A3C] text-white",
  Design: "bg-[#7C5CFF] text-white",
  "Data Science": "bg-[#00B37E] text-white",
  Marketing: "bg-[#FFCB47] text-[#0F1B3D]",
};

function getCategoryColor(category: string | null): string {
  if (!category) return "bg-[#0F1B3D]/10 text-[#0F1B3D]";
  return categoryColors[category] ?? "bg-[#0F1B3D]/10 text-[#0F1B3D]";
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "< 1 ชั่วโมง";
  const hours = Math.floor(totalSeconds / 3600);
  if (hours <= 0) return "< 1 ชั่วโมง";
  return `${hours} ชั่วโมง`;
}

function formatPrice(price: number): string {
  if (price === 0) return "ฟรี";
  return `฿${price.toLocaleString("th-TH")}`;
}

function DetailNavbar(): ReactElement {
  return (
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
          <Link
            href="/"
            className="text-[14px] font-bold text-[#0F1B3D]/70 hover:text-[#0F1B3D] px-4 py-2.5 rounded-full hover:bg-[#0F1B3D]/[0.04] transition-colors"
          >
            ← กลับไปหน้าคอร์สทั้งหมด
          </Link>
        </div>
      </div>
    </header>
  );
}

function StatItem({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <p className="text-[20px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">{value}</p>
      <p className="text-[12.5px] text-[#0F1B3D]/50 font-medium">{label}</p>
    </div>
  );
}

function EnrollCta({ course, isEnrolled }: { course: Course; isEnrolled: boolean }): ReactElement {
  if (isEnrolled) {
    return (
      <Link
        href={`/play/${course.id}`}
        className="inline-flex items-center justify-center gap-2 text-[15px] font-bold text-white bg-[#0F1B3D] hover:bg-[#182852] px-7 py-4 rounded-full transition-colors shadow-[0_12px_28px_-10px_rgba(15,27,61,0.55)] w-full"
      >
        เข้าเรียนต่อ
      </Link>
    );
  }

  return (
    <Link
      href={`/courses/${course.slug}/enroll`}
      className="inline-flex items-center justify-center gap-2 text-[15px] font-bold text-white bg-[#FF5A3C] hover:bg-[#EB4A2D] px-7 py-4 rounded-full transition-colors shadow-[0_12px_28px_-10px_rgba(255,90,60,0.5)] w-full"
    >
      สมัครเรียนเลย
    </Link>
  );
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactElement> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: course, error } = await supabase
    .from("courses")
    .select("id, title, slug, description, cover_image_url, category, price, course_code")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !course) {
    notFound();
  }

  const typedCourse = course as Course;

  // ดึงเนื้อหาคอร์สจริงจาก modules + lessons แทนการใช้คอลัมน์ hardcode
  const { data: modulesData, error: modulesError } = await supabase
    .from("modules")
    .select("id, title, order_index, lessons(id, title, video_duration_seconds, order_index)")
    .eq("course_id", typedCourse.id)
    .order("order_index", { ascending: true })
    .order("order_index", { ascending: true, referencedTable: "lessons" });

  if (modulesError) {
    console.error("Failed to fetch modules:", modulesError.message);
  }

  const modules: ModuleRow[] = (modulesData ?? []) as unknown as ModuleRow[];

  const totalDurationSeconds = modules.reduce(
    (sum, m) => sum + m.lessons.reduce((s, l) => s + (l.video_duration_seconds ?? 0), 0),
    0
  );
  const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isEnrolled = false;
  if (user) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, status")
      .eq("student_id", user.id)
      .eq("course_id", typedCourse.id)
      .eq("status", "approved")
      .maybeSingle();

    isEnrolled = Boolean(enrollment);
  }

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA]">
      <DetailNavbar />

      {/* Hero banner แบบเดียวกับภาพตัวอย่าง */}
      <section className="bg-gradient-to-br from-[#FFCB47] to-[#FF5A3C]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10">
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 bg-white rounded-[28px] p-4 sm:p-5 shadow-[0_25px_60px_-25px_rgba(15,27,61,0.4)]">
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#0F1B3D] to-[#182852] aspect-[16/9] lg:aspect-auto">
              {typedCourse.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={typedCourse.cover_image_url}
                  alt={typedCourse.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="5" width="18" height="14" rx="2" stroke="white" strokeWidth="1.5" />
                      <path d="M8 9H16M8 13H13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-center py-2">
              <span
                className={`inline-flex self-start text-[12px] font-bold px-3 py-1.5 rounded-full mb-4 ${getCategoryColor(
                  typedCourse.category
                )}`}
              >
                {typedCourse.category ?? "ทั่วไป"}
              </span>

              <h1 className="text-[26px] sm:text-[32px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] leading-tight">
                {typedCourse.title}
              </h1>

              {typedCourse.course_code && (
                <p className="mt-2 text-[13px] text-[#0F1B3D]/40 font-medium">
                  รหัสคอร์ส: {typedCourse.course_code}
                </p>
              )}

              <p className="mt-6 text-[28px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
                {formatPrice(typedCourse.price)}
              </p>

              <div className="mt-6">
                <EnrollCta course={typedCourse} isEnrolled={isEnrolled} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-10 lg:gap-12">
          <div>
            <div className="flex items-center gap-8 pb-8 border-b border-[#0F1B3D]/[0.08]">
              <StatItem label="ความยาวคอร์ส" value={formatDuration(totalDurationSeconds)} />
              <div className="w-px h-10 bg-[#0F1B3D]/10" />
              <StatItem label="จำนวนบทเรียน" value={`${totalLessons} บท`} />
            </div>

            <CourseTabs description={typedCourse.description} modules={modules} />
          </div>

          <div>
            <div className="sticky top-28 rounded-3xl bg-white border border-[#0F1B3D]/[0.06] shadow-[0_20px_40px_-18px_rgba(15,27,61,0.15)] p-7">
              <p className="text-[13px] font-bold text-[#0F1B3D]/50 mb-1">ราคาคอร์ส</p>
              <p className="text-[32px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] mb-6">
                {formatPrice(typedCourse.price)}
              </p>

              <EnrollCta course={typedCourse} isEnrolled={isEnrolled} />

              <ul className="mt-7 space-y-3">
                <li className="flex items-center gap-2.5 text-[13.5px] text-[#0F1B3D]/60 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A3C] shrink-0" />
                  เข้าถึงบทเรียนได้ตลอดหลักสูตร
                </li>
                <li className="flex items-center gap-2.5 text-[13.5px] text-[#0F1B3D]/60 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A3C] shrink-0" />
                  ติดตามความคืบหน้าการเรียนได้แบบเรียลไทม์
                </li>
                <li className="flex items-center gap-2.5 text-[13.5px] text-[#0F1B3D]/60 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A3C] shrink-0" />
                  ใบรับรองเมื่อเรียนจบคอร์ส
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}