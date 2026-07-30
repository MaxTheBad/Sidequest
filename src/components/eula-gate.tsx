"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

const CURRENT_EULA_VERSION = "2026-07-30";

export default function EulaGate() {
  const supabase = getSupabaseClient();
  const [required, setRequired] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    const check = async (userId: string | null, metadata: Record<string, unknown> = {}) => {
      if (!userId) {
        setRequired(false);
        return;
      }
      const { data } = await client
        .from("profiles")
        .select("eula_version,eula_accepted_at,deactivated_at")
        .eq("id", userId)
        .maybeSingle();
      if (data?.deactivated_at) {
        setRequired(false);
        return;
      }
      if (data?.eula_accepted_at && data.eula_version === CURRENT_EULA_VERSION) {
        setRequired(false);
        return;
      }
      if (metadata.accepted_eula === true && metadata.eula_version === CURRENT_EULA_VERSION) {
        const { data: accepted, error: acceptError } = await client.rpc("accept_current_eula", { accepted_version: CURRENT_EULA_VERSION });
        if (!acceptError && accepted) {
          setRequired(false);
          return;
        }
      }
      setRequired(true);
    };

    void client.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      void check(user?.id || null, (user?.user_metadata || {}) as Record<string, unknown>);
    });
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      void check(session?.user.id || null, (session?.user.user_metadata || {}) as Record<string, unknown>);
    });
    return () => subscription.subscription.unsubscribe();
  }, [supabase]);

  async function accept() {
    if (!supabase || !agreed || saving) return;
    setSaving(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("accept_current_eula", { accepted_version: CURRENT_EULA_VERSION });
    if (rpcError || !data) {
      setError(rpcError?.message || "Could not record your agreement.");
      setSaving(false);
      return;
    }
    await supabase.auth.updateUser({ data: { accepted_eula: true, eula_version: CURRENT_EULA_VERSION } });
    setRequired(false);
    setSaving(false);
  }

  async function decline() {
    if (!supabase || saving) return;
    await supabase.auth.signOut();
  }

  if (!required) return null;

  return (
    <div className="fixed inset-0 z-[220] grid place-items-center overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-sm">
      <div className="my-auto w-full max-w-lg space-y-4 rounded-3xl border border-white/10 bg-white p-6 shadow-2xl">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">Required agreement</p>
          <h2 className="mt-1 text-2xl font-bold">QuestHat EULA</h2>
          <p className="mt-2 text-sm text-gray-600">Accept the current safety terms to continue.</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900">
          <strong>Zero tolerance:</strong> objectionable content and abusive users are prohibited, including harassment,
          threats, hate speech, sexual exploitation, scams, self-harm encouragement, and illegal activity.
        </div>
        <ul className="space-y-2 text-sm leading-6 text-gray-700">
          <li>Automated filters reject known objectionable text.</li>
          <li>Report tools flag listings, profiles, content, and abusive behavior.</li>
          <li>Blocking removes a user&apos;s content immediately and alerts moderation.</li>
          <li>QuestHat reviews reports within 24 hours and removes confirmed offending content and users.</li>
        </ul>
        <a href="/terms" target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-cyan-800 underline underline-offset-4">Read the full EULA and Terms</a>
        <label className="flex items-start gap-3 rounded-xl border bg-gray-50 p-3 text-sm font-medium leading-5">
          <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>I agree to the EULA and understand that objectionable content and abusive behavior are not tolerated.</span>
        </label>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        <button type="button" className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:bg-gray-300" disabled={!agreed || saving} onClick={() => void accept()}>
          {saving ? "Saving..." : "Agree and continue"}
        </button>
        <button type="button" className="w-full rounded-xl border px-4 py-3 text-sm font-medium" disabled={saving} onClick={() => void decline()}>Decline and sign out</button>
      </div>
    </div>
  );
}
