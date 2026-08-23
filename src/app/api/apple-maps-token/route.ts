import { appleMapsServerIsConfigured, getAppleMapKitJsToken } from "@/lib/apple-maps-server";

export const runtime = "edge";

function permittedOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const suppliedOrigin = request.headers.get("origin") || (() => {
    const referer = request.headers.get("referer");
    if (!referer) return "";
    try { return new URL(referer).origin; } catch { return ""; }
  })();
  const allowed = new Set([requestOrigin, "https://questhat.com", "https://www.questhat.com"]);
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }
  return allowed.has(suppliedOrigin || requestOrigin) ? (suppliedOrigin || requestOrigin) : null;
}

export async function GET(request: Request) {
  if (!appleMapsServerIsConfigured()) return new Response("Apple Maps is not configured.", { status: 503 });
  const origin = permittedOrigin(request);
  if (!origin) return new Response("Origin is not allowed.", { status: 403 });
  try {
    const token = await getAppleMapKitJsToken(origin);
    return new Response(token, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Apple Maps authorization failed.", { status: 502 });
  }
}
