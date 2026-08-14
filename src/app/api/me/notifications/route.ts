import { NextRequest, NextResponse } from "next/server";
import type { NotificationRecord } from "@/lib/notifications/types";
import { createClient } from "@/utils/supabase/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

interface LegacyNotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = positiveInteger(request.nextUrl.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const beforeParam = request.nextUrl.searchParams.get("before");
  const beforeTimestamp = beforeParam ? Date.parse(beforeParam) : Number.NaN;
  const before = !Number.isNaN(beforeTimestamp) ? new Date(beforeTimestamp).toISOString() : null;

  if (beforeParam && !before) {
    return NextResponse.json({ error: "Invalid notification cursor" }, { status: 400 });
  }

  let modernQuery = supabase
    .from("notifications")
    .select(
      "id, user_id, type, title, message, related_type, related_id, action_url, is_read, read_at, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (before) modernQuery = modernQuery.lt("created_at", before);

  const [modernResult, unreadResult] = await Promise.all([
    modernQuery.range(0, limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
  ]);

  let rows: NotificationRecord[];
  if (!modernResult.error) {
    rows = (modernResult.data ?? []) as NotificationRecord[];
  } else {
    // The project had an early notifications table with `link` but without
    // the richer notification metadata. Keep existing rows readable while
    // the additive migration is being rolled out.
    let legacyQuery = supabase
      .from("notifications")
      .select("id, user_id, title, message, link, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (before) legacyQuery = legacyQuery.lt("created_at", before);

    const legacyResult = await legacyQuery.range(0, limit);

    if (legacyResult.error) {
      console.error("[notifications GET]", {
        modern: modernResult.error.message,
        legacy: legacyResult.error.message,
      });
      return NextResponse.json({ error: "Unable to load notifications" }, { status: 500 });
    }

    rows = ((legacyResult.data ?? []) as LegacyNotificationRow[]).map((row) => ({
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
    }));
  }

  if (unreadResult.error) {
    console.error("[notifications unread count]", unreadResult.error.message);
  }

  const notifications = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  return NextResponse.json({
    notifications,
    unread_count: unreadResult.count ?? notifications.filter((row) => !row.is_read).length,
    has_more: hasMore,
    next_cursor: hasMore ? notifications.at(-1)?.created_at ?? null : null,
  });
}
