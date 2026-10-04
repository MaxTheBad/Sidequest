import { getServiceSupabase } from "@/lib/security-audit-server";
import { clearTikTokStateCookie, getTikTokConfig, getTikTokStateCookie, readTikTokStateCookie, TIKTOK_SCOPES } from "@/lib/tiktok-oauth";

export const runtime = "edge";

type TikTokTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type TikTokUserInfoResponse = {
  data?: {
    user?: {
      open_id?: string;
      union_id?: string;
      display_name?: string;
      avatar_url?: string;
    };
  };
  error?: { code?: string; message?: string };
};

function redirectWithStatus(req: Request, path: string, status: string) {
  const url = new URL(path, new URL(req.url).origin);
  url.searchParams.set("tiktok", status);
  return url;
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const headers = new Headers();
  clearTikTokStateCookie(headers);

  const statePayload = await readTikTokStateCookie(getTikTokStateCookie(req), state).catch(() => null);
  if (!code || !statePayload) {
    return Response.redirect(redirectWithStatus(req, "/settings?section=connected", "invalid_state"), 302);
  }

  const supabase = getServiceSupabase();
  const { clientKey, clientSecret, redirectUri } = getTikTokConfig(req);
  if (!supabase || !clientKey || !clientSecret) {
    return Response.redirect(redirectWithStatus(req, statePayload.returnTo, "missing_config"), 302);
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
  const tokenJson = (await tokenResponse.json().catch(() => ({}))) as TikTokTokenResponse;
  if (!tokenResponse.ok || !tokenJson.access_token || !tokenJson.open_id) {
    return Response.redirect(redirectWithStatus(req, statePayload.returnTo, "token_error"), 302);
  }

  const userResponse = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userJson = (await userResponse.json().catch(() => ({}))) as TikTokUserInfoResponse;
  const user = userJson.data?.user || {};
  const expiresAt = new Date(Date.now() + Number(tokenJson.expires_in || 0) * 1000).toISOString();
  const refreshExpiresAt = tokenJson.refresh_expires_in
    ? new Date(Date.now() + Number(tokenJson.refresh_expires_in) * 1000).toISOString()
    : null;
  const scopes = (tokenJson.scope || TIKTOK_SCOPES.join(",")).split(",").map((scope) => scope.trim()).filter(Boolean);

  const { error } = await supabase.from("user_tiktok_accounts").upsert({
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
  }, { onConflict: "user_id" });

  if (error) return Response.redirect(redirectWithStatus(req, statePayload.returnTo, "save_error"), 302);
  const redirectUrl = redirectWithStatus(req, statePayload.returnTo, "connected");
  headers.set("location", redirectUrl.toString());
  return new Response(null, { status: 302, headers });
}
