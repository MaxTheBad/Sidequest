import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = [
  "../src/app/api/report-alert/route.ts",
  "../src/app/api/welcome-email/route.ts",
  "../src/lib/smtp-email.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

test("Cloudflare socket imports stay runtime-only for webpack edge builds", () => {
  for (const source of sources) {
    assert.doesNotMatch(source, /import\(["']cloudflare:sockets["']\)/);
    assert.match(source, /const socketModule = ["']cloudflare:sockets["'];/);
    assert.match(source, /import\(\/\* webpackIgnore: true \*\/ socketModule\)/);
  }
});
