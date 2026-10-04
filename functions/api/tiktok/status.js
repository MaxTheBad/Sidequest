import { getBearerUserId, json, supabaseRest } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const { userId, error } = await getBearerUserId(request, env);
  if (!userId) return json({ ok: false, error }, { status: 401 });

  const response = await supabaseRest(env, `user_tiktok_accounts?select=display_name,avatar_url,scopes,created_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
    headers: { Accept: "application/json" },
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) return json({ ok: false, error: "Could not load TikTok connection." }, { status: 500 });
  const data = Array.isArray(rows) ? rows[0] : null;
  const status = data
    ? { connected: true, displayName: data.display_name, avatarUrl: data.avatar_url, scopes: data.scopes || [], connectedAt: data.created_at }
    : { connected: false };
  return json({ ok: true, status });
}
