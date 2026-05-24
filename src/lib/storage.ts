import type { SupabaseClient } from "@supabase/supabase-js";

type StorageBucketId = "quest-media" | "quest-videos" | "profile-photos";

const PUBLIC_OBJECT_PREFIX = "/object/public/";

export function extractStorageObjectPath(publicUrl: string, bucketId: StorageBucketId) {
  if (!publicUrl) return null;
  const cleaned = publicUrl.split("?")[0] || "";
  const marker = `${PUBLIC_OBJECT_PREFIX}${bucketId}/`;
  const idx = cleaned.indexOf(marker);
  if (idx < 0) return null;
  const objectPath = cleaned.slice(idx + marker.length);
  return objectPath ? decodeURIComponent(objectPath) : null;
}

export function inferStorageBucketFromUrl(publicUrl: string): StorageBucketId | null {
  if (!publicUrl) return null;
  if (publicUrl.includes("/object/public/quest-media/")) return "quest-media";
  if (publicUrl.includes("/object/public/quest-videos/")) return "quest-videos";
  if (publicUrl.includes("/object/public/profile-photos/")) return "profile-photos";
  return null;
}

export function collectQuestStorageUrls(items: Array<{ url: string; thumbnailUrl?: string | null }>, legacyVideoUrl?: string | null) {
  const urls = new Set<string>();
  if (legacyVideoUrl) urls.add(legacyVideoUrl);
  for (const item of items) {
    if (item.url) urls.add(item.url);
    if (item.thumbnailUrl) urls.add(item.thumbnailUrl);
  }
  return Array.from(urls);
}

export async function removeStoragePublicUrls(
  supabase: SupabaseClient,
  urls: string[],
  opts: { bucketId?: StorageBucketId | null } = {},
) {
  const grouped = new Map<StorageBucketId, string[]>();

  for (const url of urls) {
    const bucketId = opts.bucketId || inferStorageBucketFromUrl(url);
    if (!bucketId) continue;
    const path = extractStorageObjectPath(url, bucketId);
    if (!path) continue;
    const existing = grouped.get(bucketId) || [];
    existing.push(path);
    grouped.set(bucketId, existing);
  }

  for (const [bucketId, paths] of grouped.entries()) {
    if (!paths.length) continue;
    const { error } = await supabase.storage.from(bucketId).remove(paths);
    if (error) throw new Error(error.message);
  }
}
