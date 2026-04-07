"use client";

import Link from "next/link";
import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
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
  const [friendsVisibility, setFriendsVisibility] = useState<"public" | "private">("public");
  const [dob, setDob] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [showPhotoCropper, setShowPhotoCropper] = useState(false);
  const [cropZoom, setCropZoom] = useState(1.2);
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [themePref, setThemePref] = useState<"auto" | "light" | "dark">("auto");

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
        .select("display_name,city,bio,friends_visibility,avatar_url")
        .eq("id", uid)
        .maybeSingle();

      setCity(profile?.city ?? "");
      setBio(profile?.bio ?? "");
      setFriendsVisibility(((profile?.friends_visibility as "public" | "private") || "public"));

      const u = await supabase.auth.getUser();
      const meta = (u.data.user?.user_metadata || {}) as Record<string, unknown>;
      const metaName = (typeof meta.full_name === "string" && meta.full_name) || (typeof meta.name === "string" && meta.name) || "";
      setDisplayName(profile?.display_name || metaName || "");
      const metaAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url : "";
      const resolvedAvatar = profile?.avatar_url || metaAvatar || "";
      setAvatarUrl(resolvedAvatar);

      if (!profile?.avatar_url && metaAvatar) {
        await supabase.from("profiles").upsert({ id: uid, avatar_url: metaAvatar });
      }
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
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("sidequest_theme_pref");
    if (saved === "auto" || saved === "light" || saved === "dark") {
      setThemePref(saved);
    }
  }, []);

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
      .upsert({ id: userId, display_name: displayName, city, bio, friends_visibility: friendsVisibility, avatar_url: avatarUrl || null });

    if (error) return setStatus(error.message);

    const { error: metaErr } = await supabase.auth.updateUser({
      data: {
        full_name: displayName,
        dob: dob || null,
        country_code: countryCode,
        avatar_url: avatarUrl || null,
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
      const baseScale = Math.max(size / img.width, size / img.height);
      const finalScale = baseScale * zoom;
      const drawW = img.width * finalScale;
      const drawH = img.height * finalScale;
      const dx = (size - drawW) / 2 + cropOffsetX;
      const dy = (size - drawH) / 2 + cropOffsetY;

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, dx, dy, drawW, drawH);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not export cropped photo.");
      return blob;
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  }

  async function startAdjustCurrentPhoto() {
    if (!avatarUrl) return;
    try {
      const res = await fetch(avatarUrl);
      const blob = await res.blob();
      const file = new File([blob], "current-avatar.jpg", { type: blob.type || "image/jpeg" });
      setPhotoFile(file);
      setCropZoom(1.2);
      setCropOffsetX(0);
      setCropOffsetY(0);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(URL.createObjectURL(file));
      setShowPhotoCropper(true);
    } catch {
      setStatus("Could not load current photo for adjusting.");
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
    let { error: profileErr } = await supabase
      .from("profiles")
      .upsert({ id: userId, avatar_url: publicData.publicUrl, avatar_capture_method: "camera", photo_onboarding_done: true });

    if (profileErr?.message?.includes("column") && (profileErr.message.includes("avatar_capture_method") || profileErr.message.includes("photo_onboarding_done"))) {
      const fallback = await supabase.from("profiles").upsert({ id: userId, avatar_url: publicData.publicUrl });
      profileErr = fallback.error;
    }

    setUploadingPhoto(false);
    if (profileErr && !profileErr.message.toLowerCase().includes("row-level security")) return setStatus(`Could not save photo: ${profileErr.message}`);

    const { error: metaErr } = await supabase.auth.updateUser({ data: { avatar_url: publicData.publicUrl } });
    if (metaErr) return setStatus(`Could not save photo metadata: ${metaErr.message}`);

    const { data: refreshedUser } = await supabase.auth.getUser();
    const refreshedMeta = (refreshedUser.user?.user_metadata || {}) as Record<string, unknown>;
    const avatarFromMeta = typeof refreshedMeta.avatar_url === "string" ? refreshedMeta.avatar_url : publicData.publicUrl;

    setAvatarUrl(avatarFromMeta);
    setPhotoFile(null);
    setPhotoPreviewUrl("");
    setShowPhotoCropper(false);
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
    await supabase.auth.updateUser({ data: { avatar_url: null } });
    setAvatarUrl("");
    setPhotoFile(null);
    setStatus("Profile photo removed.");
  }

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  function onCropPointerDown(e: PointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    setLastPointer({ x: e.clientX, y: e.clientY });
  }

  function onCropPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging || !lastPointer) return;
    const dx = e.clientX - lastPointer.x;
    const dy = e.clientY - lastPointer.y;
    setCropOffsetX((v) => v + dx);
    setCropOffsetY((v) => v + dy);
    setLastPointer({ x: e.clientX, y: e.clientY });
  }

  function onCropPointerUp() {
    setDragging(false);
    setLastPointer(null);
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
    if (!email) return setStatus("Missing account email.");
    if (!oldPassword) return setStatus("Enter your current password.");
    if (newPassword.length < 8) return setStatus("Password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return setStatus("Passwords do not match.");

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: oldPassword });
    if (verifyError) return setStatus("Current password is incorrect.");

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return setStatus(error.message);
    setOldPassword("");
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

    if (typeof window !== "undefined") {
      window.localStorage.setItem("sidequest_theme_pref", themePref);
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const resolved = themePref === "auto" ? (mq.matches ? "dark" : "light") : themePref;
      document.documentElement.dataset.theme = resolved;
    }

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
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setPhotoFile(file);
                      setCropZoom(1.2);
                      setCropOffsetX(0);
                      setCropOffsetY(0);
                      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                      setPhotoPreviewUrl(file ? URL.createObjectURL(file) : "");
                      setShowPhotoCropper(!!file);
                    }}
                  />

                  <button
                    type="button"
                    className="relative h-24 w-24 rounded-full border overflow-hidden bg-white group"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {photoPreviewUrl ? (
                      <img src={photoPreviewUrl} alt="Photo preview" className="h-full w-full object-cover" style={{ transform: `translate(${cropOffsetX}px, ${cropOffsetY}px) scale(${cropZoom})` }} />
                    ) : avatarUrl ? (
                      <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-[11px] text-gray-500">Add photo</div>
                    )}
                    <div className="absolute inset-0 bg-black/40 text-white text-xs grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {avatarUrl || photoPreviewUrl ? "Edit photo" : "Add photo"}
                    </div>
                  </button>

                  <div className="flex gap-2 flex-wrap">
                    {avatarUrl && !photoPreviewUrl && (
                      <button type="button" className="bg-blue-600 text-white rounded px-3 py-2 w-fit" onClick={() => void startAdjustCurrentPhoto()}>
                        Adjust current photo
                      </button>
                    )}

                    {photoPreviewUrl && (
                      <button type="button" className="bg-blue-600 text-white rounded px-3 py-2 w-fit" onClick={() => setShowPhotoCropper(true)}>
                        Adjust photo
                      </button>
                    )}
                      <button
                        type="button"
                        className="bg-emerald-600 text-white rounded px-3 py-2 w-fit disabled:opacity-50"
                        disabled={!photoFile || uploadingPhoto}
                        onClick={() => void uploadProfilePhoto()}
                      >
                        {uploadingPhoto ? "Saving..." : "Save photo"}
                      </button>
                      <button
                        type="button"
                        className="border rounded px-3 py-2 w-fit bg-white"
                        onClick={() => {
                          setPhotoFile(null);
                          if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                          setPhotoPreviewUrl("");
                          setShowPhotoCropper(false);
                        }}
                      >
                        Clear
                      </button>
                    </div>

                  {!!avatarUrl && (
                    <button type="button" className="border border-red-300 text-red-700 rounded px-3 py-2 w-fit" onClick={() => void deleteProfilePhoto()}>
                      Delete profile photo
                    </button>
                  )}
                </div>

                <label className="text-sm font-medium">Name</label>
                <input className="border rounded px-3 py-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

                <label className="text-sm font-medium">Date of birth</label>
                <input type="date" className="border rounded px-3 py-2" value={dob} onChange={(e) => setDob(e.target.value)} />

                <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
                  <div className="grid gap-1">
                    <label className="text-sm font-medium">Country</label>
                    <input list="country-list" className="border rounded px-3 py-2" value={countryQuery} onChange={(e) => { setCountryQuery(e.target.value); setCountryCode(resolveCountryCodeByName(e.target.value)); }} placeholder="Start typing country..." />
                  </div>

                  <div className="relative grid gap-1">
                    <label className="text-sm font-medium">City</label>
                    <input className="border rounded px-3 py-2 w-full" value={city} onChange={(e) => setCity(e.target.value)} placeholder={`Start typing city in ${countryCode}...`} />
                    {citySuggestions.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 top-full mt-1 border rounded bg-white shadow max-h-44 overflow-auto text-sm">
                        {citySuggestions.map((c) => (
                          <button key={c} type="button" className="block w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { setCity(c); setCitySuggestions([]); }}>
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <label className="text-sm font-medium">Bio</label>
                <textarea className="border rounded px-3 py-2" value={bio} onChange={(e) => setBio(e.target.value)} />

                <label className="text-sm font-medium">Friends list visibility</label>
                <select className="border rounded px-3 py-2" value={friendsVisibility} onChange={(e) => setFriendsVisibility(e.target.value as "public" | "private")}>
                  <option value="public">Public</option>
                  <option value="private">Private (friends only)</option>
                </select>

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
                  <label className="text-sm font-medium">Current password</label>
                  <input type="password" className="border rounded px-3 py-2" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />

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
                <label className="text-sm font-medium">Theme</label>
                <select className="border rounded px-3 py-2 w-fit min-w-[180px]" value={themePref} onChange={(e) => setThemePref(e.target.value as "auto" | "light" | "dark")}>
                  <option value="auto">Auto (follow system)</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
                <p className="text-xs text-gray-600">Auto follows your device theme.</p>

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

      {showPhotoCropper && photoPreviewUrl && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Adjust profile photo</h3>
              <button className="border rounded px-2 py-1" onClick={() => setShowPhotoCropper(false)}>Done</button>
            </div>
            <p className="text-xs text-gray-600">Drag photo with your finger to position it.</p>
            <div
              className="h-64 w-64 rounded-full overflow-hidden border mx-auto bg-black/5 touch-none"
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerCancel={onCropPointerUp}
            >
              <img
                src={photoPreviewUrl}
                alt="Crop preview"
                className="h-full w-full object-cover select-none"
                draggable={false}
                style={{ transform: `translate(${cropOffsetX}px, ${cropOffsetY}px) scale(${cropZoom})` }}
              />
            </div>
            <label className="text-xs">Zoom</label>
            <input type="range" min={1} max={3} step={0.05} value={cropZoom} onChange={(e) => setCropZoom(Number(e.target.value))} />
            <label className="text-xs">Move left/right</label>
            <input type="range" min={-140} max={140} step={1} value={cropOffsetX} onChange={(e) => setCropOffsetX(Number(e.target.value))} />
            <label className="text-xs">Move up/down</label>
            <input type="range" min={-140} max={140} step={1} value={cropOffsetY} onChange={(e) => setCropOffsetY(Number(e.target.value))} />
          </div>
        </div>
      )}
    </main>
  );
}
