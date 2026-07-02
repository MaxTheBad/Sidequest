const PUBLIC_OBJECT_PREFIX = "/object/public/";

export function extractStorageObjectPath(publicUrl: string | null | undefined, bucketId: string) {
  if (!publicUrl) return null;
  const cleaned = publicUrl.split("?")[0] || "";
  const marker = `${PUBLIC_OBJECT_PREFIX}${bucketId}/`;
  const idx = cleaned.indexOf(marker);
  if (idx < 0) return null;
  const objectPath = cleaned.slice(idx + marker.length);
  return objectPath ? decodeURIComponent(objectPath) : null;
}

export function inferStorageBucketFromUrl(publicUrl: string | null | undefined) {
  if (!publicUrl) return null;
  if (publicUrl.includes("/object/public/quest-media/")) return "quest-media";
  if (publicUrl.includes("/object/public/quest-videos/")) return "quest-videos";
  if (publicUrl.includes("/object/public/profile-photos/")) return "profile-photos";
  return null;
}

export type QuestStorageMediaItem = {
  url?: string | null;
  thumbnailUrl?: string | null;
};

export function collectQuestStorageUrls(items: QuestStorageMediaItem[], legacyVideoUrl?: string | null) {
  const urls = new Set<string>();
  if (legacyVideoUrl) urls.add(legacyVideoUrl);
  for (const item of items) {
    if (item.url) urls.add(item.url);
    if (item.thumbnailUrl) urls.add(item.thumbnailUrl);
  }
  return Array.from(urls);
}
