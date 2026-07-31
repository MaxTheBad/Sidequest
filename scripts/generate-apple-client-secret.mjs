import { readFileSync } from "node:fs";
import process from "node:process";
import { SignJWT, importPKCS8 } from "jose";

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

const now = Math.floor(Date.now() / 1000);
const privateKeyPem = readFileSync(keyPath, "utf8");

const privateKey = await importPKCS8(privateKeyPem, "ES256");
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
  .setIssuer(teamId)
  .setSubject(servicesId)
  .setAudience("https://appleid.apple.com")
  .setIssuedAt(now)
  .setExpirationTime(now + Math.floor(expiresInDays * 24 * 60 * 60))
  .sign(privateKey);

process.stdout.write(jwt);
