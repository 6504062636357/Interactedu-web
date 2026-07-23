import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

interface EnrolledCourse {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  category: string | null;
}

interface EnrollmentRow {
  id: string;
  created_at: string;
  courses: EnrolledCourse;
}

export default async function ProfilePage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: latestEnrollment } = await supabase
    .from("enrollments")
    .select("id, created_at, courses(id, title, slug, cover_image_url, category)")
    .eq("student_id", user!.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const enrollment = latestEnrollment as unknown as EnrollmentRow | null;

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-8">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="#0F1B3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="text-[22px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">โปรไฟล์</h1>
      </div>

      <h2 className="text-[16px] font-bold text-[#0F1B3D] mb-4">คอร์สที่เข้าเรียนล่าสุด</h2>

      {enrollment ? (
        <Link
          href={`/play/${enrollment.courses.id}`}
          className="group flex flex-col sm:flex-row gap-5 rounded-2xl border border-[#0F1B3D]/[0.06] p-4 hover:shadow-[0_15px_35px_-15px_rgba(15,27,61,0.2)] transition-shadow"
        >
          <div className="relative w-full sm:w-56 h-32 rounded-xl overflow-hidden bg-gradient-to-br from-[#0F1B3D] to-[#182852] shrink-0">
            {enrollment.courses.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={enrollment.courses.cover_image_url}
                alt={enrollment.courses.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
          </div>
          <div className="flex-1 flex flex-col justify-center">
            {enrollment.courses.category && (
              <span className="inline-flex self-start items-center gap-1.5 text-[12px] font-bold text-[#FF5A3C] mb-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                {enrollment.courses.category}
              </span>
            )}
            <p className="text-[16px] font-bold text-[#0F1B3D] group-hover:text-[#FF5A3C] transition-colors">
              {enrollment.courses.title}
            </p>
          </div>
        </Link>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-10 text-center">
          <p className="text-[13.5px] text-[#0F1B3D]/40 font-medium">ยังไม่มีคอร์สที่เข้าเรียน</p>
        </div>
      )}
    </div>
  );
}