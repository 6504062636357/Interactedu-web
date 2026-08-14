import type { ReactElement } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AdminUserProfileForm from "@/components/admin/AdminUserProfileForm";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

type DirectoryUser = {
  id: string; email: string | null; full_name: string | null; role: string;
  phone: string | null; university: string | null; faculty: string | null;
  created_at: string; last_sign_in_at: string | null;
};

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }): Promise<ReactElement> {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) redirect(`/login?redirect=/dashboard/admin/users/${userId}`);

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", actor.id)
    .maybeSingle();
  if (actorProfile?.role !== "admin") redirect("/dashboard");

  // หลังตรวจสิทธิ์แล้ว ใช้ service role อ่านข้อมูลสำหรับ Admin โดยไม่ถูก RLS
  // ของผู้ใช้เป้าหมายกรอง enrollment/activity ออก
  const admin = createAdminClient();
  const [profileRes, authRes, enrollmentsRes, certificatesRes, coursesRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, role, phone, university, faculty, created_at")
      .eq("id", userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
    admin
      .from("enrollments")
      .select("id, status, created_at, courses(id, title, course_code)")
      .eq("student_id", userId)
      .order("created_at", { ascending: false }),
    admin
      .from("certificates")
      .select("id, certificate_no, score_percentage, status, issued_at, courses(id, title)")
      .eq("user_id", userId)
      .order("issued_at", { ascending: false }),
    admin
      .from("courses")
      .select("id, title, course_code, status, created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false }),
  ]);

  const profile = profileRes.data;
  const authUser = authRes.data.user;
  if ((!profile && !authUser) || authRes.error) notFound();

  const user: DirectoryUser = {
    id: userId,
    email: authUser?.email ?? null,
    full_name:
      profile?.full_name ??
      (authUser?.user_metadata?.full_name as string | undefined) ??
      null,
    role: profile?.role ?? "student",
    phone: profile?.phone ?? null,
    university: profile?.university ?? null,
    faculty: profile?.faculty ?? null,
    created_at: profile?.created_at ?? authUser?.created_at ?? "",
    last_sign_in_at: authUser?.last_sign_in_at ?? null,
  };

  if (profileRes.error) console.error("[admin user detail] profile", profileRes.error.message);
  if (enrollmentsRes.error) console.error("[admin user detail] enrollments", enrollmentsRes.error.message);
  if (certificatesRes.error) console.error("[admin user detail] certificates", certificatesRes.error.message);
  if (coursesRes.error) console.error("[admin user detail] courses", coursesRes.error.message);

  const roleLabel = user.role === "admin" ? "แอดมิน" : user.role === "teacher" ? "ครูผู้สอน" : "นักเรียน";
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/dashboard/admin/users" className="mb-3 inline-block text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">← กลับหน้าข้อมูลผู้ใช้</Link>
      <section className="mb-6 rounded-3xl bg-[#0F1B3D] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black">{(user.full_name ?? user.email ?? "?").charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FF8066]">{roleLabel}</p><h1 className="mt-1 truncate text-2xl font-extrabold">{user.full_name ?? "ไม่ระบุชื่อ"}</h1><p className="mt-1 text-sm text-white/55">{user.email ?? "ไม่พบอีเมล (รัน migration ล่าสุดเพื่อแสดงข้อมูล Auth)"}</p></div>
        </div>
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["เบอร์โทร", user.phone ?? "—"], ["มหาวิทยาลัย", user.university ?? "—"], ["คณะ/สาขา", user.faculty ?? "—"], ["เข้าใช้ล่าสุด", user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "—"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-bold text-slate-400">{label}</p><p className="mt-1 break-words text-[13px] font-bold text-[#0F1B3D]">{value}</p></div>)}
      </div>

      {profile ? (
        <AdminUserProfileForm
          userId={user.id}
          initialFullName={user.full_name}
          initialPhone={user.phone}
          initialUniversity={user.university}
          initialFaculty={user.faculty}
        />
      ) : (
        <p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">บัญชีนี้ยังไม่มีข้อมูลในตาราง profiles จึงยังแก้ไขโปรไฟล์ไม่ได้</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-extrabold text-[#0F1B3D]">คอร์สที่ลงทะเบียน</h2><p className="mb-4 text-xs text-slate-400">{enrollmentsRes.data?.length ?? 0} รายการ</p>{enrollmentsRes.error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">โหลดข้อมูลการลงทะเบียนไม่สำเร็จ</p> : enrollmentsRes.data?.length ? <div className="space-y-2">{enrollmentsRes.data.map((enrollment) => { const course = enrollment.courses as unknown as { id: string; title: string; course_code: string | null } | null; return course ? <Link key={enrollment.id} href={`/dashboard/admin/courses/${course.id}`} className="group flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]/40"><span className="min-w-0"><span className="block truncate text-[13px] font-bold text-[#0F1B3D] transition-colors group-hover:text-[#3157D5]">{course.title}</span><span className="mt-1 block text-[11px] text-slate-400">{course.course_code ?? "—"} · {enrollment.status} · ลงทะเบียน {new Date(enrollment.created_at).toLocaleDateString("th-TH")}</span></span><span className="shrink-0 text-xs font-bold text-[#3157D5]">ดูคอร์ส →</span></Link> : <div key={enrollment.id} className="rounded-xl bg-slate-50 p-3"><p className="text-[13px] font-bold text-slate-500">ไม่พบคอร์ส</p><p className="mt-1 text-[11px] text-slate-400">สถานะ {enrollment.status}</p></div>; })}</div> : <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีการลงทะเบียน</p>}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-extrabold text-[#0F1B3D]">ใบรับรอง</h2><p className="mb-4 text-xs text-slate-400">{certificatesRes.data?.length ?? 0} ใบ</p>{certificatesRes.error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">โหลดข้อมูลใบรับรองไม่สำเร็จ</p> : certificatesRes.data?.length ? <div className="space-y-2">{certificatesRes.data.map((certificate) => { const course = certificate.courses as unknown as { id: string; title: string } | null; const content = <><p className="font-mono text-[11px] font-bold text-emerald-700">{certificate.certificate_no}</p><p className="mt-1 text-[13px] font-bold text-[#0F1B3D]">{course?.title ?? "ไม่พบคอร์ส"}</p><p className="mt-1 text-[11px] text-slate-500">คะแนน {Number(certificate.score_percentage)}% · {certificate.status}</p></>; return course ? <Link key={certificate.id} href={`/dashboard/admin/courses/${course.id}`} className="block rounded-xl bg-emerald-50 p-3 transition-colors hover:bg-emerald-100">{content}</Link> : <div key={certificate.id} className="rounded-xl bg-emerald-50 p-3">{content}</div>; })}</div> : <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีใบรับรอง</p>}</section>
      </div>

      {coursesRes.data?.length ? <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-extrabold text-[#0F1B3D]">คอร์สที่สร้าง</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{coursesRes.data.map((course) => <Link key={course.id} href={`/dashboard/admin/courses/${course.id}`} className="rounded-xl border border-slate-100 p-4 hover:bg-slate-50"><p className="text-[13.5px] font-bold text-[#0F1B3D]">{course.title}</p><p className="mt-1 text-[11px] text-slate-400">{course.course_code ?? "—"} · {course.status}</p></Link>)}</div></section> : null}
    </div>
  );
}
