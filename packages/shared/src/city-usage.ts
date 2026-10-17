export const CITY_USAGE_MIN_ACCOUNTS = 5;
export const CITY_USAGE_RETENTION_DAYS = 30;
export const CITY_USAGE_CHANGE_EVENT = 'questhat:city-usage-changed';

export type CityPreference = { enabled: boolean; selected_city: string | null };
type RpcResult = { data?: unknown; error?: unknown };
export type CityUsageClient = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult> };

export function normalizeUsageCity(value: string): string | null {
  const city = value.trim().replace(/\s+/g, ' ');
  if (city.length < 2 || city.length > 80 || !/^\p{L}[\p{L}\s’.,-]+$/u.test(city)
    || /\b(street|road|avenue|boulevard|drive|lane|court|suite|apartment)\b/i.test(city)) return null;
  return city;
}

export function cityMetricsForEvent(name: string, properties: Record<string, unknown> = {}): string[] {
  if (['discovery_loaded', 'quest_created', 'quest_join_requested'].includes(name)) return [name];
  if (name !== 'quest_join_reviewed') return [];
  const metrics: string[] = [];
  if (properties.decision === 'approved') metrics.push('join_approved');
  if (properties.decision === 'declined') metrics.push('join_declined');
  if (properties.decision === 'approved' && properties.first_approved_guest === true) metrics.push('first_approved_guest');
  if (properties.decision === 'approved' && ['under_5m', '5_30m', '30m_2h', '2h_plus'].includes(String(properties.approval_wait_bucket))) {
    metrics.push(`approval_wait_${properties.approval_wait_bucket}`);
  }
  return metrics;
}

export function parseCityPreference(value: unknown): CityPreference {
  if (!value || typeof value !== 'object') return { enabled: false, selected_city: null };
  const row = value as Record<string, unknown>;
  const city = typeof row.selected_city === 'string' ? normalizeUsageCity(row.selected_city) : null;
  return { enabled: row.enabled === true && city !== null, selected_city: city };
}

/** No SDK, IP, geocoder or device-location input; actor and local opt-in are explicit. */
export function createCityUsageRecorder(getClient: () => CityUsageClient | null) {
  let generation = 0;
  let actor: string | null = null;
  let allowed = false;
  return {
    clear() { generation++; actor = null; allowed = false; },
    async configure(nextActor: string | null, locallyOptedIn: boolean) {
      const ticket = ++generation;
      actor = nextActor;
      allowed = false;
      if (!nextActor || !locallyOptedIn) return;
      try {
        const result = await getClient()?.rpc('my_city_usage_preference', { p_actor_id: nextActor });
        if (ticket !== generation || !result || result.error) return;
        allowed = parseCityPreference(result.data).enabled;
      } catch { /* Missing/unavailable companion RPC never enables collection. */ }
    },
    capture(name: string, properties: Record<string, unknown> = {}) {
      if (!actor || !allowed) return false;
      const currentActor = actor;
      const ticket = generation;
      const metrics = cityMetricsForEvent(name, properties);
      for (const metric of metrics) {
        // Stop queued contributions synchronously on logout/withdrawal/account switch.
        void Promise.resolve().then(async () => {
          if (ticket !== generation || !allowed || actor !== currentActor) return;
          try { await getClient()?.rpc('record_city_usage', { p_actor_id: currentActor, p_metric: metric }); }
          catch { /* Analytics cannot block the user's action. */ }
        });
      }
      return metrics.length > 0;
    },
  };
}
