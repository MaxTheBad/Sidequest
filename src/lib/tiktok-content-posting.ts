import { getServiceSupabase } from "@/lib/security-audit-server";
import { getTikTokConfig } from "@/lib/tiktok-oauth";

type TikTokAccount = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
  scopes: string[] | null;
};

type TikTokTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
};

export type TikTokCreatorInfo = {
  creator_username?: string;
  creator_nickname?: string;
  creator_avatar_url?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

export async function getTikTokContentAccount(userId: string, req: Request) {
  const supabase = getServiceSupabase();
  if (!supabase) throw new Error("TikTok publishing is not configured.");
  const { data, error } = await supabase
    .from("user_tiktok_accounts")
    .select("access_token,refresh_token,expires_at,refresh_expires_at,scopes")
    .eq("user_id", userId)
    .maybeSingle<TikTokAccount>();
  if (error) throw new Error("Could not load your TikTok connection.");
  if (!data) throw new Error("Connect TikTok before sharing a video.");

  const expiresSoon = data.expires_at && new Date(data.expires_at).getTime() < Date.now() + 5 * 60 * 1000;
  if (!expiresSoon) return { account: data, accessToken: data.access_token };
  if (!data.refresh_token) throw new Error("Your TikTok connection has expired. Connect TikTok again.");

  const { clientKey, clientSecret } = getTikTokConfig(req);
  if (!clientKey || !clientSecret) throw new Error("TikTok publishing is not configured.");
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: data.refresh_token,
  });
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const refreshed = (await response.json().catch(() => ({}))) as TikTokTokenResponse;
  if (!response.ok || !refreshed.access_token) throw new Error("Your TikTok connection has expired. Connect TikTok again.");
  const expiresAt = new Date(Date.now() + Number(refreshed.expires_in || 0) * 1000).toISOString();
  const refreshExpiresAt = refreshed.refresh_expires_in
    ? new Date(Date.now() + Number(refreshed.refresh_expires_in) * 1000).toISOString()
    : data.refresh_expires_at;
  const { error: updateError } = await supabase.from("user_tiktok_accounts").update({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || data.refresh_token,
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (updateError) throw new Error("Could not refresh your TikTok connection.");
  return { account: { ...data, access_token: refreshed.access_token }, accessToken: refreshed.access_token };
}

export async function getTikTokCreatorInfo(accessToken: string) {
  const response = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
    },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({})) as { data?: TikTokCreatorInfo; error?: { code?: string; message?: string } };
  if (!response.ok || payload.error?.code && payload.error.code !== "ok") {
    throw new Error(payload.error?.message || "TikTok could not load your posting options.");
  }
  return payload.data || {};
}
