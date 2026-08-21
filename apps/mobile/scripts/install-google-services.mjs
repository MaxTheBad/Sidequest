import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = process.env.GOOGLE_SERVICES_JSON?.trim();

if (!source) {
  console.log("GOOGLE_SERVICES_JSON is not configured; leaving the local Firebase config unchanged.");
  process.exit(0);
}

if (!existsSync(source)) {
  throw new Error("GOOGLE_SERVICES_JSON does not point to an available EAS file variable.");
}

const destination = resolve("android/app/google-services.json");
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log("Installed the Android Firebase configuration for this EAS build.");
