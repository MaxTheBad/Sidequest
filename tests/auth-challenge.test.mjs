import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { authChallengeMessage as webChallengeMessage } from "../src/lib/auth-challenge.js";
import { authChallengeMessage as nativeChallengeMessage } from "../apps/mobile/src/lib/auth-challenge.js";

const webSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const nativeSource = readFileSync(new URL("../apps/mobile/src/App.tsx", import.meta.url), "utf8");

test("authentication challenge responses fail clearly without a local bypass", () => {
  for (const challengeMessage of [webChallengeMessage, nativeChallengeMessage]) {
    assert.match(challengeMessage({ message: "Captcha verification failed" }) || "", /verification challenge is required/i);
    assert.match(challengeMessage("Turnstile challenge required") || "", /supported client/i);
    assert.equal(challengeMessage({ message: "Invalid login credentials" }), null);
  }
});

test("web and native auth surfaces use the compatible challenge message", () => {
  assert.match(webSource, /authChallengeMessage\(error\) \|\| `Login failed:/);
  assert.match(webSource, /authChallengeMessage\(error\) \|\| error\.message/);
  assert.match(nativeSource, /authChallengeMessage\(result\.error\) \|\| result\.error\.message/);
  assert.match(nativeSource, /authChallengeMessage\(error\) \|\| error\.message/);
  assert.doesNotMatch(nativeSource, /captchaToken:/);
});
