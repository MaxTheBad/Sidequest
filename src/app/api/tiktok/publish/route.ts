import { getTikTokContentAccount, getTikTokCreatorInfo } from "@/lib/tiktok-content-posting";
import { getBearerUserId } from "@/lib/tiktok-oauth";

export const runtime = "edge";
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

type InitResponse = { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } };

export async function POST(req: Request) {
  const { userId, error } = await getBearerUserId(req);
  if (!userId) return Response.json({ ok: false, error }, { status: 401 });
  try {
    const form = await req.formData();
    const video = form.get("video");
    const mode = form.get("mode") === "direct" ? "direct" : "draft";
    const title = String(form.get("title") || "").trim().slice(0, 2200);
    const privacyLevel = String(form.get("privacyLevel") || "SELF_ONLY");
    if (!(video instanceof File) || !video.size) throw new Error("Choose a video to share.");
    if (!/^video\/(mp4|quicktime|webm)$/i.test(video.type)) throw new Error("Choose an MP4, MOV, or WebM video.");
    if (video.size > MAX_VIDEO_BYTES) throw new Error("Choose a video smaller than 50 MB.");

    const { account, accessToken } = await getTikTokContentAccount(userId, req);
    const requiredScope = mode === "direct" ? "video.publish" : "video.upload";
    if (!account.scopes?.includes(requiredScope)) throw new Error("Reconnect TikTok to authorize this sharing option.");
    let creator = null;
    if (mode === "direct") {
      creator = await getTikTokCreatorInfo(accessToken);
      if (!creator.privacy_level_options?.includes(privacyLevel)) throw new Error("Choose one of the privacy options available for your TikTok account.");
    }

    const endpoint = mode === "direct"
      ? "https://open.tiktokapis.com/v2/post/publish/video/init/"
      : "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
    const initBody = mode === "direct"
      ? {
          post_info: {
            title,
            privacy_level: privacyLevel,
            disable_comment: creator?.comment_disabled === true,
            disable_duet: creator?.duet_disabled === true,
            disable_stitch: creator?.stitch_disabled === true,
          },
          source_info: { source: "FILE_UPLOAD", video_size: video.size, chunk_size: video.size, total_chunk_count: 1 },
        }
      : { source_info: { source: "FILE_UPLOAD", video_size: video.size, chunk_size: video.size, total_chunk_count: 1 } };
    const initResponse = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify(initBody),
    });
    const init = (await initResponse.json().catch(() => ({}))) as InitResponse;
    if (!initResponse.ok || init.error?.code && init.error.code !== "ok" || !init.data?.upload_url || !init.data.publish_id) {
      throw new Error(init.error?.message || "TikTok could not start this upload.");
    }
    const bytes = await video.arrayBuffer();
    const uploadResponse = await fetch(init.data.upload_url, {
      method: "PUT",
      headers: {
        "content-type": video.type || "video/mp4",
        "content-length": String(video.size),
        "content-range": `bytes 0-${video.size - 1}/${video.size}`,
      },
      body: bytes,
    });
    if (!uploadResponse.ok) throw new Error("TikTok could not receive the video. Please try again.");
    return Response.json({
      ok: true,
      publishId: init.data.publish_id,
      mode,
      message: mode === "direct"
        ? "TikTok received your post for processing. It may take a moment to appear."
        : "TikTok received your draft. Open your TikTok inbox to finish editing and posting it.",
    });
  } catch (cause) {
    return Response.json({ ok: false, error: cause instanceof Error ? cause.message : "TikTok sharing is unavailable." }, { status: 400 });
  }
}
