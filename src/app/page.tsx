"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Hobby = { id: string; name: string; category: string | null };
type Quest = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  city: string | null;
  skill_level: string;
  group_size: number;
  availability: string | null;
  hobby_id: string;
  media_video_url: string | null;
  media_source: "live" | "upload" | null;
  hobbies?: { name: string | null }[] | null;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | { id: string; display_name: string | null; avatar_url: string | null } | null;
};

type AuthMode = "login" | "signup";
type ProfilePhotoStep = "idle" | "ready" | "uploading";
type Bookmark = { quest_id: string };

const TITLE_SUGGESTIONS = [
  "Beginner tennis buddy this weekend",
  "After-work climbing crew",
  "Saturday table tennis group",
  "Pickleball for total beginners",
  "Morning run partners (3x/week)",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FALLBACK_COUNTRIES = [
  "United States", "Canada", "United Kingdom", "Australia", "Brazil", "India", "Mexico", "Germany", "France", "Spain", "Italy", "Portugal", "Japan", "South Korea", "Argentina", "Chile", "Colombia", "Netherlands", "Belgium", "Sweden", "Norway", "Denmark", "Finland", "Ireland", "New Zealand", "South Africa"
];

export default function Home() {
  const supabase = getSupabaseClient();
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTroubleModal, setShowTroubleModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPhotoStepModal, setShowPhotoStepModal] = useState(false);
  const [photoStepFile, setPhotoStepFile] = useState<File | null>(null);
  const [photoStepState, setPhotoStepState] = useState<ProfilePhotoStep>("idle");

  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [bookmarkedQuestIds, setBookmarkedQuestIds] = useState<string[]>([]);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [hobbyFilter, setHobbyFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [titlePlaceholder, setTitlePlaceholder] = useState(TITLE_SUGGESTIONS[0]);
  const [description, setDescription] = useState("");
  const [hobbyId, setHobbyId] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [countryQuery, setCountryQuery] = useState("United States");
  const [city, setCity] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [availabilityMode, setAvailabilityMode] = useState<"flexible" | "specific">("flexible");
  const [availability, setAvailability] = useState("weeknights");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [skillLevel, setSkillLevel] = useState("beginner");
  const [groupSize, setGroupSize] = useState(4);
  const [questVideoFile, setQuestVideoFile] = useState<File | null>(null);
  const [questVideoSource, setQuestVideoSource] = useState<"live" | "upload">("live");
  const [questVideoDurationSec, setQuestVideoDurationSec] = useState<number | null>(null);
  const [savingQuest, setSavingQuest] = useState(false);
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);

  const countryOptions = useMemo(() => {
    try {
      // @ts-ignore
      const regions: string[] | undefined = typeof Intl !== "undefined" && Intl.supportedValuesOf ? Intl.supportedValuesOf("region") : undefined;
      const dn = new Intl.DisplayNames(["en"], { type: "region" });
      const names = (regions || []).map((code) => ({ code, name: dn.of(code) || code })).filter((x) => !!x.name).sort((a, b) => a.name.localeCompare(b.name));
      if (names.length) return names;
    } catch {}
    return FALLBACK_COUNTRIES.map((name) => ({ code: name.slice(0,2).toUpperCase(), name }));
  }, []);

  function resolveCountryCodeByName(name: string) {
    const found = countryOptions.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    return found?.code || countryCode;
  }

  const passwordChecks = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    match: password.length > 0 && password === confirmPassword,
  };

  useEffect(() => {
    if (!supabase) return;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user?.id ?? null);
      setUserEmail(data.session?.user?.email ?? "");
      if (!data.session) {
        const u = await supabase.auth.getUser();
        if (u.data.user) {
          setUserId(u.data.user.id);
          setUserEmail(u.data.user.email ?? "");
        }
      }

      if (typeof window !== "undefined" && (window.location.search.includes("code=") || window.location.search.includes("state="))) {
        window.history.replaceState({}, "", window.location.pathname);
      }

      setTitlePlaceholder(TITLE_SUGGESTIONS[Math.floor(Math.random() * TITLE_SUGGESTIONS.length)]);
      if (typeof navigator !== "undefined") {
        const region = (navigator.language.split("-")[1] || "US").toUpperCase();
        if (region.length === 2) {
          setCountryCode(region);
          const m = countryOptions.find((c) => c.code === region);
          if (m) setCountryQuery(m.name);
        }
      }
      const { data: hobbyData } = await supabase.from("hobbies").select("id,name,category").order("name");
      setHobbies(hobbyData || []);
      if (hobbyData?.length) setHobbyId((x) => x || hobbyData[0].id);
    };
    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? "");
      if (session?.user) {
        setShowAuthModal(false);
        setStatus("Signed in ✅");
        void maybeShowPhotoOnboarding(session.user.id);
      }
    });

    const refresh = async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user?.id ?? null);
      setUserEmail(data.session?.user?.email ?? "");
    };
    const onFocus = () => void refresh();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, countryOptions]);

  useEffect(() => {
    if (!supabase) return;
    void loadQuests();
  }, [supabase, hobbyFilter]);

  useEffect(() => {
    if (!supabase || !userId) {
      setBookmarkedQuestIds([]);
      return;
    }
    void loadBookmarks(userId);
  }, [supabase, userId]);

  useEffect(() => {
    if (!resendCooldown) return;
    const t = setTimeout(() => setResendCooldown((x) => Math.max(0, x - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(""), 6000);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    const q = city.trim();
    if (q.length < 2) return setCitySuggestions([]);
    const t = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5${countryCode ? `&countrycodes=${countryCode.toLowerCase()}` : ""}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        const data = (await res.json()) as Array<{ display_name: string }>;
        setCitySuggestions(data.map((x) => x.display_name).slice(0, 5));
      } catch {
        setCitySuggestions([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [city, countryCode]);

  async function loadQuests() {
    if (!supabase) return;
    setLoading(true);
    let q = supabase.from("quests").select("id,creator_id,title,description,city,skill_level,group_size,availability,hobby_id,media_video_url,media_source,hobbies(name),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)").order("created_at", { ascending: false }).limit(50);
    if (hobbyFilter !== "all") q = q.eq("hobby_id", hobbyFilter);
    const { data, error } = await q;
    setLoading(false);
    if (error) return setStatus(error.message);
    setQuests((data as Quest[]) || []);
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return window.alert("Missing Supabase env vars.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus(`Login failed: ${error.message}`);
      return window.alert(`Login failed: ${error.message}`);
    }
    const { data } = await supabase.auth.getSession();
    setUserId(data.session?.user?.id ?? null);
    setUserEmail(data.session?.user?.email ?? "");
    setShowAuthModal(false);
    setStatus("Signed in ✅");
    await maybeShowPhotoOnboarding(data.session?.user?.id ?? null);
  }

  async function signUpWithPassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (!fullName.trim()) return setStatus("Please enter your name.");
    if (!dob) return setStatus("Please enter your date of birth.");
    const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (Number.isNaN(years) || years < 13) return setStatus("You must be at least 13.");
    if (!acceptTerms) return setStatus("You must accept Terms.");
    if (!Object.values(passwordChecks).every(Boolean)) return setStatus("Password requirements not met.");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: fullName, dob, country_code: countryCode, accepted_terms: true, marketing_opt_in: marketingOptIn },
      },
    });
    if (error) return setStatus(error.message);
    if (data.user?.id) await supabase.from("profiles").upsert({ id: data.user.id, display_name: fullName });
    setPendingVerifyEmail(email);
    setResendCooldown(60);
    setStatus("✅ Account created. Verify your email, then log in.");
  }

  async function sendMagicLink() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) return window.alert(error.message);
    setStatus("✅ One-time sign-in link sent.");
  }

  async function sendReset(e?: FormEvent) {
    e?.preventDefault();
    if (!supabase) return;
    const resetRedirect = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : redirectTo;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetRedirect });
    if (error) return window.alert(error.message);
    setStatus("✅ Password reset email sent.");
  }

  async function resendVerification() {
    if (!supabase || !pendingVerifyEmail || resendCooldown > 0) return;
    const { error } = await supabase.auth.resend({ type: "signup", email: pendingVerifyEmail, options: { emailRedirectTo: redirectTo } });
    if (error) return setStatus(error.message);
    setResendCooldown(60);
    setStatus("Verification email resent ✅");
  }

  async function socialLogin(provider: "google" | "facebook") {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) {
      setStatus(`OAuth failed: ${error.message}`);
      window.alert(`OAuth failed: ${error.message}`);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserId(null);
    setUserEmail("");
    setShowPhotoStepModal(false);
    setPhotoStepFile(null);
    setPhotoStepState("idle");
    setStatus("Signed out");
  }

  async function maybeShowPhotoOnboarding(uid: string | null) {
    if (!supabase || !uid) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("photo_onboarding_done")
      .eq("id", uid)
      .maybeSingle();

    if (!profile?.photo_onboarding_done) {
      setShowPhotoStepModal(true);
      setPhotoStepState("idle");
      setPhotoStepFile(null);
    }
  }

  async function skipPhotoStep() {
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, photo_onboarding_done: true });
    if (error) return setStatus(error.message);
    setShowPhotoStepModal(false);
    setPhotoStepFile(null);
    setPhotoStepState("idle");
    setStatus("You can add a profile photo anytime in Settings.");
  }

  async function savePhotoStep() {
    if (!supabase || !userId || !photoStepFile) return;
    if (!photoStepFile.type.startsWith("image/")) return setStatus("Please choose an image file.");
    if (photoStepFile.size > 8 * 1024 * 1024) return setStatus("Photo must be under 8MB.");

    setPhotoStepState("uploading");
    const ext = (photoStepFile.name.split(".").pop() || "jpg").toLowerCase();
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(filePath, photoStepFile, { upsert: false, contentType: photoStepFile.type });
    if (uploadError) {
      setPhotoStepState("ready");
      return setStatus(`Photo upload failed: ${uploadError.message}`);
    }

    const { data: publicData } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      avatar_url: publicData.publicUrl,
      avatar_capture_method: "camera",
      photo_onboarding_done: true,
    });

    if (profileError) {
      setPhotoStepState("ready");
      return setStatus(`Could not save photo: ${profileError.message}`);
    }

    setPhotoStepState("idle");
    setPhotoStepFile(null);
    setShowPhotoStepModal(false);
    setStatus("Profile photo saved ✅");
  }

  async function getVideoDurationSeconds(file: File) {
    const blobUrl = URL.createObjectURL(file);
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => resolve(video.duration || 0);
        video.onerror = () => reject(new Error("Could not read video duration."));
        video.src = blobUrl;
      });
      return duration;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function uploadQuestVideo(file: File) {
    if (!supabase || !userId) throw new Error("Not signed in.");
    if (!file.type.startsWith("video/")) throw new Error("Please choose a video file.");
    if (file.size > 60 * 1024 * 1024) throw new Error("Video must be under 60MB.");

    const duration = await getVideoDurationSeconds(file);
    if (duration > 15.2) throw new Error("Video must be 15 seconds or less.");

    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("quest-videos")
      .upload(filePath, file, { upsert: false, contentType: file.type });
    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from("quest-videos").getPublicUrl(filePath);
    return data.publicUrl;
  }

  function resetQuestForm() {
    setTitle("");
    setDescription("");
    setSelectedDays([]);
    setAvailabilityMode("flexible");
    setAvailability("weeknights");
    setUseCustomCategory(false);
    setCustomCategory("");
    setQuestVideoFile(null);
    setQuestVideoDurationSec(null);
    setQuestVideoSource("live");
    setEditingQuestId(null);
  }

  function openCreateModal() {
    resetQuestForm();
    setShowCreateModal(true);
  }

  async function handleQuestVideoPicked(file: File | null) {
    setQuestVideoFile(null);
    setQuestVideoDurationSec(null);
    if (!file) return;
    if (!file.type.startsWith("video/")) return setStatus("Please choose a video file.");

    try {
      const duration = await getVideoDurationSeconds(file);
      setQuestVideoDurationSec(duration);
      if (duration > 15.2) {
        setStatus(`Video is ${duration.toFixed(1)}s. Max is 15s.`);
        return;
      }
      setQuestVideoFile(file);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not read video.");
    }
  }

  function openEditModal(q: Quest) {
    setEditingQuestId(q.id);
    setTitle(q.title || "");
    setDescription(q.description || "");
    setHobbyId(q.hobby_id);
    setCity(q.city || "");
    setAvailabilityMode("flexible");
    setAvailability(q.availability || "weeknights");
    setSkillLevel(q.skill_level || "beginner");
    setGroupSize(q.group_size || 4);
    setQuestVideoFile(null);
    setQuestVideoSource((q.media_source as "live" | "upload") || "upload");
    setShowCreateModal(true);
  }

  async function createQuest(e: FormEvent) {

    e.preventDefault();
    if (!supabase) return;
    if (!userId) {
      setShowAuthModal(true);
      return setStatus("Log in to create.");
    }

    // Ensure profile row exists (required by quests.creator_id FK)
    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: userId,
      display_name: fullName || userEmail.split("@")[0] || "SideQuest user",
      city,
      availability: availabilityMode === "specific" ? selectedDays.join(", ") : availability,
      skill_level: skillLevel,
    });
    if (profileErr) return setStatus(`Profile setup failed: ${profileErr.message}`);

    const avail = availabilityMode === "specific" ? selectedDays.join(", ") : availability;

    let finalHobbyId = hobbyId;
    if (useCustomCategory && customCategory.trim()) {
      const custom = customCategory.trim();
      const { data: existing } = await supabase
        .from("hobbies")
        .select("id,name")
        .ilike("name", custom)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        finalHobbyId = existing.id;
      } else {
        const slug = slugify(custom);
        const { data: created, error: hobbyErr } = await supabase
          .from("hobbies")
          .insert({ slug, name: custom, category: "Custom" })
          .select("id")
          .single();

        if (hobbyErr) {
          setStatus(`Could not create category automatically. Posting under selected category for now.`);
        } else if (created?.id) {
          finalHobbyId = created.id;
        }
      }
    }

    const finalDescription = useCustomCategory && customCategory.trim() && finalHobbyId === hobbyId
      ? `[Custom category suggestion: ${customCategory.trim()}]
${description}`
      : description;

    setSavingQuest(true);
    let videoUrl: string | null = null;
    try {
      if (questVideoFile) videoUrl = await uploadQuestVideo(questVideoFile);

      if (editingQuestId) {
        const payload: Record<string, unknown> = {
          hobby_id: finalHobbyId,
          title,
          description: finalDescription,
          city,
          skill_level: skillLevel,
          availability: avail,
          group_size: groupSize,
        };
        if (videoUrl) {
          payload.media_video_url = videoUrl;
          payload.media_source = questVideoSource;
        }

        const { error } = await supabase
          .from("quests")
          .update(payload)
          .eq("id", editingQuestId)
          .eq("creator_id", userId);
        if (error) throw new Error(error.message);

        setStatus("Listing updated ✅");
      } else {
        const { data, error } = await supabase.from("quests").insert({ creator_id: userId, hobby_id: finalHobbyId, title, description: finalDescription, city, skill_level: skillLevel, availability: avail, group_size: groupSize, media_video_url: videoUrl, media_source: videoUrl ? questVideoSource : null }).select("id").single();
        if (error) throw new Error(error.message);
        if (data?.id) await supabase.from("quest_members").insert({ quest_id: data.id, user_id: userId, role: "creator" });
        setStatus("Quest posted ✅");
      }

      resetQuestForm();
      setShowCreateModal(false);
      await loadQuests();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save listing.");
    } finally {
      setSavingQuest(false);
    }
  }

  function slugify(input: string) {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  async function loadBookmarks(uid: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("quest_bookmarks").select("quest_id").eq("user_id", uid);
    if (error) return;
    setBookmarkedQuestIds(((data as Bookmark[]) || []).map((b) => b.quest_id));
  }

  async function toggleBookmark(questId: string) {
    if (!supabase || !userId) {
      setShowAuthModal(true);
      return setStatus("Log in to save listings.");
    }

    const isSaved = bookmarkedQuestIds.includes(questId);
    if (isSaved) {
      const { error } = await supabase.from("quest_bookmarks").delete().eq("user_id", userId).eq("quest_id", questId);
      if (error) return setStatus(error.message);
      setBookmarkedQuestIds((prev) => prev.filter((id) => id !== questId));
      setStatus("Removed from saved listings.");
      return;
    }

    const { error } = await supabase.from("quest_bookmarks").insert({ user_id: userId, quest_id: questId });
    if (error && !error.message.includes("duplicate")) return setStatus(error.message);
    setBookmarkedQuestIds((prev) => [...prev, questId]);
    setStatus("Saved listing ✅");
  }

  async function askQuestion(quest: Quest) {
    if (!supabase || !userId) {
      setShowAuthModal(true);
      return setStatus("Log in to message listing owners.");
    }
    if (userId === quest.creator_id) {
      return setStatus("You can’t ask a question on your own listing.");
    }

    const privacyInput = window.prompt('Send as "public" or "private"?', "public");
    if (!privacyInput) return;
    const mode = privacyInput.trim().toLowerCase();
    if (!["public", "private"].includes(mode)) {
      return setStatus('Please type either "public" or "private".');
    }

    const text = window.prompt(`Ask a ${mode} question about "${quest.title}"`);
    if (!text || !text.trim()) return;

    const prefix = mode === "private" ? "[PRIVATE] " : "[PUBLIC] ";
    const { error } = await supabase.from("messages").insert({
      quest_id: quest.id,
      sender_id: userId,
      body: `${prefix}${text.trim()}`,
    });
    if (error) return setStatus(error.message);
    setStatus(`${mode === "private" ? "Private" : "Public"} question sent ✅ Check Inbox for replies.`);
  }

  function getCreatorProfile(q: Quest) {
    if (!q.profiles) return null;
    return Array.isArray(q.profiles) ? (q.profiles[0] ?? null) : q.profiles;
  }

  async function joinQuest(id: string) {
    if (!supabase || !userId) {
      setShowAuthModal(true);
      return setStatus("Log in to join.");
    }

    const quest = quests.find((q) => q.id === id);
    if (quest && quest.creator_id === userId) {
      return setStatus("You can’t join your own listing.");
    }

    const { error } = await supabase.from("quest_members").insert({ quest_id: id, user_id: userId, role: "member" });
    if (error && !error.message.includes("duplicate")) return setStatus(error.message);
    setStatus("Joined quest ✅");
  }

  const filteredQuests = useMemo(() => {
    if (!showSavedOnly) return quests;
    return quests.filter((q) => bookmarkedQuestIds.includes(q.id));
  }, [quests, showSavedOnly, bookmarkedQuestIds]);

  const surprisePick = useMemo(() => (filteredQuests.length ? filteredQuests[Math.floor(Math.random() * filteredQuests.length)] : null), [filteredQuests]);

  return (
    <main className="min-h-screen bg-[#f6f7fb]">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Side Quest</h1>
            <p className="text-xs text-gray-500">Find your hobby people</p>
          </div>
          <div className="flex gap-2">
            <button className="bg-black text-white rounded px-3 py-2" onClick={() => (userId ? openCreateModal() : setShowAuthModal(true))}>+ Create</button>
            <a href="/inbox" className="border rounded px-3 py-2">Inbox</a>
            {userId ? <><a href="/settings" className="border rounded px-3 py-2">Settings</a><button className="border rounded px-3 py-2" onClick={signOut}>Sign out</button></> : <button className="border rounded px-3 py-2" onClick={() => setShowAuthModal(true)}>Log in / Sign up</button>}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        <section className="rounded-2xl border bg-white p-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h2 className="font-semibold">Explore quests</h2>
            <div className="flex items-center gap-2">
              <select className="border rounded px-2 py-1" value={hobbyFilter} onChange={(e) => setHobbyFilter(e.target.value)}>
                <option value="all">All categories</option>
                {hobbies.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              <button
                className={`border rounded px-3 py-1 ${showSavedOnly ? "bg-black text-white" : ""}`}
                onClick={() => setShowSavedOnly((x) => !x)}
                type="button"
              >
                {showSavedOnly ? "Showing saved" : "Saved"}
              </button>
              <button className="border rounded px-3 py-1" onClick={() => void loadQuests()}>Refresh</button>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
            <strong>Surprise me:</strong> {surprisePick ? <><span>{surprisePick.title} ({surprisePick.hobbies?.[0]?.name || "Hobby"})</span>{userId !== surprisePick.creator_id && <button className="ml-3 border rounded px-2 py-1" onClick={() => void joinQuest(surprisePick.id)}>Join</button>}</> : "No quests yet"}
          </div>
        </section>

        <section className="grid gap-3">
          {loading ? <p>Loading...</p> : filteredQuests.map((q) => {
            const creatorProfile = getCreatorProfile(q);
            return (
            <article key={q.id} className="rounded-2xl border bg-white p-4">
              <div className="flex gap-4 items-start">
                <aside className="w-24 shrink-0 text-center">
                  {creatorProfile?.avatar_url ? (
                    <img src={creatorProfile.avatar_url} alt="Creator" className="h-16 w-16 rounded-full object-cover border mx-auto" />
                  ) : (
                    <div className="h-16 w-16 rounded-full border bg-gray-100 mx-auto" />
                  )}
                  <Link href={`/profile/${q.creator_id}`} className="mt-2 block text-xs underline text-gray-700 truncate">
                    {creatorProfile?.display_name || "View profile"}
                  </Link>
                </aside>

                <div className="flex-1 space-y-3 min-w-0">
                  {q.media_video_url ? (
                    <div className="relative">
                      <video className="w-full rounded-xl border bg-black" src={q.media_video_url} controls muted playsInline preload="metadata" />
                      {q.media_source === "live" && <span className="absolute top-2 left-2 text-xs bg-emerald-600 text-white px-2 py-1 rounded-full">Live video</span>}
                    </div>
                  ) : creatorProfile?.avatar_url ? (
                    <img src={creatorProfile.avatar_url || ""} alt="Profile fallback" className="w-full max-h-72 object-cover rounded-xl border" />
                  ) : null}

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-lg">
                        <Link href={`/listing/${q.id}`} className="underline">{q.title}</Link>
                      </h3>
                      <p className="text-xs text-gray-500">{q.hobbies?.[0]?.name || "Hobby"} · {q.skill_level} · group {q.group_size}</p>
                      <p className="text-sm mt-2">{q.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{q.city || "city tbd"} · {q.availability || "availability tbd"}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <Link href={`/listing/${q.id}`} className="border rounded px-3 py-2">View</Link>
                      {userId !== q.creator_id && (
                        <>
                          <button className="border rounded px-3 py-2" onClick={() => void joinQuest(q.id)}>Join</button>
                          <button className="border rounded px-3 py-2" onClick={() => void askQuestion(q)}>Ask question</button>
                        </>
                      )}
                      <button className="border rounded px-3 py-2" onClick={() => void toggleBookmark(q.id)}>
                        {bookmarkedQuestIds.includes(q.id) ? "★ Saved" : "☆ Save"}
                      </button>
                      {userId === q.creator_id && (
                        <button className="border rounded px-3 py-2" onClick={() => openEditModal(q)}>Edit</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
          })}
          {!loading && filteredQuests.length === 0 && <p className="text-sm text-gray-500">{showSavedOnly ? "No saved listings yet." : "No quests yet — create the first one."}</p>}
        </section>
      </div>

      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border p-4 space-y-3">
            <div className="flex justify-between items-center"><h3 className="font-semibold">Welcome back</h3><button onClick={() => setShowAuthModal(false)} className="border rounded px-2 py-1">Close</button></div>
            <div className="flex gap-2">
              <button className={`px-3 py-2 rounded ${authMode === "signup" ? "bg-black text-white" : "border"}`} onClick={() => setAuthMode("signup")}>Sign up</button>
              <button className={`px-3 py-2 rounded ${authMode === "login" ? "bg-black text-white" : "border"}`} onClick={() => setAuthMode("login")}>Log in</button>
            </div>
            {status && <div className="text-sm rounded border bg-amber-50 px-3 py-2">{status}</div>}

            <form onSubmit={authMode === "signup" ? signUpWithPassword : signInWithPassword} className="grid gap-2">
              <label className="text-xs font-medium text-gray-600">Email</label>
              <input className="border rounded px-3 py-2" placeholder="you@email.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {authMode === "signup" && (
                <>
                  <label className="text-xs font-medium text-gray-600">Full name</label>
                  <input className="border rounded px-3 py-2" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  <label className="text-sm font-medium">Date of birth (DOB)</label>
                  <input className="border rounded px-3 py-2" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
                  <p className="text-xs text-gray-500">Use your birthday (MM/DD/YYYY).</p>
                </>
              )}
              <label className="text-xs font-medium text-gray-600">Password</label>
              <div className="flex gap-2">
                <input className="border rounded px-3 py-2 flex-1" placeholder="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" className="border rounded px-3" onClick={() => setShowPassword((s) => !s)}>{showPassword ? "Hide" : "Show"}</button>
              </div>

              {authMode === "signup" && (
                <>
                  <label className="text-xs font-medium text-gray-600">Confirm password</label>
                  <div className="flex gap-2">
                    <input className="border rounded px-3 py-2 flex-1" placeholder="Confirm password" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                    <button type="button" className="border rounded px-3" onClick={() => setShowConfirmPassword((s) => !s)}>{showConfirmPassword ? "Hide" : "Show"}</button>
                  </div>
                  <div className="text-xs rounded border p-2 bg-gray-50">
                    <p>{passwordChecks.minLength ? "✅" : "⬜"} 8+ characters</p>
                    <p>{passwordChecks.uppercase ? "✅" : "⬜"} uppercase</p>
                    <p>{passwordChecks.lowercase ? "✅" : "⬜"} lowercase</p>
                    <p>{passwordChecks.number ? "✅" : "⬜"} number</p>
                    <p>{passwordChecks.special ? "✅" : "⬜"} special</p>
                    <p>{passwordChecks.match ? "✅" : "⬜"} passwords match</p>
                  </div>
                  <label className="text-sm flex gap-2 items-start"><input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} /><span>I accept the <a href="/terms" target="_blank" className="underline">Terms</a>.</span></label>
                  <label className="text-sm flex gap-2 items-start"><input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} /><span>Send me updates/promos (optional).</span></label>
                </>
              )}

              <button className="bg-black text-white rounded px-3 py-2">{authMode === "signup" ? "Create account" : "Log in"}</button>
            </form>

            <div className="pt-2 border-t space-y-2">
              <div className="flex gap-2">
                <button className="border rounded px-3 py-2 flex items-center gap-2" onClick={() => void socialLogin("google")}><img src="/google-g.svg" alt="Google" className="h-4 w-4"/><span>Google</span></button>
                <button className="border rounded px-3 py-2 flex items-center gap-2" onClick={() => void socialLogin("facebook")}><img src="/facebook-f.svg" alt="Facebook" className="h-4 w-4"/><span>Facebook</span></button>
              </div>
              {authMode === "login" && <button type="button" className="text-sm underline" onClick={() => setShowTroubleModal(true)}>Trouble signing in?</button>}
            </div>

            {!!pendingVerifyEmail && <div className="text-sm rounded bg-emerald-50 border p-2">Sent to <b>{pendingVerifyEmail}</b>. <button className="underline" disabled={resendCooldown > 0} onClick={() => void resendVerification()}>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend"}</button></div>}
          </div>
        </div>
      )}

      {showTroubleModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Trouble signing in?</h3><button className="border rounded px-2 py-1" onClick={() => setShowTroubleModal(false)}>Close</button></div>
            <button className="border rounded px-3 py-2 w-full text-left" onClick={() => void sendMagicLink()}>Send one-time sign-in link</button>
            <button className="border rounded px-3 py-2 w-full text-left" onClick={() => void sendReset()}>Reset password</button>
          </div>
        </div>
      )}

      {showPhotoStepModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Optional next step: profile photo</h3>
              <button className="border rounded px-2 py-1" onClick={() => void skipPhotoStep()}>Skip</button>
            </div>
            <p className="text-sm text-gray-600">Use your camera to add one profile photo now, or skip and do it later in Settings.</p>
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="border rounded px-3 py-2 w-full"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setPhotoStepFile(file);
                setPhotoStepState(file ? "ready" : "idle");
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
                disabled={!photoStepFile || photoStepState === "uploading"}
                onClick={() => void savePhotoStep()}
              >
                {photoStepState === "uploading" ? "Uploading..." : "Save photo"}
              </button>
              <button type="button" className="border rounded px-3 py-2" onClick={() => void skipPhotoStep()}>Skip for now</button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white border p-4 space-y-3">
            <div className="flex justify-between items-center"><h3 className="font-semibold">{editingQuestId ? "Edit Listing" : "Create Quest"}</h3><button onClick={() => { setShowCreateModal(false); resetQuestForm(); }} className="border rounded px-2 py-1">Close</button></div>
            <form onSubmit={createQuest} className="grid gap-2">
              <label className="text-sm font-medium">Title</label>
              <input className="border rounded px-3 py-2" placeholder={titlePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} />

              <label className="text-sm font-medium">Category</label>
              <div className="space-y-2">
                <select className="border rounded px-3 py-2 w-full" value={hobbyId} onChange={(e) => setHobbyId(e.target.value)}>
                  {hobbies.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={useCustomCategory} onChange={(e) => setUseCustomCategory(e.target.checked)} />
                  Suggest / use a custom category
                </label>
                {useCustomCategory && (
                  <input
                    className="border rounded px-3 py-2 w-full"
                    placeholder="e.g. Salsa dancing, Chess club, Archery"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                  />
                )}
              </div>

              <label className="text-sm font-medium">Country</label>
              <input list="country-list" className="border rounded px-3 py-2" value={countryQuery} onChange={(e) => { setCountryQuery(e.target.value); setCountryCode(resolveCountryCodeByName(e.target.value)); }} placeholder="Start typing country..." />

              <label className="text-sm font-medium">City</label>
              <div className="relative">
                <input className="border rounded px-3 py-2 w-full" placeholder={`Start typing a city in ${countryCode}...`} value={city} onChange={(e) => setCity(e.target.value)} />
                {citySuggestions.length > 0 && <div className="absolute z-20 left-0 right-0 mt-1 border rounded bg-white shadow max-h-44 overflow-auto">{citySuggestions.map((c) => <button key={c} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { setCity(c); setCitySuggestions([]); }}>{c}</button>)}</div>}
              </div>

              <label className="text-sm font-medium">Availability</label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={availabilityMode === "flexible"} onChange={() => setAvailabilityMode("flexible")} /> Flexible</label>
                <label className="flex items-center gap-2"><input type="radio" checked={availabilityMode === "specific"} onChange={() => setAvailabilityMode("specific")} /> Specific days</label>
              </div>
              {availabilityMode === "flexible" ? (
                <input className="border rounded px-3 py-2" placeholder="e.g. weeknights" value={availability} onChange={(e) => setAvailability(e.target.value)} />
              ) : (
                <div className="flex flex-wrap gap-2">{DAYS.map((d) => <button key={d} type="button" className={`border rounded-full px-3 py-1 text-sm ${selectedDays.includes(d) ? "bg-black text-white" : "bg-white"}`} onClick={() => setSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}>{d}</button>)}</div>
              )}

              <label className="text-sm font-medium">Skill level</label>
              <select className="border rounded px-3 py-2" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}><option value="beginner">Beginner</option><option value="returning">Returning</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select>

              <label className="text-sm font-medium">Group size</label>
              <input type="number" min={2} max={20} className="border rounded px-3 py-2" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} />

              <label className="text-sm font-medium">Description</label>
              <textarea className="border rounded px-3 py-2" placeholder="What are you trying to do?" value={description} onChange={(e) => setDescription(e.target.value)} />

              <label className="text-sm font-medium">Listing video (optional)</label>
              <div className="grid gap-2 rounded-xl border p-3 bg-gray-50">
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" checked={questVideoSource === "live"} onChange={() => setQuestVideoSource("live")} /> Record live video</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={questVideoSource === "upload"} onChange={() => setQuestVideoSource("upload")} /> Upload existing video</label>
                </div>
                {questVideoSource === "live" && (
                  <div className="text-xs rounded border border-amber-300 bg-amber-50 px-2 py-1">
                    Live video tip: keep recording under <b>15 seconds max</b>.
                  </div>
                )}
                <input
                  type="file"
                  accept="video/*"
                  capture={questVideoSource === "live" ? "environment" : undefined}
                  className="border rounded px-3 py-2 bg-white"
                  onChange={(e) => void handleQuestVideoPicked(e.target.files?.[0] ?? null)}
                />
                {questVideoDurationSec !== null && (
                  <p className={`text-xs ${questVideoDurationSec > 15.2 ? "text-red-600" : "text-emerald-700"}`}>
                    Selected video: {questVideoDurationSec.toFixed(1)}s {questVideoDurationSec > 15.2 ? "(too long — max 15s)" : "(within 15s limit)"}
                  </p>
                )}
                <p className="text-xs text-gray-500">If no video is added, we show profile photo fallback on the listing card.</p>
              </div>

              <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={savingQuest}>{savingQuest ? "Saving..." : (editingQuestId ? "Save changes" : "Post quest")}</button>
            </form>
          </div>
        </div>
      )}

      <datalist id="country-list">{countryOptions.map((c) => <option key={c.code} value={c.name} />)}</datalist>

      {status && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw]">
          <div className="rounded-xl bg-black text-white px-4 py-3 text-sm shadow-lg border border-white/20 flex items-center gap-3">
            <span>{status}</span>
            <button className="text-xs underline opacity-90" onClick={() => setStatus("")} type="button">dismiss</button>
          </div>
        </div>
      )}
    </main>
  );
}
