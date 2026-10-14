// Expo loads JavaScript app config files through CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const staticConfig = require("./app.json");

module.exports = () => {
  const config = structuredClone(staticConfig.expo);
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim();
  // Public SDK project identifier only. SENTRY_AUTH_TOKEN must never enter
  // Expo extra/plugin props or a shipped bundle.
  const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim();
  if (posthogKey && !posthogKey.startsWith("$")) {
    config.extra = { ...config.extra, posthogKey };
  }

  if (googleServicesFile) {
    config.android = { ...config.android, googleServicesFile };
  }

  return config;
};
