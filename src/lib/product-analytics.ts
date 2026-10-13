export function resultBucket(count: number): "empty" | "1_5" | "6_20" | "21_plus" {
  if (count <= 0) return "empty";
  if (count <= 5) return "1_5";
  if (count <= 20) return "6_20";
  return "21_plus";
}

export function classifyAnalyticsFailure(error: unknown): "auth" | "rate_limited" | "network" | "duplicate" | "validation" | "unknown" {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/auth|sign.?in|session/i.test(message)) return "auth";
  if (/rate|limit|too many/i.test(message)) return "rate_limited";
  if (/network|fetch|offline|connection/i.test(message)) return "network";
  if (/duplicate|unique/i.test(message)) return "duplicate";
  if (/invalid|validation|required/i.test(message)) return "validation";
  return "unknown";
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
