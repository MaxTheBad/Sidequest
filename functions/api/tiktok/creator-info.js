import { getBearerUserId, json, supabaseRest } from "./_shared.js";

async function getAccount(env, userId) {
  const response = await supabaseRest(env, `user_tiktok_accounts?select=access_token,scopes&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
    headers: { Accept: "application/json" },
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows) || !rows[0]) throw new Error("Connect TikTok before sharing a video.");
  return rows[0];
}

export async function onRequestPost({ request, env }) {
  const { userId, error } = await getBearerUserId(request, env);
  if (!userId) return json({ ok: false, error }, { status: 401 });
  try {
    const account = await getAccount(env, userId);
    if (!account.scopes?.includes("video.publish")) return json({ ok: false, error: "Reconnect TikTok to authorize video publishing." }, { status: 403 });
    const response = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
      method: "POST",
      headers: { authorization: `Bearer ${account.access_token}`, "content-type": "application/json; charset=UTF-8" },
      body: "{}",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error?.code && payload.error.code !== "ok") throw new Error(payload?.error?.message || "TikTok could not load your posting options.");
    return json({ ok: true, creator: payload.data || {} });
  } catch (cause) {
    return json({ ok: false, error: cause instanceof Error ? cause.message : "TikTok publishing is unavailable." }, { status: 400 });
  }
}
