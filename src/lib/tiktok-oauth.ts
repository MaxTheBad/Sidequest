import { getServiceSupabase } from "@/lib/security-audit-server";

export const TIKTOK_SCOPES = ["user.info.basic", "video.upload", "video.publish"];
const STATE_COOKIE = "qh_tiktok_oauth";
const STATE_TTL_SECONDS = 10 * 60;

type StatePayload = {
  nonce: string;
  userId: string;
  returnTo: string;
  createdAt: number;
};

export type TikTokConnectionStatus = {
  connected: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
  scopes?: string[];
  connectedAt?: string | null;
};

function getTikTokClientKey() {
  return process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_ID || "";
}

function getTikTokClientSecret() {
  return process.env.TIKTOK_CLIENT_SECRET || "";
}

export function getTikTokConfig(req?: Request) {
  const origin = req ? new URL(req.url).origin : process.env.NEXT_PUBLIC_SITE_URL || "https://questhat.com";
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || `${origin}/api/tiktok/callback`;
  return {
    clientKey: getTikTokClientKey(),
    clientSecret: getTikTokClientSecret(),
    redirectUri,
  };
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getStateSecret() {
  return process.env.TIKTOK_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TIKTOK_CLIENT_SECRET || "";
}

async function signState(data: string) {
  const secret = getStateSecret();
  if (!secret) throw new Error("Missing TikTok state secret.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

async function safeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  left.forEach((byte, index) => {
    diff |= byte ^ right[index];
  });
  return diff === 0;
}

export async function createTikTokStateCookie(payload: Omit<StatePayload, "nonce" | "createdAt">) {
  const nonce = crypto.randomUUID();
  const statePayload: StatePayload = { ...payload, nonce, createdAt: Date.now() };
  const data = base64UrlEncode(new TextEncoder().encode(JSON.stringify(statePayload)));
  const signature = await signState(data);
  return {
    state: nonce,
    cookieValue: `${data}.${signature}`,
    maxAge: STATE_TTL_SECONDS,
  };
}

export async function readTikTokStateCookie(cookieValue: string | undefined | null, expectedState: string | null) {
  if (!cookieValue || !expectedState) return null;
  const [data, signature] = cookieValue.split(".");
  if (!data || !signature) return null;
  const expectedSignature = await signState(data);
  if (!(await safeEqual(signature, expectedSignature))) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(data))) as StatePayload;
  if (payload.nonce !== expectedState) return null;
  if (Date.now() - payload.createdAt > STATE_TTL_SECONDS * 1000) return null;
  return payload;
}

export function setTikTokStateCookie(headers: Headers, value: string, maxAge: number) {
  headers.append(
    "Set-Cookie",
    `${STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
  );
}

export function clearTikTokStateCookie(headers: Headers) {
  headers.append("Set-Cookie", `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function getTikTokStateCookie(req: Request) {
  const raw = req.headers.get("cookie") || "";
  return raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
}

export function buildTikTokAuthorizeUrl(req: Request, state: string) {
  const { clientKey, redirectUri } = getTikTokConfig(req);
  if (!clientKey) throw new Error("Missing TikTok client key.");
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", clientKey);
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function getBearerUserId(req: Request) {
  const supabase = getServiceSupabase();
  if (!supabase) return { userId: null, error: "Missing Supabase admin credentials." };
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { userId: null, error: "Log in first." };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return { userId: null, error: "Log in first." };
  return { userId: data.user.id, error: null };
}
