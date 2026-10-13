import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
  generateAppleClientSecret,
  readAppleSecurityConfig,
  revokeAppleRefreshToken,
  validateAppleRefreshToken,
} from "../supabase/functions/_shared/apple-token-security.mjs";

function fixtureConfig(overrides = {}) {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const values = {
    APPLE_TEAM_ID: "3258CL32QP",
    APPLE_KEY_ID: "GSAM789J28",
    APPLE_CLIENT_ID: "com.questhat.app",
    APPLE_PRIVATE_KEY_P8: privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
    APPLE_TOKEN_ENCRYPTION_KEY_B64: randomBytes(32).toString("base64"),
    APPLE_TOKEN_ENCRYPTION_KEY_VERSION: "1",
    ...overrides,
  };
  return readAppleSecurityConfig((name) => values[name]);
}

test("Apple refresh tokens are encrypted with unique nonces and decrypt exactly", async () => {
  const config = fixtureConfig();
  const token = "fixture-apple-refresh-token-value";
  const first = await encryptAppleRefreshToken(token, config);
  const second = await encryptAppleRefreshToken(token, config);
  assert.notEqual(first.tokenNonce, second.tokenNonce);
  assert.notEqual(first.tokenCiphertext, second.tokenCiphertext);
  assert.equal(
    await decryptAppleRefreshToken({
      key_version: first.keyVersion,
      token_ciphertext: first.tokenCiphertext,
      token_nonce: first.tokenNonce,
    }, config),
    token,
  );
  assert.doesNotMatch(first.tokenCiphertext, new RegExp(token));
});

test("invalid token and encryption configuration fail closed", () => {
  assert.throws(
    () => validateAppleRefreshToken("short"),
    /valid Apple provider refresh token/,
  );
  assert.throws(
    () =>
      fixtureConfig({
        APPLE_TOKEN_ENCRYPTION_KEY_B64: randomBytes(16).toString("base64"),
      }),
    /exactly 32 bytes/,
  );
  assert.throws(
    () => fixtureConfig({ APPLE_CLIENT_ID: "" }),
    /APPLE_CLIENT_ID/,
  );
});

test("client secret uses the configured Apple identity and a five-minute lifetime", async () => {
  const config = fixtureConfig();
  const now = 1_800_000_000;
  const jwt = await generateAppleClientSecret(config, now);
  const [headerPart, claimsPart, signaturePart] = jwt.split(".");
  const decode = (value) =>
    JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  assert.deepEqual(decode(headerPart), {
    alg: "ES256",
    kid: config.keyId,
    typ: "JWT",
  });
  assert.deepEqual(decode(claimsPart), {
    iss: config.teamId,
    sub: config.clientId,
    aud: "https://appleid.apple.com",
    iat: now,
    exp: now + 300,
  });
  assert.equal(Buffer.from(signaturePart, "base64url").length, 64);
});

test("revocation sends only the documented refresh-token form and accepts Apple's idempotent 200", async () => {
  const config = fixtureConfig();
  let captured;
  const result = await revokeAppleRefreshToken(
    "fixture-apple-refresh-token-value",
    config,
    {
      nowSeconds: 1_800_000_000,
      fetchImplementation: async (url, options) => {
        captured = { url, options };
        return new Response(null, { status: 200 });
      },
    },
  );
  assert.deepEqual(result, { ok: true, status: 200 });
  assert.equal(captured.url, "https://appleid.apple.com/auth/revoke");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.body.get("client_id"), "com.questhat.app");
  assert.equal(
    captured.options.body.get("token"),
    "fixture-apple-refresh-token-value",
  );
  assert.equal(captured.options.body.get("token_type_hint"), "refresh_token");
  assert.equal(captured.options.body.get("client_secret").split(".").length, 3);
});

test("Apple revocation errors stop deletion without exposing token material", async () => {
  const config = fixtureConfig();
  await assert.rejects(
    revokeAppleRefreshToken("fixture-apple-refresh-token-value", config, {
      fetchImplementation: async () =>
        Response.json({ error: "invalid_client" }, { status: 400 }),
    }),
    /400, invalid_client/,
  );
});

test("migration and Edge Functions keep plaintext tokens out of client-readable storage", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261010180341_apple_sign_in_token_storage.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const capture = readFileSync(
    new URL(
      "../supabase/functions/apple-token-capture/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const deletion = readFileSync(
    new URL("../supabase/functions/account-deletion/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(migration, /enable row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.apple_sign_in_tokens from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete .* to service_role/i,
  );
  assert.doesNotMatch(migration, /create policy/i);
  assert.match(capture, /encryptAppleRefreshToken/);
  assert.doesNotMatch(capture, /console\.(log|error)/);
  assert.match(deletion, /APPLE_REAUTH_REQUIRED/);
  assert.match(deletion, /supportsAppleReauthentication/);
  assert.match(deletion, /revokeAppleRefreshToken/);
  assert.match(deletion, /status: "revoked"/);
  assert.match(deletion, /legacyManualAppleRevocationRequired/);
});

test("native and web clients capture Apple tokens and preserve explicit deletion intent across reauthentication", () => {
  const native = readFileSync(
    new URL("../apps/mobile/src/App.tsx", import.meta.url),
    "utf8",
  );
  const settings = readFileSync(
    new URL("../src/app/settings/page.tsx", import.meta.url),
    "utf8",
  );
  const callback = readFileSync(
    new URL("../src/app/auth/callback/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(native, /apple-token-capture/);
  assert.match(native, /APPLE_REAUTH_REQUIRED/);
  assert.match(native, /different QuestHat account/);
  assert.doesNotMatch(native, /account\.apple\.com/);
  assert.match(settings, /questhat\.pendingAppleAccountDeletion/);
  assert.match(callback, /PENDING_APPLE_DELETION_TTL_MS/);
  assert.match(callback, /apple-token-capture/);
  assert.match(
    callback,
    /confirmation: "DELETE",\s+supportsAppleReauthentication: true/,
  );
});
