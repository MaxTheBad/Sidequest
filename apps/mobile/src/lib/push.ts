import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export const ANDROID_NOTIFICATION_CHANNEL = "questhat-updates";

export async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL, {
    name: "QuestHat updates",
    description: "Messages, join updates, quest activity, and reminders.",
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: "#9BD8E4",
    showBadge: true,
  });
}

export async function getPushPermissionStatus() {
  if (Platform.OS === "web" || !Device.isDevice) {
    return "unavailable" as const;
  }
  const permission = await Notifications.getPermissionsAsync();
  return permission.status;
}

export async function requestPushPermissionAndRegisterForUser(userId: string) {
  await ensureAndroidNotificationChannel();
  if (supabase) {
    const permission = await Notifications.getPermissionsAsync();
    let status = permission.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") {
      return null;
    }
  }
  return registerPushTokenForUser(userId);
}

export async function registerPushTokenForUser(userId: string) {
  if (!supabase) return null;
  if (Platform.OS === "web" || !Device.isDevice) {
    return null;
  }

  await ensureAndroidNotificationChannel();

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") {
    return null;
  }

  const isAndroid = Platform.OS === "android";
  const tokenResult = isAndroid
    ? await Notifications.getDevicePushTokenAsync()
    : await Notifications.getExpoPushTokenAsync({
        projectId: Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId,
      });
  const pushToken = tokenResult.data;
  const { error } = await supabase.rpc("register_push_token", {
    p_expo_push_token: pushToken,
    p_platform: Platform.OS,
  });
  if (error) {
    throw new Error(error.message);
  }
  return pushToken;
}
