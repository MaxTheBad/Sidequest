export const DEFAULT_PEOPLE_FILTERS = { minAge: 18, maxAge: 100, distanceKm: 40, gender: '' };
export function peopleSearchParams(filters) {
  const minAge = Math.max(18, Math.min(100, Number(filters.minAge) || 18));
  const maxAge = Math.max(minAge, Math.min(100, Number(filters.maxAge) || 100));
  return { p_min_age: minAge, p_max_age: maxAge, p_max_distance_km: Math.max(5, Math.min(250, Number(filters.distanceKm) || 40)), p_gender_identities: filters.gender ? [filters.gender] : null, p_limit: 50, p_offset: 0 };
}
export function discoveryErrorMessage(message) {
  if (/turn on people discovery|discovery location/i.test(message)) return `${message} Open Settings to complete your opt-in discovery setup, then try again.`;
  return message || 'People could not be loaded. Try again.';
}
export function eligiblePeople(rows, userId) {
  return (rows || []).filter(p => p.id !== userId && Number.isFinite(p.age) && p.age >= 18 && Number.isFinite(p.distance_km) && p.distance_km >= 0);
}
