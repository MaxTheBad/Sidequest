export function validateQuestDraft({
  title,
  category,
  locationMode,
  meetingLocation,
  selectedCountry,
  selectedLocation,
  locationConfirmationMode,
  applePlaceId,
  groupSize,
}) {
  const cleanTitle = title.trim();
  if (!cleanTitle || !category.trim()) return { error: "Title and category are required." };
  if (cleanTitle.length > 80) return { error: "Quest title must be 80 characters or fewer." };

  const cleanLocation = meetingLocation.trim();
  if (locationMode === "remote") {
    if (!cleanLocation) return { error: "Meeting link is required." };
    try {
      const url = new URL(cleanLocation);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
    } catch {
      return { error: "Enter a valid meeting link starting with https:// or http://." };
    }
  } else {
    if (!selectedCountry) return { error: "Choose a country first." };
    if (!cleanLocation) return { error: "Meetup address is required." };
    if (locationConfirmationMode !== "device" && !selectedLocation) {
      return { error: "Search for and choose the meetup place, or use your current location." };
    }
    if (locationConfirmationMode !== "device" && !applePlaceId) {
      return { error: "Choose a verified Apple location from the search results." };
    }
  }

  const cleanGroupSize = groupSize.trim();
  if (!/^\d+$/.test(cleanGroupSize) || Number(cleanGroupSize) <= 0) {
    return { error: "Group size must be a positive whole number." };
  }
  return { error: null, groupSize: Number(cleanGroupSize) };
}
