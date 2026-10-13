import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("all native text inputs use the shared compact keyboard-dismiss control", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "apps/mobile/scripts/check-keyboard-dismiss.mjs")],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /keyboard-dismiss contract: pass/);
});
