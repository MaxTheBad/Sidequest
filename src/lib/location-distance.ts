export type StoredLocation = { lat: number; lon: number; accuracy?: number; savedAt: number };

const USER_LOCATION_STORAGE_KEY = "sidequest_user_location";
const MAX_STORED_LOCATION_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function isValidCoordinate(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function readStoredUserLocation(): StoredLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLocation>;
    if (!isValidCoordinate(Number(parsed.lat), Number(parsed.lon))) return null;
    if (!parsed.savedAt || Date.now() - Number(parsed.savedAt) > MAX_STORED_LOCATION_AGE_MS) return null;
    return {
      lat: Number(parsed.lat),
      lon: Number(parsed.lon),
      accuracy: typeof parsed.accuracy === "number" ? parsed.accuracy : undefined,
      savedAt: Number(parsed.savedAt),
    };
  } catch {
    return null;
  }
}

export function writeStoredUserLocation(location: { lat: number; lon: number; accuracy?: number }) {
  if (typeof window === "undefined" || !isValidCoordinate(location.lat, location.lon)) return;
  try {
    window.localStorage.setItem(
      USER_LOCATION_STORAGE_KEY,
      JSON.stringify({
        lat: location.lat,
        lon: location.lon,
        accuracy: location.accuracy,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // localStorage can be unavailable in private or restricted browser contexts.
  }
}
