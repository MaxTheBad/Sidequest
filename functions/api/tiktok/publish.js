import { getBearerUserId, json, supabaseRest } from "./_shared.js";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

async function getAccount(env, userId) {
  const response = await supabaseRest(env, `user_tiktok_accounts?select=access_token,scopes&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
    headers: { Accept: "application/json" },
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows) || !rows[0]) throw new Error("Connect TikTok before sharing a video.");
  return rows[0];
}

async function creatorInfo(accessToken) {
  const response = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8" },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error?.code && payload.error.code !== "ok") throw new Error(payload?.error?.message || "TikTok could not load your posting options.");
  return payload.data || {};
}

export async function onRequestPost({ request, env }) {
  const { userId, error } = await getBearerUserId(request, env);
  if (!userId) return json({ ok: false, error }, { status: 401 });
  try {
    const form = await request.formData();
    const video = form.get("video");
    const mode = form.get("mode") === "direct" ? "direct" : "draft";
    const title = String(form.get("title") || "").trim().slice(0, 2200);
    const privacyLevel = String(form.get("privacyLevel") || "SELF_ONLY");
    if (!(video instanceof File) || !video.size) throw new Error("Choose a video to share.");
    if (!/^video\/(mp4|quicktime|webm)$/i.test(video.type)) throw new Error("Choose an MP4, MOV, or WebM video.");
    if (video.size > MAX_VIDEO_BYTES) throw new Error("Choose a video smaller than 50 MB.");
    const account = await getAccount(env, userId);
    const requiredScope = mode === "direct" ? "video.publish" : "video.upload";
    if (!account.scopes?.includes(requiredScope)) throw new Error("Reconnect TikTok to authorize this sharing option.");
    const creator = mode === "direct" ? await creatorInfo(account.access_token) : null;
    if (mode === "direct" && !creator.privacy_level_options?.includes(privacyLevel)) throw new Error("Choose one of the privacy options available for your TikTok account.");
    const endpoint = mode === "direct"
      ? "https://open.tiktokapis.com/v2/post/publish/video/init/"
      : "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
    const body = mode === "direct"
      ? { post_info: { title, privacy_level: privacyLevel, disable_comment: creator.comment_disabled === true, disable_duet: creator.duet_disabled === true, disable_stitch: creator.stitch_disabled === true }, source_info: { source: "FILE_UPLOAD", video_size: video.size, chunk_size: video.size, total_chunk_count: 1 } }
      : { source_info: { source: "FILE_UPLOAD", video_size: video.size, chunk_size: video.size, total_chunk_count: 1 } };
    const initResponse = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${account.access_token}`, "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify(body) });
    const init = await initResponse.json().catch(() => ({}));
    if (!initResponse.ok || init?.error?.code && init.error.code !== "ok" || !init?.data?.upload_url || !init?.data?.publish_id) throw new Error(init?.error?.message || "TikTok could not start this upload.");
    const bytes = await video.arrayBuffer();
    const uploadResponse = await fetch(init.data.upload_url, { method: "PUT", headers: { "content-type": video.type || "video/mp4", "content-length": String(video.size), "content-range": `bytes 0-${video.size - 1}/${video.size}` }, body: bytes });
    if (!uploadResponse.ok) throw new Error("TikTok could not receive the video. Please try again.");
    return json({ ok: true, publishId: init.data.publish_id, mode, message: mode === "direct" ? "TikTok received your post for processing. It may take a moment to appear." : "TikTok received your draft. Open your TikTok inbox to finish editing and posting it." });
  } catch (cause) {
    return json({ ok: false, error: cause instanceof Error ? cause.message : "TikTok sharing is unavailable." }, { status: 400 });
  }
}
