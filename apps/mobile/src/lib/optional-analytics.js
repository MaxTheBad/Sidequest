export function createOptionalAnalytics(provider) {
  let client = typeof provider === "function" ? null : provider;
  let enabled = false;
  let desired = false;
  let generation = 0;

  return {
    isEnabled() {
      return enabled;
    },
    async enable() {
      desired = true;
      const ticket = ++generation;
      enabled = false;
      if (!client && typeof provider === "function") client = provider();
      // Missing release configuration must not pretend a provider is enabled.
      if (!client) return;
      try {
        await client.optIn?.();
        if (ticket !== generation) {
          if (!desired) await client.optOut?.();
          return;
        }
        enabled = true;
      } catch (error) {
        if (ticket === generation) enabled = false;
        throw error;
      }
    },
    async disable() {
      desired = false;
      generation++;
      // Disable collection before any caller tries to persist the preference.
      enabled = false;
      try { await client?.optOut?.(); }
      finally { await client?.reset?.(); }
    },
    capture(name, properties) {
      if (!enabled) return false;
      client?.capture?.(name, properties);
      return true;
    },
    identify(userId, properties) {
      if (!enabled || !userId) return false;
      client?.identify?.(userId, properties);
      return true;
    },
    reset() {
      client?.reset?.();
    },
  };
}
