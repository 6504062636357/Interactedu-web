import type { ReactElement } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { enrollFreeCourse } from "./actions";
import OmiseQrPayment from "@/components/OmiseQrPayment";
import AppBrand from "@/components/AppBrand";

interface Course {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  price: number;
}

function formatPrice(price: number): string {
  if (price === 0) return "ฟรี";
  return `฿${price.toLocaleString("th-TH")}`;
}

export default async function EnrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}): Promise<ReactElement> {
  const { slug } = await params;
  const { error: submitError } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/courses/${slug}/enroll`);
  }

  const { data: course, error } = await supabase
    .from("courses")
    .select("id, title, slug, cover_image_url, price")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !course) {
    notFound();
  }

  const typedCourse = course as Course;

  const { data: existingEnrollment } = await supabase
    .from("enrollments")
    .select("id, status")
    .eq("student_id", user.id)
    .eq("course_id", typedCourse.id)
    .maybeSingle();

  // ถ้าเคยอนุมัติเข้าเรียนแล้ว พาไปหน้า Success
  if (existingEnrollment?.status === "approved") {
    redirect(`/courses/${slug}/success`);
  }

  const isFree = typedCourse.price === 0;

  return (
    <div className="app-canvas min-h-screen w-full">
      <header className="app-topbar sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex h-[74px] items-center justify-between">
            <AppBrand compact />
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 lg:px-8 py-12">
        <h1 className="text-[26px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] mb-8">คำสั่งซื้อ</h1>

        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
          <div className="bg-white rounded-3xl border border-[#0F1B3D]/[0.06] p-7">
            <div className="flex items-center gap-1.5 mb-5">
              <span className="w-1 h-4 bg-[#FF5A3C] rounded-full" />
              <h2 className="text-[16px] font-bold text-[#0F1B3D]">รายการสินค้า</h2>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative w-28 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-[#0F1B3D] to-[#182852] shrink-0">
                {typedCourse.cover_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={typedCourse.cover_image_url} alt={typedCourse.title} className="absolute inset-0 w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="inline-flex text-[10.5px] font-bold text-[#FF5A3C] bg-[#FF5A3C]/10 px-2 py-1 rounded-full mb-1.5">
                  Online Course
                </span>
                <p className="text-[15px] font-bold text-[#0F1B3D] truncate">{typedCourse.title}</p>
              </div>
              <span className="text-[15px] font-bold text-[#0F1B3D] shrink-0">{formatPrice(typedCourse.price)}</span>
            </div>

            {submitError && (
              <p className="mt-5 text-[13px] font-semibold text-[#EB4A2D]">
                เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง
              </p>
            )}
          </div>

          <div>
            <div className="bg-[#FFF7E8] rounded-3xl border border-[#FFCB47]/30 p-7">
              <h2 className="text-[15px] font-bold text-[#0F1B3D] mb-5">สรุปการสั่งซื้อ</h2>

              <div className="flex items-center justify-between text-[14px] font-medium text-[#0F1B3D]/70 mb-2">
                <span>คอร์สออนไลน์</span>
                <span>{formatPrice(typedCourse.price)}</span>
              </div>
              <div className="flex items-center justify-between text-[15px] font-bold text-[#0F1B3D] pt-3 border-t border-[#0F1B3D]/10 mb-5">
                <span>สรุปยอดชำระ</span>
                <span>{formatPrice(typedCourse.price)}</span>
              </div>

              <p className="text-[12px] text-[#0F1B3D]/50 leading-relaxed mb-5">
                เมื่อชำระเงิน ถือว่าท่านได้ยอมรับ{" "}
                <span className="text-[#FF5A3C] font-semibold">ข้อตกลงและเงื่อนไขการใช้บริการ</span>{" "}
                เรียบร้อยแล้ว
              </p>

              {isFree ? (
                <form action={enrollFreeCourse.bind(null, typedCourse.id, slug)}>
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center text-[15px] font-bold text-white bg-[#FFCB47] hover:bg-[#f0bc3a] px-7 py-4 rounded-full transition-colors"
                  >
                    ลงทะเบียนฟรี
                  </button>
                </form>
              ) : (
                <OmiseQrPayment courseId={typedCourse.id} slug={slug} />
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
