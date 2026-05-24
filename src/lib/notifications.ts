import type { SupabaseClient } from "@supabase/supabase-js";

export type DeliveredNotification = {
  id: string;
  kind: "message" | "join_request" | "approval" | "declined" | "system";
  title: string;
  body: string;
  href: string;
  created_at: string;
  read_at: string | null;
  meta?: Record<string, unknown> | null;
  source_user_id?: string | null;
  quest_id?: string | null;
  message_id?: string | null;
  membership_user_id?: string | null;
};

function isMissingRelationError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() || "";
  return message.includes("relation") || message.includes("does not exist");
}

export async function getDeliveredNotifications(supabase: SupabaseClient | null, userId: string | null) {
  if (!supabase || !userId) return null;

  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("id,kind,title,body,href,created_at,read_at,meta,source_user_id,quest_id,message_id,membership_user_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      if (isMissingRelationError(error)) return null;
      throw error;
    }

    return (data || []) as DeliveredNotification[];
  } catch (error) {
    if (isMissingRelationError(error as { message?: string } | null | undefined)) return null;
    throw error;
  }
}

export async function getUnreadDeliveredNotificationCount(supabase: SupabaseClient | null, userId: string | null) {
  if (!supabase || !userId) return null;

  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      if (isMissingRelationError(error)) return null;
      throw error;
    }

    return count || 0;
  } catch (error) {
    if (isMissingRelationError(error as { message?: string } | null | undefined)) return null;
    throw error;
  }
}

export async function markDeliveredNotificationsSeen(supabase: SupabaseClient | null, userId: string | null) {
  if (!supabase || !userId) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error && !isMissingRelationError(error)) {
    throw new Error(error.message);
  }
}
