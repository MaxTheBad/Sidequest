import { getBearerUserId, json, supabaseRest } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const { userId, error } = await getBearerUserId(request, env);
  if (!userId) return json({ ok: false, error }, { status: 401 });
  const response = await supabaseRest(env, `user_tiktok_accounts?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (!response.ok) return json({ ok: false, error: "Could not disconnect TikTok." }, { status: 500 });
  return json({ ok: true });
}
