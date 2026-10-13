export function createOptionalAnalytics(client) {
  let enabled = false;

  return {
    isEnabled() {
      return enabled;
    },
    async enable() {
      enabled = true;
      await client?.optIn?.();
    },
    async disable() {
      // Disable collection before any caller tries to persist the preference.
      enabled = false;
      await client?.optOut?.();
      await client?.reset?.();
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
