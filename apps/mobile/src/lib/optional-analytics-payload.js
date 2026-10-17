const enums = {
  platform: ["ios", "android", "web"],
  screen: ["home", "create", "inbox", "joined", "settings", "notifications", "profile", "saved", "map"],
  join_mode: ["open", "approval_required"], location_mode: ["virtual", "in_person"],
  result_bucket: ["empty", "1_5", "6_20", "21_plus"], decision: ["approved", "declined", "pending"],
  approval_wait_bucket: ["under_5m", "5_30m", "30m_2h", "2h_plus"],
};

/** Only reviewed coarse manual properties; arbitrary category/free text is omitted. */
export function optionalAnalyticsPayload(properties = {}) {
  const safe = { $geoip_disable: true };
  for (const [key, values] of Object.entries(enums)) if (values.includes(properties[key])) safe[key] = properties[key];
  for (const key of ["query_active", "category_filter_active", "first_approved_guest"]) if (typeof properties[key] === "boolean") safe[key] = properties[key];
  if (Number.isInteger(properties.media_count) && properties.media_count >= 0 && properties.media_count <= 20) safe.media_count = properties.media_count;
  return safe;
}
