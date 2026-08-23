import { importPKCS8, SignJWT } from "jose";

type AppleMapsTokenResponse = {
  accessToken?: string;
  expiresInSeconds?: number;
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function mapsCredentials() {
  const teamId = process.env.APPLE_MAPS_TEAM_ID?.trim();
  const keyId = process.env.APPLE_MAPS_KEY_ID?.trim();
  const privateKey = process.env.APPLE_MAPS_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return teamId && keyId && privateKey ? { teamId, keyId, privateKey } : null;
}

export function appleMapsServerIsConfigured() {
  return Boolean(mapsCredentials());
}

async function createAuthorizationToken() {
  const credentials = mapsCredentials();
  if (!credentials) throw new Error("Apple Maps Server API credentials are not configured.");
  const key = await importPKCS8(credentials.privateKey, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: "server_api" })
    .setProtectedHeader({ alg: "ES256", kid: credentials.keyId, typ: "JWT" })
    .setIssuer(credentials.teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + 10 * 60)
    .sign(key);
}

export async function getAppleMapsAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const authorizationToken = await createAuthorizationToken();
  const response = await fetch("https://maps-api.apple.com/v1/token", {
    headers: { Authorization: `Bearer ${authorizationToken}` },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as AppleMapsTokenResponse | null;
  if (!response.ok || !body?.accessToken) {
    throw new Error(`Apple Maps authorization failed (${response.status}).`);
  }

  const expiresInSeconds = Math.max(60, Number(body.expiresInSeconds) || 1_800);
  cachedAccessToken = {
    value: body.accessToken,
    expiresAt: Date.now() + expiresInSeconds * 1_000,
  };
  return body.accessToken;
}

