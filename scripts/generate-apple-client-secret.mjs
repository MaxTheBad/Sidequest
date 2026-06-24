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

function derToJose(derSignature) {
  let offset = 0;
  if (derSignature[offset++] !== 0x30) throw new Error("Invalid DER signature.");
  const seqLength = derSignature[offset++];
  if (seqLength + 2 !== derSignature.length) throw new Error("Invalid DER signature length.");

  if (derSignature[offset++] !== 0x02) throw new Error("Invalid DER signature.");
  let rLength = derSignature[offset++];
  let r = derSignature.slice(offset, offset + rLength);
  offset += rLength;

  if (derSignature[offset++] !== 0x02) throw new Error("Invalid DER signature.");
  let sLength = derSignature[offset++];
  let s = derSignature.slice(offset, offset + sLength);

  if (r[0] === 0x00 && r.length > 32) r = r.slice(1);
  if (s[0] === 0x00 && s.length > 32) s = s.slice(1);

  if (r.length > 32 || s.length > 32) throw new Error("Invalid ECDSA signature component length.");

  const rPadded = Buffer.concat([Buffer.alloc(32 - r.length, 0), r]);
  const sPadded = Buffer.concat([Buffer.alloc(32 - s.length, 0), s]);
  return Buffer.concat([rPadded, sPadded]);
}

const header = {
  alg: "ES256",
  kid: keyId,
  typ: "JWT",
};

const encodedHeader = base64Url(JSON.stringify(header));
const encodedPayload = base64Url(JSON.stringify(payload));
const signingInput = `${encodedHeader}.${encodedPayload}`;

const signature = sign("sha256", Buffer.from(signingInput), privateKey);
const encodedSignature = base64Url(derToJose(signature));

const jwt = `${signingInput}.${encodedSignature}`;
process.stdout.write(jwt);
