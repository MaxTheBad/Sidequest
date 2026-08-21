import { registerRootComponent } from "expo";
import "./src/lib/backgroundNotifications";
import { ensureAndroidNotificationChannel } from "./src/lib/push";
import App from "./src/App";

void ensureAndroidNotificationChannel().catch((error) => {
  console.warn("Android notification channel setup failed", error instanceof Error ? error.message : String(error));
});

registerRootComponent(App);
