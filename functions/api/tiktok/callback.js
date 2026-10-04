import {
  TIKTOK_SCOPES,
  clearTikTokStateCookie,
  getTikTokConfig,
  getTikTokStateCookie,
  readTikTokStateCookie,
  redirectWithStatus,
  supabaseRest,
} from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const headers = new Headers();
  clearTikTokStateCookie(headers);

  const statePayload = await readTikTokStateCookie(getTikTokStateCookie(request), state, env).catch(() => null);
  if (!code || !statePayload) {
    return Response.redirect(redirectWithStatus(request, "/settings?section=connected", "invalid_state"), 302);
  }

  const { clientKey, clientSecret, redirectUri } = getTikTokConfig(request, env);
  if (!clientKey || !clientSecret) {
    return Response.redirect(redirectWithStatus(request, statePayload.returnTo, "missing_config"), 302);
  }

  const tokenBody = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });
  const tokenJson = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenJson.access_token || !tokenJson.open_id) {
    return Response.redirect(redirectWithStatus(request, statePayload.returnTo, "token_error"), 302);
  }

  const userResponse = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userJson = await userResponse.json().catch(() => ({}));
  const user = userJson.data?.user || {};
  const expiresAt = new Date(Date.now() + Number(tokenJson.expires_in || 0) * 1000).toISOString();
  const refreshExpiresAt = tokenJson.refresh_expires_in ? new Date(Date.now() + Number(tokenJson.refresh_expires_in) * 1000).toISOString() : null;
  const scopes = (tokenJson.scope || TIKTOK_SCOPES.join(",")).split(",").map((scope) => scope.trim()).filter(Boolean);

  const upsertResponse = await supabaseRest(env, "user_tiktok_accounts?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: statePayload.userId,
      tiktok_open_id: tokenJson.open_id,
      tiktok_union_id: user.union_id || null,
      display_name: user.display_name || null,
      avatar_url: user.avatar_url || null,
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token || null,
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
      scopes,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!upsertResponse.ok) return Response.redirect(redirectWithStatus(request, statePayload.returnTo, "save_error"), 302);
  const redirectUrl = redirectWithStatus(request, statePayload.returnTo, "connected");
  headers.set("location", redirectUrl.toString());
  return new Response(null, { status: 302, headers });
}
