const STATE_COOKIE = "qh_tiktok_oauth";
const STATE_TTL_SECONDS = 10 * 60;
const TIKTOK_SCOPES = ["user.info.basic", "video.upload", "video.publish"];

function envValue(env, key, fallback = "") {
  return env?.[key] || fallback;
}

function getSiteOrigin(request) {
  return new URL(request.url).origin || "https://questhat.com";
}

function getTikTokConfig(request, env) {
  const origin = getSiteOrigin(request);
  return {
    clientKey: envValue(env, "TIKTOK_CLIENT_KEY", envValue(env, "TIKTOK_CLIENT_ID")),
    clientSecret: envValue(env, "TIKTOK_CLIENT_SECRET"),
    redirectUri: envValue(env, "TIKTOK_REDIRECT_URI", `${origin}/api/tiktok/callback`),
  };
}

function getStateSecret(env) {
  return envValue(env, "TIKTOK_STATE_SECRET", envValue(env, "SUPABASE_SERVICE_ROLE_KEY", envValue(env, "TIKTOK_CLIENT_SECRET")));
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signState(data, env) {
  const secret = getStateSecret(env);
  if (!secret) throw new Error("Missing TikTok state secret.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

async function safeEqual(a, b) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  left.forEach((byte, index) => {
    diff |= byte ^ right[index];
  });
  return diff === 0;
}

async function createTikTokStateCookie(payload, env) {
  const nonce = crypto.randomUUID();
  const statePayload = { ...payload, nonce, createdAt: Date.now() };
  const data = base64UrlEncode(new TextEncoder().encode(JSON.stringify(statePayload)));
  const signature = await signState(data, env);
  return {
    state: nonce,
    cookieValue: `${data}.${signature}`,
    maxAge: STATE_TTL_SECONDS,
  };
}

async function readTikTokStateCookie(cookieValue, expectedState, env) {
  if (!cookieValue || !expectedState) return null;
  const [data, signature] = cookieValue.split(".");
  if (!data || !signature) return null;
  const expectedSignature = await signState(data, env);
  if (!(await safeEqual(signature, expectedSignature))) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(data)));
  if (payload.nonce !== expectedState) return null;
  if (Date.now() - payload.createdAt > STATE_TTL_SECONDS * 1000) return null;
  return payload;
}

function setTikTokStateCookie(headers, value, maxAge) {
  headers.append("Set-Cookie", `${STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearTikTokStateCookie(headers) {
  headers.append("Set-Cookie", `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function getTikTokStateCookie(request) {
  const raw = request.headers.get("cookie") || "";
  return raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
}

function buildTikTokAuthorizeUrl(request, env, state) {
  const { clientKey, redirectUri } = getTikTokConfig(request, env);
  if (!clientKey) throw new Error("Missing TikTok client key.");
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", clientKey);
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

function supabaseConfig(env) {
  return {
    url: envValue(env, "NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: envValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceKey: envValue(env, "SUPABASE_SERVICE_ROLE_KEY"),
  };
}

async function getBearerUserId(request, env) {
  const { url, anonKey } = supabaseConfig(env);
  if (!url || !anonKey) return { userId: null, error: "Missing Supabase credentials." };
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { userId: null, error: "Log in first." };
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
  });
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user?.id) return { userId: null, error: "Log in first." };
  return { userId: user.id, error: null };
}

async function supabaseRest(env, path, init = {}) {
  const { url, serviceKey } = supabaseConfig(env);
  if (!url || !serviceKey) throw new Error("Missing Supabase admin credentials.");
  const headers = new Headers(init.headers || {});
  headers.set("apikey", serviceKey);
  headers.set("authorization", `Bearer ${serviceKey}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers });
}

function json(data, init = {}) {
  return Response.json(data, init);
}

function redirectWithStatus(request, path, status) {
  const url = new URL(path, getSiteOrigin(request));
  url.searchParams.set("section", url.searchParams.get("section") || "connected");
  url.searchParams.set("tiktok", status);
  return url;
}

export {
  TIKTOK_SCOPES,
  buildTikTokAuthorizeUrl,
  clearTikTokStateCookie,
  createTikTokStateCookie,
  getBearerUserId,
  getTikTokConfig,
  getTikTokStateCookie,
  json,
  readTikTokStateCookie,
  redirectWithStatus,
  setTikTokStateCookie,
  supabaseRest,
};
