"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Aggregate = { week_start: string; selected_city: string; metric: string; recorded_actions_at_least: number; contributing_accounts_at_least: number };

export default function CityUsageReportPage() {
  const [rows, setRows] = useState<Aggregate[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    const client = getSupabaseClient();
    if (!client || busy) return;
    setBusy(true); setRows([]); setMessage("");
    try {
      const { data, error } = await client.rpc("admin_city_usage_report");
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
      if (!data?.length) setMessage("No city/metric cohort currently meets the reporting threshold. Suppressed or absent rows are not zero usage.");
    } catch { setMessage("Reports require an existing active administrator or super administrator with MFA verified in the current session. No access is granted by this page."); }
    finally { setBusy(false); }
  }
  return <main className="page-shell mx-auto max-w-5xl space-y-4 p-6">
    <Link href="/moderation">Back to moderation</Link>
    <h1 className="text-2xl font-bold">Selected-city usage counts</h1>
    <p>Three completed UTC weeks. Only separately opted-in, user-selected cities contribute. Each city/week/metric needs at least five distinct consenting accounts. Counts are rounded down to multiples of five. Missing rows are suppressed or absent, not zero. These are recorded actions, not all service activity.</p>
    <p>Source counters are account-linked and private, not anonymous. They stay in QuestHat, are removed after 30 days at hourly cleanup (within 31 days), and are removed on city opt-out/account deletion. This report has no individual rows, IDs, exact timestamps, addresses, IP/GPS city or drill-down.</p>
    <button type="button" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Load restricted report"}</button>
    {message ? <p role="status">{message}</p> : null}
    {rows.length ? <table className="w-full text-left"><thead><tr><th>UTC week</th><th>Selected city</th><th>Metric</th><th>Recorded actions, at least</th><th>Contributing accounts, at least</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.week_start}:${row.selected_city}:${row.metric}`}><td>{row.week_start}</td><td>{row.selected_city}</td><td>{row.metric}</td><td>{row.recorded_actions_at_least}</td><td>{row.contributing_accounts_at_least}</td></tr>)}</tbody></table> : null}
  </main>;
}
