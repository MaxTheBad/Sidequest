import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Pages supplies the deployed commit at build time; publish only its identifier.
  env: process.env.CF_PAGES_COMMIT_SHA || process.env.SENTRY_RELEASE
    ? { NEXT_PUBLIC_SENTRY_RELEASE: process.env.CF_PAGES_COMMIT_SHA || process.env.SENTRY_RELEASE }
    : {},
};

export default withSentryConfig(nextConfig, {
  org: "anlvio-llc",
  project: "questhat",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: Boolean(process.env.SENTRY_AUTH_TOKEN),
});
