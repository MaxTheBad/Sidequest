export function resultBucket(count: number): "empty" | "1_5" | "6_20" | "21_plus" {
  if (count <= 0) return "empty";
  if (count <= 5) return "1_5";
  if (count <= 20) return "6_20";
  return "21_plus";
}

export function classifyAnalyticsFailure(error: unknown): "auth" | "rate_limited" | "network" | "duplicate" | "validation" | "unknown" {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  if (/auth|sign.?in|session|row.level security|permission denied|\brls\b/i.test(message)) return "auth";
  if (/rate|limit|too many/i.test(message)) return "rate_limited";
  if (/network|fetch|offline|connection/i.test(message)) return "network";
  if (/duplicate|unique/i.test(message)) return "duplicate";
  if (/invalid|validation|required/i.test(message)) return "validation";
  return "unknown";
}

type ProductCapture = (name: string, properties: Record<string, string | number | boolean | null>) => void;

/** Capture only coarse outcomes around the actual request; callers provide the consent gate. */
export async function runQuestJoinRequest<T extends { error?: unknown }>(request: () => PromiseLike<T>, capture: ProductCapture, { joinMode, surface }: { joinMode?: string | null; surface: "home" | "listing" }): Promise<T> {
  const join_mode = joinMode === "approval_required" ? "approval_required" : "open";
  const emit: ProductCapture = (name, properties) => { try { capture(name, properties); } catch { /* Analytics must not block joining. */ } };
  const common = { platform: "web", surface: surface === "listing" ? "listing" : "home", join_mode };
  emit("quest_join_attempted", common);
  try {
    const result = await request();
    if (result.error) {
      const failure_category = classifyAnalyticsFailure(result.error);
      const duplicate = failure_category === "duplicate" || (typeof result.error === "object" && result.error !== null && "code" in result.error && result.error.code === "23505");
      emit("quest_join_result", { ...common, outcome: duplicate ? "duplicate" : "failed", failure_category: duplicate ? "duplicate" : failure_category });
    } else {
      emit("quest_join_requested", { ...common, outcome: "success", join_status: join_mode === "approval_required" ? "pending" : "approved" });
    }
    return result;
  } catch (error) {
    emit("quest_join_result", { ...common, outcome: "failed", failure_category: classifyAnalyticsFailure(error) });
    throw error;
  }
}

export function privacySafeAnalyticsPath(value: string) {
  const pathname = value.split(/[?#]/)[0];
  return pathname.replace(/^\/(listing|profile|inbox)\/[^/]+(?:\/.*)?$/, "/$1/[id]");
}

/** Scrub SDK-generated URLs as well as nested initial person properties before transport. */
export function scrubProductAnalyticsProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...properties };
  for (const key of ["quest_id", "user_id", "title", "description", "category", "city", "address", "exact_address", "message", "email", "reply_contact", "error", "error_message", "search_query", "query", "latitude", "longitude", "$referrer", "$initial_referrer", "$session_entry_referrer", "$referring_domain", "$initial_referring_domain", "$session_entry_referring_domain"]) delete clean[key];
  // Request no provider-side IP geolocation. This does not claim network IP
  // transport disappears; the provider's discard-IP setting is separate.
  clean.$geoip_disable = true;
  for (const key of Object.keys(clean)) {
    if (key.startsWith("utm_") || key.startsWith("$initial_utm_") || key.startsWith("$session_entry_utm_")) delete clean[key];
  }
  for (const key of ["$current_url", "$initial_current_url", "$session_entry_url"]) {
    if (typeof clean[key] !== "string") continue;
    try {
      const url = new URL(clean[key]);
      if (url.protocol === "https:" || url.protocol === "http:") clean[key] = `${url.origin}${privacySafeAnalyticsPath(url.pathname)}`;
      else delete clean[key];
    } catch { delete clean[key]; }
  }
  for (const key of ["$pathname", "$initial_pathname", "$session_entry_pathname", "page_path"]) if (typeof clean[key] === "string") clean[key] = privacySafeAnalyticsPath(clean[key]);
  for (const key of ["$set", "$set_once"]) {
    if (clean[key] && typeof clean[key] === "object" && !Array.isArray(clean[key])) clean[key] = scrubProductAnalyticsProperties(clean[key] as Record<string, unknown>);
  }
  return clean;
}

export function minutesBucket(startedAt: string | null | undefined, finishedAt: string | null | undefined): "under_5m" | "5_30m" | "30m_2h" | "2h_plus" | null {
  const start = Date.parse(startedAt || "");
  const end = Date.parse(finishedAt || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const minutes = (end - start) / 60_000;
  if (minutes < 5) return "under_5m";
  if (minutes < 30) return "5_30m";
  if (minutes < 120) return "30m_2h";
  return "2h_plus";
}

export function membershipReviewProperties(input: { decision: "approved" | "declined"; requestedAt?: string | null; reviewedAt: string; firstApprovedGuest: boolean }) {
  return { platform: "web", decision: input.decision, approval_wait_bucket: minutesBucket(input.requestedAt, input.reviewedAt), first_approved_guest: input.decision === "approved" && input.firstApprovedGuest };
}
