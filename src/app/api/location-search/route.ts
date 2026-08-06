export const runtime = "edge";

type GeocodedAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  city_district?: string;
  state?: string;
  country?: string;
  country_code?: string;
};

type NominatimResult = {
  display_name?: string;
  name?: string;
  address?: GeocodedAddress;
};

const US_STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

function getSearchVariants(value: string) {
  const raw = value.trim();
  const withoutUnit = raw
    .replace(/\s*(?:#\s*[\w-]+|(?:suite|ste|unit|apt|apartment|floor)\s*#?\s*[\w-]+)\s*,?/gi, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*$/, "")
    .trim();
  const simplifiedVenue = raw
    .replace(/^the\s+(?:shops?|mall|plaza)\s+at\s+/i, "")
    .replace(/^(?:shops?|mall|plaza)\s+at\s+/i, "")
    .trim();
  return Array.from(new Set([raw, withoutUnit, simplifiedVenue].filter((query) => query.length >= 3)));
}

function publicLabel(address: GeocodedAddress | undefined, fallbackCountryCode: string) {
  if (!address) return "";
  const city = address.city || address.town || address.village || address.municipality || address.city_district || "";
  if (!city) return "";
  const countryCode = (address.country_code || fallbackCountryCode).toUpperCase();
  if (countryCode === "US") {
    const state = (address.state || "").trim();
    const stateCode = US_STATE_CODES[state.toLowerCase()] || (/^[A-Z]{2}$/.test(state) ? state : "");
    return stateCode ? `${city}, ${stateCode}` : city;
  }
  return countryCode ? `${city}, ${countryCode.slice(0, 3)}` : city;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().slice(0, 180);
  const city = (url.searchParams.get("city") || "").trim().slice(0, 100);
  const countryName = (url.searchParams.get("country") || "").trim().slice(0, 80);
  const countryCode = (url.searchParams.get("countryCode") || "").trim().toUpperCase();
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  if (query.length < 3) return Response.json({ suggestions: [] });
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    return Response.json({ suggestions: [], error: "Invalid country." }, { status: 400 });
  }

  const locationBias = Number.isFinite(lat) && Number.isFinite(lon)
    ? `&viewbox=${lon - 1.5},${lat + 1},${lon + 1.5},${lat - 1}`
    : "";
  let results: NominatimResult[] = [];

  try {
    for (const variant of getSearchVariants(query)) {
      const normalized = variant.toLowerCase();
      const searchParts = [variant];
      if (city && !normalized.includes(city.toLowerCase())) searchParts.push(city);
      if (countryName && !normalized.includes(countryName.toLowerCase())) searchParts.push(countryName);
      const upstreamUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&dedupe=1&limit=10&accept-language=en&q=${encodeURIComponent(searchParts.join(", "))}${countryCode ? `&countrycodes=${countryCode.toLowerCase()}` : ""}${locationBias}`;
      const response = await fetch(upstreamUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "QuestHat/1.0 (support@questhat.com)",
        },
      });
      if (!response.ok) continue;
      results = await response.json() as NominatimResult[];
      if (results.length) break;
    }
  } catch {
    return Response.json({ suggestions: [], error: "Location search is temporarily unavailable." }, { status: 502 });
  }

  const suggestions = Array.from(new Map(results.map((result) => {
    const label = (result.display_name || result.name || "").trim();
    if (!label) return null;
    return [label.toLowerCase(), { label, publicLabel: publicLabel(result.address, countryCode) }] as const;
  }).filter((entry): entry is readonly [string, { label: string; publicLabel: string }] => Boolean(entry))).values());

  return Response.json(
    { suggestions },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
