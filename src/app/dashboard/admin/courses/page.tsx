import type { ReactElement } from "react";
import { createClient } from "@/utils/supabase/server";
import CourseStatusTabs, { type CourseStatusFilter } from "./components/CourseStatusTabs";
import AdminCourseCard from "./components/AdminCourseCard";

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<ReactElement> {
  const { status } = await searchParams;
  const activeStatus = (status as CourseStatusFilter) || "all";

  const supabase = await createClient();

  const { data: allCourses } = await supabase
    .from("courses")
    .select("id, course_code, title, category, description, status, price, cover_image_url, created_at")
    .order("created_at", { ascending: false });

  const courses = allCourses ?? [];

  const counts = {
    all: courses.length,
    published: courses.filter((c) => c.status === "published").length,
    pending: courses.filter((c) => c.status === "pending").length,
    draft: courses.filter((c) => c.status === "draft").length,
    rejected: courses.filter((c) => c.status === "rejected").length,
  };

  const filteredCourses =
    activeStatus === "all" ? courses : courses.filter((c) => c.status === activeStatus);

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-[24px] font-extrabold text-[#0F1B3D] mb-1">จัดการคอร์ส</h1>
        <p className="text-[13px] text-[#0F1B3D]/50 mb-6">คอร์สทั้งหมด {courses.length} คอร์ส</p>

        <CourseStatusTabs counts={counts} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {filteredCourses.map((course) => (
            <AdminCourseCard
              key={course.id}
              id={course.id}
              courseCode={course.course_code}
              title={course.title}
              category={course.category}
              description={course.description}
              status={course.status}
              price={course.price}
              coverImageUrl={course.cover_image_url}
              createdAt={course.created_at}
            />
          ))}
        </div>

        {filteredCourses.length === 0 && (
          <p className="text-center text-[13px] text-[#0F1B3D]/40 py-16">ไม่มีคอร์สในสถานะนี้</p>
        )}
      </div>
    </div>
  );
}