export type ReportReferenceInput = string;

export function formatReportReference(id: ReportReferenceInput | null | undefined) {
  if (!id) return "RQ-UNKNOWN";
  const compact = id.replace(/-/g, "").toUpperCase();
  return `RQ-${compact.slice(0, 8)}`;
}

