"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { normalizeUsername, usernameErrorMessage, validateUsername } from "@/lib/username";
import { useUsernameAvailability } from "@/lib/use-username-availability";

export default function UsernameGate() {
  const supabase = getSupabaseClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [required, setRequired] = useState(false);
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const availability = useUsernameAvailability(username, userId, savedUsername);

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
        .select("username,display_name")
        .eq("id", uid)
        .maybeSingle();
      if (!profileError) {
        const nextUsername = data?.username || data?.display_name || "";
        setSavedUsername(nextUsername);
        setUsername(nextUsername);
        setRequired(!nextUsername);
      }
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
    const validationError = validateUsername(username);
    if (validationError) return setError(validationError);
    if (availability === "taken") return setError("That username is already taken.");

    setSaving(true);
    setError("");
    const normalized = normalizeUsername(username);
    const { error: saveError } = await supabase.from("profiles").upsert({ id: userId, username: normalized, display_name: normalized });
    setSaving(false);

    if (saveError) return setError(usernameErrorMessage(saveError.message));
    setRequired(false);
  }

  if (!required) return null;

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <form onSubmit={save} className="w-full max-w-md space-y-4 rounded-3xl border bg-white p-6 shadow-2xl">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Required</p>
          <h2 className="text-2xl font-semibold">Choose your username</h2>
          <p className="mt-1 text-sm text-gray-600">
            Usernames are unique. You can change yours once every 24 hours.
          </p>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="required-username">Username</label>
          <input
            id="required-username"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            className="rounded-xl border px-3 py-2.5"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase());
              setError("");
            }}
            placeholder="your_username"
            maxLength={30}
          />
          <p className="text-xs text-gray-500">3-30 letters, numbers, or underscores.</p>
          {availability === "checking" ? <p className="text-sm text-gray-500">Checking availability...</p> : null}
          {availability === "available" && normalizeUsername(username) !== normalizeUsername(savedUsername) ? <p className="text-sm text-emerald-600">Username is available.</p> : null}
          {availability === "taken" ? <p className="text-sm text-red-600">That username is already taken.</p> : null}
          {availability === "error" ? <p className="text-sm text-amber-600">Could not check availability. You can still try saving.</p> : null}
          {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        </div>
        <button disabled={saving || availability === "checking" || availability === "taken"} className="w-full rounded-xl bg-black px-4 py-2.5 font-medium text-white disabled:opacity-50">
          {saving ? "Saving..." : "Save username"}
        </button>
      </form>
    </div>
  );
}
