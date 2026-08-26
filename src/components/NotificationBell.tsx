"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationRecord } from "@/lib/notifications/types";
import { createClient } from "@/utils/supabase/client";

interface NotificationsResponse {
  notifications: NotificationRecord[];
  unread_count: number;
}
function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "เมื่อสักครู่";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} นาทีที่แล้ว`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} ชั่วโมงที่แล้ว`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)} วันที่แล้ว`;
  return new Date(value).toLocaleDateString("th-TH", { dateStyle: "medium" });
}

export default function NotificationBell(): ReactElement {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const readStateRef = useRef(new Map<string, boolean>());
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !active) return;

        const notificationsResponse = await fetch("/api/me/notifications?limit=20", {
          cache: "no-store",
        });

        if (!active) return;
        if (notificationsResponse.ok) {
          const result = (await notificationsResponse.json()) as NotificationsResponse;
          setItems(result.notifications);
          readStateRef.current = new Map(
            result.notifications.map((notification) => [notification.id, notification.is_read])
          );
          setUnreadCount(result.unread_count);
        } else {
          setLoadError(true);
        }

        channel = supabase
          .channel(`notifications-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              const notification = payload.new as NotificationRecord;
              const knownState = readStateRef.current.get(notification.id);
              readStateRef.current.set(notification.id, notification.is_read);
              setItems((previous) => {
                if (previous.some((item) => item.id === notification.id)) return previous;
                return [notification, ...previous].slice(0, 20);
              });
              if (knownState === undefined && !notification.is_read) {
                setUnreadCount((count) => count + 1);
              }
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              const updated = payload.new as NotificationRecord;
              const previousIsRead = readStateRef.current.get(updated.id);
              readStateRef.current.set(updated.id, updated.is_read);

              setItems((previous) =>
                previous.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
              );

              if (previousIsRead !== updated.is_read) {
                setUnreadCount((count) =>
                  Math.max(0, count + (updated.is_read ? -1 : 1))
                );
              }
            }
          )
          .subscribe((status, error) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.warn("[notifications] Realtime unavailable", error);
            }
          });
      } catch (error) {
        console.warn("[notifications] init failed", error);
        setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void init();

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function markRead(notification: NotificationRecord): Promise<void> {
    let readRequest: Promise<Response> | null = null;
    if (!notification.is_read) {
      readStateRef.current.set(notification.id, true);
      setItems((previous) =>
        previous.map((item) =>
          item.id === notification.id
            ? { ...item, is_read: true, read_at: new Date().toISOString() }
            : item
        )
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      readRequest = fetch(`/api/me/notifications/${notification.id}/read`, {
        method: "PATCH",
      });
    }

    setOpen(false);
    router.push(`/dashboard/notifications/${notification.id}`);

    if (readRequest) {
      const response = await readRequest;
      if (!response.ok) {
        readStateRef.current.set(notification.id, false);
        setItems((previous) =>
          previous.map((item) => (item.id === notification.id ? { ...item, is_read: false } : item))
        );
        setUnreadCount((count) => count + 1);
      }
    }
  }

  async function markAllRead(): Promise<void> {
    if (unreadCount === 0) return;
    const previousItems = items;
    const previousCount = unreadCount;
    const previousReadState = new Map(readStateRef.current);
    items.forEach((item) => readStateRef.current.set(item.id, true));
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);

    const response = await fetch("/api/me/notifications/read-all", { method: "PATCH" });
    if (!response.ok) {
      readStateRef.current = previousReadState;
      setItems(previousItems);
      setUnreadCount(previousCount);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 text-slate-500 shadow-[0_5px_18px_rgba(15,27,61,0.05)] transition-all hover:border-[#3157D5]/20 hover:text-[#3157D5] hover:shadow-[0_8px_22px_rgba(15,27,61,0.09)]"
        aria-label={unreadCount > 0 ? `การแจ้งเตือนที่ยังไม่อ่าน ${unreadCount} รายการ` : "การแจ้งเตือน"}
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 8C18 4.7 15.3 2 12 2S6 4.7 6 8c0 7-3 9-3 9h18s-3-2-3-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 21h-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex min-h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-white bg-[#EB4A2D] px-1 text-[9px] font-extrabold text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2.5 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/95 shadow-[0_24px_60px_-16px_rgba(15,27,61,0.3)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3.5">
            <div>
              <p className="text-sm font-extrabold text-[#0F1B3D]">การแจ้งเตือน</p>
              <p className="text-[11px] text-slate-400">ยังไม่อ่าน {unreadCount} รายการ</p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-[11.5px] font-bold text-[#3157D5] hover:underline"
              >
                อ่านทั้งหมด
              </button>
            )}
          </div>

          <div className="max-h-[24rem] overflow-y-auto" aria-live="polite">
            {loading ? (
              <p className="py-10 text-center text-[13px] text-slate-400">กำลังโหลด...</p>
            ) : loadError ? (
              <div className="px-5 py-10 text-center">
                <p className="text-[13px] font-semibold text-slate-500">โหลดรายการแจ้งเตือนไม่สำเร็จ</p>
                <p className="mt-1 text-[11.5px] text-slate-400">กรุณารีเฟรชหน้าแล้วลองอีกครั้ง</p>
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-slate-400">ยังไม่มีการแจ้งเตือน</p>
            ) : (
              items.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  onClick={() => void markRead(notification)}
                  className={`block w-full border-b border-slate-100 px-4 py-3.5 text-left transition-colors last:border-0 hover:bg-slate-50 ${
                    notification.is_read ? "bg-white" : "bg-blue-50/60"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.is_read ? "bg-slate-200" : "bg-[#3157D5]"}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold text-slate-800">{notification.title}</span>
                      <span className="mt-0.5 block overflow-hidden text-ellipsis text-[12px] leading-5 text-slate-500">
                        {notification.message}
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-400">{relativeTime(notification.created_at)}</span>
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-3 text-center text-[12.5px] font-bold text-[#3157D5] hover:bg-slate-50"
          >
            ดูการแจ้งเตือนทั้งหมด
          </Link>
        </div>
      )}
    </div>
  );
}
