import { buildTikTokAuthorizeUrl, createTikTokStateCookie, getBearerUserId, json, setTikTokStateCookie } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const { userId, error } = await getBearerUserId(request, env);
  if (!userId) return json({ ok: false, error }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const returnTo = typeof body.returnTo === "string" && body.returnTo.startsWith("/") ? body.returnTo : "/settings?section=connected";

  try {
    const { state, cookieValue, maxAge } = await createTikTokStateCookie({ userId, returnTo }, env);
    const authorizationUrl = buildTikTokAuthorizeUrl(request, env, state);
    const headers = new Headers();
    setTikTokStateCookie(headers, cookieValue, maxAge);
    return json({ ok: true, authorizationUrl }, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TikTok connection is unavailable.";
    return json({ ok: false, error: message }, { status: 500 });
  }
}
