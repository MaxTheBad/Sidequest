export type FacebookDeletionPayload = {
  algorithm?: string;
  issued_at?: number;
  user_id?: string;
};

function decodeBase64UrlBytes(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export async function verifyFacebookSignedRequest(signedRequest: string, appSecret: string) {
  const [encodedSignature, encodedPayload, extra] = signedRequest.split(".");
  if (!encodedSignature || !encodedPayload || extra || !appSecret) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64UrlBytes(encodedPayload))) as FacebookDeletionPayload;
    if ((payload.algorithm || "").toUpperCase() !== "HMAC-SHA256" || !payload.user_id) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload)));
    const provided = decodeBase64UrlBytes(encodedSignature);
    return constantTimeEqual(provided, expected) ? payload : null;
  } catch {
    return null;
  }
}

export async function hashFacebookUserId(userId: string, appSecret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${appSecret}:${userId}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type FacebookIdentityCandidate = {
  id?: string;
  identity_id?: string;
  provider?: string;
  identity_data?: Record<string, unknown> | null;
};

export function userMatchesFacebookId(
  user: { identities?: FacebookIdentityCandidate[] | null; user_metadata?: Record<string, unknown> | null },
  facebookUserId: string,
) {
  const facebookIdentities = (user.identities || []).filter((identity) => identity.provider === "facebook");
  const identityMatches = facebookIdentities.some((identity) => {
    const identityData = identity.identity_data || {};
    return [identity.id, identity.identity_id, identityData.sub, identityData.id, identityData.user_id]
      .some((value) => typeof value === "string" && value === facebookUserId);
  });
  if (identityMatches) return true;

  // Supabase versions differ in where they expose the provider subject. Only
  // trust metadata fallbacks when this user actually has a Facebook identity.
  return facebookIdentities.length > 0 && [user.user_metadata?.provider_id, user.user_metadata?.sub, user.user_metadata?.oauth_user_id]
    .some((value) => typeof value === "string" && value === facebookUserId);
}
