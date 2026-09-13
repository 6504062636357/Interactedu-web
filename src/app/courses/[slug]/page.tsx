import type { ReactElement } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CourseTabs from "@/components/CourseTabs";
import AppBrand from "@/components/AppBrand";
import CourseReviews, { type CourseReviewItem } from "@/components/courses/CourseReviews";
import { DEFAULT_COURSE_COVER_URL } from "@/lib/constants/course-cover";

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

interface CourseReviewRow {
  id: string;
  rating: number;
  meets_expectation: boolean;
  liked_tags: string[] | null;
  comment: string | null;
  created_at: string;
  student_id: string;
  student_name: string;
  student_avatar_url: string | null;
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

// [แก้บั๊ก: หน้านี้เคยปัดทุกค่าต่ำกว่า 1 ชม. เป็น "< 1 ชั่วโมง" หมด] ตอนนี้คอลัมน์
// lessons.video_duration_seconds เริ่มมีค่าจริงแล้ว (ดู saveLessonDraft/updateLessonDraft) แต่บทเรียน
// ส่วนใหญ่ตอนนี้ยาวแค่หลักนาที/วินาที (วิดีโอทดสอบ) ทำให้โดนปัดจนดูเหมือนยังไม่ได้แก้ — เปลี่ยนมาใช้
// สูตรเดียวกับ app/page.tsx และ CoursesExplorer.tsx (แสดงวินาที/นาที/ชั่วโมงตามจริง) ให้ตรงกันทั้งเว็บ
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
  if (price === 0) return "ฟรี";
  return `฿${price.toLocaleString("th-TH")}`;
}

function DetailNavbar(): ReactElement {
  return (
    <header className="app-topbar sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex h-[74px] items-center justify-between">
          <AppBrand compact />
          <Link
            href="/"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-bold text-slate-600 shadow-sm transition hover:border-[#3157D5]/20 hover:text-[#3157D5]"
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

function EnrollCta({
  course,
  isEnrolled,
  firstLessonId,
}: {
  course: Course;
  isEnrolled: boolean;
  firstLessonId: string | null;
}): ReactElement {
  if (isEnrolled) {
    const href = firstLessonId
      ? `/play/${course.id}/${firstLessonId}`
      : `/play/${course.id}`;

    return (
      <Link
        href={href}
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

  const firstLessonId: string | null =
    [...modules]
      .sort((a, b) => a.order_index - b.order_index)
      .flatMap((m) => [...m.lessons].sort((a, b) => a.order_index - b.order_index))[0]?.id ?? null;

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

  // ★ เพิ่มใหม่: ดึงรีวิวของคอร์สนี้ทั้งหมด — ตาราง course_reviews เปิดให้อ่านสาธารณะสำหรับ
  // คอร์สที่เผยแพร่แล้ว (RLS) เพราะหน้านี้เป็นหน้าสาธารณะ ไม่ต้องล็อกอินก็ดูรีวิวได้
  const { data: reviewsData, error: reviewsError } = await supabase
    .from("course_reviews")
    .select(
      "id, rating, meets_expectation, liked_tags, comment, created_at, student_id, student_name, student_avatar_url"
    )
    .eq("course_id", typedCourse.id)
    .order("created_at", { ascending: false });

  if (reviewsError) {
    console.error("Failed to fetch course reviews:", reviewsError.message);
  }

  const reviews: CourseReviewItem[] = ((reviewsData ?? []) as CourseReviewRow[]).map((r) => ({
    id: r.id,
    rating: r.rating,
    meetsExpectation: r.meets_expectation,
    likedTags: r.liked_tags ?? [],
    comment: r.comment,
    createdAt: r.created_at,
    studentId: r.student_id,
    studentName: r.student_name,
    studentAvatarUrl: r.student_avatar_url,
  }));

  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA]">
      <DetailNavbar />

      {/* Hero banner แบบเดียวกับภาพตัวอย่าง */}
      <section className="bg-gradient-to-br from-[#FFCB47] to-[#FF5A3C]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10">
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 bg-white rounded-[28px] p-4 sm:p-5 shadow-[0_25px_60px_-25px_rgba(15,27,61,0.4)]">
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#0F1B3D] to-[#182852] aspect-[16/9] lg:aspect-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={typedCourse.cover_image_url ?? DEFAULT_COURSE_COVER_URL}
                alt={typedCourse.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
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

              {/* ★ เพิ่มใหม่: badge คะแนนรีวิวเฉลี่ย โชว์เฉพาะตอนมีรีวิวแล้วอย่างน้อย 1 รีวิว */}
              {reviewCount > 0 && (
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="text-[13px] font-extrabold text-[#0F1B3D]">{avgRating.toFixed(1)}</span>
                  <span className="text-[13px] text-[#FFB020]" aria-hidden="true">
                    {"★".repeat(Math.round(avgRating))}
                    {"☆".repeat(5 - Math.round(avgRating))}
                  </span>
                  <span className="text-[12px] text-[#0F1B3D]/40 font-medium">({reviewCount} รีวิว)</span>
                </div>
              )}

              <p className="mt-6 text-[28px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
                {formatPrice(typedCourse.price)}
              </p>

              <div className="mt-6">
                <EnrollCta course={typedCourse} isEnrolled={isEnrolled} firstLessonId={firstLessonId} />
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

              <EnrollCta course={typedCourse} isEnrolled={isEnrolled} firstLessonId={firstLessonId} />

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

      {/* ★ เพิ่มใหม่: ส่วนรีวิวจากผู้เรียน — สรุปคะแนน + ฟอร์มส่งรีวิว (เฉพาะคนที่ลงทะเบียนแล้ว) + รายการความคิดเห็น */}
      {/* id="reviews" ไว้ให้หน้าอื่น (เช่นหน้าคอร์สของฉัน) ลิงก์มาเด้งตรงส่วนนี้ได้ด้วย #reviews */}
      <section id="reviews" className="max-w-7xl mx-auto px-6 lg:px-8 pb-16 scroll-mt-20">
        <CourseReviews
          courseId={typedCourse.id}
          slug={typedCourse.slug}
          reviews={reviews}
          canReview={isEnrolled}
          currentUserId={user?.id ?? null}
        />
      </section>
    </div>
  );
}
