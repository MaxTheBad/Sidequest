"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Tab = "profile" | "account" | "preferences";

const COUNTRY_OPTIONS = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "BR", name: "Brazil" },
  { code: "IN", name: "India" },
  { code: "MX", name: "Mexico" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
];

export default function SettingsPage() {
  const supabase = getSupabaseClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [status, setStatus] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [dob, setDob] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [marketingOptIn, setMarketingOptIn] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const run = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;
      const userEmail = data.session?.user?.email ?? "";
      setUserId(uid);
      setEmail(userEmail);
      setNewEmail(userEmail);

      if (!uid) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name,city,bio")
        .eq("id", uid)
        .maybeSingle();

      setDisplayName(profile?.display_name ?? "");
      setCity(profile?.city ?? "");
      setBio(profile?.bio ?? "");

      const u = await supabase.auth.getUser();
      const meta = (u.data.user?.user_metadata || {}) as Record<string, unknown>;
      setMarketingOptIn(Boolean(meta.marketing_opt_in));
      if (typeof meta.dob === "string") setDob(meta.dob);
      if (typeof meta.country_code === "string" && meta.country_code.length === 2) setCountryCode(meta.country_code.toUpperCase());
      else if (typeof navigator !== "undefined") {
        const region = (navigator.language.split("-")[1] || "US").toUpperCase();
        if (region.length === 2) setCountryCode(region);
      }
    };

    void run();
  }, [supabase]);

  useEffect(() => {
    const q = city.trim();
    if (q.length < 2) return setCitySuggestions([]);
    const t = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5${countryCode ? `&countrycodes=${countryCode.toLowerCase()}` : ""}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        const json = (await res.json()) as Array<{ display_name: string }>;
        setCitySuggestions(json.map((x) => x.display_name).slice(0, 5));
      } catch {
        setCitySuggestions([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [city, countryCode]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !userId) return setStatus("Not signed in.");

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: displayName, city, bio });

    if (error) return setStatus(error.message);

    const { error: metaErr } = await supabase.auth.updateUser({
      data: {
        full_name: displayName,
        dob: dob || null,
        country_code: countryCode,
      },
    });

    if (metaErr) return setStatus(metaErr.message);
    setStatus("Profile saved ✅");
  }

  async function changeEmail(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) return setStatus(error.message);
    setStatus("Email change requested ✅ Check both old and new inboxes to confirm.");
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (newPassword.length < 8) return setStatus("Password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return setStatus("Passwords do not match.");

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return setStatus(error.message);
    setNewPassword("");
    setConfirmPassword("");
    setStatus("Password updated ✅");
  }

  async function savePreferences(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    const { error } = await supabase.auth.updateUser({
      data: {
        marketing_opt_in: marketingOptIn,
      },
    });

    if (error) return setStatus(error.message);
    setStatus("Preferences saved ✅");
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
      <section className="max-w-3xl mx-auto rounded-2xl border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settings</h1>
          <a href="/" className="border rounded px-3 py-2 text-sm">Back</a>
        </div>

        {status && <p className="text-sm rounded border bg-amber-50 px-3 py-2">{status}</p>}

        <div className="flex gap-2 flex-wrap">
          <button className={`px-3 py-2 rounded ${tab === "profile" ? "bg-black text-white" : "border"}`} onClick={() => setTab("profile")}>Profile</button>
          <button className={`px-3 py-2 rounded ${tab === "account" ? "bg-black text-white" : "border"}`} onClick={() => setTab("account")}>Account</button>
          <button className={`px-3 py-2 rounded ${tab === "preferences" ? "bg-black text-white" : "border"}`} onClick={() => setTab("preferences")}>Preferences</button>
        </div>

        {!userId ? (
          <p className="text-sm text-gray-600">Please log in first.</p>
        ) : (
          <>
            {tab === "profile" && (
              <form onSubmit={saveProfile} className="grid gap-2">
                <label className="text-sm font-medium">Name</label>
                <input className="border rounded px-3 py-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

                <label className="text-sm font-medium">Date of birth</label>
                <input type="date" className="border rounded px-3 py-2" value={dob} onChange={(e) => setDob(e.target.value)} />

                <label className="text-sm font-medium">Country</label>
                <select className="border rounded px-3 py-2" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                  {COUNTRY_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>

                <label className="text-sm font-medium">City</label>
                <div className="relative">
                  <input className="border rounded px-3 py-2 w-full" value={city} onChange={(e) => setCity(e.target.value)} placeholder={`Start typing city in ${countryCode}...`} />
                  {citySuggestions.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 border rounded bg-white shadow max-h-44 overflow-auto text-sm">
                      {citySuggestions.map((c) => (
                        <button key={c} type="button" className="block w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { setCity(c); setCitySuggestions([]); }}>
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <label className="text-sm font-medium">Bio</label>
                <textarea className="border rounded px-3 py-2" value={bio} onChange={(e) => setBio(e.target.value)} />

                <button className="bg-black text-white rounded px-3 py-2 mt-1">Save profile</button>
              </form>
            )}

            {tab === "account" && (
              <div className="space-y-5">
                <form onSubmit={changeEmail} className="grid gap-2">
                  <label className="text-sm font-medium">Current email</label>
                  <input className="border rounded px-3 py-2 bg-gray-50" value={email} disabled />

                  <label className="text-sm font-medium">New email</label>
                  <input type="email" className="border rounded px-3 py-2" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />

                  <button className="border rounded px-3 py-2">Change email</button>
                </form>

                <form onSubmit={changePassword} className="grid gap-2">
                  <label className="text-sm font-medium">New password</label>
                  <input type="password" className="border rounded px-3 py-2" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />

                  <label className="text-sm font-medium">Confirm new password</label>
                  <input type="password" className="border rounded px-3 py-2" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />

                  <button className="border rounded px-3 py-2">Update password</button>
                </form>
              </div>
            )}

            {tab === "preferences" && (
              <form onSubmit={savePreferences} className="grid gap-3">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} />
                  <span>Send me product updates, promotions, and announcements.</span>
                </label>
                <button className="border rounded px-3 py-2 w-fit">Save preferences</button>
              </form>
            )}
          </>
        )}
      </section>
    </main>
  );
}
