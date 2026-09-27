import Constants from "expo-constants";

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  siteUrl?: string;
  sentryDsn?: string;
  posthogKey?: string;
};

const extra = (Constants.expoConfig?.extra || {}) as Extra;

function cleanEnvValue(value: string | undefined) {
  if (!value || value.startsWith("$")) return "";
  return value;
}

export const env = {
  supabaseUrl: cleanEnvValue(process.env.EXPO_PUBLIC_SUPABASE_URL) || cleanEnvValue(extra.supabaseUrl),
  supabaseAnonKey: cleanEnvValue(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || cleanEnvValue(extra.supabaseAnonKey),
  siteUrl: cleanEnvValue(process.env.EXPO_PUBLIC_SITE_URL) || cleanEnvValue(extra.siteUrl) || "https://questhat.com",
  sentryDsn: cleanEnvValue(process.env.EXPO_PUBLIC_SENTRY_DSN) || cleanEnvValue(extra.sentryDsn),
  posthogKey: cleanEnvValue(process.env.EXPO_PUBLIC_POSTHOG_KEY) || cleanEnvValue(extra.posthogKey),
};
