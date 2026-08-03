// components/NotificationBell.tsx
"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

interface NotificationRow {
  id: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell(): ReactElement {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, link, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      setItems(data ?? []);

      channel = supabase
        .channel("notifications-" + user.id)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            setItems((prev) => [payload.new as NotificationRow, ...prev]);
          }
        )
        .subscribe();
    }

    void init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = items.filter((n) => !n.is_read).length;

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) void markAllRead(); }}
        className="relative w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M18 8C18 6.4 17.4 4.9 16.2 3.8C15.1 2.6 13.6 2 12 2C10.4 2 8.9 2.6 7.8 3.8C6.6 4.9 6 6.4 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke="#334155" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.7 21C13.5 21.3 13.3 21.6 13 21.7C12.7 21.9 12.3 22 12 22C11.7 22 11.3 21.9 11 21.7C10.7 21.6 10.5 21.3 10.3 21" stroke="#334155" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 min-w-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-slate-100 shadow-lg py-2 z-50 max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-[13px] text-slate-400 text-center py-8">ยังไม่มีการแจ้งเตือน</p>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                href={n.link ?? "#"}
                onClick={() => setOpen(false)}
                className="block px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
              >
                <p className="text-[13px] font-semibold text-slate-800">{n.title}</p>
                {n.message && <p className="text-[12px] text-slate-500 mt-0.5">{n.message}</p>}
                <p className="text-[11px] text-slate-400 mt-1">
                  {new Date(n.created_at).toLocaleString("th-TH")}
                </p>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}