import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions } from "@/lib/sentry-privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  release: process.env.SENTRY_RELEASE || process.env.CF_PAGES_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1,
  ...sentryPrivacyOptions(),
});
