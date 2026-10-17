"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeUsageCity, parseCityPreference, type CityPreference } from "@questhat/shared";
import { getSupabaseClient } from "@/lib/supabase";

export default function CityUsagePreference({ locallyOptedIn, onSaved }: { locallyOptedIn: boolean; onSaved: () => void }) {
  const [actor, setActor] = useState<string | null>(null);
  const [preference, setPreference] = useState<CityPreference>({ enabled: false, selected_city: null });
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const actorRef = useRef<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let current = true;
    let generation = 0;
    async function load() {
      const ticket = ++generation;
      actorRef.current = null;
      const { data: auth } = await client!.auth.getUser();
      const id = auth.user?.id || null;
      if (!current || ticket !== generation) return;
      actorRef.current = id;
      setActor(id);
      setPreference({ enabled: false, selected_city: null });
      setCity("");
      if (!id) return;
      const { data, error } = await client!.rpc("my_city_usage_preference", { p_actor_id: id });
      if (!current || ticket !== generation) return;
      if (error) return setMessage("City reports are not available right now. No city contribution has been enabled here.");
      const saved = parseCityPreference(data);
      setPreference(saved);
      setCity(saved.selected_city || "");
    }
    const refresh = () => { void load().catch(() => { if (current) setMessage("City reports are unavailable. No success is assumed."); }); };
    refresh();
    const { data: subscription } = client.auth.onAuthStateChange(refresh);
    return () => { current = false; actorRef.current = null; subscription.subscription.unsubscribe(); };
  }, []);

  async function save(enabled: boolean) {
    const client = getSupabaseClient();
    if (!client || !actor || busy) return;
    const selected = normalizeUsageCity(city);
    if (enabled && (!locallyOptedIn || !selected)) return setMessage("Enable optional analytics and choose a city name—not an address or coordinates.");
    setBusy(true);
    try {
      const { data, error } = await client.rpc("set_city_usage_preference", { p_actor_id: actor, p_enabled: enabled, p_selected_city: enabled ? selected : null });
      if (actorRef.current !== actor) return;
      if (error) throw error;
      const saved = parseCityPreference(data);
      setPreference(saved);
      setCity(saved.selected_city || "");
      setMessage(enabled ? "Your selected city can contribute to limited usage counts." : "City reports off. Your stored city counters were removed.");
      onSaved();
    } catch { setMessage("Could not save the city-report choice. Please try again; no success is assumed."); }
    finally { setBusy(false); }
  }

  return <section className="mt-4 grid gap-2 rounded-xl border p-3" aria-label="City usage reports">
    <h3>City usage reports (optional)</h3>
    <p>Choose a city to help us understand where QuestHat is useful. We use this choice, not GPS or IP-derived city. Reports show weekly counts only when at least five consenting accounts contribute to that city and metric, with counts rounded down to groups of five.</p>
    <p>Internal counters are account-linked, not anonymous. They are removed after 30 days at the next hourly cleanup (within 31 days), when you turn city reports off, or when your account is deleted. Only existing MFA-verified administrators can read the suppressed reports; city contributions stay in our database, not PostHog.</p>
    {!actor ? <p>Sign in to choose city reports.</p> : <>
      <label>City name only<input className="ml-2 rounded border p-2" value={city} maxLength={80} placeholder="For example, Miami, FL" disabled={busy} onChange={event => setCity(event.target.value)} /></label>
      <p>{preference.enabled ? `Saved city: ${preference.selected_city}` : "City reports are off until you choose to enable them."}</p>
      {!locallyOptedIn ? <p>Optional analytics is off on this browser, so it sends no city usage. You can still turn off the account-level city choice below.</p> : null}
      <div className="flex gap-2"><button type="button" disabled={busy || !locallyOptedIn || !normalizeUsageCity(city)} onClick={() => void save(true)}>Enable or update city reports</button><button type="button" disabled={busy || !preference.enabled} onClick={() => void save(false)}>Turn off and remove city counters</button></div>
    </>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
