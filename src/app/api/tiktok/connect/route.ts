import { buildTikTokAuthorizeUrl, createTikTokStateCookie, getBearerUserId, setTikTokStateCookie } from "@/lib/tiktok-oauth";

export const runtime = "edge";

export async function POST(req: Request) {
  const { userId, error } = await getBearerUserId(req);
  if (!userId) return Response.json({ ok: false, error }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { returnTo?: unknown };
  const returnTo = typeof body.returnTo === "string" && body.returnTo.startsWith("/") ? body.returnTo : "/settings?section=connected";
  try {
    const { state, cookieValue, maxAge } = await createTikTokStateCookie({ userId, returnTo });
    const authorizationUrl = buildTikTokAuthorizeUrl(req, state);
    const headers = new Headers();
    setTikTokStateCookie(headers, cookieValue, maxAge);
    return Response.json({ ok: true, authorizationUrl }, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TikTok connection is unavailable.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
