const PUBLIC_OBJECT_PREFIX = "/object/public/";

export function extractStorageObjectPath(publicUrl, bucketId) {
  if (!publicUrl) return null;
  const cleaned = publicUrl.split("?")[0] || "";
  const marker = `${PUBLIC_OBJECT_PREFIX}${bucketId}/`;
  const idx = cleaned.indexOf(marker);
  if (idx < 0) return null;
  const objectPath = cleaned.slice(idx + marker.length);
  return objectPath ? decodeURIComponent(objectPath) : null;
}

export function inferStorageBucketFromUrl(publicUrl) {
  if (!publicUrl) return null;
  if (publicUrl.includes("/object/public/quest-media/")) return "quest-media";
  if (publicUrl.includes("/object/public/quest-videos/")) return "quest-videos";
  if (publicUrl.includes("/object/public/profile-photos/")) return "profile-photos";
  return null;
}

export function collectQuestStorageUrls(items, legacyVideoUrl) {
  const urls = new Set();
  if (legacyVideoUrl) urls.add(legacyVideoUrl);
  for (const item of items) {
    if (item.url) urls.add(item.url);
    if (item.thumbnailUrl) urls.add(item.thumbnailUrl);
  }
  return Array.from(urls);
}

export async function removeStoragePublicUrls(supabase, urls, opts = {}) {
  const grouped = new Map();

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
