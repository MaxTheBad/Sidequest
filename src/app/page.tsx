"use client";

import Link from "next/link";
import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type Hobby = { id: string; name: string; category: string | null };
type QuestMediaItem = {
  url: string;
  type: "image" | "video";
  label?: string | null;
};

type DraftMediaItem = {
  id: string;
  type: "image" | "video";
  label: string;
  source: "existing" | "new";
  url?: string;
  file?: File;
};

type Quest = {
  id: string;
  creator_id: string;
  join_mode?: "open" | "approval_required";
  exact_location_visibility?: "private" | "public" | "approved_members";
  exact_address?: string | null;
  title: string;
  description: string | null;
  city: string | null;
  skill_level: string;
  group_size: number;
  availability: string | null;
  hobby_id: string;
  media_video_url: string | null;
  media_source: "live" | "upload" | null;
  media_items?: QuestMediaItem[] | null;
  hobbies?: { name: string | null }[] | null;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | { id: string; display_name: string | null; avatar_url: string | null } | null;
};

type AuthMode = "login" | "signup";
type ProfilePhotoStep = "idle" | "ready" | "uploading";
type Bookmark = { quest_id: string };
type Membership = { quest_id: string; status?: "pending" | "approved" | "declined" };

const TITLE_SUGGESTIONS = [
  "Beginner tennis buddy this weekend",
  "After-work climbing crew",
  "Saturday table tennis group",
  "Pickleball for total beginners",
  "Morning run partners (3x/week)",
];
const MEDIA_LABEL_HINTS = [
  "Photo of front of building",
  "Video of last event",
  "Photo of seating area",
  "Video walkthrough",
];
const FALLBACK_COUNTRIES = [
  "United States", "Canada", "United Kingdom", "Australia", "Brazil", "India", "Mexico", "Germany", "France", "Spain", "Italy", "Portugal", "Japan", "South Korea", "Argentina", "Chile", "Colombia", "Netherlands", "Belgium", "Sweden", "Norway", "Denmark", "Finland", "Ireland", "New Zealand", "South Africa"
];
const CATEGORY_SUGGESTIONS = [
  "Gym",
  "Jogging",
  "Biking",
  "Coding",
  "Content creation",
  "Team building",
  "Studying",
  "Yoga",
  "Hiking",
  "Basketball",
  "Soccer",
  "Tennis",
  "Pickleball",
  "Board games",
  "Language exchange",
  "Photography",
];
const GROUP_SIZE_OPTIONS = ["any", "2", "3", "4", "5", "6", "8", "10", "12"];

export default function Home() {
  const supabase = getSupabaseClient();
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [viewerName, setViewerName] = useState("");

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTroubleModal, setShowTroubleModal] = useState(false);
  const [handledCreateParam, setHandledCreateParam] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [expandedMedia, setExpandedMedia] = useState<{ items: QuestMediaItem[]; index: number } | null>(null);
  const [mediaTouchStartX, setMediaTouchStartX] = useState<number | null>(null);
  const [questionTarget, setQuestionTarget] = useState<Quest | null>(null);
  const [questionMode, setQuestionMode] = useState<"public" | "private">("public");
  const [questionText, setQuestionText] = useState("");
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [lastQuestionMs, setLastQuestionMs] = useState(0);
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
  const [photoStepPreviewUrl, setPhotoStepPreviewUrl] = useState("");
  const [photoStepZoom, setPhotoStepZoom] = useState(1.2);
  const [photoStepOffsetX, setPhotoStepOffsetX] = useState(0);
  const [photoStepOffsetY, setPhotoStepOffsetY] = useState(0);
  const [photoStepDragging, setPhotoStepDragging] = useState(false);
  const [photoStepLastPointer, setPhotoStepLastPointer] = useState<{ x: number; y: number } | null>(null);
  const [photoStepState, setPhotoStepState] = useState<ProfilePhotoStep>("idle");

  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [bookmarkedQuestIds, setBookmarkedQuestIds] = useState<string[]>([]);
  const [joinedQuestIds, setJoinedQuestIds] = useState<string[]>([]);
  const [membershipStatusByQuest, setMembershipStatusByQuest] = useState<Record<string, "pending" | "approved" | "declined">>({});
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [hobbyFilter, setHobbyFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [titlePlaceholder, setTitlePlaceholder] = useState(TITLE_SUGGESTIONS[0]);
  const [description, setDescription] = useState("");
  const [hobbyId, setHobbyId] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [countryQuery, setCountryQuery] = useState("United States");
  const [city, setCity] = useState("");
  const [exactAddress, setExactAddress] = useState("");
  const [joinMode, setJoinMode] = useState<"open" | "approval_required">("open");
  const [exactLocationVisibility, setExactLocationVisibility] = useState<"private" | "public" | "approved_members">("private");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [availabilityMode, setAvailabilityMode] = useState<"specific_time" | "find_best_time">("find_best_time");
  const [availability, setAvailability] = useState("");
  const [startAt, setStartAt] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringStartDate, setRecurringStartDate] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [groupSizeChoice, setGroupSizeChoice] = useState("");
  const [groupSizeCustom, setGroupSizeCustom] = useState("");
  const [questVideoFile, setQuestVideoFile] = useState<File | null>(null);
  const [questVideoSource, setQuestVideoSource] = useState<"live" | "upload">("live");
  const [questVideoDurationSec, setQuestVideoDurationSec] = useState<number | null>(null);
  const [questMediaFiles, setQuestMediaFiles] = useState<Array<{ id: string; file: File; label: string }>>([]);
  const [existingMediaItems, setExistingMediaItems] = useState<QuestMediaItem[]>([]);
  const [mediaDraftItems, setMediaDraftItems] = useState<DraftMediaItem[]>([]);
  const [dragMediaId, setDragMediaId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [removeExistingVideo, setRemoveExistingVideo] = useState(false);
  const liveVideoInputRef = useRef<HTMLInputElement | null>(null);
  const uploadVideoInputRef = useRef<HTMLInputElement | null>(null);
  const [savingQuest, setSavingQuest] = useState(false);
  const [lastQuestCreateMs, setLastQuestCreateMs] = useState(0);
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

  const categoryOptions = useMemo(() => {
    const existingNames = new Set(hobbies.map((h) => h.name.toLowerCase()));
    const suggestionOnly = CATEGORY_SUGGESTIONS
      .filter((name) => !existingNames.has(name.toLowerCase()))
      .map((name) => ({ id: `suggestion:${name}`, name, isSuggestion: true as const }));
    const dbOptions = hobbies.map((h) => ({ id: h.id, name: h.name, isSuggestion: false as const }));
    return [...dbOptions, ...suggestionOnly].sort((a, b) => a.name.localeCompare(b.name));
  }, [hobbies]);

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
      if (data.session?.user) {
        const md = (data.session.user.user_metadata || {}) as Record<string, unknown>;
        setViewerName((typeof md.full_name === "string" && md.full_name) || (typeof md.name === "string" && md.name) || "");
      }

      if (data.session?.user) {
        const md = (data.session.user.user_metadata || {}) as Record<string, unknown>;
        await ensureProfileRow(data.session.user.id, data.session.user.email, md);
      }

      if (!data.session) {
        const u = await supabase.auth.getUser();
        if (u.data.user) {
          setUserId(u.data.user.id);
          setUserEmail(u.data.user.email ?? "");
          const md = (u.data.user.user_metadata || {}) as Record<string, unknown>;
          setViewerName((typeof md.full_name === "string" && md.full_name) || (typeof md.name === "string" && md.name) || "");
          await ensureProfileRow(u.data.user.id, u.data.user.email, md);
        }
      }

      if (typeof window !== "undefined" && (window.location.search.includes("code=") || window.location.search.includes("state="))) {
        setStatus("✅ Email confirmed. You can now continue.");
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
    };
    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? "");
      const md = (session?.user?.user_metadata || {}) as Record<string, unknown>;
      setViewerName((typeof md.full_name === "string" && md.full_name) || (typeof md.name === "string" && md.name) || "");
      if (session?.user) {
        void ensureProfileRow(session.user.id, session.user.email, md);
        setShowAuthModal(false);
        if (typeof window !== "undefined" && sessionStorage.getItem("sidequest_open_create") === "1") {
          sessionStorage.removeItem("sidequest_open_create");
          openCreateModal();
        }
        if (event === "SIGNED_IN" && typeof window !== "undefined" && window.location.search.includes("code=")) {
          setStatus("✅ Email confirmed. Welcome!");
        }
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
      setJoinedQuestIds([]);
      return;
    }
    void Promise.all([loadBookmarks(userId), loadMemberships(userId)]);
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
    const q = exactAddress.trim();
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
  }, [exactAddress, countryCode]);

  async function loadQuests() {
    if (!supabase) return;
    setLoading(true);
    let q = supabase.from("quests").select("id,creator_id,title,description,city,skill_level,group_size,availability,hobby_id,join_mode,exact_location_visibility,exact_address,media_video_url,media_source,media_items,hobbies(name),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)").order("created_at", { ascending: false }).limit(50);
    if (hobbyFilter !== "all") q = q.eq("hobby_id", hobbyFilter);
    const firstRes = await q;
    let data: Quest[] | null = firstRes.data as Quest[] | null;
    let error = firstRes.error;

    // Backward compatibility if migration for media_items has not been applied yet
    if (error?.message?.includes("column quests.media_items does not exist")) {
      let fallback = supabase.from("quests").select("id,creator_id,title,description,city,skill_level,group_size,availability,hobby_id,join_mode,exact_location_visibility,exact_address,media_video_url,media_source,hobbies(name),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)").order("created_at", { ascending: false }).limit(50);
      if (hobbyFilter !== "all") fallback = fallback.eq("hobby_id", hobbyFilter);
      const res = await fallback;
      data = res.data as Quest[] | null;
      error = res.error;
    }

    setLoading(false);
    if (error) return setStatus(error.message);
    setQuests(data || []);
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return setStatus("Missing Supabase env vars.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setPendingVerifyEmail(email);
        setResendCooldown(0);
      }
      setStatus(`Login failed: ${error.message}`);
      return;
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

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: fullName, dob, country_code: countryCode, accepted_terms: true, marketing_opt_in: marketingOptIn },
      },
    });
    if (error) return setStatus(error.message);

    setPendingVerifyEmail(email);
    setResendCooldown(60);
    setShowAuthModal(false);
    setStatus("✅ Verification email sent. Please confirm your email.");
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

  async function ensureProfileRow(uid: string, emailValue?: string | null, metadata?: Record<string, unknown> | null) {
    if (!supabase || !uid) return;
    const md = metadata || {};
    const nameFromMeta = (typeof md.full_name === "string" && md.full_name) || (typeof md.name === "string" && md.name) || "";
    const fallbackName = (emailValue || "").split("@")[0] || "SideQuest user";
    await supabase.from("profiles").upsert({
      id: uid,
      display_name: nameFromMeta || fallbackName,
      avatar_url: (typeof md.avatar_url === "string" && md.avatar_url) || null,
    });
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
    setViewerName("");
    setShowPhotoStepModal(false);
    setPhotoStepFile(null);
    if (photoStepPreviewUrl) URL.revokeObjectURL(photoStepPreviewUrl);
    setPhotoStepPreviewUrl("");
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
      if (photoStepPreviewUrl) URL.revokeObjectURL(photoStepPreviewUrl);
      setPhotoStepPreviewUrl("");
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
    if (photoStepPreviewUrl) URL.revokeObjectURL(photoStepPreviewUrl);
    setPhotoStepPreviewUrl("");
    setPhotoStepState("idle");
    setStatus("You can add a profile photo anytime in Settings.");
  }

  async function makePhotoStepCrop(file: File) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Could not load image."));
        i.src = url;
      });

      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare crop.");

      const baseScale = Math.max(size / img.width, size / img.height);
      const finalScale = baseScale * photoStepZoom;
      const drawW = img.width * finalScale;
      const drawH = img.height * finalScale;
      const dx = (size - drawW) / 2 + photoStepOffsetX;
      const dy = (size - drawH) / 2 + photoStepOffsetY;
      ctx.drawImage(img, dx, dy, drawW, drawH);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not export image.");
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function savePhotoStep() {
    if (!supabase || !userId || !photoStepFile) return;
    if (!photoStepFile.type.startsWith("image/")) return setStatus("Please choose an image file.");
    if (photoStepFile.size > 8 * 1024 * 1024) return setStatus("Photo must be under 8MB.");

    setPhotoStepState("uploading");

    let cropped: Blob;
    try {
      cropped = await makePhotoStepCrop(photoStepFile);
    } catch (err) {
      setPhotoStepState("ready");
      return setStatus(err instanceof Error ? err.message : "Could not crop image.");
    }

    const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(filePath, cropped, { upsert: false, contentType: "image/jpeg" });
    if (uploadError) {
      setPhotoStepState("ready");
      return setStatus(`Photo upload failed: ${uploadError.message}`);
    }

    const { data: publicData } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
    let { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      avatar_url: publicData.publicUrl,
      avatar_capture_method: "camera",
      photo_onboarding_done: true,
    });

    if (profileError?.message?.includes("column")) {
      const fallback = await supabase.from("profiles").upsert({ id: userId, avatar_url: publicData.publicUrl });
      profileError = fallback.error;
    }

    if (profileError && !profileError.message.toLowerCase().includes("row-level security")) {
      setPhotoStepState("ready");
      return setStatus(`Could not save photo: ${profileError.message}`);
    }

    await supabase.auth.updateUser({ data: { avatar_url: publicData.publicUrl } });
    setPhotoStepState("idle");
    setPhotoStepFile(null);
    if (photoStepPreviewUrl) URL.revokeObjectURL(photoStepPreviewUrl);
    setPhotoStepPreviewUrl("");
    setShowPhotoStepModal(false);
    setStatus("Profile photo saved ✅");
  }

  function onPhotoStepPointerDown(e: PointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setPhotoStepDragging(true);
    setPhotoStepLastPointer({ x: e.clientX, y: e.clientY });
  }

  function onPhotoStepPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!photoStepDragging || !photoStepLastPointer) return;
    const dx = e.clientX - photoStepLastPointer.x;
    const dy = e.clientY - photoStepLastPointer.y;
    setPhotoStepOffsetX((v) => v + dx);
    setPhotoStepOffsetY((v) => v + dy);
    setPhotoStepLastPointer({ x: e.clientX, y: e.clientY });
  }

  function onPhotoStepPointerUp() {
    setPhotoStepDragging(false);
    setPhotoStepLastPointer(null);
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

  async function uploadQuestMediaFiles(items: Array<{ file: File; label: string }>) {
    if (!supabase || !userId) throw new Error("Not signed in.");
    const uploaded: QuestMediaItem[] = [];

    for (const item of items) {
      const file = item.file;
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) throw new Error("Media must be an image or video file.");
      if (isImage && file.size > 15 * 1024 * 1024) throw new Error("Images must be under 15MB.");
      if (isVideo && file.size > 60 * 1024 * 1024) throw new Error("Videos must be under 60MB.");

      const ext = (file.name.split(".").pop() || (isImage ? "jpg" : "mp4")).toLowerCase();
      const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from("quest-media")
        .upload(filePath, file, { upsert: false, contentType: file.type });
      if (error) throw new Error(error.message);

      const { data } = supabase.storage.from("quest-media").getPublicUrl(filePath);
      uploaded.push({
        url: data.publicUrl,
        type: isImage ? "image" : "video",
        label: item.label.trim() || null,
      });
    }

    return uploaded;
  }

  function resetQuestForm() {
    setTitle("");
    setDescription("");
    setAvailabilityMode("find_best_time");
    setAvailability("");
    setStartAt("");
    setIsRecurring(false);
    setRecurringStartDate("");
    setHobbyId("");
    setCategoryInput("");
    setUseCustomCategory(false);
    setCustomCategory("");
    setExactAddress("");
    setJoinMode("open");
    setExactLocationVisibility("private");
    setSkillLevel("");
    setGroupSizeChoice("");
    setGroupSizeCustom("");
    setQuestVideoFile(null);
    setQuestVideoDurationSec(null);
    setQuestVideoSource("live");
    setQuestMediaFiles([]);
    setExistingMediaItems([]);
    setMediaDraftItems([]);
    setSelectedMediaId(null);
    setRemoveExistingVideo(false);
    setEditingQuestId(null);
  }

  function openCreateModal() {
    resetQuestForm();
    setShowCreateModal(true);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const openAuthFromUrl = async () => {
      const params = new URLSearchParams(window.location.search);
      const pendingAuth = sessionStorage.getItem("sidequest_open_auth") === "1";
      const pendingCreate = sessionStorage.getItem("sidequest_open_create") === "1";

      let activeUserId = userId;
      if (!activeUserId && supabase) {
        const { data } = await supabase.auth.getSession();
        activeUserId = data.session?.user?.id ?? null;
        if (activeUserId) setUserId(activeUserId);
      }

      if ((params.get("auth") === "1" || pendingAuth) && !activeUserId) {
        setShowAuthModal(true);
        setStatus("Please sign in to continue.");
        if (pendingAuth) sessionStorage.removeItem("sidequest_open_auth");
      }

      if (handledCreateParam) return;
      if (params.get("create") !== "1" && !pendingCreate) return;
      if (activeUserId) {
        if (pendingCreate) sessionStorage.removeItem("sidequest_open_create");
        openCreateModal();
        if (typeof window !== "undefined" && params.get("create") === "1") {
          const next = new URL(window.location.href);
          next.searchParams.delete("create");
          window.history.replaceState({}, "", next.pathname + (next.search ? `?${next.searchParams.toString()}` : ""));
        }
      } else {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("sidequest_open_create", "1");
          sessionStorage.setItem("sidequest_open_auth", "1");
        }
        setShowAuthModal(true);
        setStatus("Log in to create.");
      }
      setHandledCreateParam(true);
    };

    void openAuthFromUrl();

    const onOpenAuth = () => {
      if (!userId) {
        setShowAuthModal(true);
        setStatus("Please sign in to continue.");
      }
    };

    const onOpenCreate = () => {
      if (userId) {
        openCreateModal();
      } else {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("sidequest_open_create", "1");
          sessionStorage.setItem("sidequest_open_auth", "1");
        }
        setShowAuthModal(true);
        setStatus("Log in to create.");
      }
    };

    window.addEventListener("sidequest:open-auth", onOpenAuth as EventListener);
    window.addEventListener("sidequest:open-create", onOpenCreate as EventListener);
    window.addEventListener("popstate", openAuthFromUrl);
    return () => {
      window.removeEventListener("sidequest:open-auth", onOpenAuth as EventListener);
      window.removeEventListener("sidequest:open-create", onOpenCreate as EventListener);
      window.removeEventListener("popstate", openAuthFromUrl);
    };
  }, [handledCreateParam, userId]);

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

  function handleQuestMediaPicked(files: FileList | null) {
    if (!files?.length) return;

    const existingImages = mediaDraftItems.filter((m) => m.type === "image").length;
    const existingVideos = mediaDraftItems.filter((m) => m.type === "video").length;

    let imgLeft = Math.max(0, 2 - existingImages);
    let vidLeft = Math.max(0, 2 - existingVideos);

    const added: DraftMediaItem[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/") && imgLeft > 0) {
        added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, label: "", type: "image", source: "new" });
        imgLeft -= 1;
      } else if (file.type.startsWith("video/") && vidLeft > 0) {
        added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, label: "", type: "video", source: "new" });
        vidLeft -= 1;
      }
    }

    if (!added.length) {
      setStatus("Max reached: up to 2 photos and 2 videos per listing.");
      return;
    }

    setMediaDraftItems((prev) => {
      const next = [...prev, ...added];
      if (!selectedMediaId && next.length) setSelectedMediaId(next[0].id);
      return next;
    });
    if (added.length < files.length) setStatus("Only up to 2 photos and 2 videos are allowed.");
  }

  const mediaPreviewUrls = useMemo(() => {
    const map = new Map<string, string>();
    mediaDraftItems.forEach((item) => {
      if (item.url) map.set(item.id, item.url);
      else if (item.file) map.set(item.id, URL.createObjectURL(item.file));
    });
    return map;
  }, [mediaDraftItems]);

  useEffect(() => {
    return () => {
      mediaDraftItems.forEach((item) => {
        if (item.file) {
          const url = mediaPreviewUrls.get(item.id);
          if (url) URL.revokeObjectURL(url);
        }
      });
    };
  }, [mediaDraftItems, mediaPreviewUrls]);

  const selectedMediaItem = mediaDraftItems.find((m) => m.id === selectedMediaId) || null;

  function openEditModal(q: Quest) {
    setEditingQuestId(q.id);
    setTitle(q.title || "");
    setDescription(q.description || "");
    setHobbyId(q.hobby_id);
    const hobby = hobbies.find((h) => h.id === q.hobby_id);
    setCategoryInput(hobby?.name || "");
    setCity(q.city || "");
    setExactAddress(q.exact_address || "");
    setJoinMode(q.join_mode || "open");
    setExactLocationVisibility(q.exact_location_visibility || "private");
    setAvailabilityMode("find_best_time");
    setAvailability(q.availability || "");
    setStartAt("");
    setIsRecurring(false);
    setRecurringStartDate("");
    setSkillLevel(q.skill_level || "");
    if (!q.group_size || q.group_size <= 0) {
      setGroupSizeChoice("any");
      setGroupSizeCustom("");
    } else if (GROUP_SIZE_OPTIONS.includes(String(q.group_size))) {
      setGroupSizeChoice(String(q.group_size));
      setGroupSizeCustom("");
    } else {
      setGroupSizeChoice("custom");
      setGroupSizeCustom(String(q.group_size));
    }
    setQuestVideoFile(null);
    setQuestVideoSource((q.media_source as "live" | "upload") || "upload");
    setQuestMediaFiles([]);
    const legacyVideo = q.media_video_url ? [{ id: `legacy-video-${q.id}`, type: "video" as const, label: "", source: "existing" as const, url: q.media_video_url }] : [];
    const existingItems = (q.media_items || []).map((m, i) => ({ id: `existing-${q.id}-${i}`, type: m.type, label: m.label || "", source: "existing" as const, url: m.url }));
    const draftItems = [...legacyVideo, ...existingItems];
    setMediaDraftItems(draftItems);
    setSelectedMediaId(draftItems[0]?.id || null);
    setExistingMediaItems(q.media_items || []);
    setRemoveExistingVideo(false);
    setShowCreateModal(true);
  }

  function deriveCityFromLocation(input: string) {
    const parts = input.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return "";

    const country = parts[parts.length - 1] || "";
    const postal = [...parts].reverse().find((p) => /\d{4,}/.test(p)) || "";

    const city = parts.find((p, i) => {
      if (i === 0 || i >= parts.length - 1) return false;
      if (!/[A-Za-z]/.test(p)) return false;
      if (/county/i.test(p)) return false;
      if (/(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|court|ct\.?|place|pl\.?|trail|trl\.?|circle|cir\.?)/i.test(p)) return false;
      return true;
    }) || "";

    const summary = [city, postal, country].filter(Boolean).join(", ");
    return summary || parts[0];
  }

  async function createQuest(e: FormEvent) {

    e.preventDefault();
    if (!supabase) return;
    let activeUserId = userId;
    if (!activeUserId) {
      const { data } = await supabase.auth.getSession();
      activeUserId = data.session?.user?.id ?? null;
      if (activeUserId) setUserId(activeUserId);
    }
    if (!activeUserId) {
      setShowAuthModal(true);
      return setStatus("Log in to create.");
    }
    if (Date.now() - lastQuestCreateMs < 15000) return setStatus("Please wait a bit before posting another listing.");

    const { count: recentQuestCount } = await supabase
      .from("quests")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", activeUserId)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if ((recentQuestCount || 0) >= 5 && !editingQuestId) return setStatus("Rate limit: max 5 new listings per hour.");

    const selectedGroupSize = groupSizeChoice === "custom" ? Number(groupSizeCustom) : (groupSizeChoice === "any" ? 0 : Number(groupSizeChoice));

    if (!title.trim()) return setStatus("Title is required.");
    if (!exactAddress.trim()) return setStatus("Location is required.");
    if (!useCustomCategory && !categoryInput.trim()) return setStatus("Category is required.");
    if (useCustomCategory && !customCategory.trim()) return setStatus("Please enter your custom category suggestion.");
    if (!groupSizeChoice) return setStatus("Group size is required.");
    if (groupSizeChoice === "custom" && (!Number.isFinite(selectedGroupSize) || selectedGroupSize < 2 || selectedGroupSize > 50)) {
      return setStatus("Custom group size must be between 2 and 50.");
    }
    if (availabilityMode === "specific_time" && !startAt) return setStatus("Pick a specific start time.");
    if (isRecurring && !recurringStartDate) return setStatus("Pick a recurring start date.");

    const derivedCity = deriveCityFromLocation(exactAddress) || city;
    const availabilityParts = [
      availabilityMode === "specific_time" ? `Start at: ${new Date(startAt).toLocaleString()}` : "Let’s find the best time",
      isRecurring ? `Recurring from ${recurringStartDate}` : null,
      availability.trim() ? `Notes: ${availability.trim()}` : null,
    ].filter(Boolean);
    const avail = availabilityParts.join(" · ");

    // Ensure profile row exists (required by quests.creator_id FK)
    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: activeUserId,
      display_name: fullName || userEmail.split("@")[0] || "SideQuest user",
      city: derivedCity,
      availability: avail,
      skill_level: skillLevel,
    });
    if (profileErr) return setStatus(`Profile setup failed: ${profileErr.message}`);

    let finalHobbyId = hobbyId;
    if (!finalHobbyId && categoryInput.trim()) {
      const picked = categoryOptions.find((o) => o.name.toLowerCase() === categoryInput.trim().toLowerCase());
      if (picked?.id) finalHobbyId = picked.id;
    }

    const suggestedFromDropdown = finalHobbyId.startsWith("suggestion:") ? finalHobbyId.replace("suggestion:", "").trim() : "";

    if (suggestedFromDropdown) {
      const { data: existingSuggested } = await supabase
        .from("hobbies")
        .select("id,name")
        .ilike("name", suggestedFromDropdown)
        .limit(1)
        .maybeSingle();
      if (existingSuggested?.id) {
        finalHobbyId = existingSuggested.id;
      } else {
        const { data: createdSuggested, error: createSuggestedErr } = await supabase
          .from("hobbies")
          .insert({ slug: slugify(suggestedFromDropdown), name: suggestedFromDropdown, category: "Custom" })
          .select("id")
          .single();
        if (!createSuggestedErr && createdSuggested?.id) finalHobbyId = createdSuggested.id;
        else finalHobbyId = "";
      }
    }

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

    if (!finalHobbyId) return setStatus("Please select a category or use a custom category suggestion.");

    const finalDescription = useCustomCategory && customCategory.trim() && finalHobbyId === hobbyId
      ? `[Custom category suggestion: ${customCategory.trim()}]
${description}`
      : description;

    setSavingQuest(true);
    setStatus(editingQuestId ? "Updating listing…" : "Posting listing…");
    try {
      const newDraftItems = mediaDraftItems.filter((m) => m.source === "new" && m.file);
      const uploadedMedia = newDraftItems.length
        ? await uploadQuestMediaFiles(newDraftItems.map((m) => ({ file: m.file as File, label: m.label })))
        : [];

      let uploadIdx = 0;
      const nextMediaItems: QuestMediaItem[] = mediaDraftItems
        .map((m) => {
          if (m.source === "existing" && m.url) return { url: m.url, type: m.type, label: m.label || null };
          const uploaded = uploadedMedia[uploadIdx++];
          return uploaded || null;
        })
        .filter((m): m is QuestMediaItem => !!m);

      if (editingQuestId) {
        const payload: Record<string, unknown> = {
          hobby_id: finalHobbyId,
          title,
          description: finalDescription,
          city: derivedCity,
          exact_address: exactAddress || null,
          join_mode: joinMode,
          exact_location_visibility: exactLocationVisibility,
          skill_level: skillLevel,
          availability: avail,
          group_size: selectedGroupSize,
          media_items: nextMediaItems,
          media_video_url: null,
          media_source: null,
        };

        const { error } = await supabase
          .from("quests")
          .update(payload)
          .eq("id", editingQuestId)
          .eq("creator_id", activeUserId);
        if (error) throw new Error(error.message);

        setStatus("Listing updated ✅");
        setLastQuestCreateMs(Date.now());
      } else {
        const { data, error } = await supabase.from("quests").insert({ creator_id: activeUserId, hobby_id: finalHobbyId, title, description: finalDescription, city: derivedCity, exact_address: exactAddress || null, join_mode: joinMode, exact_location_visibility: exactLocationVisibility, skill_level: skillLevel, availability: avail, group_size: selectedGroupSize, media_video_url: null, media_source: null, media_items: nextMediaItems }).select("id").single();
        if (error) throw new Error(error.message);
        if (data?.id) await supabase.from("quest_members").insert({ quest_id: data.id, user_id: activeUserId, role: "creator" });
        setStatus("Quest posted ✅");
        setLastQuestCreateMs(Date.now());
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
    if (error) {
      if (error.message.includes("quest_bookmarks")) {
        setBookmarkedQuestIds([]);
        return;
      }
      return;
    }
    setBookmarkedQuestIds(((data as Bookmark[]) || []).map((b) => b.quest_id));
  }

  async function loadMemberships(uid: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("quest_members").select("quest_id,status").eq("user_id", uid);
    if (error) return;
    const rows = (data as Membership[]) || [];
    setJoinedQuestIds(rows.filter((m) => (m.status || "approved") === "approved").map((m) => m.quest_id));
    setMembershipStatusByQuest(Object.fromEntries(rows.map((m) => [m.quest_id, (m.status || "approved") as "pending" | "approved" | "declined"])));
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
    if (error?.message.includes("quest_bookmarks")) return setStatus("Bookmarks not set up yet. Run the bookmarks SQL migration.");
    if (error && !error.message.includes("duplicate")) return setStatus(error.message);
    setBookmarkedQuestIds((prev) => [...prev, questId]);
    setStatus("Saved listing ✅");
  }

  function askQuestion(quest: Quest) {
    if (!supabase || !userId) {
      setShowAuthModal(true);
      setStatus("Log in to message listing owners.");
      return;
    }
    if (userId === quest.creator_id) {
      setStatus("You can’t ask a question on your own listing.");
      return;
    }

    setQuestionTarget(quest);
    setQuestionMode("public");
    setQuestionText("");
    setShowQuestionModal(true);
  }

  async function sendQuestionFromModal() {
    if (!supabase || !userId || !questionTarget) return;
    if (sendingQuestion) return;
    if (Date.now() - lastQuestionMs < 3000) return setStatus("Slow down a sec before sending again.");
    const trimmed = questionText.trim();
    if (!trimmed) return setStatus("Please enter your question.");
    if (trimmed.length > 500) return setStatus("Question is too long (max 500 chars).");

    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", userId)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if ((count || 0) >= 6) return setStatus("Rate limit: please wait a minute before sending more messages.");

    setSendingQuestion(true);
    const prefix = questionMode === "private"
      ? `[PRIVATE to=${questionTarget.creator_id}] `
      : "[PUBLIC] ";
    const { error } = await supabase.from("messages").insert({
      quest_id: questionTarget.id,
      sender_id: userId,
      body: `${prefix}${trimmed}`,
    });
    setSendingQuestion(false);
    if (error) return setStatus(error.message);

    setShowQuestionModal(false);
    setQuestionTarget(null);
    setQuestionText("");
    setLastQuestionMs(Date.now());
    setStatus(`${questionMode === "private" ? "Private" : "Public"} question sent ✅ Check Inbox for replies.`);
  }

  function getCreatorProfile(q: Quest) {
    if (!q.profiles) return null;
    return Array.isArray(q.profiles) ? (q.profiles[0] ?? null) : q.profiles;
  }

  async function deleteQuest(id: string) {
    if (!supabase || !userId) return;
    const ok = window.confirm("Delete this listing? This cannot be undone.");
    if (!ok) return;

    const { error } = await supabase.from("quests").delete().eq("id", id).eq("creator_id", userId);
    if (error) return setStatus(error.message);
    if (editingQuestId === id) {
      setShowCreateModal(false);
      resetQuestForm();
    }
    setStatus("Listing deleted 🗑️");
    await loadQuests();
  }

  async function toggleJoinQuest(id: string) {
    if (!supabase || !userId) {
      setShowAuthModal(true);
      return setStatus("Log in to join.");
    }

    const quest = quests.find((q) => q.id === id);
    if (quest && quest.creator_id === userId) {
      return setStatus("You can’t join your own listing.");
    }

    const membershipStatus = membershipStatusByQuest[id];
    const hasJoined = membershipStatus === "approved";
    const hasPending = membershipStatus === "pending";

    if (hasJoined || hasPending) {
      const { error } = await supabase
        .from("quest_members")
        .delete()
        .eq("quest_id", id)
        .eq("user_id", userId);
      if (error) return setStatus(error.message);

      await supabase
        .from("quest_exact_location_access")
        .delete()
        .eq("quest_id", id)
        .eq("user_id", userId);

      await loadMemberships(userId);
      setStatus(hasPending ? "Join request canceled." : "Left quest.");
      return;
    }

    const nextStatus = (quest?.join_mode || "open") === "approval_required" ? "pending" : "approved";
    const existingStatus = membershipStatusByQuest[id];
    if (existingStatus === "declined") {
      const { error: delErr } = await supabase
        .from("quest_members")
        .delete()
        .eq("quest_id", id)
        .eq("user_id", userId);
      if (delErr) return setStatus(delErr.message);
    }
    {
      const { error } = await supabase.from("quest_members").insert({ quest_id: id, user_id: userId, role: "member", status: nextStatus });
      if (error && !error.message.includes("duplicate") && !error.message.toLowerCase().includes("unique")) return setStatus(error.message);
    }
    await loadMemberships(userId);
    setStatus(nextStatus === "pending" ? "Join request sent ⏳" : "Joined quest ✅");
  }

  const filteredQuests = useMemo(() => {
    if (!showSavedOnly) return quests;
    return quests.filter((q) => bookmarkedQuestIds.includes(q.id));
  }, [quests, showSavedOnly, bookmarkedQuestIds]);

  const surprisePick = useMemo(() => (filteredQuests.length ? filteredQuests[Math.floor(Math.random() * filteredQuests.length)] : null), [filteredQuests]);
  const editingQuest = useMemo(() => quests.find((q) => q.id === editingQuestId) || null, [quests, editingQuestId]);

  return (
    <main className="min-h-screen bg-[#f6f7fb]">
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {!!pendingVerifyEmail && (
          <div className="text-sm rounded bg-emerald-50 border p-2">Email sent to <b>{pendingVerifyEmail}</b>. <button className="underline" disabled={resendCooldown > 0} onClick={() => void resendVerification()}>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend"}</button></div>
        )}
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
            <strong>Surprise me:</strong> {surprisePick ? <><span>{surprisePick.title} ({surprisePick.hobbies?.[0]?.name || "Hobby"})</span>{userId !== surprisePick.creator_id && <button className="ml-3 border rounded px-2 py-1" onClick={() => void toggleJoinQuest(surprisePick.id)}>{membershipStatusByQuest[surprisePick.id] === "pending" ? "Cancel request" : (membershipStatusByQuest[surprisePick.id] === "declined" ? "Request again" : (joinedQuestIds.includes(surprisePick.id) ? "Leave" : ((surprisePick.join_mode || "open") === "approval_required" ? "Request to join" : "Join")))}</button>}</> : "No quests yet"}
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
                  {(q.media_video_url || q.media_items?.length) ? (
                    <div
                      className="w-full overflow-x-auto overscroll-x-contain pb-1 snap-x snap-mandatory [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
                      style={{ touchAction: "pan-x" }}
                    >
                      <div className="flex gap-2 pr-10 min-w-0">
                        {q.media_video_url ? (
                          <div className="relative rounded-lg border p-2 bg-gray-50 shrink-0 snap-start basis-[78%] sm:basis-56">
                            <video className="w-full h-28 rounded bg-black object-cover" src={q.media_video_url} controls muted playsInline preload="metadata" />
                            {q.media_source === "live" && <span className="absolute top-3 left-3 text-xs bg-emerald-600 text-white px-2 py-1 rounded-full">Live video</span>}
                          </div>
                        ) : null}

                        {q.media_items?.map((m, i) => (
                          <div key={`${m.url}-${i}`} className="rounded-lg border p-2 bg-gray-50 shrink-0 snap-start basis-[78%] sm:basis-56">
                            <button
                              type="button"
                              className="block w-full"
                              onClick={() => setExpandedMedia({ items: q.media_items || [], index: i })}
                            >
                              {m.type === "image" ? (
                                <img src={m.url} alt={m.label || "Listing image"} className="w-full h-28 object-cover rounded" />
                              ) : (
                                <video src={m.url} className="w-full h-28 object-cover rounded bg-black" preload="metadata" muted playsInline />
                              )}
                            </button>
                            {m.label && <p className="text-[11px] mt-1 text-gray-600 truncate">{m.label}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-lg">
                        <Link href={`/listing/${q.id}`} className="underline decoration-2 underline-offset-2" title="Open listing">
                          {q.title} <span className="text-sm text-gray-500">↗ View listing</span>
                        </Link>
                      </h3>
                      <p className="text-xs text-gray-500">{q.hobbies?.[0]?.name || "Hobby"} · {(q.skill_level || "all levels")} · group {q.group_size > 0 ? q.group_size : "any"}</p>
                      <p className="text-sm mt-2">{q.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{q.city || deriveCityFromLocation(q.exact_address || "") || "city tbd"} · {q.availability || "availability tbd"}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {userId !== q.creator_id && (
                        <>
                          <button className="border rounded px-3 py-2" onClick={() => void toggleJoinQuest(q.id)}>{membershipStatusByQuest[q.id] === "pending" ? "Cancel request" : (membershipStatusByQuest[q.id] === "declined" ? "Request again" : (joinedQuestIds.includes(q.id) ? "Leave" : ((q.join_mode || "open") === "approval_required" ? "Request to join" : "Join")))}</button>
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
            {status && <div className="text-sm rounded border bg-amber-100 text-amber-950 border-amber-300 px-3 py-2">{status}</div>}

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
                setPhotoStepZoom(1.2);
                setPhotoStepOffsetX(0);
                setPhotoStepOffsetY(0);
                if (photoStepPreviewUrl) URL.revokeObjectURL(photoStepPreviewUrl);
                setPhotoStepPreviewUrl(file ? URL.createObjectURL(file) : "");
                setPhotoStepState(file ? "ready" : "idle");
              }}
            />
            {photoStepPreviewUrl && (
              <div className="rounded-lg border bg-white p-2 space-y-2">
                <p className="text-xs text-gray-600">Drag photo with your finger to position it</p>
                <div
                  className="h-44 w-44 rounded-full overflow-hidden border mx-auto bg-black/5 touch-none"
                  onPointerDown={onPhotoStepPointerDown}
                  onPointerMove={onPhotoStepPointerMove}
                  onPointerUp={onPhotoStepPointerUp}
                  onPointerCancel={onPhotoStepPointerUp}
                >
                  <img
                    src={photoStepPreviewUrl}
                    alt="Preview"
                    className="h-full w-full object-cover"
                    draggable={false}
                    style={{ transform: `translate(${photoStepOffsetX}px, ${photoStepOffsetY}px) scale(${photoStepZoom})` }}
                  />
                </div>
                <label className="text-xs">Zoom</label>
                <input type="range" min={1} max={3} step={0.05} value={photoStepZoom} onChange={(e) => setPhotoStepZoom(Number(e.target.value))} />
              </div>
            )}
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
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white border p-4 space-y-3 max-h-[92vh] overflow-y-auto my-auto">
            <div className="flex justify-between items-center"><h3 className="font-semibold">{editingQuestId ? "Edit Listing" : "Create Quest"}</h3><button disabled={savingQuest} onClick={() => { setShowCreateModal(false); resetQuestForm(); }} className="border rounded px-2 py-1 disabled:opacity-50">Close</button></div>
            <form onSubmit={createQuest} className="grid gap-2">
              <label className="text-sm font-medium">Title *</label>
              <input className="border rounded px-3 py-2" placeholder={titlePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} required />

              <label className="text-sm font-medium">Category *</label>
              <div className="space-y-2">
                <input
                  list="category-list"
                  className={`border rounded px-3 py-2 w-full transition ${useCustomCategory ? "opacity-50 blur-[1px] pointer-events-none" : ""}`}
                  value={categoryInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCategoryInput(value);
                    const matched = categoryOptions.find((o) => o.name.toLowerCase() === value.trim().toLowerCase());
                    setHobbyId(matched?.id || "");
                  }}
                  placeholder="Select category"
                  disabled={useCustomCategory}
                />
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

              <label className="text-sm font-medium">Description</label>
              <textarea className="border rounded px-3 py-2" placeholder="What are you trying to do?" value={description} onChange={(e) => setDescription(e.target.value)} />

              <label className="text-sm font-medium">Skill level</label>
              <select className="border rounded px-3 py-2" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
                <option value="">Select skill level...</option>
                <option value="beginner">Beginner</option>
                <option value="returning">Returning</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>

              <label className="text-sm font-medium">Availability (optional)</label>
              <div className="grid gap-2 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={availabilityMode === "specific_time"} onChange={() => setAvailabilityMode("specific_time")} /> Start at a specific time</label>
                <label className="flex items-center gap-2"><input type="radio" checked={availabilityMode === "find_best_time"} onChange={() => setAvailabilityMode("find_best_time")} /> Let’s see which time works best</label>
              </div>
              {availabilityMode === "specific_time" && (
                <input type="datetime-local" className="border rounded px-3 py-2" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} /> Recurring
              </label>
              {isRecurring && (
                <input type="date" className="border rounded px-3 py-2" value={recurringStartDate} onChange={(e) => setRecurringStartDate(e.target.value)} />
              )}
              <input className="border rounded px-3 py-2" placeholder="Optional availability notes" value={availability} onChange={(e) => setAvailability(e.target.value)} />

              <label className="text-sm font-medium">Group size *</label>
              <select className="border rounded px-3 py-2" value={groupSizeChoice} onChange={(e) => setGroupSizeChoice(e.target.value)} required>
                <option value="">Select group size...</option>
                {GROUP_SIZE_OPTIONS.map((v) => <option key={v} value={v}>{v === "any" ? "Any" : v}</option>)}
                <option value="custom">Custom number...</option>
              </select>
              {groupSizeChoice === "custom" && (
                <input type="number" min={2} max={50} className="border rounded px-3 py-2" value={groupSizeCustom} onChange={(e) => setGroupSizeCustom(e.target.value)} placeholder="Enter custom group size" />
              )}

              <label className="text-sm font-medium">Join mode</label>
              <select className="border rounded px-3 py-2" value={joinMode} onChange={(e) => setJoinMode(e.target.value as "open" | "approval_required")}>
                <option value="open">Anyone can join instantly</option>
                <option value="approval_required">Host must approve members</option>
              </select>

              <label className="text-sm font-medium">Location visibility</label>
              <select className="border rounded px-3 py-2" value={exactLocationVisibility} onChange={(e) => setExactLocationVisibility(e.target.value as "private" | "public" | "approved_members")}>
                <option value="private">Private (manual share)</option>
                <option value="approved_members">Auto-share with approved members</option>
                <option value="public">Public (everyone)</option>
              </select>

              <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
                <div className="grid gap-1">
                  <label className="text-sm font-medium">Country</label>
                  <input list="country-list" className="border rounded px-3 py-2" value={countryQuery} onChange={(e) => { setCountryQuery(e.target.value); setCountryCode(resolveCountryCodeByName(e.target.value)); }} placeholder="Start typing country..." />
                </div>
                <div className="grid gap-1">
                  <label className="text-sm font-medium">Location *</label>
                  <div className="relative">
                    <input className="border rounded px-3 py-2 w-full" placeholder="Address or location (city is okay too)" value={exactAddress} onChange={(e) => setExactAddress(e.target.value)} required />
                    {citySuggestions.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-1 border rounded bg-white shadow max-h-44 overflow-auto text-sm">
                        {citySuggestions.map((c) => (
                          <button key={c} type="button" className="block w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { setExactAddress(c); setCitySuggestions([]); }}>
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <label className="text-sm font-medium">Media (photos + videos)</label>
              <div className="grid gap-3 rounded-xl border p-3 bg-gray-50">
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(e) => {
                    handleQuestMediaPicked(e.target.files);
                    e.currentTarget.value = "";
                  }}
                  className="border rounded px-3 py-2"
                />
                <p className="text-xs text-gray-500">Drag thumbnails to reorder. First item is Main. Tap an item to edit its caption below.</p>

                <div className="grid grid-cols-3 gap-2">
                  {mediaDraftItems.map((item, idx) => {
                    const previewUrl = mediaPreviewUrls.get(item.id) || "";
                    return (
                      <button
                        key={item.id}
                        type="button"
                        draggable
                        onClick={() => setSelectedMediaId(item.id)}
                        onDragStart={() => setDragMediaId(item.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (!dragMediaId || dragMediaId === item.id) return;
                          setMediaDraftItems((prev) => {
                            const from = prev.findIndex((m) => m.id === dragMediaId);
                            const to = prev.findIndex((m) => m.id === item.id);
                            if (from < 0 || to < 0) return prev;
                            const next = [...prev];
                            const [moved] = next.splice(from, 1);
                            next.splice(to, 0, moved);
                            return next;
                          });
                          setDragMediaId(null);
                        }}
                        className={`relative aspect-square overflow-hidden rounded-xl border bg-white ${selectedMediaId === item.id ? "ring-2 ring-blue-500" : ""}`}
                      >
                        {item.type === "image" ? (
                          <img src={previewUrl} alt={item.label || "Media preview"} className="h-full w-full object-cover" />
                        ) : (
                          <video src={previewUrl} className="h-full w-full object-cover bg-black" muted playsInline preload="metadata" />
                        )}
                        {idx === 0 && <span className="absolute left-1.5 top-1.5 px-1.5 py-0.5 rounded bg-black text-white text-[10px]">Main</span>}
                        <span className="absolute right-1.5 bottom-1.5 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white">{item.type === "image" ? "Photo" : "Video"}</span>
                        <span
                          className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-white border flex items-center justify-center text-sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMediaDraftItems((prev) => prev.filter((m) => m.id !== item.id));
                            if (selectedMediaId === item.id) {
                              const remaining = mediaDraftItems.filter((m) => m.id !== item.id);
                              setSelectedMediaId(remaining[0]?.id || null);
                            }
                          }}
                        >
                          ×
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedMediaItem ? (
                  <div className="rounded border bg-white p-2 grid gap-2">
                    <div className="text-xs text-gray-600">Caption for selected {selectedMediaItem.type === "image" ? "photo" : "video"}</div>
                    <input
                      className="border rounded px-2 py-1 text-sm"
                      placeholder={`e.g., ${MEDIA_LABEL_HINTS[0]}`}
                      value={selectedMediaItem.label}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMediaDraftItems((prev) => prev.map((m) => m.id === selectedMediaItem.id ? { ...m, label: value } : m));
                      }}
                    />
                  </div>
                ) : null}
              </div>

              {savingQuest && <div className="text-sm rounded border bg-blue-50 px-3 py-2">Working on it… uploading media and saving listing.</div>}
              <div className="flex gap-2 flex-wrap">
                <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={savingQuest}>{savingQuest ? "Saving..." : (editingQuestId ? "Save changes" : "Post quest")}</button>
                {editingQuestId && (
                  <button type="button" className="border border-red-300 text-red-700 rounded px-3 py-2" onClick={() => void deleteQuest(editingQuestId)}>
                    Delete listing
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {expandedMedia && expandedMedia.items.length > 0 && (
        <div
          className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setExpandedMedia(null)}
          onTouchStart={(e) => setMediaTouchStartX(e.changedTouches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const endX = e.changedTouches[0]?.clientX;
            if (mediaTouchStartX === null || endX === undefined) return;
            const delta = endX - mediaTouchStartX;
            if (Math.abs(delta) < 40) return;
            setExpandedMedia((s) => {
              if (!s) return s;
              const len = s.items.length;
              return { ...s, index: delta < 0 ? (s.index + 1) % len : (s.index - 1 + len) % len };
            });
          }}
        >
          {expandedMedia.items[expandedMedia.index]?.type === "image" ? (
            <img src={expandedMedia.items[expandedMedia.index].url} alt={expandedMedia.items[expandedMedia.index].label || "Expanded media"} className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          ) : (
            <video src={expandedMedia.items[expandedMedia.index].url} controls autoPlay className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain bg-black" onClick={(e) => e.stopPropagation()} />
          )}
          <button type="button" className="absolute top-4 right-4 border rounded px-3 py-2 bg-white" onClick={() => setExpandedMedia(null)}>Close</button>
          <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 border rounded-full h-10 w-10 bg-white" onClick={(e) => { e.stopPropagation(); setExpandedMedia((s) => (!s ? s : { ...s, index: (s.index - 1 + s.items.length) % s.items.length })); }}>‹</button>
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 border rounded-full h-10 w-10 bg-white" onClick={(e) => { e.stopPropagation(); setExpandedMedia((s) => (!s ? s : { ...s, index: (s.index + 1) % s.items.length })); }}>›</button>
        </div>
      )}

      {showQuestionModal && questionTarget && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Ask question</h3>
              <button className="border rounded px-2 py-1" onClick={() => setShowQuestionModal(false)}>Close</button>
            </div>
            <p className="text-sm text-gray-600">About: <b>{questionTarget.title}</b></p>
            <div className="flex gap-2">
              <button type="button" className={`border rounded px-3 py-2 ${questionMode === "public" ? "bg-black text-white" : ""}`} onClick={() => setQuestionMode("public")}>Public</button>
              <button type="button" className={`border rounded px-3 py-2 ${questionMode === "private" ? "bg-black text-white" : ""}`} onClick={() => setQuestionMode("private")}>Private</button>
            </div>
            <p className="text-xs text-gray-600">Please keep questions general and avoid sharing personal information.</p>
            <textarea className="border rounded px-3 py-2 w-full" placeholder="Type your question..." value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
            <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={sendingQuestion || !questionText.trim()} onClick={() => void sendQuestionFromModal()}>{sendingQuestion ? "Sending..." : "Send"}</button>
          </div>
        </div>
      )}

      <datalist id="country-list">{countryOptions.map((c) => <option key={c.code} value={c.name} />)}</datalist>
      <datalist id="category-list">{categoryOptions.map((c) => <option key={c.id} value={c.name} />)}</datalist>

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
