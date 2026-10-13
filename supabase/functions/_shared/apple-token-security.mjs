const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64url(value) {
  const bytes = typeof value === "string" ? utf8.encode(value) : value;
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

function normalizePrivateKey(value) {
  return value.replace(/\\n/g, "\n").trim();
}

function privateKeyBytes(value) {
  const pem = normalizePrivateKey(value);
  const match =
    /^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PRIVATE KEY-----$/s
      .exec(pem);
  if (!match) throw new Error("Apple private key is not a PKCS#8 PEM value.");
  return base64ToBytes(match[1].replace(/\s/g, ""));
}

export function validateAppleRefreshToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  if (token.length < 16 || token.length > 8192 || /\s/.test(token)) {
    throw new Error("A valid Apple provider refresh token is required.");
  }
  return token;
}

export function readAppleSecurityConfig(readEnvironment) {
  const config = {
    teamId: readEnvironment("APPLE_TEAM_ID")?.trim() || "",
    keyId: readEnvironment("APPLE_KEY_ID")?.trim() || "",
    clientId: readEnvironment("APPLE_CLIENT_ID")?.trim() || "",
    privateKey: readEnvironment("APPLE_PRIVATE_KEY_P8") || "",
    encryptionKey: readEnvironment("APPLE_TOKEN_ENCRYPTION_KEY_B64")?.trim() ||
      "",
    keyVersion: Number(
      readEnvironment("APPLE_TOKEN_ENCRYPTION_KEY_VERSION") || "1",
    ),
  };
  if (!/^[A-Z0-9]{10}$/.test(config.teamId)) {
    throw new Error("APPLE_TEAM_ID is not configured.");
  }
  if (!/^[A-Z0-9]{10}$/.test(config.keyId)) {
    throw new Error("APPLE_KEY_ID is not configured.");
  }
  if (!/^[A-Za-z0-9.-]{3,255}$/.test(config.clientId)) {
    throw new Error("APPLE_CLIENT_ID is not configured.");
  }
  if (!Number.isSafeInteger(config.keyVersion) || config.keyVersion < 1) {
    throw new Error("Apple token encryption key version is invalid.");
  }
  privateKeyBytes(config.privateKey);
  const encryptionKeyBytes = base64ToBytes(config.encryptionKey);
  if (encryptionKeyBytes.length !== 32) {
    throw new Error(
      "Apple token encryption key must contain exactly 32 bytes.",
    );
  }
  return { ...config, encryptionKeyBytes };
}

function importEncryptionKey(
  config,
  cryptoImplementation = globalThis.crypto,
) {
  return cryptoImplementation.subtle.importKey(
    "raw",
    config.encryptionKeyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptAppleRefreshToken(
  token,
  config,
  cryptoImplementation = globalThis.crypto,
) {
  const normalizedToken = validateAppleRefreshToken(token);
  const nonce = cryptoImplementation.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey(config, cryptoImplementation);
  const ciphertext = await cryptoImplementation.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    utf8.encode(normalizedToken),
  );
  return {
    tokenCiphertext: base64url(new Uint8Array(ciphertext)),
    tokenNonce: base64url(nonce),
    keyVersion: config.keyVersion,
  };
}

export async function decryptAppleRefreshToken(
  record,
  config,
  cryptoImplementation = globalThis.crypto,
) {
  if (record.key_version !== config.keyVersion) {
    throw new Error("Apple token encryption key version is unavailable.");
  }
  const key = await importEncryptionKey(config, cryptoImplementation);
  const plaintext = await cryptoImplementation.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.token_nonce) },
    key,
    base64ToBytes(record.token_ciphertext),
  );
  return validateAppleRefreshToken(utf8Decoder.decode(plaintext));
}

export async function generateAppleClientSecret(
  config,
  nowSeconds = Math.floor(Date.now() / 1000),
  cryptoImplementation = globalThis.crypto,
) {
  const privateKey = await cryptoImplementation.subtle.importKey(
    "pkcs8",
    privateKeyBytes(config.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = base64url(
    JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }),
  );
  const claims = base64url(JSON.stringify({
    iss: config.teamId,
    sub: config.clientId,
    aud: "https://appleid.apple.com",
    iat: nowSeconds,
    exp: nowSeconds + 300,
  }));
  const signingInput = `${header}.${claims}`;
  const signature = await cryptoImplementation.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    utf8.encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

export async function revokeAppleRefreshToken(token, config, options = {}) {
  const fetchImplementation = options.fetchImplementation || globalThis.fetch;
  const clientSecret = await generateAppleClientSecret(
    config,
    options.nowSeconds,
    options.cryptoImplementation,
  );
  const response = await fetchImplementation(
    "https://appleid.apple.com/auth/revoke",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: clientSecret,
        token: validateAppleRefreshToken(token),
        token_type_hint: "refresh_token",
      }),
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const code = typeof payload?.error === "string"
      ? payload.error
      : "apple_revoke_failed";
    throw new Error(
      `Apple token revocation failed (${response.status}, ${code}).`,
    );
  }
  return { ok: true, status: response.status };
}
