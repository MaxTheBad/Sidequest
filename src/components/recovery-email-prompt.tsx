"use client";

import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = "questhat_recovery_email_prompted_at";

function reminderKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function shouldPrompt(user: User | null) {
  if (!user || user.email) return false;
  const raw = window.localStorage.getItem(reminderKey(user.id));
  const lastPromptedAt = raw ? Number(raw) : 0;
  return !Number.isFinite(lastPromptedAt) || Date.now() - lastPromptedAt >= REMINDER_INTERVAL_MS;
}

export default function RecoveryEmailPrompt() {
  const supabase = getSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const syncUser = (nextUser: User | null) => {
      setUser(nextUser);
      if (nextUser?.email) {
        window.localStorage.removeItem(reminderKey(nextUser.id));
        setVisible(false);
        return;
      }
      setVisible(shouldPrompt(nextUser));
    };

    void supabase.auth.getUser().then(({ data }) => syncUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => syncUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  function dismiss() {
    if (user) window.localStorage.setItem(reminderKey(user.id), String(Date.now()));
    setVisible(false);
    setStatus("");
  }

  async function addRecoveryEmail(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !user || saving) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    setSaving(true);
    setStatus("");
    const emailRedirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.updateUser({ email: cleanEmail }, { emailRedirectTo });
    setSaving(false);
    if (error) {
      setStatus(error.message);
      return;
    }

    window.localStorage.setItem(reminderKey(user.id), String(Date.now()));
    setStatus("Check your inbox and verify this email. After that, it can help you recover your account.");
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="recovery-email-title">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-[#11131c] text-white shadow-2xl shadow-black/40">
        <div className="bg-gradient-to-br from-[#103b47] via-[#12303a] to-[#11131c] px-6 pb-5 pt-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#9bd8e4]/25 bg-[#9bd8e4]/12 text-2xl" aria-hidden="true">✉</div>
            <button type="button" onClick={dismiss} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-white/10">Not now</button>
          </div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9bd8e4]">Account recovery</p>
          <h2 id="recovery-email-title" className="mt-2 text-2xl font-black tracking-tight">Don&apos;t lose your QuestHat account</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Add a verified recovery email to keep access to your quests, messages, and connections if your social login changes.</p>
        </div>

        <form onSubmit={addRecoveryEmail} className="space-y-4 px-6 py-6">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-200">Recovery email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="min-h-12 w-full rounded-2xl border border-white/10 bg-[#0b0d14] px-4 text-base text-white outline-none placeholder:text-slate-600 focus:border-[#8ed5e2] focus:ring-2 focus:ring-[#8ed5e2]/20"
            />
          </label>
          {status ? <p className={`rounded-xl border px-3 py-2 text-sm leading-5 ${status.startsWith("Check") ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-amber-400/20 bg-amber-400/10 text-amber-100"}`}>{status}</p> : null}
          <button type="submit" disabled={saving || Boolean(status.startsWith("Check"))} className="min-h-12 w-full rounded-2xl bg-[#95d7e3] px-4 font-black text-[#082f3a] transition hover:bg-[#aae3ec] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Sending verification..." : status.startsWith("Check") ? "Verification sent" : "Add recovery email"}
          </button>
          <p className="text-center text-xs leading-5 text-slate-500">We&apos;ll only use it for account access and the notification choices you make.</p>
        </form>
      </div>
    </div>
  );
}
