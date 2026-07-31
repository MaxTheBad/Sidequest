import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

const BACKGROUND_NOTIFICATION_TASK = "questhat-background-notification";

function readUnreadCount(payload: Notifications.NotificationTaskPayload) {
  if ("actionIdentifier" in payload) return null;

  const directCount = payload.data?.unreadCount;
  if (typeof directCount === "number" && Number.isFinite(directCount)) {
    return Math.max(0, Math.floor(directCount));
  }

  const dataString = payload.data?.dataString;
  if (typeof dataString !== "string") return null;

  try {
    const parsed = JSON.parse(dataString) as { unreadCount?: unknown };
    return typeof parsed.unreadCount === "number" && Number.isFinite(parsed.unreadCount)
      ? Math.max(0, Math.floor(parsed.unreadCount))
      : null;
  } catch {
    return null;
  }
}

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error) return Notifications.BackgroundNotificationTaskResult.Failed;

    const unreadCount = readUnreadCount(data);
    if (unreadCount === null) return Notifications.BackgroundNotificationTaskResult.NoData;

    await Notifications.setBadgeCountAsync(unreadCount);
    return Notifications.BackgroundNotificationTaskResult.NewData;
  });
}

if (Platform.OS !== "web") {
  void Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((error) => {
    console.warn("Background notification registration failed", error instanceof Error ? error.message : String(error));
  });
}
