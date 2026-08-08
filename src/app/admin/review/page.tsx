// import type { ReactElement } from "react";
// import Link from "next/link";
// import { redirect } from "next/navigation";
// import { createClient } from "@/utils/supabase/server";

// interface RawRow {
//   id: string;
//   submitted_at: string;
//   lessons: { title: string; courses: { title: string } | { title: string }[] } | null;
// }

// function formatDate(iso: string): string {
//   return new Date(iso).toLocaleString("th-TH", {
//     year: "numeric",
//     month: "short",
//     day: "numeric",
//     hour: "2-digit",
//     minute: "2-digit",
//   });
// }

// export default async function AdminReviewListPage(): Promise<ReactElement> {
//   const supabase = await createClient();

//   const {
//     data: { user },
//   } = await supabase.auth.getUser();

//   if (!user) redirect("/login?redirect=/admin/review");

//   const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
//   if (profile?.role !== "admin") redirect("/");

//   // ---- DEBUG STEP 1: เช็คว่ามี draft สถานะ submitted อยู่จริงไหม (query ดิบ ไม่ join) ----
//   const { data: rawDrafts, error: rawError } = await supabase
//     .from("lesson_drafts")
//     .select("id, lesson_id, status, submitted_at")
//     .eq("status", "pending_review");

//   console.log("[admin/review] DEBUG rawDrafts:", JSON.stringify(rawDrafts, null, 2));
//   console.log("[admin/review] DEBUG rawError:", rawError);

//   // ---- DEBUG STEP 2: query แบบ join จริงที่ใช้แสดงผล ----
//   const { data, error } = await supabase
//     .from("lesson_drafts")
//     .select("id, submitted_at, lessons(title, course_id, courses(title))")
//     .eq("status", "pending_review")
//     .order("submitted_at", { ascending: true });

//   console.log("[admin/review] DEBUG joined data:", JSON.stringify(data, null, 2));
//   console.log("[admin/review] DEBUG joined error:", error);

//   const drafts = ((data ?? []) as unknown as RawRow[]).map((row) => {
//     const lesson = row.lessons;
//     const course = lesson ? (Array.isArray(lesson.courses) ? lesson.courses[0] : lesson.courses) : null;
//     return {
//       id: row.id,
//       submitted_at: row.submitted_at,
//       lessonTitle: lesson?.title ?? "ไม่พบชื่อบทเรียน",
//       courseTitle: course?.title ?? "ไม่พบชื่อคอร์ส",
//     };
//   });

//   return (
//     <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
//       <div className="max-w-4xl mx-auto">
//         <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] mb-2">
//           บทเรียนรอตรวจสอบ
//         </h1>
//         <p className="text-[13.5px] text-[#0F1B3D]/40 font-medium mb-8">{drafts.length} รายการ</p>

//         {/* ---- DEBUG PANEL: ลบออกทีหลังตอนแก้เสร็จแล้ว ---- */}
//         <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-xs font-mono text-red-800 whitespace-pre-wrap break-all">
//           <p className="font-bold mb-2">🔍 DEBUG PANEL (ลบทิ้งทีหลัง)</p>
//           <p>rawDrafts count: {rawDrafts?.length ?? "null"}</p>
//           <p>rawError: {rawError ? JSON.stringify(rawError) : "none"}</p>
//           <p className="mt-2">joined data count: {data?.length ?? "null"}</p>
//           <p>joined error: {error ? JSON.stringify(error) : "none"}</p>
//           <p className="mt-2">rawDrafts raw json:</p>
//           <p>{JSON.stringify(rawDrafts, null, 2)}</p>
//         </div>

//         {drafts.length > 0 ? (
//           <div className="space-y-3">
//             {drafts.map((draft) => (
//               <Link
//                 key={draft.id}
//                 href={`/admin/review/${draft.id}`}
//                 className="flex items-center justify-between gap-4 bg-white rounded-2xl border border-[#0F1B3D]/[0.06] p-5 hover:shadow-[0_15px_35px_-15px_rgba(15,27,61,0.2)] transition-shadow"
//               >
//                 <div>
//                   <p className="text-[13px] font-bold text-[#FF5A3C] mb-1">{draft.courseTitle}</p>
//                   <p className="text-[15px] font-bold text-[#0F1B3D]">{draft.lessonTitle}</p>
//                   <p className="text-[12px] text-[#0F1B3D]/40 font-medium mt-1">
//                     ส่งเมื่อ {formatDate(draft.submitted_at)}
//                   </p>
//                 </div>
//                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
//                   <path d="M9 6l6 6-6 6" stroke="#0F1B3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
//                 </svg>
//               </Link>
//             ))}
//           </div>
//         ) : (
//           <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
//             <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ไม่มีบทเรียนรอตรวจสอบตอนนี้</p>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

interface RawRow {
  id: string;
  submitted_at: string;
  lessons: { title: string; courses: { title: string } | { title: string }[] } | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminReviewListPage(): Promise<ReactElement> {
  const supabase = await createClient();

  // Step 1: เช็ค User Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/admin/review");

  // ⚡ Step 2: ยิง Profile Check และ Main Data Query พร้อมกันแบบ Parallel
  const [profileRes, draftsRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("lesson_drafts")
      .select("id, submitted_at, lessons(title, course_id, courses(title))")
      .in("status", ["pending_review", "submitted"])
      .order("submitted_at", { ascending: true }),
  ]);

  if (profileRes.data?.role !== "admin") redirect("/");

  const data = draftsRes.data;

  const drafts = ((data ?? []) as unknown as RawRow[]).map((row) => {
    const lesson = row.lessons;
    const course = lesson ? (Array.isArray(lesson.courses) ? lesson.courses[0] : lesson.courses) : null;
    return {
      id: row.id,
      submitted_at: row.submitted_at,
      lessonTitle: lesson?.title ?? "ไม่พบชื่อบทเรียน",
      courseTitle: course?.title ?? "ไม่พบชื่อคอร์ส",
    };
  });

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-[24px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] mb-2">
          บทเรียนรอตรวจสอบ
        </h1>
        <p className="text-[13.5px] text-[#0F1B3D]/40 font-medium mb-8">{drafts.length} รายการ</p>

        {draftsRes.error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
            โหลดคิวตรวจสอบไม่สำเร็จ: {draftsRes.error.message}
          </div>
        )}

        {!draftsRes.error && drafts.length > 0 ? (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <Link
                key={draft.id}
                href={`/admin/review/${draft.id}`}
                className="flex items-center justify-between gap-4 bg-white rounded-2xl border border-[#0F1B3D]/[0.06] p-5 hover:shadow-[0_15px_35px_-15px_rgba(15,27,61,0.2)] transition-shadow"
              >
                <div>
                  <p className="text-[13px] font-bold text-[#FF5A3C] mb-1">{draft.courseTitle}</p>
                  <p className="text-[15px] font-bold text-[#0F1B3D]">{draft.lessonTitle}</p>
                  <p className="text-[12px] text-[#0F1B3D]/40 font-medium mt-1">
                    ส่งเมื่อ {formatDate(draft.submitted_at)}
                  </p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
                  <path d="M9 6l6 6-6 6" stroke="#0F1B3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ))}
          </div>
        ) : !draftsRes.error ? (
          <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
            <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ไม่มีบทเรียนรอตรวจสอบตอนนี้</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
