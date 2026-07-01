import { createClient } from "@supabase/supabase-js";

export const SECURITY_EVENT_TYPES = new Set([
  "signup_password_submitted",
  "oauth_started",
  "login_password_success",
  "turnstile_verified",
  "media_uploaded",
  "quest_created",
  "quest_updated",
  "report_submitted",
  "message_sent",
]);

export const MEDIA_SOURCE_CONTEXTS = new Set([
  "profile_photo",
  "profile_photo_original",
  "quest_media",
  "quest_media_thumbnail",
  "quest_video",
  "onboarding_photo",
]);

export function getRequestIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

export function getRequestMetadata(req: Request) {
  return {
    raw_ip: getRequestIp(req),
    user_agent: req.headers.get("user-agent"),
    cf_ray: req.headers.get("cf-ray"),
    cf_ipcountry: req.headers.get("cf-ipcountry"),
  };
}

export function deriveDeviceLabel(userAgent: string | null) {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return null;
  const family = ua.includes("iphone")
    ? "iPhone"
    : ua.includes("ipad")
      ? "iPad"
      : ua.includes("android")
        ? "Android"
        : ua.includes("windows")
          ? "Windows"
          : ua.includes("mac os")
            ? "Mac"
            : ua.includes("linux")
              ? "Linux"
              : "Unknown";
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/")
      ? "Chrome"
      : ua.includes("safari/")
        ? "Safari"
        : ua.includes("firefox/")
          ? "Firefox"
          : "Unknown";
  return `${family} ${browser}`;
}

export async function hashIp(ip: string | null) {
  if (!ip) return null;
  const salt = process.env.SECURITY_AUDIT_IP_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!salt) return null;
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeMetadata(value: unknown) {
  if (!isPlainObject(value)) return {};
  const json = JSON.stringify(value);
  if (json.length > 4096) return { truncated: true };
  return value;
}
