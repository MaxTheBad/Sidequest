import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");

test("iOS media transfer calls use the supported foreground session option", () => {
  const uploadCall = appSource.match(
    /FileSystem\.uploadAsync\(endpoint, params\.uri, \{[\s\S]*?\n  \}\);/,
  )?.[0] ?? "";
  assert.match(uploadCall, /uploadType: FileSystem\.FileSystemUploadType\.BINARY_CONTENT/);
  assert.match(uploadCall, /sessionType: FileSystem\.FileSystemSessionType\.FOREGROUND/);
  assert.match(uploadCall, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(uploadCall, /apikey: env\.supabaseAnonKey/);
  assert.match(uploadCall, /"Content-Type": params\.mimeType/);

  const coverDownloadCall = appSource.match(
    /FileSystem\.downloadAsync\(resolved\.uri, destination, \{[\s\S]*?\}\)/,
  )?.[0] ?? "";
  assert.match(coverDownloadCall, /sessionType: FileSystem\.FileSystemSessionType\.FOREGROUND/);
});

test("upload ownership and response safeguards remain in place", () => {
  const helper = appSource.match(
    /async function uploadLocalFileToStorage[\s\S]*?\n\}\n\nfunction getFileExtension/,
  )?.[0] ?? "";
  assert.match(helper, /supabase\.auth\.getSession\(\)/);
  assert.match(helper, /params\.path\.split\("\/", 1\)\[0\] !== sessionData\.session\?\.user\.id/);
  assert.match(helper, /result\.status < 200 \|\| result\.status >= 300/);
  assert.match(helper, /result\.status === 401/);
  assert.match(helper, /result\.status === 403/);
});
