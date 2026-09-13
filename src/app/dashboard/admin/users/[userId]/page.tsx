import type { ReactElement } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AdminUserProfileForm from "@/components/admin/AdminUserProfileForm";
import { createClient } from "@/utils/supabase/server";

type DirectoryUser = {
  id: string; email: string | null; full_name: string | null; role: string | null;
  phone: string | null; university: string | null; faculty: string | null;
  created_at: string; last_sign_in_at: string | null;
  enrollment_count: number; certificate_count: number;
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

  // RPC นี้ตรวจบทบาทแอดมินในฐานข้อมูลและคืนข้อมูล Auth โดยไม่ต้องใช้ server secret key
  const [directoryRes, profileRes, enrollmentsRes, certificatesRes, coursesRes] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase
      .from("profiles")
      .select("id, full_name, role, phone, university, faculty, created_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select("id, status, created_at, courses(id, title, course_code)")
      .eq("student_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("certificates")
      .select("id, certificate_no, score_percentage, status, issued_at, courses(id, title)")
      .eq("user_id", userId)
      .order("issued_at", { ascending: false }),
    supabase
      .from("courses")
      .select("id, title, course_code, status, created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false }),
  ]);

  const profile = profileRes.data;
  const directoryUser = ((directoryRes.data ?? []) as DirectoryUser[]).find((row) => row.id === userId);
  if (!directoryUser && !profile) notFound();

  const user: DirectoryUser = directoryUser ?? {
    id: userId,
    email: null,
    full_name: profile?.full_name ?? null,
    role: profile?.role ?? null,
    phone: profile?.phone ?? null,
    university: profile?.university ?? null,
    faculty: profile?.faculty ?? null,
    created_at: profile?.created_at ?? "",
    last_sign_in_at: null,
    enrollment_count: 0,
    certificate_count: 0,
  };
  const hasProfile = Boolean(profile || directoryUser?.role);
  const enrollmentCount = Math.max(Number(user.enrollment_count) || 0, enrollmentsRes.data?.length ?? 0);
  const certificateCount = Math.max(Number(user.certificate_count) || 0, certificatesRes.data?.length ?? 0);
  const enrollmentsIncomplete = Boolean(enrollmentsRes.error || (directoryUser && (enrollmentsRes.data?.length ?? 0) < enrollmentCount));
  const certificatesIncomplete = Boolean(certificatesRes.error || (directoryUser && (certificatesRes.data?.length ?? 0) < certificateCount));

  if (directoryRes.error) console.error("[admin user detail] directory", directoryRes.error.message);
  if (profileRes.error) console.error("[admin user detail] profile", profileRes.error.message);
  if (enrollmentsRes.error) console.error("[admin user detail] enrollments", enrollmentsRes.error.message);
  if (certificatesRes.error) console.error("[admin user detail] certificates", certificatesRes.error.message);
  if (coursesRes.error) console.error("[admin user detail] courses", coursesRes.error.message);

  const roleLabel = user.role === "admin" ? "แอดมิน" : user.role === "teacher" ? "ครูผู้สอน" : user.role === "student" ? "นักเรียน" : "ยังไม่กำหนดบทบาท";
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/dashboard/admin/users" className="mb-3 inline-block text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">← กลับหน้าข้อมูลผู้ใช้</Link>
      <section className="mb-6 rounded-3xl bg-[#0F1B3D] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black">{(user.full_name ?? user.email ?? "?").charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FF8066]">{roleLabel}</p><h1 className="mt-1 truncate text-2xl font-extrabold">{user.full_name ?? "ไม่ระบุชื่อ"}</h1><p className="mt-1 text-sm text-white/70">{user.email ?? "ไม่พบอีเมล"}</p><p className="mt-1 break-all font-mono text-[11px] text-white/45">รหัสบัญชี {user.id}</p></div>
        </div>
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["เบอร์โทร", user.phone ?? "—"], ["มหาวิทยาลัย", user.university ?? "—"], ["คณะ/สาขา", user.faculty ?? "—"], ["เข้าใช้ล่าสุด", user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "—"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-bold text-slate-400">{label}</p><p className="mt-1 break-words text-[13px] font-bold text-[#0F1B3D]">{value}</p></div>)}
      </div>

      {hasProfile ? (
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
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-extrabold text-[#0F1B3D]">คอร์สที่ลงทะเบียน</h2><p className="mb-4 text-xs text-slate-400">{enrollmentCount} รายการ</p>{enrollmentsIncomplete ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">แสดงข้อมูลการลงทะเบียนได้ไม่ครบ</p> : enrollmentsRes.data?.length ? <div className="space-y-2">{enrollmentsRes.data.map((enrollment) => { const course = enrollment.courses as unknown as { id: string; title: string; course_code: string | null } | null; return course ? <Link key={enrollment.id} href={`/dashboard/admin/courses/${course.id}`} className="group flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157D5]/40"><span className="min-w-0"><span className="block truncate text-[13px] font-bold text-[#0F1B3D] transition-colors group-hover:text-[#3157D5]">{course.title}</span><span className="mt-1 block text-[11px] text-slate-400">{course.course_code ?? "—"} · {enrollment.status} · ลงทะเบียน {new Date(enrollment.created_at).toLocaleDateString("th-TH")}</span></span><span className="shrink-0 text-xs font-bold text-[#3157D5]">ดูคอร์ส →</span></Link> : <div key={enrollment.id} className="rounded-xl bg-slate-50 p-3"><p className="text-[13px] font-bold text-slate-500">ไม่พบคอร์ส</p><p className="mt-1 text-[11px] text-slate-400">สถานะ {enrollment.status}</p></div>; })}</div> : <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีการลงทะเบียน</p>}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-extrabold text-[#0F1B3D]">ใบรับรอง</h2><p className="mb-4 text-xs text-slate-400">{certificateCount} ใบ</p>{certificatesIncomplete ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">แสดงข้อมูลใบรับรองได้ไม่ครบ</p> : certificatesRes.data?.length ? <div className="space-y-2">{certificatesRes.data.map((certificate) => { const course = certificate.courses as unknown as { id: string; title: string } | null; const content = <><p className="font-mono text-[11px] font-bold text-emerald-700">{certificate.certificate_no}</p><p className="mt-1 text-[13px] font-bold text-[#0F1B3D]">{course?.title ?? "ไม่พบคอร์ส"}</p><p className="mt-1 text-[11px] text-slate-500">คะแนน {Number(certificate.score_percentage)}% · {certificate.status}</p></>; return course ? <Link key={certificate.id} href={`/dashboard/admin/courses/${course.id}`} className="block rounded-xl bg-emerald-50 p-3 transition-colors hover:bg-emerald-100">{content}</Link> : <div key={certificate.id} className="rounded-xl bg-emerald-50 p-3">{content}</div>; })}</div> : <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีใบรับรอง</p>}</section>
      </div>

      {coursesRes.data?.length ? <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-extrabold text-[#0F1B3D]">คอร์สที่สร้าง</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{coursesRes.data.map((course) => <Link key={course.id} href={`/dashboard/admin/courses/${course.id}`} className="rounded-xl border border-slate-100 p-4 hover:bg-slate-50"><p className="text-[13.5px] font-bold text-[#0F1B3D]">{course.title}</p><p className="mt-1 text-[11px] text-slate-400">{course.course_code ?? "—"} · {course.status}</p></Link>)}</div></section> : null}
    </div>
  );
}
