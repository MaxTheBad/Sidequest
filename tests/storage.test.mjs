import test from "node:test";
import assert from "node:assert/strict";
import {
  collectQuestStorageUrls,
  extractStorageObjectPath,
  inferStorageBucketFromUrl,
} from "../src/lib/storage.js";

test("extracts a storage object path from a public URL", () => {
  const url = "https://abc.supabase.co/storage/v1/object/public/quest-media/user-1/thumb.jpg";
  assert.equal(extractStorageObjectPath(url, "quest-media"), "user-1/thumb.jpg");
});

test("infers the correct bucket from a public URL", () => {
  assert.equal(
    inferStorageBucketFromUrl("https://abc.supabase.co/storage/v1/object/public/quest-videos/u1/video.webm"),
    "quest-videos",
  );
});

test("collects unique quest storage urls including thumbnails", () => {
  const urls = collectQuestStorageUrls(
    [
      { url: "https://abc.supabase.co/storage/v1/object/public/quest-media/u1/photo.jpg", thumbnailUrl: null },
      { url: "https://abc.supabase.co/storage/v1/object/public/quest-media/u1/video.webm", thumbnailUrl: "https://abc.supabase.co/storage/v1/object/public/quest-media/u1/thumb.jpg" },
    ],
    "https://abc.supabase.co/storage/v1/object/public/quest-videos/u1/legacy.webm",
  );

  assert.equal(urls.length, 4);
  assert.ok(urls.includes("https://abc.supabase.co/storage/v1/object/public/quest-media/u1/photo.jpg"));
  assert.ok(urls.includes("https://abc.supabase.co/storage/v1/object/public/quest-media/u1/thumb.jpg"));
  assert.ok(urls.includes("https://abc.supabase.co/storage/v1/object/public/quest-videos/u1/legacy.webm"));
});
