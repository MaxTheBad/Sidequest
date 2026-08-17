import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  userMatchesFacebookId,
  verifyFacebookSignedRequest,
} from "../src/lib/facebook-data-deletion.ts";

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signedRequest(payload, secret = "test-secret") {
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

test("verifies a genuine Meta data-deletion signed request", async () => {
  const request = signedRequest({ algorithm: "HMAC-SHA256", user_id: "facebook-123", issued_at: 42 });
  const payload = await verifyFacebookSignedRequest(request, "test-secret");
  assert.equal(payload?.user_id, "facebook-123");
});

test("rejects tampered or incorrectly signed Meta requests", async () => {
  const request = signedRequest({ algorithm: "HMAC-SHA256", user_id: "facebook-123" });
  assert.equal(await verifyFacebookSignedRequest(request, "wrong-secret"), null);
  assert.equal(await verifyFacebookSignedRequest(`${request}tampered`, "test-secret"), null);
});

test("matches Facebook ids from Supabase identity data", () => {
  const user = {
    identities: [{ provider: "facebook", id: "identity-row", identity_data: { sub: "facebook-123" } }],
    user_metadata: {},
  };
  assert.equal(userMatchesFacebookId(user, "facebook-123"), true);
  assert.equal(userMatchesFacebookId(user, "facebook-999"), false);
});

test("does not trust metadata from a non-Facebook identity", () => {
  assert.equal(userMatchesFacebookId({
    identities: [{ provider: "google", id: "google-user" }],
    user_metadata: { sub: "facebook-user-123" },
  }, "facebook-user-123"), false);
});
