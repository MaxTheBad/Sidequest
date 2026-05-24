"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { markDeliveredNotificationsSeen } from "@/lib/notifications";

export const NOTIFICATION_LAST_SEEN_KEY = "sidequest_notifications_last_seen";

export function getLocalNotificationLastSeen() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NOTIFICATION_LAST_SEEN_KEY) || "";
}

export function setLocalNotificationLastSeen(value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFICATION_LAST_SEEN_KEY, value);
}

export async function getPersistedNotificationLastSeen(supabase: SupabaseClient | null, userId: string | null) {
  const local = getLocalNotificationLastSeen();
  if (!supabase || !userId) return local;

  try {
    const { data, error } = await supabase
      .from("notification_state")
      .select("last_seen_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return local || "";
    return data?.last_seen_at || local || "";
  } catch {
    return local || "";
  }
}

export async function markNotificationsSeen(supabase: SupabaseClient | null, userId: string | null) {
  const now = new Date().toISOString();
  setLocalNotificationLastSeen(now);

  if (!supabase || !userId) return now;

  try {
    await markDeliveredNotificationsSeen(supabase, userId);
    const { error } = await supabase.from("notification_state").upsert({
      user_id: userId,
      last_seen_at: now,
      updated_at: now,
    });
    if (error) return now;
  } catch {
    return now;
  }

  return now;
}
