import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";

function usage() {
  console.error(
    "Usage: node scripts/generate-apple-client-secret.mjs <team_id> <key_id> <services_id> <private_key_p8_path> [expires_in_days]"
  );
  process.exit(1);
}

const [teamId, keyId, servicesId, keyPath, expiresInDaysRaw] = process.argv.slice(2);
if (!teamId || !keyId || !servicesId || !keyPath) usage();

const expiresInDays = Number(expiresInDaysRaw || "180");
if (!Number.isFinite(expiresInDays) || expiresInDays <= 0) {
  console.error("expires_in_days must be a positive number.");
  process.exit(1);
}

const privateKeyPem = readFileSync(keyPath, "utf8");
const privateKey = createPrivateKey(privateKeyPem);

const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: teamId,
  iat: now,
  exp: now + Math.floor(expiresInDays * 24 * 60 * 60),
  aud: "https://appleid.apple.com",
  sub: servicesId,
};

function base64Url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const header = {
  alg: "ES256",
  kid: keyId,
  typ: "JWT",
};

const encodedHeader = base64Url(JSON.stringify(header));
const encodedPayload = base64Url(JSON.stringify(payload));
const signingInput = `${encodedHeader}.${encodedPayload}`;

const signature = sign(null, Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: "ieee-p1363",
});
const encodedSignature = base64Url(signature);

const jwt = `${signingInput}.${encodedSignature}`;
process.stdout.write(jwt);
