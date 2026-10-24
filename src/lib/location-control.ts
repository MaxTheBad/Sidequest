export type UserLocationStatus = "idle" | "loading" | "ready" | "denied" | "error";
export type UserLocationPermission = "unknown" | "prompt" | "granted" | "denied";

export function getLocationControlCopy(
  status: UserLocationStatus,
  permission: UserLocationPermission,
  approximate = false,
) {
  if (status === "loading") {
    return { label: "Locating…", message: "Requesting your location…" };
  }
  if (status === "ready") {
    return {
      label: approximate ? "Approximate location" : "My location",
      message: approximate
        ? "Using your approximate location to calculate quest distances."
        : "Using your location to calculate quest distances.",
    };
  }
  if (status === "denied" || permission === "denied") {
    return {
      label: "Location blocked",
      message: "Location is blocked for QuestHat. Allow it in your browser site settings, then try again.",
    };
  }
  if (status === "error") {
    return {
      label: "Try locating again",
      message: "We couldn’t get your location. Check device location services and try again.",
    };
  }
  return { label: "Locate me", message: "Use your location to center the map and calculate quest distances." };
}
