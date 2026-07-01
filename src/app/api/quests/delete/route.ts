import { getServiceSupabase } from "@/lib/security-audit-server";
import { collectQuestStorageUrls, removeStoragePublicUrls } from "@/lib/storage.js";

export const runtime = "edge";

type DeleteQuestBody = {
  quest_id?: unknown;
};

type QuestMediaItem = {
  url?: string | null;
  thumbnailUrl?: string | null;
};

function cleanId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function POST(req: Request) {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return Response.json({ ok: false, error: "Missing Supabase admin credentials." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return Response.json({ ok: false, error: "Log in to delete this listing." }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  const userId = authData.user?.id || null;
  if (authError || !userId) {
    return Response.json({ ok: false, error: "Log in to delete this listing." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as DeleteQuestBody | null;
  const questId = cleanId(body?.quest_id);
  if (!questId) {
    return Response.json({ ok: false, error: "Missing listing id." }, { status: 400 });
  }

  const { data: quest, error: readError } = await supabase
    .from("quests")
    .select("id, creator_id, media_video_url, media_items")
    .eq("id", questId)
    .maybeSingle();

  if (readError) {
    return Response.json({ ok: false, error: readError.message }, { status: 500 });
  }
  if (!quest) {
    return Response.json({ ok: false, error: "Listing was already deleted." }, { status: 404 });
  }
  if (quest.creator_id !== userId) {
    return Response.json({ ok: false, error: "Only the listing creator can delete this listing." }, { status: 403 });
  }

  const storageUrls = collectQuestStorageUrls(
    ((quest.media_items || []) as QuestMediaItem[]).map((item) => ({
      url: item.url || null,
      thumbnailUrl: item.thumbnailUrl || null,
    })),
    quest.media_video_url || null,
  );

  const { error: deleteError } = await supabase
    .from("quests")
    .delete()
    .eq("id", questId)
    .eq("creator_id", userId);

  if (deleteError) {
    return Response.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  try {
    await removeStoragePublicUrls(supabase, storageUrls);
  } catch (cleanupErr) {
    const message = cleanupErr instanceof Error ? cleanupErr.message : "Storage cleanup failed.";
    return Response.json({ ok: true, storageCleanupError: message });
  }

  return Response.json({ ok: true });
}
