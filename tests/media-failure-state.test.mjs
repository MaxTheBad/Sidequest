import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { classifyPickedMedia, createMediaOperationGate } from "../apps/mobile/src/lib/media-operation-gate.js";
import { isIosUnsupportedVideoUrl } from "../apps/mobile/src/lib/media-compatibility.js";

test("canceled or absent picker output has no media to classify", () => {
  assert.equal(classifyPickedMedia(null), null);
});

test("supported media follows existing types and unsupported MIME is rejected", () => {
  assert.equal(classifyPickedMedia({ type: "image", mimeType: "image/heic" }), "image");
  assert.equal(classifyPickedMedia({ type: "video", mimeType: "video/quicktime" }), "video");
  assert.equal(classifyPickedMedia({ type: "image", mimeType: "application/pdf" }), null);
  assert.equal(classifyPickedMedia({ type: "file", mimeType: "application/pdf" }), null);
});

test("late operations cannot commit after a user or draft change", () => {
  const gate = createMediaOperationGate();
  const first = gate.begin("user-a");
  gate.invalidate();
  assert.equal(gate.isCurrent(first, "user-a"), false);
  const second = gate.begin("draft-2");
  assert.equal(gate.isCurrent(second, "draft-2"), true);
  assert.equal(gate.isCurrent(second, "draft-3"), false);
});

test("profile replacement and removal preserve visible state until persistence succeeds", () => {
  const source = fs.readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");
  const upload = source.slice(source.indexOf("async function uploadProfilePhoto"), source.indexOf("async function deleteProfilePhoto"));
  assert.ok(upload.indexOf("if (profileError) throw profileError") < upload.indexOf("setSettingsAvatarUri(avatarUrl)"));
  assert.doesNotMatch(upload, /previousPhotoPath|remove\(\[settingsAvatarUri\]\)/);
  assert.match(upload, /remove\(\[uploadedPhotoPath\]\)/);
  const remove = source.slice(source.indexOf("async function deleteProfilePhoto"), source.indexOf("function showProfilePhotoOptions"));
  assert.ok(remove.indexOf("if (profileError) throw profileError") < remove.indexOf('setSettingsAvatarUri("")'));
  assert.match(remove, /profilePhotoOperationGate\.isCurrent/);
});

test("quest media rules and stale completion guards stay wired to call sites", () => {
  const source = fs.readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /VIDEO_MAX_DURATION_SECONDS = 15/);
  assert.match(source, /VIDEO_MAX_SIZE_BYTES = 60 \* 1024 \* 1024/);
  assert.match(source, /A quest can include up to 3 media items/);
  assert.match(source, /classifyPickedMedia\(asset\)/);
  assert.match(source, /questMediaOperationGate\.isCurrent/);
});

test("iOS webm media uses a poster fallback before player creation", () => {
  assert.equal(isIosUnsupportedVideoUrl("https://cdn.example/video.webm", "ios"), true);
  assert.equal(isIosUnsupportedVideoUrl("https://cdn.example/video.webm?download=1", "ios"), true);
  assert.equal(isIosUnsupportedVideoUrl("https://cdn.example/video.mp4", "ios"), false);
  assert.equal(isIosUnsupportedVideoUrl("https://cdn.example/video.webm", "android"), false);
  const source = fs.readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");
  const item = source.slice(source.indexOf("function FeedVideoItem"), source.indexOf("function FeedVideoItemSession"));
  assert.match(item, /isIosUnsupportedVideoUrl\(media\.url, Platform\.OS\)/);
  assert.match(item, /This video format is not supported on iPhone/);
  assert.doesNotMatch(item, /useVideoPlayer/);
});
