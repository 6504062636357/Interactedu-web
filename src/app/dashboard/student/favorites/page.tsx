// app/dashboard/student/favorites/page.tsx
"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

interface FavoriteCourse {
  id: string;
  title: string;
  cover_image_url: string | null;
}

export default function FavoriteCoursesPage(): ReactElement {
  const [courses, setCourses] = useState<FavoriteCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const { data, error } = await supabase
        .from("course_favorites")
        .select("course_id, courses(id, title, cover_image_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setCourses(
          data
            .map((row) => row.courses as unknown as FavoriteCourse)
            .filter(Boolean)
        );
      }
      setIsLoading(false);
    }
    void load();
  }, []);

  async function handleRemove(courseId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("course_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("course_id", courseId);

    setCourses((prev) => prev.filter((c) => c.id !== courseId));
  }

  return (
    <div>
      <h1 className="text-[20px] font-bold text-blue-950 mb-6 flex items-center gap-2">
        <Heart className="w-5 h-5 text-slate-400" />
        คอร์สโปรดของฉัน
      </h1>

      {isLoading ? (
        <p className="text-[13.5px] text-slate-400 py-8 text-center">กำลังโหลด...</p>
      ) : courses.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl py-16 text-center">
          <p className="text-[13.5px] text-slate-400">ยังไม่มีคอร์สที่บันทึกไว้</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <div
              key={course.id}
              className="border border-slate-200 rounded-xl overflow-hidden group relative"
            >
              <Link href={`/courses/${course.id}`}>
                <div className="w-full h-32 bg-slate-100">
                  {course.cover_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={course.cover_image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-[13.5px] font-semibold text-slate-900 line-clamp-2">
                    {course.title}
                  </p>
                </div>
              </Link>
              <button
                onClick={() => handleRemove(course.id)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors"
                aria-label="ลบออกจากรายการโปรด"
              >
                <Heart className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}