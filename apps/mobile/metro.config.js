// Metro configuration is evaluated by Node's CommonJS loader.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

// Keeps React Native source maps compatible with Sentry while excluding web-only
// replay and feedback code from the native QuestHat bundle.
module.exports = getSentryExpoConfig(__dirname, {
  includeWebReplay: false,
  includeWebFeedback: false,
});
