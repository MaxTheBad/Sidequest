import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export async function getPushPermissionStatus() {
  if (Platform.OS === "web" || !Device.isDevice) {
    return "unavailable" as const;
  }
  const permission = await Notifications.getPermissionsAsync();
  return permission.status;
}

export async function requestPushPermissionAndRegisterForUser(userId: string) {
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

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") {
    return null;
  }

  const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn("Push registration skipped: missing EAS projectId.");
    return null;
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = tokenResult.data;
  const { error } = await supabase.rpc("register_push_token", {
    p_expo_push_token: expoPushToken,
    p_platform: Platform.OS,
  });
  if (error) {
    throw new Error(error.message);
  }
  return expoPushToken;
}
