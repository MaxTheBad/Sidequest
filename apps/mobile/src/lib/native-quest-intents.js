export function createNativeIntentGate() {
  const active = new Set();
  return {
    begin(key) {
      if (active.has(key)) return false;
      active.add(key);
      return true;
    },
    finish(key) { active.delete(key); },
  };
}

export function canIncludeQuestPrivateLocation({ userId, creatorId, isManager, visibility, membershipStatus, accessUserIds = /** @type {string[]} */ ([]) }) {
  if (!userId) return false;
  if (isManager || creatorId === userId || visibility === "public") return true;
  if (visibility === "approved_members") return membershipStatus === "approved" && accessUserIds.includes(userId);
  return accessUserIds.includes(userId);
}

export async function refreshQuestPrivateLocationForIntent(quest, options = {}) {
  if (options.includePrivateLocation !== true) return { quest, includePrivateLocation: false };
  if (quest.exact_location_visibility === "public" || quest.creator_id === options.userId) {
    return { quest, includePrivateLocation: true };
  }
  try {
    const current = await options.loadPrivateLocation?.(quest.id);
    if (!current) return { quest, includePrivateLocation: false };
    return { quest: { ...quest, ...current }, includePrivateLocation: true };
  } catch {
    return { quest, includePrivateLocation: false };
  }
}

export function buildQuestSharePayload(quest, siteUrl) {
  const url = `${siteUrl.replace(/\/$/, "")}/listing/${encodeURIComponent(quest.id)}`;
  return { message: `${quest.title} ${url}`, url };
}

export function buildQuestCalendarDetails(quest, options = {}) {
  if (!quest.starts_at) throw new Error("This quest does not have a start time yet.");
  const startDate = new Date(quest.starts_at);
  if (!Number.isFinite(startDate.getTime())) throw new Error("This quest has an invalid start time.");
  const listingUrl = `${options.siteUrl.replace(/\/$/, "")}/listing/${encodeURIComponent(quest.id)}`;
  const includePrivate = options.includePrivateLocation === true;
  const exactLocation = includePrivate ? quest.exact_address?.trim() || "" : "";
  const publicLocation = quest.city?.trim() || "";
  const isVirtual = /^virtual$/i.test(publicLocation);
  const rawLocation = exactLocation || publicLocation;
  const location = isVirtual ? "Online" : rawLocation;
  const hasCoordinates = includePrivate && Number.isFinite(quest.exact_lat) && Number.isFinite(quest.exact_lng);
  const directionsUrl = hasCoordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${quest.exact_lat},${quest.exact_lng}`
    : exactLocation && !isVirtual && !/^https?:\/\//i.test(exactLocation)
      ? `https://maps.apple.com/?daddr=${encodeURIComponent(exactLocation)}`
      : null;
  const details = [
    quest.description?.trim(),
    quest.time_flexible ? "Time: Flexible — coordinate the final time in QuestHat." : null,
    quest.availability?.trim() ? `Schedule: ${quest.availability.trim()}` : null,
    includePrivate && quest.location_details?.trim() ? `Meeting details: ${quest.location_details.trim()}` : null,
    includePrivate && /^https?:\/\//i.test(exactLocation) ? `Join online: ${exactLocation}` : null,
    directionsUrl ? `Directions: ${directionsUrl}` : null,
    `QuestHat listing: ${listingUrl}`,
  ].filter(Boolean).join("\n\n");
  return {
    title: quest.title,
    startDate,
    endDate: new Date(startDate.getTime() + 60 * 60 * 1000),
    location,
    notes: details || options.previousNotes || `QuestHat listing: ${listingUrl}`,
    url: listingUrl,
    alarms: [{ relativeOffset: -1440 }, { relativeOffset: -30 }],
    timeZone: options.timeZone,
  };
}

export function createCalendarPayloadFingerprint(details, includePrivateLocation) {
  const dateText = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
  };
  const payload = [
    details.title || "",
    dateText(details.startDate),
    dateText(details.endDate),
    details.location || "",
    details.notes || "",
    details.url || "",
    details.timeZone || "",
    includePrivateLocation === true ? "private" : "public",
  ].join("\u001f");
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < payload.length; index += 1) {
    const code = payload.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `v1:${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export function getCalendarUpdateState(previous, currentFingerprint) {
  if (!previous?.eventId) return "add";
  if (!previous.payloadFingerprint || !currentFingerprint) return "current";
  return previous.payloadFingerprint === currentFingerprint ? "current" : "updated";
}

export function canCommitCalendarTracking(operationUserId, currentUserId) {
  return Boolean(operationUserId && operationUserId === currentUserId);
}

export async function tryUpdateStoredCalendarEvent(previous, details, adapters) {
  if (!previous?.eventId) return { status: "missing" };
  try {
    await adapters.getEvent(previous.eventId);
    await adapters.updateEvent(previous.eventId, details);
    return { status: "updated", eventId: previous.eventId, calendarId: previous.calendarId || "" };
  } catch (error) {
    return { status: "unavailable", error };
  }
}

export async function persistCalendarExportBaseline(events, questId, record, persist) {
  const next = { ...events, [questId]: record };
  await persist(next);
  return next;
}

export function buildQuestDirectionsOptions(quest, options = {}) {
  const includePrivate = options.includePrivateLocation === true;
  const exactLocation = includePrivate ? quest.exact_address?.trim() || "" : "";
  const publicLocation = quest.city?.trim() || "";
  if (/^virtual$/i.test(publicLocation) && !/^https?:\/\//i.test(exactLocation)) return [];
  const destination = exactLocation || publicLocation;
  if (!destination) return [];
  if (/^https?:\/\//i.test(destination)) {
    return includePrivate ? [{ label: "Open quest link", url: destination }] : [];
  }
  const hasCoordinates = includePrivate && Number.isFinite(quest.exact_lat) && Number.isFinite(quest.exact_lng);
  const coordinateText = hasCoordinates ? `${quest.exact_lat},${quest.exact_lng}` : "";
  const encodedCoordinates = encodeURIComponent(coordinateText);
  const encodedDestination = encodeURIComponent(destination);
  const encodedPlaceId = includePrivate && quest.apple_place_id ? encodeURIComponent(quest.apple_place_id) : "";
  const results = [];
  if (options.platform === "ios") {
    results.push({
      label: "Apple Maps",
      url: encodedPlaceId
        ? `https://maps.apple.com/directions?destination=${encodedDestination}&destination-place-id=${encodedPlaceId}&mode=driving`
        : `http://maps.apple.com/?daddr=${encodedDestination}&dirflg=d`,
    });
  } else if (options.platform === "android") {
    results.push({ label: "Maps", url: hasCoordinates ? `geo:${coordinateText}?q=${encodedCoordinates}` : `geo:0,0?q=${encodedDestination}` });
  }
  results.push({ label: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${hasCoordinates ? encodedCoordinates : encodedDestination}&travelmode=driving` });
  results.push({ label: "Waze", url: hasCoordinates ? `https://waze.com/ul?ll=${encodedCoordinates}&navigate=yes` : `https://waze.com/ul?q=${encodedDestination}&navigate=yes` });
  return results;
}
