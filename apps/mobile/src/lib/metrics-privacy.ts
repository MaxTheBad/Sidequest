export function resultBucket(count: number): "empty" | "1_5" | "6_20" | "21_plus" {
  if (count <= 0) return "empty";
  if (count <= 5) return "1_5";
  if (count <= 20) return "6_20";
  return "21_plus";
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

/** The native dashboard schema intentionally excludes identifiers, location, and free text. */
export function discoveryLoadedProperties(input: {
  platform: string;
  resultCount: number;
  queryActive: boolean;
  categoryFilterActive: boolean;
}) {
  return {
    platform: input.platform,
    result_bucket: resultBucket(input.resultCount),
    query_active: input.queryActive,
    category_filter_active: input.categoryFilterActive,
  };
}

/** Host-review metrics keep only decision and coarse elapsed time. */
export function joinReviewedProperties(input: {
  platform: string;
  decision: string;
  requestedAt: string | null | undefined;
  reviewedAt: string;
  firstApprovedGuest: boolean | null;
}) {
  return {
    platform: input.platform,
    decision: input.decision,
    approval_wait_bucket: minutesBucket(input.requestedAt, input.reviewedAt),
    first_approved_guest: input.firstApprovedGuest,
  };
}
