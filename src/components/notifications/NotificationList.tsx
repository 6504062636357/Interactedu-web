"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import type { NotificationRecord } from "@/lib/notifications/types";

interface NotificationsResponse {
  notifications: NotificationRecord[];
  unread_count: number;
  has_more: boolean;
  next_cursor: string | null;
}

function formattedDate(value: string): string {
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function NotificationList(): ReactElement {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function loadMore(cursor: string): Promise<void> {
    setLoading(true);
    const response = await fetch(
      `/api/me/notifications?limit=50&before=${encodeURIComponent(cursor)}`,
      { cache: "no-store" }
    );
    if (response.ok) {
      const result = (await response.json()) as NotificationsResponse;
      setItems((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [...current, ...result.notifications.filter((item) => !knownIds.has(item.id))];
      });
      setNextCursor(result.next_cursor);
      setHasMore(result.has_more);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/me/notifications?limit=50", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as NotificationsResponse;
      })
      .then((result) => {
        if (!active || !result) return;
        setItems(result.notifications);
        setUnreadCount(result.unread_count);
        setNextCursor(result.next_cursor);
        setHasMore(result.has_more);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function openNotification(notification: NotificationRecord): Promise<void> {
    let readRequest: Promise<Response> | null = null;
    if (!notification.is_read) {
      setItems((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      readRequest = fetch(`/api/me/notifications/${notification.id}/read`, { method: "PATCH" });
    }

    router.push(`/dashboard/notifications/${notification.id}`);

    if (readRequest) {
      const response = await readRequest;
      if (!response.ok) {
        setItems((current) =>
          current.map((item) => (item.id === notification.id ? { ...item, is_read: false } : item))
        );
        setUnreadCount((count) => count + 1);
      }
    }
  }

  async function markAllRead(): Promise<void> {
    const response = await fetch("/api/me/notifications/read-all", { method: "PATCH" });
    if (response.ok) {
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    }
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#3157D5]">Notification center</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.02em] text-[#0F1B3D]">การแจ้งเตือนทั้งหมด</h1>
          <p className="mt-1 text-sm text-slate-500">ติดตามเหตุการณ์สำคัญเกี่ยวกับบัญชีและคอร์สของคุณ</p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-[#3157D5] shadow-sm hover:bg-slate-50"
          >
            อ่านทั้งหมด
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-[22px] border border-slate-200/70 bg-white shadow-[0_8px_28px_rgba(15,27,61,0.045)]">
        {!loading && items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold text-slate-500">ยังไม่มีการแจ้งเตือน</p>
          </div>
        ) : (
          items.map((notification) => (
            <button
              type="button"
              key={notification.id}
              onClick={() => void openNotification(notification)}
              className={`flex w-full items-start gap-4 border-b border-slate-100 px-5 py-4 text-left transition-colors last:border-0 hover:bg-slate-50 ${
                notification.is_read ? "bg-white" : "bg-blue-50/50"
              }`}
            >
              <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${notification.is_read ? "bg-slate-200" : "bg-[#3157D5]"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-800">{notification.title}</span>
                <span className="mt-1 block break-words text-[13px] leading-5 text-slate-500">{notification.message}</span>
                <span className="mt-2 block text-[11px] text-slate-400">{formattedDate(notification.created_at)}</span>
              </span>
              <span className="mt-1 text-slate-300" aria-hidden="true">→</span>
            </button>
          ))
        )}

        {loading && <p className="px-5 py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>}
      </div>

      {!loading && hasMore && nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore(nextCursor)}
          className="mx-auto mt-5 block rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50"
        >
          โหลดเพิ่มเติม
        </button>
      )}
    </section>
  );
}
