/** @param {string|null|undefined} visibility @param {string|null|undefined} label */
export function isUnsafeProtectedPublicLabel(visibility, label) {
  return visibility !== "public" && /^\s*\d+\s+.*(street|st\b|road|rd\b|avenue|ave\b|boulevard|blvd\b|drive|dr\b|lane|ln\b|court|ct\b)/i.test(label || "");
}

export const PUBLIC_LOCATION_LABEL_ERROR = "Use a city or area name for the public label; keep street addresses in the protected meeting location.";
