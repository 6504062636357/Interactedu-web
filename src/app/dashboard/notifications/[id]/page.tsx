import type { ReactElement } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { NotificationRecord, NotificationType } from "@/lib/notifications/types";
import { createClient } from "@/utils/supabase/server";

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
  course_rejected: "คอร์สต้องแก้ไข",
  student_completed_course: "ผู้เรียนจบคอร์ส",
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

  return (
    <main className="min-h-screen bg-[#F6F7FA] px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/notifications"
          className="inline-flex items-center gap-2 text-sm font-bold text-[#3157D5] hover:underline"
        >
          <span aria-hidden="true">←</span>
          การแจ้งเตือนทั้งหมด
        </Link>

        <article className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#3157D5]">
                {TYPE_LABELS[notification.type] ?? "การแจ้งเตือน"}
              </span>
              <time className="text-xs text-slate-400" dateTime={notification.created_at}>
                {formattedDate(notification.created_at)}
              </time>
            </div>
            <h1 className="mt-4 text-2xl font-extrabold tracking-[-0.02em] text-[#0F1B3D] sm:text-3xl">
              {notification.title}
            </h1>
          </div>

          <div className="px-6 py-7 sm:px-8 sm:py-9">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-600">
              {notification.message || "ไม่มีรายละเอียดเพิ่มเติม"}
            </p>

            {actionUrl && (
              <Link
                href={actionUrl}
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[#3157D5] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#2748B8]"
              >
                ไปยังรายการที่เกี่ยวข้อง
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
