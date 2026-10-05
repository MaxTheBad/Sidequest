import { getTikTokContentAccount, getTikTokCreatorInfo } from "@/lib/tiktok-content-posting";
import { getBearerUserId } from "@/lib/tiktok-oauth";

export const runtime = "edge";

export async function POST(req: Request) {
  const { userId, error } = await getBearerUserId(req);
  if (!userId) return Response.json({ ok: false, error }, { status: 401 });
  try {
    const { account, accessToken } = await getTikTokContentAccount(userId, req);
    if (!account.scopes?.includes("video.publish")) {
      return Response.json({ ok: false, error: "Reconnect TikTok to authorize video publishing." }, { status: 403 });
    }
    return Response.json({ ok: true, creator: await getTikTokCreatorInfo(accessToken) });
  } catch (cause) {
    return Response.json({ ok: false, error: cause instanceof Error ? cause.message : "TikTok publishing is unavailable." }, { status: 400 });
  }
}
