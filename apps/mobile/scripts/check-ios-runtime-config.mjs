import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const configIndex = args.indexOf("--config");
const configPath = configIndex === -1
  ? path.resolve(process.cwd(), "apps/mobile/app.json")
  : path.resolve(args[configIndex + 1] || "");

if (configIndex !== -1 && !args[configIndex + 1]) {
  throw new Error("--config requires a path to a generated app.config file");
}

const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
const extra = (parsed.expo?.extra ?? parsed.extra ?? {});
const hasSupabaseUrl = typeof extra.supabaseUrl === "string" && extra.supabaseUrl.length > 0;
const hasSupabaseAnonKey = typeof extra.supabaseAnonKey === "string" && extra.supabaseAnonKey.length > 0;

if (!hasSupabaseUrl || !hasSupabaseAnonKey) {
  throw new Error("iOS runtime config is missing required Supabase settings");
}

if (extra.postQuestFollowUpsEnabled !== true) {
  throw new Error("iOS runtime config is missing the released post-quest follow-up capability");
}

if (extra.nativeFeedbackEnabled !== true) {
  throw new Error("iOS runtime config does not enable native feedback with the hosted Turnstile challenge");
}

console.log("ios_runtime_config=supabase-present;post-quest-followups=enabled;native-feedback=enabled");
