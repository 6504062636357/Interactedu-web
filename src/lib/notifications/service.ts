import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import type { NotificationType } from "./types";

interface NotificationContent {
  type: NotificationType;
  title: string;
  message: string;
  relatedType?: string | null;
  relatedId?: string | null;
  actionUrl?: string | null;
  dedupeKey?: string | null;
}

interface CreateNotificationInput extends NotificationContent {
  userId: string;
}

interface NotificationInsertRow {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_type: string | null;
  related_id: string | null;
  action_url: string | null;
  dedupe_key: string | null;
}

export interface NotificationWriteResult {
  created: boolean;
  error?: string;
}

function safeActionUrl(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toInsertRow(input: CreateNotificationInput): NotificationInsertRow {
  return {
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    related_type: input.relatedType ?? null,
    related_id: input.relatedId ?? null,
    action_url: safeActionUrl(input.actionUrl),
    dedupe_key: input.dedupeKey ?? null,
  };
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationWriteResult> {
  try {
    const supabase = createAdminClient();
    const row = toInsertRow(input);

    const mutation = input.dedupeKey
      ? supabase.from("notifications").upsert(row, {
          onConflict: "dedupe_key",
          ignoreDuplicates: true,
        })
      : supabase.from("notifications").insert(row);

    const { error } = await mutation;
    if (error) {
      console.error("[notifications] create failed", {
        type: input.type,
        userId: input.userId,
        error: error.message,
      });
      return { created: false, error: error.message };
    }

    return { created: true };
  } catch (error) {
    const message = errorMessage(error);
    console.error("[notifications] create failed", {
      type: input.type,
      userId: input.userId,
      error: message,
    });
    return { created: false, error: message };
  }
}

export async function notifyAdmins(
  input: NotificationContent
): Promise<NotificationWriteResult[]> {
  try {
    const supabase = createAdminClient();
    const { data: admins, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin");

    if (error) throw error;

    const rows = (admins ?? []).map((admin) =>
      toInsertRow({
        ...input,
        userId: admin.id,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${admin.id}` : null,
      })
    );

    if (rows.length === 0) return [];

    const mutation = input.dedupeKey
      ? supabase.from("notifications").upsert(rows, {
          onConflict: "dedupe_key",
          ignoreDuplicates: true,
        })
      : supabase.from("notifications").insert(rows);

    const { error: mutationError } = await mutation;
    if (mutationError) throw mutationError;

    return rows.map(() => ({ created: true }));
  } catch (error) {
    const message = errorMessage(error);
    console.error("[notifications] notify admins failed", {
      type: input.type,
      error: message,
    });
    return [{ created: false, error: message }];
  }
}
