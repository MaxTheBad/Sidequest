"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function UsernameGate() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [required, setRequired] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const check = async (uid: string | null) => {
      setUserId(uid);
      if (!uid) {
        setRequired(false);
        return;
      }
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", uid)
        .maybeSingle();
      if (!profileError) setRequired(!data?.display_name);
    };

    void supabase.auth.getSession().then(({ data }) => check(data.session?.user.id || null));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void check(session?.user.id || null);
    });
    return () => subscription.subscription.unsubscribe();
  }, [supabase]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !userId) return;
    if (!name.trim()) return setError("Please enter your name.");

    setSaving(true);
    setError("");
    const { error: saveError } = await supabase.from("profiles").upsert({ id: userId, display_name: name.trim(), username: null });
    setSaving(false);

    if (saveError) return setError(saveError.message);
    setRequired(false);
  }

  if (!required) return null;

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <form onSubmit={save} className="w-full max-w-md space-y-4 rounded-3xl border bg-white p-6 shadow-2xl">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Required</p>
          <h2 className="text-2xl font-semibold">Choose your name</h2>
          <p className="mt-1 text-sm text-gray-600">
            This is the name people will see on your profile.
          </p>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="required-name">Name</label>
          <input
            id="required-name"
            autoFocus
            className="rounded-xl border px-3 py-2.5"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="Your real name"
            maxLength={80}
          />
          {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        </div>
        <button disabled={saving} className="w-full rounded-xl bg-black px-4 py-2.5 font-medium text-white disabled:opacity-50">
          {saving ? "Saving..." : "Save name"}
        </button>
      </form>
    </div>
  );
}
