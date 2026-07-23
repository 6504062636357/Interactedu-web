import type { ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

interface EnrolledCourse {
  id: string;
  title: string;
  cover_image_url: string | null;
}

interface EnrollmentRow {
  id: string;
  courses: EnrolledCourse;
}

export default async function MyCoursesPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("enrollments")
    .select("id, courses(id, title, cover_image_url)")
    .eq("student_id", user!.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const enrollments = (data ?? []) as unknown as EnrollmentRow[];

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-8">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M8 6.5v11l9-5.5-9-5.5z" stroke="#0F1B3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="text-[22px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">คอร์สของฉัน</h1>
      </div>

      {enrollments.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {enrollments.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/student/courses/${e.courses.id}`}
              className="group rounded-2xl border border-[#0F1B3D]/[0.06] overflow-hidden hover:shadow-[0_15px_35px_-15px_rgba(15,27,61,0.2)] transition-shadow"
            >
              <div className="relative h-32 bg-gradient-to-br from-[#0F1B3D] to-[#182852]">
                {e.courses.cover_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.courses.cover_image_url}
                    alt={e.courses.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-4">
                <p className="text-[14.5px] font-bold text-[#0F1B3D] group-hover:text-[#FF5A3C] transition-colors line-clamp-2">
                  {e.courses.title}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
          <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ยังไม่มีคอร์สที่ลงทะเบียน</p>
        </div>
      )}
    </div>
  );
}