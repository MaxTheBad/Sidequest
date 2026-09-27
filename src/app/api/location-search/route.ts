import { appleMapsServerIsConfigured, getAppleMapsAccessToken } from "@/lib/apple-maps-server";
import { getServiceSupabase } from "@/lib/security-audit-server";

export const runtime = "edge";

type SearchProvider = "apple_native" | "apple_server";
type SearchBody = {
  provider?: unknown;
  query?: unknown;
  countryCode?: unknown;
  countryName?: unknown;
  city?: unknown;
  lat?: unknown;
  lon?: unknown;
};

type StructuredAddress = {
  locality?: string;
  administrativeArea?: string;
  administrativeAreaCode?: string;
};

type ApplePlace = {
  id?: string;
  name?: string;
  country?: string;
  countryCode?: string;
  formattedAddressLines?: string[];
  coordinate?: { latitude?: number; longitude?: number };
  structuredAddress?: StructuredAddress;
};

type AppleSearchResponse = { results?: ApplePlace[] };
type QuotaResult = {
  allowed: boolean;
  daily_used: number;
  daily_remaining: number;
  retry_after_seconds: number;
  reason: string | null;
};

const DAILY_LIMIT = 30;
const BURST_LIMIT = 5;
const resultCache = new Map<string, { expiresAt: number; suggestions: LocationSuggestion[] }>();

type LocationSuggestion = {
  id: string | null;
  label: string;
  address: string;
  publicLabel: string;
  lat: number | null;
  lon: number | null;
};

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function publicLabel(place: ApplePlace, fallbackCountryCode: string) {
  const address = place.structuredAddress;
  const city = cleanString(address?.locality, 100);
  if (!city) return "";
  const countryCode = cleanString(place.countryCode || fallbackCountryCode, 3).toUpperCase();
  const state = cleanString(address?.administrativeAreaCode || address?.administrativeArea, 100);
  if (countryCode === "US") return state ? `${city}, ${state}` : city;
  return countryCode ? `${city}, ${countryCode}` : city;
}

function normalizePlaces(results: ApplePlace[], fallbackCountryCode: string) {
  const seen = new Set<string>();
  const suggestions: LocationSuggestion[] = [];
  for (const place of results.slice(0, 12)) {
    const address = (place.formattedAddressLines || []).map((line) => cleanString(line, 160)).filter(Boolean).join(", ");
    const name = cleanString(place.name, 160);
    const label = name && address && !address.toLowerCase().startsWith(name.toLowerCase())
      ? `${name}, ${address}`
      : address || name;
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    const latitude = Number(place.coordinate?.latitude);
    const longitude = Number(place.coordinate?.longitude);
    suggestions.push({
      id: cleanString(place.id, 300) || null,
      label,
      address: address || label,
      publicLabel: publicLabel(place, fallbackCountryCode),
      lat: Number.isFinite(latitude) ? latitude : null,
      lon: Number.isFinite(longitude) ? longitude : null,
    });
  }
  return suggestions;
}

function quotaError(result: QuotaResult) {
  const isDailyLimit = result.reason === "daily_limit";
  return Response.json({
    suggestions: [],
    error: isDailyLimit
      ? "You’ve reached today’s 30 address searches. Try again tomorrow."
      : "Too many searches at once. Wait a moment and try again.",
    remaining: result.daily_remaining,
    retryAfterSeconds: result.retry_after_seconds,
  }, {
    status: 429,
    headers: {
      "Cache-Control": "private, no-store",
      "Retry-After": String(Math.max(1, result.retry_after_seconds)),
    },
  });
}

export async function POST(request: Request) {
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: "Location search is unavailable." }, { status: 503 });

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return Response.json({ error: "Sign in to search for a location." }, { status: 401 });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  const userId = authData.user?.id || null;
  if (authError || !userId) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });

  const body = await request.json().catch(() => null) as SearchBody | null;
  const provider: SearchProvider = body?.provider === "apple_native" ? "apple_native" : "apple_server";
  const query = cleanString(body?.query, 180);
  const countryCode = cleanString(body?.countryCode, 2).toUpperCase();

  if (provider === "apple_server" && !appleMapsServerIsConfigured()) {
    return Response.json({ suggestions: [], error: "Apple address search is not configured yet." }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  if (provider === "apple_server" && query.length < 3) {
    return Response.json({ suggestions: [], error: "Enter at least 3 characters." }, { status: 400 });
  }
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    return Response.json({ suggestions: [], error: "Choose a valid country." }, { status: 400 });
  }

  const { data: quotaRows, error: quotaRpcError } = await supabase.rpc("consume_location_search_quota", {
    p_user_id: userId,
    p_provider: provider,
    p_daily_limit: DAILY_LIMIT,
    p_burst_limit: BURST_LIMIT,
  });
  const quota = (Array.isArray(quotaRows) ? quotaRows[0] : quotaRows) as QuotaResult | null;
  if (quotaRpcError || !quota) {
    return Response.json({ suggestions: [], error: "Couldn’t verify the search limit. Try again." }, { status: 503 });
  }
  if (!quota.allowed) return quotaError(quota);

  if (provider === "apple_native") {
    return Response.json({ ok: true, remaining: quota.daily_remaining }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const latitude = Number(body?.lat);
  const longitude = Number(body?.lon);
  const roundedLocation = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? `${latitude.toFixed(2)},${longitude.toFixed(2)}`
    : "";
  // Apple already accepts an explicit country filter and a location bias. Appending
  // profile/city text to a business name can turn an exact POI query into a miss.
  const cacheKey = JSON.stringify([query.toLowerCase(), countryCode, roundedLocation]);
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json({ suggestions: cached.suggestions, remaining: quota.daily_remaining }, {
      headers: { "Cache-Control": "private, no-store", "X-QuestHat-Search-Cache": "hit" },
    });
  }

  try {
    const accessToken = await getAppleMapsAccessToken();
    const searchApple = async (includeLocationBias: boolean) => {
      const params = new URLSearchParams({ q: query, lang: "en-US" });
      if (countryCode) params.set("limitToCountries", countryCode);
      if (includeLocationBias && roundedLocation) params.set("searchLocation", roundedLocation);
      const response = await fetch(`https://maps-api.apple.com/v1/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => null) as AppleSearchResponse | null;
      return { response, body };
    };

    let { response: appleResponse, body: appleBody } = await searchApple(true);
    if (!appleResponse.ok) {
      const status = appleResponse.status === 429 ? 503 : 502;
      return Response.json({ suggestions: [], error: appleResponse.status === 429 ? "Address search is busy. Try again later." : "Address search failed. Try again." }, { status });
    }
    let suggestions = normalizePlaces(appleBody?.results || [], countryCode);
    // A device-location bias should improve nearby relevance, but it can hide a
    // correctly named venue farther away. Retry once without the bias on a miss.
    if (!suggestions.length && roundedLocation) {
      ({ response: appleResponse, body: appleBody } = await searchApple(false));
      if (appleResponse.ok) suggestions = normalizePlaces(appleBody?.results || [], countryCode);
    }
    resultCache.set(cacheKey, { suggestions, expiresAt: Date.now() + 5 * 60_000 });
    if (resultCache.size > 200) {
      for (const [key, value] of resultCache) if (value.expiresAt <= Date.now()) resultCache.delete(key);
    }
    return Response.json({ suggestions, remaining: quota.daily_remaining }, {
      headers: { "Cache-Control": "private, no-store", "X-QuestHat-Search-Provider": "apple" },
    });
  } catch {
    return Response.json({ suggestions: [], error: "Address search is temporarily unavailable." }, {
      status: 502,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export async function GET() {
  return Response.json({ error: "Use the Search button in QuestHat." }, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "private, no-store" },
  });
}
