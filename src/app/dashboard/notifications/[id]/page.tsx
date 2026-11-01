import type { ReactElement } from "react";
import Link from "next/link";
import { Bell, CircleCheck, FilePenLine, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import type { NotificationRecord, NotificationType } from "@/lib/notifications/types";
import { createClient } from "@/utils/supabase/server";
import AppBrand from "@/components/AppBrand";

interface LegacyNotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

const TYPE_LABELS: Record<NotificationType, string> = {
  system: "ระบบ",
  payment_approved: "การชำระเงินสำเร็จ",
  payment_rejected: "การชำระเงินไม่สำเร็จ",
  course_access_granted: "สิทธิ์เข้าเรียน",
  lesson_completed: "เรียนจบบทเรียน",
  exercise_passed: "ผ่านแบบทดสอบ",
  exercise_failed: "แบบทดสอบยังไม่ผ่าน",
  certificate_issued: "ใบรับรอง",
  payment_slip_pending: "สลิปรอตรวจสอบ",
  course_review_pending: "คอร์สรอตรวจสอบ",
  certificate_generation_failed: "สร้างใบรับรองไม่สำเร็จ",
  course_approved: "คอร์สผ่านการอนุมัติ",
  lesson_approved: "บทเรียนผ่านการอนุมัติ",
  lesson_rejected: "บทเรียนต้องแก้ไข",
  course_rejected: "คอร์สต้องแก้ไข",
  student_completed_course: "ผู้เรียนจบคอร์ส",
  student_started_course: "ผู้เรียนเริ่มเรียนคอร์ส",
};

function internalActionUrl(value: string | null): string | null {
  return value?.startsWith("/") && !value.startsWith("//") ? value : null;
}

function formattedDate(value: string): string {
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const modernResult = await supabase
    .from("notifications")
    .select(
      "id, user_id, type, title, message, related_type, related_id, action_url, is_read, read_at, created_at"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  let notification: NotificationRecord | null = null;
  if (!modernResult.error) {
    notification = modernResult.data as NotificationRecord | null;
  } else {
    const legacyResult = await supabase
      .from("notifications")
      .select("id, user_id, title, message, link, is_read, created_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (legacyResult.error) {
      console.error("[notification detail]", {
        modern: modernResult.error.message,
        legacy: legacyResult.error.message,
      });
      notFound();
    }

    const row = legacyResult.data as LegacyNotificationRow | null;
    if (row) {
      notification = {
        id: row.id,
        user_id: row.user_id,
        type: "system",
        title: row.title,
        message: row.message ?? "",
        related_type: null,
        related_id: null,
        action_url: row.link,
        is_read: row.is_read,
        read_at: null,
        created_at: row.created_at,
      };
    }
  }

  if (!notification) notFound();

  if (!notification.is_read) {
    const modernUpdate = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notification.id)
      .eq("user_id", user.id);

    if (modernUpdate.error) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id)
        .eq("user_id", user.id);
    }
  }

  const actionUrl = internalActionUrl(notification.action_url);
  const actionLabel =
    notification.type === "course_approved" ||
    notification.type === "lesson_approved" ||
    notification.type === "course_rejected" ||
    notification.type === "lesson_rejected"
      ? "เปิดหน้าคอร์ส"
      : "ไปยังรายการที่เกี่ยวข้อง";

  const needsAttention = ["course_rejected", "lesson_rejected", "payment_rejected", "exercise_failed", "certificate_generation_failed"].includes(notification.type);
  const isSuccess = ["course_approved", "lesson_approved", "payment_approved", "course_access_granted", "lesson_completed", "exercise_passed", "certificate_issued", "student_completed_course"].includes(notification.type);
  const Icon = needsAttention ? FilePenLine : isSuccess ? CircleCheck : Bell;
  const theme = needsAttention
    ? { header: "from-orange-50 via-orange-50/40 to-white", icon: "bg-orange-100 text-orange-600 ring-orange-200/60", badge: "bg-orange-100/80 text-orange-800", line: "bg-orange-400" }
    : isSuccess
      ? { header: "from-emerald-50 via-emerald-50/40 to-white", icon: "bg-emerald-100 text-emerald-600 ring-emerald-200/60", badge: "bg-emerald-100/80 text-emerald-800", line: "bg-emerald-400" }
      : { header: "from-indigo-50 via-indigo-50/40 to-white", icon: "bg-indigo-100 text-indigo-600 ring-indigo-200/60", badge: "bg-indigo-100/80 text-indigo-800", line: "bg-indigo-400" };

  return (
    <div className="app-canvas min-h-screen">
      <header className="app-topbar sticky top-0 z-40">
        <div className="mx-auto flex h-[74px] max-w-5xl items-center justify-between px-5 sm:px-7">
          <AppBrand compact />
          <span className="hidden items-center gap-2 text-sm text-slate-500 sm:inline-flex"><Bell size={16} aria-hidden="true" /> การแจ้งเตือน</span>
        </div>
      </header>
      <main className="px-4 py-8 sm:px-7 sm:py-12">
        <div className="mx-auto max-w-2xl">
          <Link href="/dashboard/notifications" className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-slate-600 transition-colors hover:text-[#3157D5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
            การแจ้งเตือนทั้งหมด
          </Link>

          <article className="mt-6 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_rgba(15,27,61,0.06)]">
            <div className={`h-1 ${theme.line}`} />
            <div className={`bg-gradient-to-br ${theme.header} px-6 pb-7 pt-8 sm:px-8`}>
              <div className="flex items-start gap-4">
                <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ${theme.icon}`}><Icon size={27} strokeWidth={1.7} aria-hidden="true" /></span>
                <div className="min-w-0">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${theme.badge}`}>{TYPE_LABELS[notification.type] ?? "การแจ้งเตือน"}</span>
                  <h1 className="mt-3 break-words text-xl font-bold leading-snug tracking-tight text-[#0F1B3D] sm:text-2xl">{notification.title}</h1>
                  <div className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-slate-500">
                    <Clock3 size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <time dateTime={notification.created_at}>{formattedDate(notification.created_at)}</time>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-8 pt-6 sm:px-8">
              <h2 className="text-xs font-semibold text-slate-500">รายละเอียดการแจ้งเตือน</h2>
              <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700">{notification.message || "ไม่มีรายละเอียดเพิ่มเติม"}</p>
              {actionUrl && <div className="mt-7 border-t border-slate-100 pt-6">
                {actionUrl && <Link href={actionUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3157D5] px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-[#2748B8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">{actionLabel}</Link>}
              </div>}
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}