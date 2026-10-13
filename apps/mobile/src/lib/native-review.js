import * as StoreReview from "expo-store-review";
import AsyncStorage from "@react-native-async-storage/async-storage";

const REVIEW_COOLDOWN_KEY = "questhat_store_review_last_requested_at";
const REVIEW_COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;

// This accepts only a neutral session milestone. It has no access to private
// feedback, attendance, or other outcome fields.
export async function requestNeutralEngagementReview(milestone, now = Date.now()) {
  if (milestone !== "quest_detail_opened") return false;
  const lastRequested = Number(await AsyncStorage.getItem(REVIEW_COOLDOWN_KEY) || 0);
  if (Number.isFinite(lastRequested) && now - lastRequested < REVIEW_COOLDOWN_MS) return false;
  if (!await StoreReview.isAvailableAsync() || !await StoreReview.hasAction()) return false;
  await StoreReview.requestReview();
  await AsyncStorage.setItem(REVIEW_COOLDOWN_KEY, String(now));
  return true;
}
