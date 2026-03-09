"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Tab = "profile" | "account" | "preferences";

const FALLBACK_COUNTRIES = ["United States","Canada","United Kingdom","Australia","Brazil","India","Mexico","Germany","France","Spain","Italy","Portugal","Japan","South Korea","Argentina","Chile","Colombia","Netherlands","Belgium","Sweden","Norway","Denmark","Finland","Ireland","New Zealand","South Africa"];

export default function SettingsPage() {
  const supabase = getSupabaseClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [status, setStatus] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [countryQuery, setCountryQuery] = useState("United States");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [dob, setDob] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [cropZoom, setCropZoom] = useState(1.2);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const countryOptions = useState(() => {
    try {
      // @ts-expect-error supportedValuesOf may not exist in all TS lib targets
      const regions: string[] | undefined = typeof Intl !== "undefined" && Intl.supportedValuesOf ? Intl.supportedValuesOf("region") : undefined;
      const dn = new Intl.DisplayNames(["en"], { type: "region" });
      const names = (regions || []).map((code) => ({ code, name: dn.of(code) || code })).filter((x) => !!x.name).sort((a, b) => a.name.localeCompare(b.name));
      if (names.length) return names;
    } catch {}
    return FALLBACK_COUNTRIES.map((name) => ({ code: name.slice(0,2).toUpperCase(), name }));
  })[0];

  function resolveCountryCodeByName(name: string) {
    const found = countryOptions.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    return found?.code || countryCode;
  }

  const selectedCountryCode = useMemo(() => {
    const found = countryOptions.find((c) => c.name.toLowerCase() === countryQuery.trim().toLowerCase());
    return (found?.code || countryCode || "").toLowerCase();
  }, [countryOptions, countryCode, countryQuery]);

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
        .select("display_name,city,bio,avatar_url")
        .eq("id", uid)
        .maybeSingle();

      setDisplayName(profile?.display_name ?? "");
      setCity(profile?.city ?? "");
      setBio(profile?.bio ?? "");
      setAvatarUrl(profile?.avatar_url ?? "");

      const u = await supabase.auth.getUser();
      const meta = (u.data.user?.user_metadata || {}) as Record<string, unknown>;
      setMarketingOptIn(Boolean(meta.marketing_opt_in));
      if (typeof meta.dob === "string") setDob(meta.dob);
      const metaCountry = typeof meta.country_code === "string" ? meta.country_code : "";
      if (metaCountry.length === 2) { const cc = metaCountry.toUpperCase(); setCountryCode(cc); const m = countryOptions.find((c)=>c.code===cc); if (m) setCountryQuery(m.name); }
      else if (typeof navigator !== "undefined") {
        const region = (navigator.language.split("-")[1] || "US").toUpperCase();
        if (region.length === 2) { setCountryCode(region); const m = countryOptions.find((c)=>c.code===region); if (m) setCountryQuery(m.name); }
      }
    };

    void run();
  }, [supabase, countryOptions]);

  useEffect(() => {
    const q = city.trim();
    if (q.length < 2) {
      setCitySuggestions([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json${selectedCountryCode ? `&countryCode=${selectedCountryCode}` : ""}`;
        const res = await fetch(url);
        const json = (await res.json()) as { results?: Array<{ name: string; admin1?: string; country?: string }> };
        const suggestions = (json.results || []).map((r) => [r.name, r.admin1, r.country].filter(Boolean).join(", "));
        setCitySuggestions(suggestions);
      } catch {
        setCitySuggestions([]);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [city, selectedCountryCode]);

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


  async function makeCroppedAvatar(file: File) {
    const imgUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Could not load image."));
        i.src = imgUrl;
      });

      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare image editor.");

      const zoom = Math.max(1, cropZoom);
      const drawW = img.width * zoom;
      const drawH = img.height * zoom;
      const minX = size - drawW;
      const minY = size - drawH;
      const dx = minX * (cropX / 100);
      const dy = minY * (cropY / 100);

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, dx, dy, drawW, drawH);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not export cropped photo.");
      return blob;
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  }

  async function uploadProfilePhoto() {
    if (!supabase || !userId || !photoFile) return setStatus("Choose a photo first.");
    if (!photoFile.type.startsWith("image/")) return setStatus("Please choose an image file.");
    if (photoFile.size > 8 * 1024 * 1024) return setStatus("Photo must be under 8MB.");

    setUploadingPhoto(true);

    let cropped: Blob;
    try {
      cropped = await makeCroppedAvatar(photoFile);
    } catch (err) {
      setUploadingPhoto(false);
      return setStatus(err instanceof Error ? err.message : "Could not crop image.");
    }

    const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(filePath, cropped, { upsert: false, contentType: "image/jpeg" });

    if (uploadError) {
      setUploadingPhoto(false);
      return setStatus(`Photo upload failed: ${uploadError.message}`);
    }

    const { data: publicData } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert({ id: userId, avatar_url: publicData.publicUrl, avatar_capture_method: "camera", photo_onboarding_done: true });

    setUploadingPhoto(false);
    if (profileErr) return setStatus(`Could not save photo: ${profileErr.message}`);

    setAvatarUrl(publicData.publicUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl("");
    setStatus("Profile photo updated ✅");
  }

  async function deleteProfilePhoto() {
    if (!supabase || !userId) return;
    const ok = window.confirm("Remove your profile photo?");
    if (!ok) return;

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, avatar_url: null });
    if (error) return setStatus(error.message);
    setAvatarUrl("");
    setPhotoFile(null);
    setStatus("Profile photo removed.");
  }

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

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
      <datalist id="country-list">{countryOptions.map((c) => <option key={c.code} value={c.name} />)}</datalist>
      <section className="max-w-3xl mx-auto rounded-2xl border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settings</h1>
          <Link href="/" className="border rounded px-3 py-2 text-sm">Back</Link>
        </div>

        {status && <p className="text-sm rounded border bg-amber-50 px-3 py-2 sticky top-2 z-30">{status}</p>}

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
                <label className="text-sm font-medium">Profile photo</label>
                <div className="grid gap-2 rounded-xl border p-3 bg-gray-50">
                  {avatarUrl ? <img src={avatarUrl} alt="Profile" className="h-20 w-20 rounded-full object-cover border" /> : <p className="text-xs text-gray-500">No profile photo yet.</p>}
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="border rounded px-3 py-2 bg-white"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setPhotoFile(file);
                      setCropZoom(1.2);
                      setCropX(50);
                      setCropY(50);
                      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                      setPhotoPreviewUrl(file ? URL.createObjectURL(file) : "");
                    }}
                  />
                  <p className="text-xs text-gray-500">Camera capture only in supported browsers/devices.</p>

                  {photoPreviewUrl && (
                    <div className="rounded-lg border bg-white p-2 space-y-2">
                      <p className="text-xs text-gray-600">Adjust crop before upload</p>
                      <div className="h-56 w-56 rounded-full overflow-hidden border mx-auto bg-black/5">
                        <img
                          src={photoPreviewUrl}
                          alt="Preview"
                          className="h-full w-full object-cover"
                          style={{ transform: `scale(${cropZoom})`, transformOrigin: `${cropX}% ${cropY}%` }}
                        />
                      </div>
                      <label className="text-xs">Zoom</label>
                      <input type="range" min={1} max={3} step={0.05} value={cropZoom} onChange={(e) => setCropZoom(Number(e.target.value))} />
                      <label className="text-xs">Focus left/right</label>
                      <input type="range" min={0} max={100} step={1} value={cropX} onChange={(e) => setCropX(Number(e.target.value))} />
                      <label className="text-xs">Focus up/down</label>
                      <input type="range" min={0} max={100} step={1} value={cropY} onChange={(e) => setCropY(Number(e.target.value))} />
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className="border rounded px-3 py-2 w-fit disabled:opacity-50"
                      disabled={!photoFile || uploadingPhoto}
                      onClick={() => void uploadProfilePhoto()}
                    >
                      {uploadingPhoto ? "Uploading..." : "Upload camera photo"}
                    </button>
                    {!!photoFile && (
                      <button
                        type="button"
                        className="border rounded px-3 py-2 w-fit"
                        onClick={() => {
                          setPhotoFile(null);
                          if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                          setPhotoPreviewUrl("");
                        }}
                      >
                        Clear selected photo
                      </button>
                    )}
                    {!!avatarUrl && (
                      <button type="button" className="border border-red-300 text-red-700 rounded px-3 py-2 w-fit" onClick={() => void deleteProfilePhoto()}>
                        Delete profile photo
                      </button>
                    )}
                  </div>
                </div>

                <label className="text-sm font-medium">Name</label>
                <input className="border rounded px-3 py-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

                <label className="text-sm font-medium">Date of birth</label>
                <input type="date" className="border rounded px-3 py-2" value={dob} onChange={(e) => setDob(e.target.value)} />

                <label className="text-sm font-medium">Country</label>
                <input list="country-list" className="border rounded px-3 py-2" value={countryQuery} onChange={(e) => { setCountryQuery(e.target.value); setCountryCode(resolveCountryCodeByName(e.target.value)); }} placeholder="Start typing country..." />

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
