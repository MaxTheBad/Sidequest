export function resolveExactCountrySelection(query, countries) {
  const normalizedQuery = (query || "").trim().toLocaleLowerCase("en");
  if (!normalizedQuery) return null;

  const match = countries.find((country) => country.name.trim().toLocaleLowerCase("en") === normalizedQuery);
  return match ? { name: match.name, code: match.code } : null;
}

export function activeLocationDraftValue(locationMode, exactAddress, meetingLink) {
  return locationMode === "remote" ? meetingLink : exactAddress;
}
