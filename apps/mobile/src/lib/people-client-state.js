export function normalizePeopleFilters({ minAge, maxAge, distanceKm, genders }) {
  const normalizedMinAge = Math.max(18, Math.min(100, Number(minAge) || 18));
  const normalizedMaxAge = Math.max(normalizedMinAge, Math.min(100, Number(maxAge) || 100));
  const normalizedDistance = Math.max(5, Math.min(250, Number(distanceKm) || 40));
  return {
    minAge: normalizedMinAge,
    maxAge: normalizedMaxAge,
    distanceKm: normalizedDistance,
    genders: Array.from(new Set((genders || []).filter((value) => typeof value === "string" && value.trim()))),
  };
}

export function createPeopleRequestGate() {
  let generation = 0;
  return {
    begin(scope) { return { scope, generation: ++generation }; },
    invalidate() { generation += 1; },
    isCurrent(request, scope) { return request.scope === scope && request.generation === generation; },
  };
}

export function createPeopleActionGate() {
  let generation = 0;
  const pending = new Map();
  return {
    begin(key) {
      if (pending.has(key)) return null;
      const token = { key, generation: ++generation };
      pending.set(key, token);
      return token;
    },
    isCurrent(token, key) {
      return Boolean(token && token.key === key && pending.get(key) === token);
    },
    finish(token) {
      if (token && pending.get(token.key) === token) pending.delete(token.key);
    },
    reset() {
      generation += 1;
      pending.clear();
    },
  };
}
