// src/app/dashboard/admin/courses/[courseId]/lessons/page.tsx
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import RegenerateScormButton from "@/components/RegenerateScormButton";
export default async function AdminCourseLessonsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const supabase = await createClient();

  const { data: course } = await supabase
    .from('courses')
    .select('id, title')
    .eq('id', courseId)
    .single();

  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('id, title, video_url, is_scorm, scorm_entry_point, scorm_version')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true });

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-6">
        <div>
          <Link
            href="/dashboard/admin/courses"
            className="text-[12.5px] font-semibold text-slate-400 hover:text-slate-600 mb-2 inline-block"
          >
            ← กลับหน้าจัดการคอร์ส
          </Link>
          <h1 className="text-[24px] font-bold text-blue-950 tracking-[-0.01em]">
            จัดการบทเรียน — {course?.title ?? 'ไม่พบคอร์ส'}
          </h1>
          <p className="mt-1.5 text-[14px] text-slate-500">
            รายการเนื้อหาของคอร์สนี้
          </p>
        </div>

        {error && (
          <div className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            โหลดรายการบทเรียนไม่สำเร็จ: {error.message}
          </div>
        )}

        <div className="space-y-3">
          {lessons?.length ? (
            lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-5 flex items-center justify-between"
              >
                <div>
                  <p className="text-[14.5px] font-bold text-blue-950">{lesson.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {lesson.video_url && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        มีวิดีโอ
                      </span>
                    )}
                    {lesson.is_scorm && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        มี SCORM ({lesson.scorm_version ?? '-'})
                      </span>
                    )}
                    {!lesson.video_url && !lesson.is_scorm && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        ยังไม่มีเนื้อหา
                      </span>
                    )}
                  </div>
                </div>

               {lesson.is_scorm && (
  <div className="flex items-center gap-2 shrink-0">
    <Link
      href={`/play/${courseId}/${lesson.id}`}
      target="_blank"
      className="text-[12.5px] font-bold text-white bg-[#FF5A3C] hover:opacity-90 transition px-4 py-2 rounded-full"
    >
      ดูตัวอย่าง
    </Link>
    <RegenerateScormButton lessonId={lesson.id} />
  </div>
)}
              </div>
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-14 text-center">
              <p className="text-[13.5px] font-semibold text-slate-500">คอร์สนี้ยังไม่มีบทเรียน</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}