"use client";

import Link from "next/link";
import { FormEvent, PointerEvent, UIEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CityAutocompleteInput from "@/components/city-autocomplete-input";
import QuestMap from "@/components/quest-map";
import { getSupabaseClient } from "@/lib/supabase";
import { CANONICAL_CATEGORIES, resolveCanonicalCategory, suggestCanonicalCategories } from "@/lib/category-suggestions.js";
import { getCategoryFallbackMedia } from "@/lib/category-default-media";
import { readStoredUserLocation, writeStoredUserLocation } from "@/lib/location-distance";
import { isImageLikeFile, prepareImageForUpload } from "@/lib/media-optimize";
import { compressVideoForUpload } from "@/lib/video-optimize";
import { collectQuestStorageUrls, removeStoragePublicUrls } from "@/lib/storage.js";
import { APP_EVENT_NAMES, APP_NAME } from "@/lib/app-brand";
import { AppIcon } from "@/components/app-icons";
import { formatReportReference } from "@/lib/reporting";

type Hobby = { id: string; name: string; category: string | null };
type QuestMediaItem = {
  url: string;
  type: "image" | "video";
  label?: string | null;
  thumbnailUrl?: string | null;
};

type DraftMediaItem = {
  id: string;
  type: "image" | "video";
  label: string;
  source: "existing" | "new";
  url?: string;
  file?: File;
  thumbnailUrl?: string | null;
};

type Quest = {
  id: string;
  creator_id: string;
  created_at?: string | null;
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
  hobbies?: { name: string | null; category: string | null }[] | { name: string | null; category: string | null } | null;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | { id: string; display_name: string | null; avatar_url: string | null } | null;
};

function getQuestHobby(q?: { hobbies?: { name?: string | null; category?: string | null }[] | { name?: string | null; category?: string | null } | null }) {
  if (!q?.hobbies) return null;
  return Array.isArray(q.hobbies) ? (q.hobbies[0] ?? null) : q.hobbies;
}

function getQuestCategoryLabel(q?: { hobbies?: { category: string | null }[] | { category: string | null } | null }) {
  const category = getQuestHobby(q)?.category?.trim();
  return category || "Category";
}

function getQuestCategoryDisplay(q?: { hobbies?: { name?: string | null; category?: string | null }[] | { name?: string | null; category?: string | null } | null; title?: string | null }) {
  const hobby = getQuestHobby(q);
  const raw = hobby?.category?.trim() || hobby?.name?.trim() || q?.title || "";
  const canonical = resolveCanonicalCategory(raw);
  if (canonical) return canonical;
  if (raw && !/^category$/i.test(raw) && !/^hobby$/i.test(raw)) return raw;
  return "Category";
}

type AuthMode = "login" | "signup";
type ProfilePhotoStep = "idle" | "ready" | "uploading";
type Bookmark = { quest_id: string };
type Membership = { quest_id: string; status?: "pending" | "approved" | "declined" };
type OnboardingHobby = { hobby_id: string; is_primary?: boolean | null };

type CreateSelectOption = { value: string; label: string };

function CreateSelect({ value, options, placeholder, onChange, searchable = false, invalid = false }: {
  value: string;
  options: CreateSelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  searchable?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = searchable && query.trim()
    ? options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className="create-select relative">
      <button
        type="button"
        className={`create-select-trigger w-full ${invalid ? "is-invalid" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? "" : "create-select-placeholder"}>{selected?.label || placeholder}</span>
        <AppIcon name="chevronDown" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="create-select-menu" role="listbox">
          {searchable ? (
            <div className="create-select-search-wrap">
              <input autoFocus className="create-select-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
            </div>
          ) : null}
          <div className="create-select-options">
            {filtered.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                className={`create-select-option ${option.value === value ? "selected" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span>{option.label}</span>
                {option.value === value ? <AppIcon name="check" className="h-4 w-4" /> : null}
              </button>
            ))}
            {!filtered.length ? <p className="px-3 py-4 text-sm text-gray-500">No matches</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const TITLE_SUGGESTIONS = [
  "Beginner tennis buddy this weekend",
  "After-work climbing crew",
  "Saturday table tennis group",
  "Pickleball for total beginners",
  "Morning run partners (3x/week)",
];
const TITLE_SUGGESTIONS_BY_CATEGORY: Record<string, string[]> = {
  sports: [
    "Pick a sports buddy and get reps in",
    "Weekend game plan: play, practice, repeat",
    "Join a casual sports crew this week",
  ],
  "indoor games": [
    "Table time with a regular crew",
    "Casual game night with accountability",
    "Find your next indoor game partner",
  ],
  community: [
    "Find a community event partner",
    "Volunteer together this weekend",
    "Join the neighborhood effort and follow through",
  ],
  build: [
    "Lock in and ship your MVP in 14 days",
    "Build in public: validate your idea this week",
    "Find a co-builder and execute",
  ],
  learn: [
    "Lock in for a focused study sprint",
    "Learn SQL with an accountability buddy",
    "Daily learning streak — no zero days",
  ],
  career: [
    "Lock in on interview prep this weekend",
    "Resume glow-up + job hunt execution",
    "LinkedIn outreach sprint with accountability",
  ],
  "healthy lifestyle": [
    "Lock in with a gym buddy",
    "Cardio accountability crew (3x/week)",
    "Healthy habits reset: sleep, food, movement",
  ],
  running: [
    "Morning run partners (3x/week)",
    "Easy pace run crew",
    "5K training accountability",
  ],
  outdoors: [
    "Lock in for a sunrise hike",
    "Beginner-friendly trail day",
    "Weekend adventure squad",
  ],
  social: [
    "Meet new people and actually follow through",
    "Communication skills practice circle",
    "Community hang + good vibes only",
  ],
  money: [
    "Lock in and execute a money plan",
    "Budget reset sprint for this month",
    "Side hustle ideas to action",
  ],
  creative: [
    "Write for 30 minutes daily",
    "Photo walk + editing session",
    "Co-create content this weekend",
  ],
  "arts & crafts": [
    "Saturday painting + coffee session",
    "DIY craft night with accountability",
    "Lock in and finish your art piece",
  ],
  "book club": [
    "Monthly book club with real follow-through",
    "Reading circle + discussion night",
    "Finish the book and show up",
  ],
  sewing: [
    "Sewing session with accountability",
    "Finish that hem, patch, or project",
    "Creative sewing night with momentum",
  ],
  "music / producer": [
    "Producer lock-in session tonight",
    "Beat-making sprint and feedback",
    "Finish one track this week",
  ],
  fishing: [
    "Early morning fishing trip",
    "Cast off and keep the streak going",
    "Weekend shoreline session",
  ],
  lifestyle: [
    "Build a better morning routine",
    "Declutter sprint + reset",
    "Weekly productivity planning",
  ],
  wildcard: [
    "Something different: let's explore it",
    "My custom challenge starts now",
    "Open idea lab — bring your wildcards",
  ],
};
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
  "Fishing",
];
const GROUP_SIZE_OPTIONS = ["any", "2", "3", "4", "5", "6", "8", "10", "12"];
const REPORT_REASONS: Record<"listing_content" | "chat_behavior" | "profile_account" | "in_person", Array<{ code: string; label: string }>> = {
  listing_content: [
    { code: "spam_scam", label: "Spam / scam" },
    { code: "sexual_content", label: "Sexual or explicit content" },
    { code: "hate_harassment", label: "Hate / harassment" },
    { code: "misleading", label: "Misleading or fake listing" },
    { code: "other", label: "Other" },
  ],
  chat_behavior: [
    { code: "harassment", label: "Harassment" },
    { code: "threats", label: "Threats" },
    { code: "hate_speech", label: "Hate speech" },
    { code: "spam", label: "Spam" },
    { code: "other", label: "Other" },
  ],
  profile_account: [
    { code: "fake_identity", label: "Fake identity" },
    { code: "impersonation", label: "Impersonation" },
    { code: "inappropriate_profile", label: "Inappropriate profile" },
    { code: "other", label: "Other" },
  ],
  in_person: [
    { code: "no_show", label: "No-show" },
    { code: "unsafe_behavior", label: "Unsafe behavior" },
    { code: "harassment", label: "Harassment" },
    { code: "fraud_payment", label: "Fraud / payment issue" },
    { code: "other", label: "Other" },
  ],
};

export default function Home() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const redirectTo =
    typeof window !== "undefined"
      ? `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin}/auth/callback`
      : undefined;

  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [viewerName, setViewerName] = useState("");

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTroubleModal, setShowTroubleModal] = useState(false);
  const [handledCreateParam, setHandledCreateParam] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showCityMapModal, setShowCityMapModal] = useState(false);
  const [cityMapTitle, setCityMapTitle] = useState("");
  const [cityMapUrl, setCityMapUrl] = useState("");
  const [cityMapLoading, setCityMapLoading] = useState(false);
  const [mapViewTitle, setMapViewTitle] = useState("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; accuracy?: number } | null>(null);
  const [userLocationStatus, setUserLocationStatus] = useState<"idle" | "loading" | "ready" | "denied" | "error">("idle");
  const [locationPermission, setLocationPermission] = useState<"unknown" | "prompt" | "granted" | "denied">("unknown");
  const [expandedMedia, setExpandedMedia] = useState<{ items: QuestMediaItem[]; index: number } | null>(null);
  const expandedMediaStripRef = useRef<HTMLDivElement | null>(null);
  const feedVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const [expandedQuestIds, setExpandedQuestIds] = useState<Record<string, boolean>>({});
  const [questionTarget, setQuestionTarget] = useState<Quest | null>(null);
  const [questionMode, setQuestionMode] = useState<"public" | "private">("public");
  const [questionText, setQuestionText] = useState("");
  const [questionComments, setQuestionComments] = useState<Array<{ id: string; sender_id: string; body: string; created_at: string; profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | { id: string; display_name: string | null; avatar_url: string | null } | null }>>([]);
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [lastQuestionMs, setLastQuestionMs] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<Quest | null>(null);
  const [reportContext, setReportContext] = useState<"listing_content" | "chat_behavior" | "profile_account" | "in_person">("listing_content");
  const [reportReason, setReportReason] = useState("spam_scam");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportFeedback, setReportFeedback] = useState("");
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
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingDisplayName, setOnboardingDisplayName] = useState("");
  const [onboardingCity, setOnboardingCity] = useState("");
  const [onboardingBio, setOnboardingBio] = useState("");
  const [onboardingInterestIds, setOnboardingInterestIds] = useState<string[]>([]);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [onboardingPhotoFile, setOnboardingPhotoFile] = useState<File | null>(null);
  const [onboardingPhotoPreviewUrl, setOnboardingPhotoPreviewUrl] = useState("");
  const [onboardingExistingAvatarUrl, setOnboardingExistingAvatarUrl] = useState("");
  const [onboardingPhotoZoom, setOnboardingPhotoZoom] = useState(1.2);
  const [onboardingPhotoOffsetX, setOnboardingPhotoOffsetX] = useState(0);
  const [onboardingPhotoOffsetY, setOnboardingPhotoOffsetY] = useState(0);
  const [onboardingPhotoDragging, setOnboardingPhotoDragging] = useState(false);
  const [onboardingPhotoLastPointer, setOnboardingPhotoLastPointer] = useState<{ x: number; y: number } | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [bookmarkedQuestIds, setBookmarkedQuestIds] = useState<string[]>([]);
  const [joinedQuestIds, setJoinedQuestIds] = useState<string[]>([]);
  const [membershipStatusByQuest, setMembershipStatusByQuest] = useState<Record<string, "pending" | "approved" | "declined">>({});
  const [commentCountByQuestId, setCommentCountByQuestId] = useState<Record<string, number>>({});
  const [shareCountByQuestId, setShareCountByQuestId] = useState<Record<string, number>>({});
  const [shareCountCooldownUntilByQuestId, setShareCountCooldownUntilByQuestId] = useState<Record<string, number>>({});
  const [feedMediaIndexByQuest, setFeedMediaIndexByQuest] = useState<Record<string, number>>({});
  const [generatedVideoThumbs, setGeneratedVideoThumbs] = useState<Record<string, string>>({});
  const [feedViewMode, setFeedViewMode] = useState<"list" | "map">(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem("sidequest_feed_view_mode") === "map" ? "map" : "list";
  });
  const [selectedMapQuestId, setSelectedMapQuestId] = useState<string | null>(null);
  const [focusedMapQuestId, setFocusedMapQuestId] = useState<string | null>(null);
  const [openCardMenuQuestId, setOpenCardMenuQuestId] = useState<string | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"newest" | "soonest" | "title">("newest");
  const [showDiscoverFilters, setShowDiscoverFilters] = useState(true);
  const [showDistanceJoinModal, setShowDistanceJoinModal] = useState(false);
  const [pendingDistanceJoinQuestId, setPendingDistanceJoinQuestId] = useState<string | null>(null);
  const [pendingDistanceJoinLabel, setPendingDistanceJoinLabel] = useState("");
  const feedToggleDragStartRef = useRef<number | null>(null);
  const [hobbyFilter, setHobbyFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const cityCoordinateCacheRef = useRef<Record<string, { lat: number; lon: number }>>({});
  const [distanceByQuestId, setDistanceByQuestId] = useState<Record<string, string>>({});
  const [coordsByQuestId, setCoordsByQuestId] = useState<Record<string, { lat: number; lon: number }>>({});

  const [title, setTitle] = useState("");
  const [titlePlaceholder, setTitlePlaceholder] = useState(TITLE_SUGGESTIONS[0]);
  const [description, setDescription] = useState("");
  const [hobbyId, setHobbyId] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [locationMode, setLocationMode] = useState<"in_person" | "remote">("in_person");
  const [countryCode, setCountryCode] = useState("US");
  const [countryQuery, setCountryQuery] = useState("United States");
  const [city, setCity] = useState("");
  const [exactAddress, setExactAddress] = useState("");
  const [joinMode, setJoinMode] = useState<"open" | "approval_required">("open");
  const [exactLocationVisibility, setExactLocationVisibility] = useState<"private" | "public" | "approved_members">("approved_members");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [restoreScrollY, setRestoreScrollY] = useState<number | null>(null);
  const [availabilityMode, setAvailabilityMode] = useState<"specific_time" | "find_best_time">("find_best_time");
  const [availability, setAvailability] = useState("");
  const [startAt, setStartAt] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [recurringStartDate, setRecurringStartDate] = useState("");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [skillLevel, setSkillLevel] = useState("any");
  const [groupSizeChoice, setGroupSizeChoice] = useState("any");
  const [groupSizeCustom, setGroupSizeCustom] = useState("");
  const [questVideoFile, setQuestVideoFile] = useState<File | null>(null);
  const [questVideoSource, setQuestVideoSource] = useState<"live" | "upload">("live");
  const [questVideoDurationSec, setQuestVideoDurationSec] = useState<number | null>(null);
  const [questMediaFiles, setQuestMediaFiles] = useState<Array<{ id: string; file: File; label: string }>>([]);
  const [existingMediaItems, setExistingMediaItems] = useState<QuestMediaItem[]>([]);
  const [mediaDraftItems, setMediaDraftItems] = useState<DraftMediaItem[]>([]);
  const [dragMediaId, setDragMediaId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [videoThumbStatus, setVideoThumbStatus] = useState("");
  const [selectedMediaVideoDuration, setSelectedMediaVideoDuration] = useState(0);
  const selectedMediaVideoRef = useRef<HTMLVideoElement | null>(null);
  const [removeExistingVideo, setRemoveExistingVideo] = useState(false);
  const liveVideoInputRef = useRef<HTMLInputElement | null>(null);
  const uploadVideoInputRef = useRef<HTMLInputElement | null>(null);
  const [savingQuest, setSavingQuest] = useState(false);
  const [lastQuestCreateMs, setLastQuestCreateMs] = useState(0);
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [showPublicLocationConfirm, setShowPublicLocationConfirm] = useState(false);
  const [showManualShareConfirm, setShowManualShareConfirm] = useState(false);
  const [pendingManualShareVisibility, setPendingManualShareVisibility] = useState<"private" | "public" | "approved_members" | null>(null);
  const [highlightLocationVisibility, setHighlightLocationVisibility] = useState(false);
  const [publicVisibilityConfirmed, setPublicVisibilityConfirmed] = useState(false);
  const [snoozePublicLocationWarning, setSnoozePublicLocationWarning] = useState(false);
  const [snoozeManualShareWarning, setSnoozeManualShareWarning] = useState(false);
  const publicVisibilityBypassRef = useRef(false);
  const manualShareWarningBypassRef = useRef(false);
  const publicWarningMutedUntilRef = useRef<number>(0);
  const locationVisibilityRef = useRef<HTMLDivElement | null>(null);
  const createQuestFormRef = useRef<HTMLFormElement | null>(null);

  function onboardingStorageKey(uid: string) {
    return `sidequest_onboarding_done:${uid}`;
  }

  function resetOnboardingPhoto() {
    setOnboardingPhotoFile(null);
    if (onboardingPhotoPreviewUrl) URL.revokeObjectURL(onboardingPhotoPreviewUrl);
    setOnboardingPhotoPreviewUrl("");
    setOnboardingExistingAvatarUrl("");
    setOnboardingPhotoZoom(1.2);
    setOnboardingPhotoOffsetX(0);
    setOnboardingPhotoOffsetY(0);
    setOnboardingPhotoDragging(false);
    setOnboardingPhotoLastPointer(null);
  }

  function resetOnboardingForm() {
    setOnboardingStep(0);
    setOnboardingDisplayName("");
    setOnboardingCity("");
    setOnboardingBio("");
    setOnboardingInterestIds([]);
    resetOnboardingPhoto();
  }

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
    const fromDb = hobbies.map((h) => ({ id: h.id, name: h.name, isSuggestion: false as const }));
    const existing = new Set(fromDb.map((x) => x.name.toLowerCase()));
    const canonical = CANONICAL_CATEGORIES
      .filter((name) => !existing.has(name.toLowerCase()))
      .map((name) => ({ id: `canonical:${name.toLowerCase()}`, name, isSuggestion: true as const }));

    return [...fromDb, ...canonical].sort((a, b) => a.name.localeCompare(b.name));
  }, [hobbies]);
  const canonicalCategoryNamesById = useMemo(() => {
    return new Map<string, string>(
      CANONICAL_CATEGORIES.map((name) => [`canonical:${name.toLowerCase()}`, name] as const)
    );
  }, []);

  const categoryTitleHint = useMemo(
    () => pickTitleSuggestionByCategory(categoryInput || ""),
    [categoryInput]
  );
  const categoryTitleSuggestions = useMemo(
    () => getTitleSuggestionsByCategory(categoryInput || ""),
    [categoryInput]
  );
  const canonicalCategoryMatch = useMemo(
    () => resolveCanonicalCategory(categoryInput),
    [categoryInput]
  );
  const canonicalCategorySuggestions = useMemo(
    () => suggestCanonicalCategories(categoryInput),
    [categoryInput]
  );

  useEffect(() => {
    if (!categoryInput.trim()) {
      return;
    }
    setTitlePlaceholder(categoryTitleHint);
  }, [categoryInput, categoryTitleHint]);

  useEffect(() => {
    if (locationMode === "remote") {
      setExactLocationVisibility("private");
      return;
    }
    if (joinMode === "open" && exactLocationVisibility === "approved_members") {
      setExactLocationVisibility("private");
    }
  }, [joinMode, exactLocationVisibility, locationMode]);

  useEffect(() => {
    if (!highlightLocationVisibility) return;
    const t = setTimeout(() => setHighlightLocationVisibility(false), 2200);
    return () => clearTimeout(t);
  }, [highlightLocationVisibility]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let cancelled = false;
    void navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
      if (cancelled) return;
      setLocationPermission(result.state as "prompt" | "granted" | "denied");
      result.onchange = () => setLocationPermission(result.state as "prompt" | "granted" | "denied");
    }).catch(() => {
      if (!cancelled) setLocationPermission("unknown");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const storedLocation = readStoredUserLocation();
    if (!storedLocation) return;
    setUserLocation({ lat: storedLocation.lat, lon: storedLocation.lon, accuracy: storedLocation.accuracy });
    setUserLocationStatus("ready");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("sidequest_public_location_warning_muted_until");
    const ts = raw ? Number(raw) : 0;
    if (Number.isFinite(ts) && ts > 0) publicWarningMutedUntilRef.current = ts;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sidequest_feed_view_mode", feedViewMode);
  }, [feedViewMode]);

  function resolveCountryCodeByName(name: string) {
    const found = countryOptions.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    return found?.code || countryCode;
  }

  function getFilterCategoryName(value: string) {
    if (value === "all") return null;
    return canonicalCategoryNamesById.get(value) || hobbies.find((h) => h.id === value)?.name || null;
  }

  function pickTitleSuggestionByCategory(categoryName: string) {
    const normalized = categoryName.trim().toLowerCase();
    const canonical = resolveCanonicalCategory(categoryName)?.toLowerCase() || "";
    const direct = TITLE_SUGGESTIONS_BY_CATEGORY[normalized] || (canonical ? TITLE_SUGGESTIONS_BY_CATEGORY[canonical] : null);
    if (direct?.length) return direct[Math.floor(Math.random() * direct.length)];
    const matchedKey = Object.keys(TITLE_SUGGESTIONS_BY_CATEGORY).find((key) => normalized.includes(key) || (canonical ? canonical.includes(key) : false));
    if (matchedKey) {
      const pool = TITLE_SUGGESTIONS_BY_CATEGORY[matchedKey];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return TITLE_SUGGESTIONS_BY_CATEGORY.wildcard[Math.floor(Math.random() * TITLE_SUGGESTIONS_BY_CATEGORY.wildcard.length)];
  }

  function getTitleSuggestionsByCategory(categoryName: string) {
    const normalized = categoryName.trim().toLowerCase();
    const canonical = resolveCanonicalCategory(categoryName)?.toLowerCase() || "";
    const direct = TITLE_SUGGESTIONS_BY_CATEGORY[normalized] || (canonical ? TITLE_SUGGESTIONS_BY_CATEGORY[canonical] : null);
    const matchedKey = Object.keys(TITLE_SUGGESTIONS_BY_CATEGORY).find((key) => normalized.includes(key) || (canonical ? canonical.includes(key) : false));
    const pool = direct || (matchedKey ? TITLE_SUGGESTIONS_BY_CATEGORY[matchedKey] : null) || TITLE_SUGGESTIONS_BY_CATEGORY.wildcard;
    return Array.from(new Set(pool)).slice(0, 3);
  }

  function flagFieldError(field: string, message: string) {
    setFieldErrors((prev) => ({ ...prev, [field]: true }));
    setStatus(message);
  }

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
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
        await sendWelcomeEmail(data.session.access_token);
        await maybeShowOnboarding(data.session.user.id, data.session.user.email);
        await maybeShowPhotoOnboarding(data.session.user.id);
      }

      if (!data.session) {
        const u = await supabase.auth.getUser();
        if (u.data.user) {
          setUserId(u.data.user.id);
          setUserEmail(u.data.user.email ?? "");
          const md = (u.data.user.user_metadata || {}) as Record<string, unknown>;
          setViewerName((typeof md.full_name === "string" && md.full_name) || (typeof md.name === "string" && md.name) || "");
          await ensureProfileRow(u.data.user.id, u.data.user.email, md);
          await maybeShowOnboarding(u.data.user.id, u.data.user.email);
          await maybeShowPhotoOnboarding(u.data.user.id);
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
      setAuthReady(true);
    };
    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? "");
      const md = (session?.user?.user_metadata || {}) as Record<string, unknown>;
      setViewerName((typeof md.full_name === "string" && md.full_name) || (typeof md.name === "string" && md.name) || "");
      if (session?.user) {
        void ensureProfileRow(session.user.id, session.user.email, md);
        void sendWelcomeEmail(session.access_token);
        setShowAuthModal(false);
        if (typeof window !== "undefined" && sessionStorage.getItem("gathergo_open_create") === "1") {
          sessionStorage.removeItem("gathergo_open_create");
          openCreateModal();
        }
        if (event === "SIGNED_IN" && typeof window !== "undefined" && window.location.search.includes("code=")) {
          setStatus("✅ Email confirmed. Welcome!");
        }
        void maybeShowPhotoOnboarding(session.user.id);
      }
      setAuthReady(true);
    });

    const refresh = async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user?.id ?? null);
      setUserEmail(data.session?.user?.email ?? "");
      setAuthReady(true);
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
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setShowDiscoverFilters(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem("sidequest_home_scroll_y");
    if (saved && /^-?\d+$/.test(saved)) {
      setRestoreScrollY(Number(saved));
    }
    const onScroll = () => {
      window.sessionStorage.setItem("sidequest_home_scroll_y", String(window.scrollY || window.pageYOffset || 0));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user?.id ?? userId ?? null;
    if (uid) {
      const { data: blockRows } = await supabase
        .from("friends")
        .select("requester_id,addressee_id,status")
        .eq("status", "blocked")
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
      const blocked = Array.from(new Set(((blockRows || []) as Array<{ requester_id: string; addressee_id: string }>).flatMap((r) => [r.requester_id, r.addressee_id]).filter((id) => id !== uid)));
      setBlockedUserIds(blocked);
    }
    let q = supabase.from("quests").select("id,creator_id,created_at,title,description,city,skill_level,group_size,availability,hobby_id,join_mode,exact_location_visibility,exact_address,media_video_url,media_source,media_items,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)").order("created_at", { ascending: false }).limit(24);
      const filterCategoryName = getFilterCategoryName(hobbyFilter);
      if (hobbyFilter !== "all") {
        if (filterCategoryName && hobbyFilter.startsWith("canonical:")) {
          q = q.ilike("hobbies.name", filterCategoryName);
        } else {
          q = q.eq("hobby_id", hobbyFilter);
        }
      }
    const firstRes = await q;
    let data: Quest[] | null = firstRes.data as Quest[] | null;
    let error = firstRes.error;

    // Backward compatibility if migration for media_items has not been applied yet
    if (error?.message?.includes("column quests.media_items does not exist")) {
      let fallback = supabase.from("quests").select("id,creator_id,created_at,title,description,city,skill_level,group_size,availability,hobby_id,join_mode,exact_location_visibility,exact_address,media_video_url,media_source,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)").order("created_at", { ascending: false }).limit(24);
      if (hobbyFilter !== "all") {
        if (filterCategoryName && hobbyFilter.startsWith("canonical:")) {
          fallback = fallback.ilike("hobbies.name", filterCategoryName);
        } else {
          fallback = fallback.eq("hobby_id", hobbyFilter);
        }
      }
      const res = await fallback;
      data = res.data as Quest[] | null;
      error = res.error;
    }

    setLoading(false);
    if (error) return setStatus(error.message);
    const visibleQuests = (data || []).filter((quest) => !blockedUserIds.includes(quest.creator_id));
    setQuests(visibleQuests);

    const questIds = visibleQuests.map((quest) => quest.id);
    if (!questIds.length) {
      setCommentCountByQuestId({});
      setShareCountByQuestId({});
      return;
    }

    if (typeof window !== "undefined") {
      const cooldownEntries = questIds
        .map((questId) => {
          const raw = window.localStorage.getItem(`sidequest_share_count_cooldown:${questId}`);
          const until = raw ? Number(raw) : 0;
          return Number.isFinite(until) && until > Date.now() ? [questId, until] as const : null;
        })
        .filter((entry): entry is readonly [string, number] => !!entry);
      setShareCountCooldownUntilByQuestId(Object.fromEntries(cooldownEntries));
    }

    const [commentRowsRes, shareRowsRes] = await Promise.all([
      supabase.from("messages").select("quest_id").in("quest_id", questIds).like("body", "[PUBLIC] %"),
      supabase.from("quest_shares").select("quest_id").in("quest_id", questIds),
    ]);

    if (!commentRowsRes.error) {
      setCommentCountByQuestId((commentRowsRes.data || []).reduce<Record<string, number>>((acc, row: { quest_id: string }) => {
        acc[row.quest_id] = (acc[row.quest_id] || 0) + 1;
        return acc;
      }, {}));
    }
    if (!shareRowsRes.error) {
      setShareCountByQuestId((shareRowsRes.data || []).reduce<Record<string, number>>((acc, row: { quest_id: string }) => {
        acc[row.quest_id] = (acc[row.quest_id] || 0) + 1;
        return acc;
      }, {}));
    }
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

  async function socialLogin(provider: "google" | "facebook" | "apple") {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) {
      setStatus(`OAuth failed: ${error.message}`);
      window.alert(`OAuth failed: ${error.message}`);
    }
  }

  async function sendWelcomeEmail(accessToken?: string | null) {
    if (!supabase || !accessToken) return;
    try {
      const response = await fetch("/api/welcome-email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.warn("Welcome email failed", response.status, body);
      }
    } catch {
      // Best effort only.
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserId(null);
    setUserEmail("");
    setViewerName("");
    setShowPhotoStepModal(false);
    setShowOnboardingWizard(false);
    setPhotoStepFile(null);
    if (photoStepPreviewUrl) URL.revokeObjectURL(photoStepPreviewUrl);
    setPhotoStepPreviewUrl("");
    setPhotoStepState("idle");
    setOnboardingStep(0);
    setOnboardingDisplayName("");
    setOnboardingCity("");
    setOnboardingBio("");
    setOnboardingInterestIds([]);
    setOnboardingDone(false);
    setOnboardingStep(0);
    resetOnboardingPhoto();
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

  async function loadOnboardingState(uid: string, emailValue?: string | null) {
    if (!supabase || !uid) return;

    const [{ data: profile }, { data: hobbyRows }] = await Promise.all([
      supabase.from("profiles").select("display_name,city,bio,radius_km,onboarding_done").eq("id", uid).maybeSingle(),
      supabase.from("user_hobbies").select("hobby_id,is_primary").eq("user_id", uid),
    ]);

    const savedHobbyIds = ((hobbyRows as OnboardingHobby[] | null) || []).map((row) => row.hobby_id);
    const savedName = profile?.display_name || emailValue?.split("@")[0] || "SideQuest user";
    setOnboardingDisplayName(savedName);
    setOnboardingCity(profile?.city || "");
    setOnboardingBio(profile?.bio || "");
    setOnboardingInterestIds(savedHobbyIds);
    setOnboardingDone(Boolean(profile?.onboarding_done));
    setOnboardingExistingAvatarUrl((profile as { avatar_source_url?: string | null; avatar_url?: string | null } | null)?.avatar_source_url || (profile as { avatar_url?: string | null } | null)?.avatar_url || "");
  }

  async function maybeShowOnboarding(uid: string | null, emailValue?: string | null) {
    if (!supabase || !uid) return;
    await loadOnboardingState(uid, emailValue);
    if (typeof window !== "undefined" && window.localStorage.getItem(onboardingStorageKey(uid)) === "1") {
      setOnboardingDone(true);
      setShowOnboardingWizard(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_done")
      .eq("id", uid)
      .maybeSingle();

    if (!profile?.onboarding_done) {
      setShowOnboardingWizard(true);
      setOnboardingStep(0);
    }
  }

  async function uploadOnboardingPhoto() {
    if (!supabase || !userId || !onboardingPhotoFile) return null;
    if (!isImageLikeFile(onboardingPhotoFile)) return null;

    const normalized = await prepareImageForUpload(onboardingPhotoFile, { maxWidth: 2200, maxHeight: 2200, quality: 0.9 });
    const cropUrl = URL.createObjectURL(normalized);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Could not load image."));
        i.src = cropUrl;
      });

      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare image.");

      const baseScale = Math.max(size / img.width, size / img.height);
      const finalScale = baseScale * onboardingPhotoZoom;
      const drawW = img.width * finalScale;
      const drawH = img.height * finalScale;
      const dx = (size - drawW) / 2 + onboardingPhotoOffsetX;
      const dy = (size - drawH) / 2 + onboardingPhotoOffsetY;
      ctx.drawImage(img, dx, dy, drawW, drawH);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not export image.");

      const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(filePath, blob, { upsert: false, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
      const originalFilePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}-original.jpg`;
      const { error: originalUploadError } = await supabase.storage
        .from("profile-photos")
        .upload(originalFilePath, onboardingPhotoFile, { upsert: false, contentType: onboardingPhotoFile.type || "image/jpeg" });
      if (originalUploadError) throw originalUploadError;
      const { data: originalData } = supabase.storage.from("profile-photos").getPublicUrl(originalFilePath);
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        avatar_url: publicData.publicUrl,
        avatar_source_url: originalData.publicUrl,
        photo_onboarding_done: true,
      });
      if (profileError && !profileError.message.toLowerCase().includes("row-level security")) throw profileError;

      await supabase.auth.updateUser({ data: { avatar_url: publicData.publicUrl } });
      return { avatarUrl: publicData.publicUrl, sourceUrl: originalData.publicUrl };
    } finally {
      URL.revokeObjectURL(cropUrl);
    }
  }

  async function saveOnboarding() {
    if (!supabase || !userId) return;
    setOnboardingSaving(true);
    try {
      let uploadedPhotoUrl: string | null = null;
      let uploadedPhotoSourceUrl: string | null = null;
      let warning: string | null = null;

      if (onboardingPhotoFile) {
        try {
          const uploaded = await uploadOnboardingPhoto();
          uploadedPhotoUrl = uploaded?.avatarUrl || null;
          uploadedPhotoSourceUrl = uploaded?.sourceUrl || null;
        } catch (err) {
          warning = err instanceof Error ? `Photo not saved: ${err.message}` : "Photo not saved.";
        }
      }

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        display_name: onboardingDisplayName.trim() || userEmail.split("@")[0] || "SideQuest user",
        city: onboardingCity.trim() || null,
        bio: onboardingBio.trim() || null,
        onboarding_done: true,
      });
      if (profileError) throw profileError;

      if (uploadedPhotoUrl) {
        const { error: avatarError } = await supabase.from("profiles").upsert({
          id: userId,
          avatar_url: uploadedPhotoUrl,
          ...(uploadedPhotoSourceUrl ? { avatar_source_url: uploadedPhotoSourceUrl } : {}),
        });
        if (avatarError && !avatarError.message.toLowerCase().includes("column")) {
          warning = warning || `Photo details not saved: ${avatarError.message}`;
        }
      }

      const { error: deleteError } = await supabase.from("user_hobbies").delete().eq("user_id", userId);
      if (deleteError && !deleteError.message.toLowerCase().includes("row-level security")) {
        warning = warning || `Hobbies not saved: ${deleteError.message}`;
      }

      if (onboardingInterestIds.length) {
        const { error: insertError } = await supabase.from("user_hobbies").insert(
          onboardingInterestIds.map((hobbyId, index) => ({
            user_id: userId,
            hobby_id: hobbyId,
            is_primary: index === 0,
          }))
        );
        if (insertError && !insertError.message.toLowerCase().includes("row-level security")) {
          warning = warning || `Hobbies not saved: ${insertError.message}`;
        }
      }

      await supabase.auth.updateUser({
        data: {
          full_name: onboardingDisplayName.trim() || userEmail.split("@")[0] || "SideQuest user",
        },
      });

      if (typeof window !== "undefined") window.localStorage.setItem(onboardingStorageKey(userId), "1");
      setOnboardingDone(true);
      setShowOnboardingWizard(false);
      setStatus(warning ? `Onboarding saved with warnings: ${warning}` : "Onboarding saved ✅");
      await loadQuests();
    } catch (err) {
      if (typeof window !== "undefined") window.localStorage.setItem(onboardingStorageKey(userId), "1");
      setOnboardingDone(true);
      setShowOnboardingWizard(false);
      setStatus(err instanceof Error ? `${err.message} (saved locally; DB migration may still be needed)` : "Could not save onboarding.");
    } finally {
      setOnboardingSaving(false);
    }
  }

  async function skipOnboarding() {
    if (!supabase || !userId) return;
    setOnboardingSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert({ id: userId, onboarding_done: true });
      if (error) throw error;
      if (typeof window !== "undefined") window.localStorage.setItem(onboardingStorageKey(userId), "1");
      setOnboardingDone(true);
      setShowOnboardingWizard(false);
      setStatus("You can finish setup later in Settings.");
    } catch (err) {
      if (typeof window !== "undefined") window.localStorage.setItem(onboardingStorageKey(userId), "1");
      setOnboardingDone(true);
      setShowOnboardingWizard(false);
      setStatus(err instanceof Error ? `${err.message} (skipped locally; DB migration may still be needed)` : "Could not skip onboarding.");
    } finally {
      setOnboardingSaving(false);
    }
  }

  async function restartOnboardingForTesting() {
    if (!supabase || !userId) return;
    const ok = window.confirm("Restart onboarding for this account?");
    if (!ok) return;
    const { error } = await supabase.from("profiles").upsert({ id: userId, onboarding_done: false });
    if (error) return setStatus(error.message);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(onboardingStorageKey(userId));
    }
    setOnboardingDone(false);
    setShowOnboardingWizard(true);
    setOnboardingStep(0);
    await maybeShowOnboarding(userId, userEmail);
    setStatus("Onboarding restarted.");
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
    if (!isImageLikeFile(photoStepFile)) return setStatus("Please choose an image file.");

    setPhotoStepState("uploading");

    let cropped: Blob;
    try {
      const normalized = await prepareImageForUpload(photoStepFile, { maxWidth: 2200, maxHeight: 2200, quality: 0.9 });
      cropped = await makePhotoStepCrop(normalized);
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

  async function uploadQuestMediaThumbnail(file: File) {
    if (!supabase || !userId) throw new Error("Not signed in.");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}-thumb.${ext}`;
    const { error } = await supabase.storage
      .from("quest-media")
      .upload(filePath, file, { upsert: false, contentType: file.type || "image/jpeg" });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("quest-media").getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function captureSelectedVideoThumbnail() {
    const video = selectedMediaVideoRef.current;
    const selected = selectedMediaItem;
    if (!video || !selected || selected.type !== "video") return;
    if (!video.videoWidth || !video.videoHeight) throw new Error("Video is not ready yet.");

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not capture video frame.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
    if (!blob) throw new Error("Could not create thumbnail.");

    const thumbFile = new File([blob], `thumb-${Date.now()}.jpg`, { type: "image/jpeg" });
    return uploadQuestMediaThumbnail(thumbFile);
  }

  async function createVideoThumbnailFromFile(file: File) {
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Could not read video metadata."));
      });

      const targetTime = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(0.2, Math.max(0, video.duration - 0.2)) : 0.2;
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        try {
          video.currentTime = targetTime;
        } catch (err) {
          video.removeEventListener("seeked", onSeeked);
          reject(err);
        }
      });

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not capture video frame.");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
      if (!blob) throw new Error("Could not create thumbnail.");

      return new File([blob], `thumb-${Date.now()}.jpg`, { type: "image/jpeg" });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function uploadQuestMediaFiles(items: Array<{ file: File; label: string; thumbnailUrl?: string | null }>) {
    if (!supabase || !userId) throw new Error("Not signed in.");
    const uploaded: QuestMediaItem[] = [];

    for (const item of items) {
      const originalFile = item.file;
      const isVideo = originalFile.type.startsWith("video/");
      const looksImage = isImageLikeFile(originalFile);
      if (!looksImage && !isVideo) throw new Error("Media must be an image or video file.");

      const file = looksImage
        ? await prepareImageForUpload(originalFile, { maxWidth: 1600, maxHeight: 1600, quality: 0.82 })
        : (isVideo ? await compressVideoForUpload(originalFile, { maxWidth: 960, maxHeight: 960, videoBitsPerSecond: 900_000 }) : originalFile);

      const isImage = file.type.startsWith("image/");
      const isCompressedVideo = file.type.startsWith("video/");
      if (isImage && file.size > 8 * 1024 * 1024) throw new Error("Compressed images must be under 8MB.");
      if (isCompressedVideo && file.size > 60 * 1024 * 1024) throw new Error("Videos must be under 60MB.");

      let thumbnailUrl = item.thumbnailUrl || null;
      if (isCompressedVideo && !thumbnailUrl) {
        try {
          const thumbFile = await createVideoThumbnailFromFile(file);
          thumbnailUrl = await uploadQuestMediaThumbnail(thumbFile);
        } catch {
          thumbnailUrl = null;
        }
      }

      const ext = (file.name.split(".").pop() || (isImage ? "jpg" : "mp4")).toLowerCase();
      const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from("quest-media")
        .upload(filePath, file, { upsert: false, contentType: file.type || (isImage ? "image/jpeg" : "video/mp4") });
      if (error) throw new Error(error.message);

      const { data } = supabase.storage.from("quest-media").getPublicUrl(filePath);
      uploaded.push({
        url: data.publicUrl,
        type: isImage ? "image" : "video",
        label: item.label.trim() || null,
        thumbnailUrl,
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
    setRecurringFrequency("weekly");
    setRecurringStartDate("");
    setShowAdvancedSettings(false);
    setHobbyId("");
    setCategoryInput("");
    setUseCustomCategory(false);
    setCustomCategory("");
    setCategoryDropdownOpen(false);
    setLocationMode("in_person");
    setExactAddress("");
    setJoinMode("open");
    setExactLocationVisibility("approved_members");
    setSkillLevel("any");
    setGroupSizeChoice("any");
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
    setFieldErrors({});
    setShowPublicLocationConfirm(false);
    setHighlightLocationVisibility(false);
    setPublicVisibilityConfirmed(false);
    publicVisibilityBypassRef.current = false;
  }

  function openCreateModal() {
    resetQuestForm();
    setShowCreateModal(true);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const openAuthFromUrl = async () => {
      const params = new URLSearchParams(window.location.search);
      const pendingAuth = sessionStorage.getItem("gathergo_open_auth") === "1";
      const pendingCreate = sessionStorage.getItem("gathergo_open_create") === "1";

      let activeUserId = userId;
      if (!activeUserId && supabase) {
        const { data } = await supabase.auth.getSession();
        activeUserId = data.session?.user?.id ?? null;
        if (activeUserId) setUserId(activeUserId);
      }

      if ((params.get("auth") === "1" || pendingAuth) && !activeUserId) {
        setShowAuthModal(true);
        setStatus("Please sign in to continue.");
        if (pendingAuth) sessionStorage.removeItem("gathergo_open_auth");
      }

      if (handledCreateParam) return;
      if (params.get("create") !== "1" && !pendingCreate) return;
      if (activeUserId) {
        if (pendingCreate) sessionStorage.removeItem("gathergo_open_create");
        openCreateModal();
        if (typeof window !== "undefined" && params.get("create") === "1") {
          const next = new URL(window.location.href);
          next.searchParams.delete("create");
          window.history.replaceState({}, "", next.pathname + (next.search ? `?${next.searchParams.toString()}` : ""));
        }
      } else {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("gathergo_open_create", "1");
          sessionStorage.setItem("gathergo_open_auth", "1");
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
          sessionStorage.setItem("gathergo_open_create", "1");
          sessionStorage.setItem("gathergo_open_auth", "1");
        }
        setShowAuthModal(true);
        setStatus("Log in to create.");
      }
    };

    for (const eventName of APP_EVENT_NAMES.openAuth) {
      window.addEventListener(eventName, onOpenAuth as EventListener);
    }
    for (const eventName of APP_EVENT_NAMES.openCreate) {
      window.addEventListener(eventName, onOpenCreate as EventListener);
    }
    window.addEventListener("popstate", openAuthFromUrl);
    return () => {
      for (const eventName of APP_EVENT_NAMES.openAuth) {
        window.removeEventListener(eventName, onOpenAuth as EventListener);
      }
      for (const eventName of APP_EVENT_NAMES.openCreate) {
        window.removeEventListener(eventName, onOpenCreate as EventListener);
      }
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

  async function handleQuestMediaPicked(files: FileList | null) {
    if (!files?.length) return;

    const existingImages = mediaDraftItems.filter((m) => m.type === "image").length;
    const existingVideos = mediaDraftItems.filter((m) => m.type === "video").length;

    let imgLeft = Math.max(0, 2 - existingImages);
    let vidLeft = Math.max(0, 2 - existingVideos);

    const added: DraftMediaItem[] = [];
    for (const picked of Array.from(files)) {
      if (isImageLikeFile(picked) && imgLeft > 0) {
        try {
          const file = await prepareImageForUpload(picked, { maxWidth: 1600, maxHeight: 1600, quality: 0.82 });
          added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, label: "", type: "image", source: "new" });
          imgLeft -= 1;
        } catch (err) {
          setStatus(err instanceof Error ? err.message : "Could not process image.");
        }
      } else if (picked.type.startsWith("video/") && vidLeft > 0) {
        added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: picked, label: "", type: "video", source: "new" });
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

  useEffect(() => {
    setVideoThumbStatus("");
    if (!selectedMediaItem || selectedMediaItem.type !== "video") {
      setSelectedMediaVideoDuration(0);
      return;
    }
    const vid = selectedMediaVideoRef.current;
    if (vid && Number.isFinite(vid.duration) && vid.duration > 0) {
      setSelectedMediaVideoDuration(vid.duration);
    }
  }, [selectedMediaItem?.id, selectedMediaItem?.type]);

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
    const existingItems = (q.media_items || []).map((m, i) => ({ id: `existing-${q.id}-${i}`, type: m.type, label: m.label || "", source: "existing" as const, url: m.url, thumbnailUrl: m.thumbnailUrl || null }));
    const draftItems = [...legacyVideo, ...existingItems];
    setMediaDraftItems(draftItems);
    setSelectedMediaId(draftItems[0]?.id || null);
    setExistingMediaItems(
      draftItems.map((item) => ({
        url: item.url,
        type: item.type,
        label: item.label || null,
        thumbnailUrl: "thumbnailUrl" in item ? item.thumbnailUrl || null : null,
      })),
    );
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

  function formatQuestMeta(quest: Quest) {
    const rawLocation = sanitizeLocationLabel(quest.city) || sanitizeLocationLabel(deriveCityFromLocation(quest.exact_address || "")) || "city tbd";
    const parts = rawLocation.split(",").map((p) => p.trim()).filter(Boolean);
    const city = parts[0] || rawLocation;
    return city;
  }

  function formatQuestCityState(quest: Quest) {
    const raw = getQuestCityQuery(quest).trim();
    return raw || "City tbd";
  }

  function isVirtualQuest(quest: Quest) {
    const exactAddress = (quest.exact_address || "").trim();
    if (!exactAddress) return false;
    if (quest.exact_location_visibility !== "private") return false;
    const lowered = exactAddress.toLowerCase();
    if (/(https?:\/\/|www\.|:\/\/)/i.test(exactAddress)) return true;
    if (/(zoom|google meet|meet\.google|teams\.microsoft|webex|gotomeeting|ringcentral|whereby|discord\.gg|discord|slack|jitsi|bluejeans|join)/i.test(lowered)) return true;
    if (/\.[a-z]{2,}(?:\/|$)/i.test(exactAddress) && !/(street|st\.|road|rd\.|avenue|ave\.|boulevard|blvd\.|drive|dr\.|lane|ln\.|way|court|ct\.|place|pl\.|trail|trl\.|circle|cir\.)/i.test(lowered)) return true;
    return false;
  }

  function getQuestCityQuery(quest: Quest) {
    if (isVirtualQuest(quest)) return "Virtual";
    const rawLocation = sanitizeLocationLabel(quest.city) || sanitizeLocationLabel(deriveCityFromLocation(quest.exact_address || "")) || "";
    const parts = rawLocation.split(",").map((p) => p.trim()).filter(Boolean);
    const city = parts[0] || rawLocation;
    const stateFromAddress = (() => {
      const raw = (quest.exact_address || "").trim();
      if (!raw) return "";
      const statePart = raw.split(",").map((p) => p.trim()).reverse().find((part) => /^[A-Z]{2}$/.test(part) || /^(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)$/i.test(part));
      if (!statePart) return "";
      if (/^[A-Z]{2}$/.test(statePart)) return statePart.toUpperCase();
      const stateMap: Record<string, string> = {
        alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
        florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
        louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
        montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
        "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
        "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
        washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
      };
      return stateMap[statePart.toLowerCase()] || "";
    })();
    const state = (parts.find((part, index) => index > 0 && /^[A-Z]{2}$/.test(part)) || stateFromAddress || "").toUpperCase();
    return [city, state].filter(Boolean).join(", ");
  }

  function getQuestMapQuery(quest: Quest) {
    if (isVirtualQuest(quest)) return "Virtual";
    const exactAddress = quest.exact_address?.trim();
    if (exactAddress && quest.exact_location_visibility === "public") return exactAddress;
    return getQuestCityQuery(quest);
  }

  function normalizeQuestDistanceQuery(input?: string | null) {
    const raw = sanitizeLocationLabel(input);
    if (!raw) return "";
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)[0]
      ?.replace(/^(city|town|village)\s+of\s+/i, "")
      .trim() || raw;
  }

  function postalQuestDistanceQuery(input?: string | null) {
    const raw = sanitizeLocationLabel(input);
    return raw.split(",").map((part) => part.trim()).find((part) => /^\d{4,}$/.test(part)) || "";
  }

  function isStateOnlyQuestLocation(input?: string | null) {
    const raw = sanitizeLocationLabel(input);
    if (!raw) return false;
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 1) return false;
    const value = parts[0].toLowerCase();
    const stateNames = new Set([
      "alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico","new york","north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee","texas","utah","vermont","virginia","washington","west virginia","wisconsin","wyoming","district of columbia","dc"
    ]);
    const stateAbbrevs = new Set([
      "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia","ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj","nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt","va","wa","wv","wi","wy","dc"
    ]);
    return stateNames.has(value) || stateAbbrevs.has(value);
  }

  function getQuestDistanceQueries(quest: Quest) {
    if (isVirtualQuest(quest)) return [];
    return [
      getQuestMapQuery(quest),
      isStateOnlyQuestLocation(quest.city) ? "" : normalizeQuestDistanceQuery(quest.city),
      normalizeQuestDistanceQuery(deriveCityFromLocation(quest.exact_address || "")),
      normalizeQuestDistanceQuery(quest.exact_address),
      postalQuestDistanceQuery(quest.city),
      postalQuestDistanceQuery(quest.exact_address),
    ].filter((query, index, queries) => query && query !== "Virtual" && queries.indexOf(query) === index);
  }

  function getQuestCityLabel(quest: Quest) {
    if (isVirtualQuest(quest)) return "Virtual";
    const rawLocation = sanitizeLocationLabel(quest.city) || sanitizeLocationLabel(deriveCityFromLocation(quest.exact_address || "")) || "";
    const parts = rawLocation.split(",").map((p) => p.trim()).filter(Boolean);
    const city = parts[0] || rawLocation || "city tbd";
    return city;
  }

  function distanceLabelMiles(miles: number) {
    if (!Number.isFinite(miles)) return "";
    if (miles < 1) return `${Math.max(0.1, Math.round(miles * 10) / 10)} mi away`;
    if (miles < 10) return `${Math.round(miles * 10) / 10} mi away`;
    return `${Math.round(miles)} mi away`;
  }

  function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 3958.8;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  async function fetchQuestCityCoordinates(query: string) {
    const cached = cityCoordinateCacheRef.current[query];
    if (cached) return cached;
    try {
      const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
      const city = parts[0]?.toLowerCase() || "";
      const state = parts.find((part) => /^[A-Z]{2}$/.test(part))?.toLowerCase() || "";
      const postal = parts.find((part) => /^\d{4,}$/.test(part)) || "";
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
      const json = (await res.json()) as { results?: Array<{ latitude: number; longitude: number; name?: string; admin1?: string; country?: string; country_code?: string }> };
      const results = json.results || [];
      const scoreCandidate = (candidate: { name?: string; admin1?: string; country?: string; country_code?: string }) => {
        const name = (candidate.name || "").trim().toLowerCase();
        const admin1 = (candidate.admin1 || "").trim().toLowerCase();
        const country = (candidate.country || "").trim().toLowerCase();
        let score = 0;
        if (!name) return -1;
        if (/^\d{4,}$/.test(query.trim())) score += name ? 40 : 0;
        if (postal && candidate.country_code?.toLowerCase() === "us") score += 30;
        if (city) {
          if (name === city) score += 30;
          else if (name.includes(city) || city.includes(name)) score += 18;
        }
        if (state) {
          if (admin1 === state) score += 25;
          else if (admin1.includes(state) || state.includes(admin1)) score += 12;
        }
        if (country === "united states") score += 4;
        return score;
      };
      const result = results
        .map((candidate) => ({ candidate, score: scoreCandidate(candidate) }))
        .filter(({ score }) => score >= 0)
        .sort((a, b) => b.score - a.score)[0]?.candidate || null;
      if (!result) return null;
      const coords = { lat: result.latitude, lon: result.longitude };
      cityCoordinateCacheRef.current[query] = coords;
      return coords;
    } catch {
      return null;
    }
  }

  async function openQuestCityMap(quest: Quest) {
    const query = getQuestCityQuery(quest);
    if (!query) return;
    setCityMapTitle(formatQuestMeta(quest));
    setShowCityMapModal(true);
    setCityMapLoading(true);
    setCityMapUrl("");
    const url = await fetchQuestCityMapUrl(query);
    setCityMapUrl(url);
    setCityMapLoading(false);
  }

  async function fetchQuestCityMapUrl(query: string) {
    const coords = await fetchQuestCityCoordinates(query);
    if (coords) {
      return `https://www.openstreetmap.org/export/embed.html?bbox=${coords.lon - 0.08}%2C${coords.lat - 0.08}%2C${coords.lon + 0.08}%2C${coords.lat + 0.08}&layer=mapnik&marker=${coords.lat}%2C${coords.lon}`;
    }
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}#map=10`;
  }

  async function requestUserLocation() {
    if (!("geolocation" in navigator)) {
      setUserLocationStatus("error");
      return;
    }
    setUserLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy };
        writeStoredUserLocation(nextLocation);
        setUserLocation(nextLocation);
        setUserLocationStatus("ready");
      },
      (error) => {
        setUserLocationStatus(error.code === error.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  function getCurrentPositionOnce() {
    return new Promise<{ lat: number; lon: number; accuracy?: number }>((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Geolocation is not available on this device."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextLocation = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          writeStoredUserLocation(nextLocation);
          resolve(nextLocation);
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            reject(new Error("Location access is required to request or join this event."));
            return;
          }
          reject(new Error("Could not read your location. Please try again."));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  }

  async function enableLocationAndRetry() {
    try {
      const loc = await getCurrentPositionOnce();
      setUserLocation(loc);
      setUserLocationStatus("ready");
      setStatus("Location enabled ✅");
    } catch (err) {
      setUserLocationStatus("denied");
      setStatus(err instanceof Error ? err.message : "Location access is required to request or join this event.");
    }
  }

  function toggleFeedVideoPlayback(videoId: string) {
    const video = feedVideoRefs.current[videoId];
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  async function generateVideoThumbnail(video: HTMLVideoElement, key: string) {
    if (generatedVideoThumbs[key]) return;
    if (!video.videoWidth || !video.videoHeight) return;
    try {
      const targetTime = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(0.1, Math.max(0, video.duration - 0.1)) : 0.1;
      if (Math.abs(video.currentTime - targetTime) > 0.05) {
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked, { once: true });
          try {
            video.currentTime = targetTime;
          } catch {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          }
        });
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      setGeneratedVideoThumbs((prev) => (prev[key] ? prev : { ...prev, [key]: dataUrl }));
    } catch {
      // Ignore cross-origin canvas tainting or decode failures.
    }
  }

  async function openFeedVideoFullscreen(videoId: string) {
    const video = feedVideoRefs.current[videoId];
    if (!video) return;
    if (video.requestFullscreen) {
      await video.requestFullscreen();
      return;
    }
    const webkitVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    webkitVideo.webkitEnterFullscreen?.();
  }

  function formatPostedLabel(createdAt?: string | null) {
    if (!createdAt) return "Posted recently";
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return "Posted recently";
    const diffMs = Date.now() - created.getTime();
    const diffHours = diffMs / (60 * 60 * 1000);
    const diffDays = diffHours / 24;
    if (diffHours < 24) {
      const roundedMinutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
      if (roundedMinutes < 60) return `Posted ${roundedMinutes}m ago`;
      return `Posted ${Math.max(1, Math.round(diffHours))} hrs ago`;
    }
    if (diffDays < 7) return `Posted ${created.toLocaleDateString(undefined, { weekday: "short" })}`;
    return `Posted ${created.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  }

  function getEventTimingLabel(availability?: string | null) {
    const raw = (availability || "").trim();
    if (!raw) return "Event time tbd";
    return raw.replace(/^Start at:\s*/i, "Event: ");
  }

  function sanitizeLocationLabel(input?: string | null) {
    const raw = (input || "").trim();
    if (!raw) return "";
    return raw.replace(/,\s*(Florida|FL)$/i, "").replace(/\s+\b(Florida|FL)\b$/i, "").trim();
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

    if (!categoryInput.trim()) return flagFieldError("category", "Please enter a category.");
    if (!title.trim()) return flagFieldError("title", "Please enter a title.");
    if (!countryQuery.trim()) return flagFieldError("country", "Please enter a country.");
    if (locationMode === "remote") {
      if (!exactAddress.trim()) return flagFieldError("location", "Remote meeting link is required.");
    } else if (!exactAddress.trim()) {
      return flagFieldError("location", "Location is required.");
    }
    if (!groupSizeChoice) return flagFieldError("groupSize", "Group size is required.");
    if (groupSizeChoice === "custom" && (!Number.isFinite(selectedGroupSize) || selectedGroupSize < 2 || selectedGroupSize > 50)) {
      return flagFieldError("groupSize", "Custom group size must be between 2 and 50.");
    }
    if (availabilityMode === "specific_time" && !startAt) return setStatus("Pick a specific start time.");
    if (isRecurring && !recurringStartDate) return setStatus("Pick a recurring start date.");

    const isPublicWarningMuted = Date.now() < publicWarningMutedUntilRef.current;
    if (locationMode === "in_person" && exactLocationVisibility === "public" && !isPublicWarningMuted && !publicVisibilityBypassRef.current && !publicVisibilityConfirmed) {
      setShowPublicLocationConfirm(true);
      return;
    }

    const derivedCity = locationMode === "remote" ? city : deriveCityFromLocation(exactAddress) || city;
    const availabilityParts = [
      availabilityMode === "specific_time" ? `Start at: ${new Date(startAt).toLocaleString()}` : "Let's find the best time",
      isRecurring ? `Recurring ${recurringFrequency} from ${recurringStartDate}` : null,
      availability.trim() ? `Notes: ${availability.trim()}` : null,
    ].filter(Boolean);
    const avail = availabilityParts.join(" · ");

    let creatorLocationWarning = "";
    try {
      const hostLocation = await getCurrentPositionOnce();
      setUserLocation(hostLocation);
      setUserLocationStatus("ready");
      const locationQuery = locationMode === "remote" ? city : (derivedCity || exactAddress);
      const questCoords = await fetchQuestCityCoordinates(locationQuery);
      if (questCoords) {
        const miles = haversineMiles(hostLocation.lat, hostLocation.lon, questCoords.lat, questCoords.lon);
        if (Number.isFinite(miles) && miles > 20) {
          creatorLocationWarning = ` Your listing is about ${distanceLabelMiles(miles)} from you.`;
        }
      }
    } catch {
      setUserLocationStatus("denied");
      return setStatus("Location access is required to create a listing.");
    }

    // Ensure profile row exists (required by quests.creator_id FK)
    const profileUpdate: any = {
      id: activeUserId,
      display_name: fullName || userEmail.split("@")[0] || "SideQuest user",
      city: derivedCity,
      availability: avail,
    };
    // Only include skill_level if it's a specific level (not "any" or empty)
    if (skillLevel && skillLevel.trim() && skillLevel !== "any") {
      profileUpdate.skill_level = skillLevel;
    }
    const { error: profileErr } = await supabase.from("profiles").upsert(profileUpdate);
    if (profileErr) return setStatus(`Profile setup failed: ${profileErr.message}`);

    let finalHobbyId = hobbyId;
    const canonicalOrTyped = resolveCanonicalCategory(categoryInput) || categoryInput.trim();

    if (!finalHobbyId && canonicalOrTyped) {
      const picked = categoryOptions.find((o) => o.name.toLowerCase() === canonicalOrTyped.toLowerCase());
      if (picked?.id && !picked.id.startsWith("canonical:")) finalHobbyId = picked.id;
    }

    if (!finalHobbyId && canonicalOrTyped) {
      const { data: existing } = await supabase
        .from("hobbies")
        .select("id,name")
        .ilike("name", canonicalOrTyped)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        finalHobbyId = existing.id;
      } else {
        const { data: created, error: hobbyErr } = await supabase
          .from("hobbies")
          .insert({ slug: slugify(canonicalOrTyped), name: canonicalOrTyped, category: canonicalOrTyped })
          .select("id")
          .single();

        if (hobbyErr) {
          setSavingQuest(false);
          return setStatus(`Could not create category "${canonicalOrTyped}": ${hobbyErr.message}`);
        } else if (created?.id) {
          finalHobbyId = created.id;
        }
      }
    }

    if (!finalHobbyId) {
      setSavingQuest(false);
      return setStatus("Category is required. Please try selecting or entering a category again.");
    }

    const finalDescription = description;

    setShowPublicLocationConfirm(false);
    setPublicVisibilityConfirmed(false);
    setSavingQuest(true);
    setStatus(editingQuestId ? "Updating listing…" : "Posting listing…");
    try {
      const newDraftItems = mediaDraftItems.filter((m) => m.source === "new" && m.file);
      const uploadedMedia = newDraftItems.length
        ? await uploadQuestMediaFiles(newDraftItems.map((m) => ({ file: m.file as File, label: m.label, thumbnailUrl: m.thumbnailUrl || null })))
        : [];

      let uploadIdx = 0;
      const nextMediaItems: QuestMediaItem[] = mediaDraftItems
        .map((m) => {
          if (m.source === "existing" && m.url) return { url: m.url, type: m.type, label: m.label || null, thumbnailUrl: m.thumbnailUrl || null };
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
          exact_location_visibility: locationMode === "remote" ? "private" : exactLocationVisibility,
          availability: avail,
          group_size: selectedGroupSize,
          media_items: nextMediaItems,
          media_video_url: null,
          media_source: null,
        };
        // Only include skill_level if it's a specific level (not "any" or empty)
        if (skillLevel && skillLevel.trim() && skillLevel !== "any") {
          payload.skill_level = skillLevel;
        }

        const { error } = await supabase
          .from("quests")
          .update(payload)
          .eq("id", editingQuestId)
          .eq("creator_id", activeUserId);
        if (error) throw new Error(error.message);

        try {
          await cleanupQuestStorage(
            {
              media_video_url: null,
              media_items: existingMediaItems,
            },
            nextMediaItems,
          );
          setStatus(`Listing updated ✅${creatorLocationWarning}`);
        } catch (cleanupErr) {
          console.warn("Quest storage cleanup failed after update:", cleanupErr);
          setStatus(`Listing updated ✅ (storage cleanup partial)${creatorLocationWarning}`);
        }
        setLastQuestCreateMs(Date.now());
      } else {
        const insertPayload: Record<string, unknown> = {
          creator_id: activeUserId,
          hobby_id: finalHobbyId,
          title,
          description: finalDescription,
          city: derivedCity,
          exact_address: exactAddress || null,
          join_mode: joinMode,
          exact_location_visibility: locationMode === "remote" ? "private" : exactLocationVisibility,
          availability: avail,
          group_size: selectedGroupSize,
          media_video_url: null,
          media_source: null,
          media_items: nextMediaItems,
        };
        // Only include skill_level if it's a specific level (not "any" or empty)
        if (skillLevel && skillLevel.trim() && skillLevel !== "any") {
          insertPayload.skill_level = skillLevel;
        }
        const { data, error } = await supabase.from("quests").insert(insertPayload).select("id").single();
        if (error) throw new Error(error.message);
        if (data?.id) await supabase.from("quest_members").insert({ quest_id: data.id, user_id: activeUserId, role: "creator" });
        setStatus(`Quest posted ✅${creatorLocationWarning}`);
        setLastQuestCreateMs(Date.now());
      }

      resetQuestForm();
      setShowCreateModal(false);
      await loadQuests();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save listing.");
    } finally {
      publicVisibilityBypassRef.current = false;
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

  async function shareQuest(q: Quest) {
    const url = typeof window !== "undefined" ? `${window.location.origin}/listing/${q.id}` : `/listing/${q.id}`;
    const text = `${q.title}${q.description ? ` - ${q.description}` : ""}`;
    const cooldownMs = 5 * 60 * 1000;
    const now = Date.now();
    const cooldownUntil = shareCountCooldownUntilByQuestId[q.id] || 0;
    const canIncrementShareCount = now >= cooldownUntil;
    if (supabase && canIncrementShareCount) {
      const { error } = await supabase.from("quest_shares").insert({ quest_id: q.id, user_id: userId || null, shared_via: "native_share" });
      if (error) {
        setStatus(error.message);
      } else {
        setShareCountByQuestId((prev) => ({ ...prev, [q.id]: (prev[q.id] || 0) + 1 }));
        setShareCountCooldownUntilByQuestId((prev) => ({ ...prev, [q.id]: now + cooldownMs }));
        if (typeof window !== "undefined") {
          window.localStorage.setItem(`sidequest_share_count_cooldown:${q.id}`, String(now + cooldownMs));
        }
      }
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: q.title, text, url });
        return;
      } catch {
        // Fall through to clipboard copy.
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied to clipboard.");
    }
  }

  function askQuestion(quest: Quest, mode: "public" | "private" = "public") {
    if (!supabase || !userId) {
      setShowAuthModal(true);
      setStatus("Log in to message listing owners.");
      return;
    }

    setQuestionTarget(quest);
    setQuestionMode(mode);
    setQuestionText("");
    setShowQuestionModal(true);
    void (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id,sender_id,body,created_at,profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)")
        .eq("quest_id", quest.id)
        .like("body", "[PUBLIC] %")
        .order("created_at", { ascending: false })
        .limit(100);
      setQuestionComments((data || []) as typeof questionComments);
    })();
  }

  function openReportModal(quest: Quest) {
    if (!supabase || !userId) {
      setShowAuthModal(true);
      setStatus("Log in to submit reports.");
      return;
    }
    setReportTarget(quest);
    setReportContext("listing_content");
    setReportReason(REPORT_REASONS.listing_content[0].code);
    setReportDetails("");
    setReportFeedback("");
    setShowReportModal(true);
  }

  const reportFeedbackTone = reportFeedback.toLowerCase().includes("couldn't") || reportFeedback.toLowerCase().includes("try again")
    ? "error"
    : reportFeedback.toLowerCase().includes("submitted")
      ? "success"
      : "neutral";

  async function submitReport() {
    if (!supabase || !userId || !reportTarget) return;
    if (!reportDetails.trim() && reportContext === "in_person") {
      return setStatus("Please add details for in-person reports.");
    }

    setSubmittingReport(true);
    const reportId = crypto.randomUUID();
    const payload = {
      id: reportId,
      reporter_id: userId,
      reported_user_id: reportTarget.creator_id || null,
      quest_id: reportTarget.id,
      context_type: reportContext,
      reason_code: reportReason,
      details: reportDetails.trim() || null,
      auto_flags: {
        reporter_name: userEmail.split("@")[0] || null,
        listing_title: reportTarget.title || null,
        host_name: Array.isArray(reportTarget.profiles) ? reportTarget.profiles[0]?.display_name || reportTarget.creator_id || null : reportTarget.profiles?.display_name || reportTarget.creator_id || null,
        report_target_key: `listing:${reportTarget.id}`,
        report_target_label: reportTarget.title || null,
      },
    };

    const { error } = await supabase.from("reports").insert(payload);
    setSubmittingReport(false);
    if (error) {
      setReportFeedback(error.message || "We couldn't submit that report right now. Please try again in a moment.");
      return;
    }

    const notify = await fetch("/api/report-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId }),
    });
    if (!notify.ok) {
      const body = await notify.text().catch(() => "");
      setReportFeedback(body || "Report saved, but email alert failed.");
      return;
    }

    setReportFeedback(`Report submitted. Reference ${formatReportReference(reportId)}.`);
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

  function getCategoryFallbackVisual(categoryRaw?: string | null) {
    return getCategoryFallbackMedia(categoryRaw);
  }

  function getQuestCategoryRaw(q: Quest) {
    const hobby = getQuestHobby(q);
    const category = hobby?.category?.trim();
    if (category && category.toLowerCase() !== "category") return category;
    const name = hobby?.name?.trim();
    if (name && name.toLowerCase() !== "hobby") return name;
    return q.title || null;
  }

  function getQuestCategoryDisplay(q: Quest) {
    const hobby = getQuestHobby(q);
    const title = q.title.trim().toLowerCase();
    const candidates = [
      hobby?.name?.trim(),
      hobby?.category?.trim(),
    ].filter((value): value is string => {
      if (!value) return false;
      const normalized = value.toLowerCase();
      if (/^(category|hobby|custom)$/i.test(value)) return false;
      return normalized !== title;
    });
    for (const raw of candidates) {
      const canonical = resolveCanonicalCategory(raw);
      if (canonical) return canonical;
      return raw;
    }
    return "Category";
  }

  function getSkillLevelLabel(skillLevel?: string | null) {
    const raw = (skillLevel || "").trim();
    if (!raw || raw.toLowerCase() === "any") return "Any level";
    if (/^beginner$/i.test(raw)) return "Beginner";
    if (/^intermediate$/i.test(raw)) return "Intermediate";
    if (/^advanced$/i.test(raw)) return "Advanced";
    return raw;
  }

  function buildQuestStorageUrls(quest: Pick<Quest, "media_video_url" | "media_items">) {
    return collectQuestStorageUrls(
      (quest.media_items || []).map((item) => ({
        url: item.url,
        thumbnailUrl: item.thumbnailUrl || null,
      })),
      quest.media_video_url || null,
    );
  }

  async function cleanupQuestStorage(quest: Pick<Quest, "media_video_url" | "media_items">, nextItems: QuestMediaItem[] = []) {
    if (!supabase) return;
    const originalUrls = new Set(buildQuestStorageUrls(quest));
    const nextUrls = new Set(
      collectQuestStorageUrls(
        nextItems.map((item) => ({
          url: item.url,
          thumbnailUrl: item.thumbnailUrl || null,
        })),
      ),
    );
    const removed = Array.from(originalUrls).filter((url) => !nextUrls.has(url));
    if (!removed.length) return;
    await removeStoragePublicUrls(supabase, removed);
  }

  async function deleteQuest(id: string) {
    if (!supabase || !userId) return;
    const ok = window.confirm("Delete this listing? This cannot be undone.");
    if (!ok) return;

    const quest = quests.find((q) => q.id === id) || null;
    const { error } = await supabase.from("quests").delete().eq("id", id).eq("creator_id", userId);
    if (error) return setStatus(error.message);
    if (quest) {
      try {
        await cleanupQuestStorage(quest, []);
      } catch (cleanupErr) {
        console.warn("Quest storage cleanup failed after delete:", cleanupErr);
        setStatus("Listing deleted (storage cleanup partial)");
        await loadQuests();
        return;
      }
    }
    if (editingQuestId === id) {
      setShowCreateModal(false);
      resetQuestForm();
    }
    setStatus("Listing deleted");
    await loadQuests();
  }

  async function toggleJoinQuest(id: string) {
    if (!supabase || !userId) {
      setShowAuthModal(true);
      return setStatus("Log in to join.");
    }

    const quest = quests.find((q) => q.id === id);
    if (quest && quest.creator_id === userId) {
      return setStatus("You can't join your own listing.");
    }

    let liveLocation: { lat: number; lon: number; accuracy?: number } | null = null;
    try {
      liveLocation = await getCurrentPositionOnce();
      setUserLocation(liveLocation);
      setUserLocationStatus("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Location access is required to request or join this event.";
      setUserLocationStatus("denied");
      return setStatus(message);
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
    const questCoords = quest ? await fetchQuestCityCoordinates(getQuestMapQuery(quest)) : null;
    const cachedDistance = distanceByQuestId[id];
    const parsedCachedDistance = cachedDistance ? Number.parseFloat(cachedDistance) : NaN;
    const distanceMiles = Number.isFinite(parsedCachedDistance)
      ? parsedCachedDistance
      : (questCoords ? haversineMiles(liveLocation!.lat, liveLocation!.lon, questCoords.lat, questCoords.lon) : null);
    const existingStatus = membershipStatusByQuest[id];
    if (existingStatus === "declined") {
      const { error: delErr } = await supabase
        .from("quest_members")
        .delete()
        .eq("quest_id", id)
        .eq("user_id", userId);
      if (delErr) return setStatus(delErr.message);
    }
    if (distanceMiles !== null && Number.isFinite(distanceMiles) && distanceMiles >= 15) {
      setPendingDistanceJoinQuestId(id);
      setPendingDistanceJoinLabel(distanceLabelMiles(distanceMiles));
      setShowDistanceJoinModal(true);
      return;
    }
    {
      const { error } = await supabase.from("quest_members").insert({ quest_id: id, user_id: userId, role: "member", status: nextStatus });
      if (error && !error.message.includes("duplicate") && !error.message.toLowerCase().includes("unique")) return setStatus(error.message);
    }
    await loadMemberships(userId);
    setStatus(`${nextStatus === "pending" ? "Join request sent ⏳" : "Joined quest ✅"}`);
  }

  async function confirmDistanceJoinQuest() {
    if (!supabase || !userId || !pendingDistanceJoinQuestId) return;
    const id = pendingDistanceJoinQuestId;
    const quest = quests.find((q) => q.id === id);
    if (!quest) return;
    const nextStatus = (quest.join_mode || "open") === "approval_required" ? "pending" : "approved";
    const existingStatus = membershipStatusByQuest[id];
    setShowDistanceJoinModal(false);
    setPendingDistanceJoinQuestId(null);
    setPendingDistanceJoinLabel("");
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
    setStatus(`${nextStatus === "pending" ? "Join request sent ⏳" : "Joined quest ✅"} This event is about ${pendingDistanceJoinLabel} from you.`);
  }

  const filteredQuests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const visible = quests
      .filter((q) => !blockedUserIds.includes(q.creator_id))
      .filter((q) => {
        if (!query) return true;
        const haystack = [
          q.title,
          q.description,
          q.city,
          q.availability,
          getQuestHobby(q)?.name,
          q.skill_level,
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      });
    return [...visible].sort((a, b) => {
      if (sortMode === "title") return (a.title || "").localeCompare(b.title || "");
      const parseStart = (availability?: string | null) => {
        const match = availability?.match(/Start at:\s*(.+?)(?:\s*·\s*Notes:|$)/i);
        const ts = match ? Date.parse(match[1] || "") : NaN;
        return Number.isFinite(ts) ? ts : 0;
      };
      const aTime = parseStart(a.availability);
      const bTime = parseStart(b.availability);
      if (sortMode === "soonest") {
        if (aTime && bTime) return aTime - bTime;
        if (aTime) return -1;
        if (bTime) return 1;
      }
      return +new Date(b.created_at || 0) - +new Date(a.created_at || 0);
    });
  }, [quests, blockedUserIds, searchQuery, sortMode]);

  useEffect(() => {
    if (loading) return;
    if (restoreScrollY === null) return;
    const y = restoreScrollY;
    setRestoreScrollY(null);
    window.sessionStorage.removeItem("sidequest_home_scroll_y");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, behavior: "auto" });
      });
    });
  }, [loading, restoreScrollY, filteredQuests.length]);

  const editingQuest = useMemo(() => quests.find((q) => q.id === editingQuestId) || null, [quests, editingQuestId]);
  const mapQuestItems = useMemo(() => {
    const items = filteredQuests
      .map((quest) => ({
        quest,
        coords: coordsByQuestId[quest.id] || null,
        distance: distanceByQuestId[quest.id] || "",
      }))
      .filter((item) => item.coords)
      .sort((a, b) => {
        const ap = Number(a.distance.split(" ")[0] || "99999");
        const bp = Number(b.distance.split(" ")[0] || "99999");
        return ap - bp;
      })
      .slice(0, 10);
    return items;
  }, [coordsByQuestId, distanceByQuestId, filteredQuests]);
  const mapQuestMarkers = useMemo(() => {
    return mapQuestItems.map((item) => ({
      id: item.quest.id,
      title: item.quest.title,
      city: item.quest.city,
      location: formatQuestCityState(item.quest),
      category: getQuestCategoryDisplay(item.quest),
      host: (() => {
        const creator = getCreatorProfile(item.quest);
        return creator?.display_name
          ? {
              id: item.quest.creator_id,
              name: creator.display_name,
              avatarUrl: creator.avatar_url || null,
            }
          : undefined;
      })(),
      coords: item.coords!,
      distance: item.distance,
    }));
  }, [mapQuestItems]);
  const selectedMapQuest = useMemo(() => {
    if (!selectedMapQuestId) return null;
    return mapQuestItems.find((item) => item.quest.id === selectedMapQuestId)?.quest || null;
  }, [mapQuestItems, selectedMapQuestId]);
  const mapBounds = useMemo(() => {
    const points = mapQuestItems.flatMap((item) => (item.coords ? [item.coords] : []));
    const userLocationIsUsable = !!userLocation && (!userLocation.accuracy || userLocation.accuracy <= 50000);
    if (userLocationIsUsable) points.push(userLocation);
    if (!points.length) return null;
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lonMin = Math.min(...lons);
    const lonMax = Math.max(...lons);
    const padLat = Math.max((latMax - latMin) * 0.2, 0.15);
    const padLon = Math.max((lonMax - lonMin) * 0.2, 0.15);
    return {
      latMin: latMin - padLat,
      latMax: latMax + padLat,
      lonMin: lonMin - padLon,
      lonMax: lonMax + padLon,
    };
  }, [mapQuestItems, userLocation]);
  const mapViewEmbedUrl = useMemo(() => {
    if (!mapBounds) return "";
    const centerLat = (mapBounds.latMin + mapBounds.latMax) / 2;
    const centerLon = (mapBounds.lonMin + mapBounds.lonMax) / 2;
    const bbox = `${mapBounds.lonMin}%2C${mapBounds.latMin}%2C${mapBounds.lonMax}%2C${mapBounds.latMax}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${centerLat}%2C${centerLon}`;
  }, [mapBounds]);
  const locationLooksOff = useMemo(() => {
    if (!userLocation || !mapQuestItems.length) return false;
    const nearestMiles = Math.min(...mapQuestItems.map((item) => haversineMiles(userLocation.lat, userLocation.lon, item.coords!.lat, item.coords!.lon)));
    return Number.isFinite(nearestMiles) && nearestMiles > 1500;
  }, [mapQuestItems, userLocation]);

  useEffect(() => {
    if (feedViewMode !== "map") return;
    setSelectedMapQuestId(null);
    setFocusedMapQuestId(null);
  }, [feedViewMode]);

  useEffect(() => {
    if (feedViewMode !== "map") return;
    const quest = selectedMapQuest;
    if (!quest) {
      setMapViewTitle("");
      return;
    }
    setMapViewTitle(formatQuestMeta(quest));
  }, [feedViewMode, selectedMapQuest]);

  useEffect(() => {
    let cancelled = false;
    if (!filteredQuests.length) {
    setDistanceByQuestId({});
    setCoordsByQuestId({});
    return;
    }
    void (async () => {
      const entries = await Promise.all(filteredQuests.map(async (quest) => {
        const queries = getQuestDistanceQueries(quest);
        const results = await Promise.all(queries.map((query) => fetchQuestCityCoordinates(query)));
        const coords = results.find(Boolean) || null;
        return [quest.id, coords] as const;
      }));
      if (cancelled) return;
      setCoordsByQuestId(Object.fromEntries(entries.filter(([, value]) => value).map(([id, value]) => [id, value!])));
      if (userLocation) {
        const distanceEntries = entries
          .filter(([, value]) => value)
          .map(([id, value]) => [id, distanceLabelMiles(haversineMiles(userLocation.lat, userLocation.lon, value!.lat, value!.lon))] as const);
        setDistanceByQuestId(Object.fromEntries(distanceEntries.filter(([, value]) => value)));
      } else {
        setDistanceByQuestId({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filteredQuests, userLocation]);

  return (
<main className="min-h-screen bg-transparent">
      <div className="w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 lg:py-8 space-y-6">
        {!!pendingVerifyEmail && (
          <div className="text-sm rounded bg-emerald-50 border p-2">Email sent to <b>{pendingVerifyEmail}</b>. <button className="underline" disabled={resendCooldown > 0} onClick={() => void resendVerification()}>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend"}</button></div>
        )}
        {!userId && !showOnboardingWizard ? (
          <section className="py-3 sm:py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Quest Hat</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">Find local people to do real plans with.</h1>
            <p className="mt-3 max-w-2xl text-sm text-gray-500 sm:text-base">
              Quest Hat helps people discover nearby activities, start group quests, and meet others who want to do
              the same thing instead of just talking about it.
            </p>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
          <aside className="space-y-4 xl:sticky xl:top-[76px]">
            <section className="space-y-4">
              <button
                type="button"
                onClick={() => setShowDiscoverFilters((current) => !current)}
                className="hidden w-full items-start justify-between gap-4 text-left sm:flex"
                aria-expanded={showDiscoverFilters}
                aria-controls="discover-filters"
              >
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Filter quests</p>
                  <h2 className="text-xl font-semibold">Find quests</h2>
                  <p className="text-sm text-gray-500">Tap to filter by category, sort, and search.</p>
                </div>
                <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white text-slate-700">
                  <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${showDiscoverFilters ? "rotate-180" : ""} blink-colors`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>
              {showDiscoverFilters ? (
                <div id="discover-filters" className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="block text-xs font-medium text-gray-600">Category</label>
                      <select className="w-full border rounded-xl px-3 py-2.5 bg-white" value={hobbyFilter} onChange={(e) => setHobbyFilter(e.target.value)}>
                        <option value="all">All categories</option>
                        {categoryOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="block text-xs font-medium text-gray-600">Sort by</label>
                      <select className="w-full border rounded-xl px-3 py-2.5 bg-white" value={sortMode} onChange={(e) => setSortMode(e.target.value as "newest" | "soonest" | "title")}>
                        <option value="newest">Newest</option>
                        <option value="soonest">Soonest</option>
                        <option value="title">Title</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="block text-xs font-medium text-gray-600">Search</label>
                    <input
                      className="w-full border rounded-xl px-3 py-2.5 bg-white"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search title, city, category..."
                    />
                  </div>
                </div>
              ) : null}
            </section>

          </aside>

          <section className="space-y-4">
            <div className="flex flex-col items-stretch gap-3 px-1 sm:flex-row sm:items-center sm:justify-between sm:px-1">
              <button
                type="button"
                onClick={() => setShowDiscoverFilters((current) => !current)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left sm:hidden"
                aria-expanded={showDiscoverFilters}
                aria-controls="discover-filters"
              >
                <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white text-slate-700">
                  <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${showDiscoverFilters ? "rotate-180" : ""} blink-colors`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Filter quests</p>
                  <h2 className="text-xl font-semibold">Find quests</h2>
                  <p className="text-sm text-gray-500">Tap to filter by category, sort, and search.</p>
                </div>
              </button>
              <div className="hidden sm:block flex-1" />
              <div
                className="relative inline-grid grid-cols-2 self-end items-stretch rounded-full border border-white/10 bg-[#0c5063] p-1 shadow-lg shadow-black/20 backdrop-blur"
                role="switch"
                aria-checked={feedViewMode === "map"}
                aria-label="Toggle between list and map"
                onClick={(e) => {
                  if (feedToggleDragStartRef.current !== null) return;
                  const target = e.target as HTMLElement;
                  if (target.closest("button")) return;
                  setFeedViewMode((current) => (current === "list" ? "map" : "list"));
                }}
                onPointerDown={(e) => {
                  feedToggleDragStartRef.current = e.clientX;
                }}
                onPointerUp={(e) => {
                  const start = feedToggleDragStartRef.current;
                  feedToggleDragStartRef.current = null;
                  if (start === null) return;
                  const delta = e.clientX - start;
                  if (Math.abs(delta) < 12) return;
                  setFeedViewMode(delta > 0 ? "map" : "list");
                }}
                onPointerCancel={() => {
                  feedToggleDragStartRef.current = null;
                }}
              >
              <span
                className={`absolute inset-y-1 left-1 w-[calc(50%-0.375rem)] rounded-full bg-white shadow transition-transform duration-200 ease-out ${feedViewMode === "map" ? "translate-x-full" : "translate-x-0"}`}
                aria-hidden="true"
              />
              <button
                aria-pressed={feedViewMode === "list"}
                className={`relative z-10 w-full rounded-full px-3.5 py-1.5 text-center text-xs font-medium transition ${feedViewMode === "list" ? "text-black dark:text-white" : "text-white/75 hover:text-white dark:text-white/65 dark:hover:text-white"}`}
                onClick={() => setFeedViewMode("list")}
                type="button"
              >
                List
              </button>
              <button
                aria-pressed={feedViewMode === "map"}
                className={`relative z-10 w-full rounded-full px-3.5 py-1.5 text-center text-xs font-medium transition ${feedViewMode === "map" ? "text-black dark:text-white" : "text-white/75 hover:text-white dark:text-white/65 dark:hover:text-white"}`}
                onClick={() => setFeedViewMode("map")}
                type="button"
              >
                  Map
                </button>
              </div>
            </div>

            {feedViewMode === "list" ? (
              <div className="grid w-screen max-w-none gap-0 grid-cols-1 -mx-4 sm:w-full sm:mx-auto sm:max-w-3xl xl:mx-auto xl:w-full xl:max-w-6xl">
              {loading ? <p>Loading...</p> : filteredQuests.map((q) => {
            const creatorProfile = getCreatorProfile(q);
            const feedMediaItems: QuestMediaItem[] = [
              ...(q.media_video_url ? [{ url: q.media_video_url, type: "video" as const, label: q.media_source === "live" ? "Live video" : "Video", thumbnailUrl: undefined }] : []),
              ...((q.media_items || []).map((m) => ({ url: m.url, type: m.type, label: m.label || undefined, thumbnailUrl: m.thumbnailUrl || undefined }))),
            ];
            const feedIndex = feedMediaIndexByQuest[q.id] || 0;
            const fallbackVisual = getCategoryFallbackVisual(getQuestCategoryRaw(q));
            const questCoords = coordsByQuestId[q.id];
            const distanceLabel = distanceByQuestId[q.id] || (userLocation && questCoords ? distanceLabelMiles(haversineMiles(userLocation.lat, userLocation.lon, questCoords.lat, questCoords.lon)) : "");

            return (
            <article key={q.id} className={`quest-card w-full bg-white border border-slate-200 shadow-[0_14px_40px_rgba(15,23,42,0.08)] overflow-hidden ${feedViewMode === "list" ? "rounded-none sm:rounded-[1.75rem] h-[calc(100svh-10.75rem)] sm:h-auto flex flex-col xl:h-[calc(100dvh-8.25rem)] xl:flex xl:flex-col" : "rounded-[2rem]"}`}>
              <div className={`p-3 flex items-center justify-between gap-2 ${feedViewMode === "list" ? "sm:p-4 absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/22 via-black/12 via-black/6 to-transparent py-2 sm:py-3 text-white border-0 backdrop-blur-[0.75px]" : ""}`}>
                <Link href={`/profile/${q.creator_id}`} className="flex items-center gap-2 min-w-0">
                  {creatorProfile?.avatar_url ? (
                    <img src={creatorProfile.avatar_url} alt="Creator" className="h-9 w-9 rounded-full object-cover border" />
                  ) : (
                    <div className="h-9 w-9 rounded-full border bg-gray-100" />
                  )}
                  <span className="text-sm font-semibold truncate">{creatorProfile?.display_name || "View profile"}</span>
                </Link>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col leading-tight">
                    <p className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-white/90 drop-shadow sm:text-base">
                      <AppIcon name="location" className="h-4 w-4" /> {getQuestCityQuery(q)}
                    </p>
                    {distanceLabel ? (
                      <p className="pl-5 text-[11px] font-medium whitespace-nowrap text-white/80 drop-shadow sm:text-sm">
                        {distanceLabel}
                      </p>
                    ) : null}
                  </div>
                  <div className="relative">
                    <button
                      className="border rounded px-2 py-1 text-xs"
                      aria-label="Listing options"
                      onClick={() => setOpenCardMenuQuestId((v) => (v === q.id ? null : q.id))}
                    >
                      <AppIcon name="more" className="h-5 w-5" />
                    </button>
                    {openCardMenuQuestId === q.id && (
                      <div className="absolute right-0 mt-1 w-36 rounded-xl border bg-white shadow-md z-20 overflow-hidden">
                        {userId === q.creator_id && (
                          <>
                            <button className="block w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-gray-50" onClick={() => { setOpenCardMenuQuestId(null); openEditModal(q); }}>
                              Edit listing
                            </button>
                            <button className="block w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50" onClick={() => { setOpenCardMenuQuestId(null); void deleteQuest(q.id); }}>
                              Delete listing
                            </button>
                          </>
                        )}
                        {userId !== q.creator_id && (
                          <button className="block w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50" onClick={() => { setOpenCardMenuQuestId(null); openReportModal(q); }}>
                            Report listing
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {feedMediaItems.length > 0 ? (
                <div className="relative flex-1 min-h-0 bg-black">
                  <div
                    className={`w-full h-full overflow-x-auto snap-x snap-mandatory flex ${feedViewMode === "list" ? "gap-0" : ""}`}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                      setFeedMediaIndexByQuest((prev) => ({ ...prev, [q.id]: Math.min(feedMediaItems.length - 1, Math.max(0, idx)) }));
                    }}
                  >
                    {feedMediaItems.map((m, i) => (
                      <div key={`${m.url}-${i}`} className={`relative w-full h-full shrink-0 snap-start bg-black overflow-hidden ${feedViewMode === "list" ? "min-h-0" : "aspect-[4/3] lg:aspect-[4/3]"}`}>
                        {m.type === "image" ? (
                          <button type="button" className="w-full h-full block overflow-hidden" onClick={() => setExpandedMedia({ items: feedMediaItems, index: i })}>
                            <img
                              src={m.url}
                              alt={m.label || "Listing media"}
                              className={`w-full h-full ${feedViewMode === "list" ? "object-contain object-center" : "object-cover object-center"}`}
                            />
                          </button>
                        ) : (
                          <>
                            {(m.thumbnailUrl || generatedVideoThumbs[`${q.id}-${i}`]) ? (
                              <img
                                src={m.thumbnailUrl || generatedVideoThumbs[`${q.id}-${i}`]}
                                alt={m.label || "Video thumbnail"}
                                className={`absolute inset-0 h-full w-full ${feedViewMode === "list" ? "object-contain object-center" : "object-cover object-center"}`}
                              />
                            ) : null}
                            <video
                              ref={(el) => {
                                feedVideoRefs.current[`${q.id}-${i}`] = el;
                              }}
                              src={m.url}
                              crossOrigin="anonymous"
                              poster={m.thumbnailUrl || generatedVideoThumbs[`${q.id}-${i}`] || undefined}
                              className={`relative z-10 w-full h-full bg-transparent opacity-0 transition-opacity duration-200 ${feedViewMode === "list" ? "object-contain object-center" : "object-cover object-center"}`}
                              preload="metadata"
                              playsInline
                              onLoadedMetadata={(e) => {
                                void generateVideoThumbnail(e.currentTarget, `${q.id}-${i}`);
                              }}
                              onLoadedData={(e) => {
                                e.currentTarget.classList.remove("opacity-0");
                                e.currentTarget.classList.add("opacity-100");
                              }}
                              onCanPlay={(e) => {
                                e.currentTarget.classList.remove("opacity-0");
                                e.currentTarget.classList.add("opacity-100");
                              }}
                              onClick={() => toggleFeedVideoPlayback(`${q.id}-${i}`)}
                            />
                            <button
                              type="button"
                              className="absolute top-3 right-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/65"
                              aria-label="Fullscreen"
                              title="Fullscreen"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openFeedVideoFullscreen(`${q.id}-${i}`);
                              }}
                            >
                              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M7 3H3v4" />
                                <path d="M17 3h4v4" />
                                <path d="M3 17v4h4" />
                                <path d="M21 17v4h-4" />
                              </svg>
                            </button>
                          </>
                        )}
                        {feedViewMode === "list" && feedMediaItems.length > 1 ? (
                          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-black/25 px-2 py-1 backdrop-blur-sm pointer-events-none">
                            {feedMediaItems.map((_, dotIndex) => (
                              <span key={dotIndex} className={`h-1.5 w-1.5 rounded-full ${dotIndex === feedIndex ? "bg-white" : "bg-white/40"}`} />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={`relative border-y overflow-hidden ${feedViewMode === "list" ? "h-full min-h-0 xl:flex-1 xl:min-h-0" : "h-[22vh] sm:h-[18vh] lg:h-[14vw] max-h-[220px]"}`} style={{ background: fallbackVisual.gradient, clipPath: feedViewMode === "list" ? "polygon(0 0, 100% 0, 100% 94%, 0 100%)" : undefined }}>
                  <img src={fallbackVisual.imageUrl} alt={fallbackVisual.title} className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-black/10" />
                  <div className="absolute inset-0 opacity-60" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 100%)" }} />
                </div>
              )}

              {feedViewMode === "list" ? (
                <>
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="soft-fade-layer pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-black/10 via-black/5 to-transparent"
                  />
                  <div
                    className={`absolute inset-x-0 bottom-0 z-10 px-4 text-white text-left ${expandedQuestIds[q.id] === false ? "pb-3" : "quest-list-overlay pt-8 pb-4"}`}
                    onClick={() => setExpandedQuestIds((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedQuestIds((prev) => ({ ...prev, [q.id]: !prev[q.id] }));
                      }
                    }}
                  >
                    <div className="flex h-full flex-col justify-end gap-4">
                      {expandedQuestIds[q.id] === false ? (
                        <div className="grid w-full max-w-[calc(100%-1rem)] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap backdrop-blur-[2px] shadow-sm">
                          <Link
                            href={`/listing/${q.id}`}
                            className="justify-self-start underline decoration-2 underline-offset-2 text-white/95 truncate max-w-full"
                            title="Open listing"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {q.title}
                          </Link>
                          <button
                            type="button"
                            className="justify-self-center inline-flex items-center gap-1 underline decoration-2 underline-offset-2 text-white/95"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedQuestIds((prev) => ({ ...prev, [q.id]: true }));
                            }}
                          >
                            <span>Show more</span>
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m6 10 6 6 6-6" />
                            </svg>
                          </button>
                          <div className="justify-self-end flex flex-col items-end gap-0.5 min-w-0 max-w-full">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 underline decoration-2 underline-offset-2 text-white/95 truncate max-w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openQuestCityMap(q);
                            }}
                          >
                            <span className="truncate">{formatQuestCityState(q)}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/85">
                              {getQuestCategoryDisplay(q)}
                            </p>
                            <h3 className="text-[11px] sm:text-xs font-semibold leading-tight tracking-tight text-white max-w-[70%]">
                              <Link href={`/listing/${q.id}`} className="underline decoration-2 underline-offset-2" title="Open listing">
                                {q.title}
                              </Link>
                            </h3>
                            {q.description ? <p className="text-sm text-white/85 leading-relaxed line-clamp-2">{q.description}</p> : null}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 bg-white">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-start gap-2 flex-1 min-w-0">
                    {userId !== q.creator_id ? (
                      <button
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-sm font-semibold text-slate-900 transition hover:text-[#0c5063] focus-visible:text-[#0c5063]"
                        aria-label={membershipStatusByQuest[q.id] === "pending" ? "Cancel request" : (membershipStatusByQuest[q.id] === "declined" ? "Request again" : (joinedQuestIds.includes(q.id) ? "Leave" : ((q.join_mode || "open") === "approval_required" ? "Request to join" : "Join")))}
                        title={membershipStatusByQuest[q.id] === "pending" ? "Cancel request" : (membershipStatusByQuest[q.id] === "declined" ? "Request again" : (joinedQuestIds.includes(q.id) ? "Leave" : ((q.join_mode || "open") === "approval_required" ? "Request to join" : "Join")))}
                        onClick={() => void toggleJoinQuest(q.id)}
                      >
                        <AppIcon name={membershipStatusByQuest[q.id] === "pending" ? "clock" : (membershipStatusByQuest[q.id] === "declined" ? "refresh" : (joinedQuestIds.includes(q.id) ? "minus" : "plus"))} className="h-6 w-6" />
                      </button>
                    ) : null}
                    <button className="inline-flex h-9 w-auto shrink-0 items-center justify-center gap-1 rounded-full bg-transparent px-1.5 text-sm font-medium text-slate-900 transition hover:text-[#0c5063] focus-visible:text-[#0c5063]" aria-label={`Comment ${commentCountByQuestId[q.id] || 0}`} title="Comment" onClick={() => {
                      void askQuestion(q, "public");
                    }}>
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 14a4 4 0 0 1-4 4H9l-5 3V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v6Z" />
                      </svg>
                      <span className="text-xs tabular-nums text-slate-700">{commentCountByQuestId[q.id] || 0}</span>
                    </button>
                    <button className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-sm font-medium text-slate-900 transition hover:text-[#0c5063] focus-visible:text-[#0c5063]" aria-label="Message" title="Message" onClick={() => {
                      void askQuestion(q, "private");
                    }}>
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-11Z" />
                        <path d="M5 7l7 5.5L19 7" />
                      </svg>
                    </button>
                    <button className="inline-flex h-9 w-auto shrink-0 items-center justify-center gap-1 rounded-full bg-transparent px-1.5 text-sm font-medium text-slate-900 transition hover:text-[#0c5063] focus-visible:text-[#0c5063]" aria-label={`Share ${shareCountByQuestId[q.id] || 0}`} title="Share" onClick={() => void shareQuest(q)}>
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 5v14" />
                        <path d="m6 11 6-6 6 6" />
                        <path d="M5 19h14" />
                      </svg>
                      <span className="text-xs tabular-nums text-slate-700">{shareCountByQuestId[q.id] || 0}</span>
                    </button>
                    </div>
                    <button className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-sm font-medium transition hover:text-[#0c5063] focus-visible:text-[#0c5063] ${bookmarkedQuestIds.includes(q.id) ? "text-[#0c5063]" : "text-slate-900"}`} aria-label={bookmarkedQuestIds.includes(q.id) ? "Saved" : "Save"} title={bookmarkedQuestIds.includes(q.id) ? "Saved" : "Save"} onClick={() => void toggleBookmark(q.id)}>
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={bookmarkedQuestIds.includes(q.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3.5 14.6 8.8l5.9.9-4.3 4.2 1 5.9L12 17.1 6.8 19.8l1-5.9-4.3-4.2 5.9-.9L12 3.5Z" />
                      </svg>
                    </button>
                  </div>
                </div>
                </>
              ) : (
                <div className={`p-3 sm:p-4 space-y-3 flex h-full flex-col sm:p-5`}>
                  <div className="space-y-2 min-h-[112px]">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[11px] sm:text-xs font-semibold leading-tight tracking-tight">
                        <Link href={`/listing/${q.id}`} className="underline decoration-2 underline-offset-2" title="Open listing">
                          {q.title}
                        </Link>
                      </h3>
                    </div>
                    <p className="text-xs font-medium text-slate-500 leading-relaxed">
                      {formatPostedLabel(q.created_at)}
                    </p>
                    <p className="text-xs font-medium text-slate-500 leading-relaxed">
                      {getEventTimingLabel(q.availability)}
                    </p>
                    {expandedQuestIds[q.id] ? (
                      <>
                        <Link href={`/listing/${q.id}`} className="text-xs font-medium text-slate-500 whitespace-nowrap">
                          View listing ↗
                        </Link>
                        <div className="flex flex-wrap gap-2">
                          <span className="text-[11px] font-semibold tracking-wide uppercase text-slate-700">{getSkillLevelLabel(q.skill_level)}</span>
                          <span className="text-[11px] font-semibold text-slate-700">·</span>
                          <span className="text-[11px] font-semibold tracking-wide uppercase text-slate-700">{getQuestCategoryDisplay(q)}</span>
                          <span className="text-[11px] font-semibold text-slate-700">·</span>
                          <span className="text-[11px] font-semibold tracking-wide uppercase text-slate-700">group {q.group_size > 0 ? q.group_size : "any"}</span>
                        </div>
                        {q.description ? <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">{q.description}</p> : null}
                        <p className="text-xs text-slate-500 leading-relaxed">Where: {formatQuestCityState(q)}{distanceLabel ? ` · ${distanceLabel}` : ""}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">When: {getEventTimingLabel(q.availability)}</p>
                        <button
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 underline underline-offset-2"
                          onClick={() => setExpandedQuestIds((prev) => ({ ...prev, [q.id]: false }))}
                        >
                          <span>Show less</span>
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m6 14 6-6 6 6" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <button
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 underline underline-offset-2 w-fit"
                        onClick={() => setExpandedQuestIds((prev) => ({ ...prev, [q.id]: true }))}
                      >
                        <span>Show more</span>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m6 10 6 6 6-6" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className={`grid w-full items-center ${userId !== q.creator_id ? "grid-cols-4" : "grid-cols-3"}`}>
                    {userId !== q.creator_id ? (
                      <button
                        className="justify-self-start inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-sm font-semibold text-black dark:text-white transition hover:text-[#0c5063] focus-visible:text-[#0c5063]"
                        aria-label={membershipStatusByQuest[q.id] === "pending" ? "Cancel request" : (membershipStatusByQuest[q.id] === "declined" ? "Request again" : (joinedQuestIds.includes(q.id) ? "Leave" : ((q.join_mode || "open") === "approval_required" ? "Request to join" : "Join")))}
                        title={membershipStatusByQuest[q.id] === "pending" ? "Cancel request" : (membershipStatusByQuest[q.id] === "declined" ? "Request again" : (joinedQuestIds.includes(q.id) ? "Leave" : ((q.join_mode || "open") === "approval_required" ? "Request to join" : "Join")))}
                        onClick={() => void toggleJoinQuest(q.id)}
                      >
                        <AppIcon name={membershipStatusByQuest[q.id] === "pending" ? "clock" : (membershipStatusByQuest[q.id] === "declined" ? "refresh" : (joinedQuestIds.includes(q.id) ? "minus" : "plus"))} className="h-7 w-7" />
                      </button>
                    ) : null}
                    <button className="justify-self-center inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-sm font-medium text-black dark:text-white transition hover:text-[#0c5063] focus-visible:text-[#0c5063]" aria-label="Comment" title="Comment" onClick={() => {
                      void askQuestion(q, "public");
                    }}>
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 14a4 4 0 0 1-4 4H9l-5 3V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v6Z" />
                      </svg>
                    </button>
                    <button className="justify-self-center inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-sm font-medium text-black dark:text-white transition hover:text-[#0c5063] focus-visible:text-[#0c5063]" aria-label="Message" title="Message" onClick={() => {
                      void askQuestion(q, "private");
                    }}>
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-11Z" />
                        <path d="M5 7l7 5.5L19 7" />
                      </svg>
                    </button>
                    <button className={`justify-self-end inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-sm font-medium transition hover:text-[#0c5063] focus-visible:text-[#0c5063] ${bookmarkedQuestIds.includes(q.id) ? "text-[#0c5063]" : "text-black dark:text-white"}`} aria-label={bookmarkedQuestIds.includes(q.id) ? "Saved" : "Save"} title={bookmarkedQuestIds.includes(q.id) ? "Saved" : "Save"} onClick={() => void toggleBookmark(q.id)}>
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill={bookmarkedQuestIds.includes(q.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3.5 14.6 8.8l5.9.9-4.3 4.2 1 5.9L12 17.1 6.8 19.8l1-5.9-4.3-4.2 5.9-.9L12 3.5Z" />
                      </svg>
                    </button>
                  </div>

                  {q.description ? (
                    <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">
                      {q.description}
                    </p>
                  ) : null}
                  <p className="text-xs font-medium text-slate-500 leading-relaxed">
                    Where: {formatQuestCityState(q)}{distanceLabel ? ` · ${distanceLabel}` : ""}
                  </p>
                  <p className="text-xs font-medium text-slate-500 leading-relaxed">When: {getEventTimingLabel(q.availability)}</p>
                </div>
              )}
            </article>
          );
          })}
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_340px]">
                <div className="space-y-4">
                  <div className="rounded-3xl bg-white border shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between gap-3 p-4 border-b">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Map view</p>
                        <h3 className="text-base sm:text-lg font-semibold">{mapViewTitle || "Select a pin"}</h3>
                      </div>
                      <div className="rounded-full border px-3 py-1.5 text-xs text-slate-500">10 closest</div>
                    </div>
                    <div className="p-4">
                      <div className="relative">
                        {loading ? (
                          <div className="grid place-items-center h-[60vh] rounded-3xl border bg-slate-100 text-slate-600">
                            <div className="flex flex-col items-center gap-3">
                              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
                              <p className="text-sm font-medium text-slate-700">Loading quests…</p>
                            </div>
                          </div>
                        ) : mapBounds ? (
                          <QuestMap
                            items={mapQuestMarkers}
                            userLocation={userLocation}
                            locationLabel={
                              userLocationStatus === "loading"
                                ? "Locating..."
                                : userLocationStatus === "ready"
                                  ? (userLocation?.accuracy && userLocation.accuracy > 50000 ? "Approximate location" : "My location")
                                  : locationPermission === "denied"
                                    ? "Enable in Settings"
                                    : "Locate me"
                            }
                            onLocateMe={() => {
                              setSelectedMapQuestId(null);
                              setFocusedMapQuestId(null);
                              void requestUserLocation();
                            }}
                            onSelectQuest={(questId) => setSelectedMapQuestId((current) => (current === questId ? null : questId))}
                            selectedQuestId={selectedMapQuest?.id || null}
                            focusQuestId={focusedMapQuestId}
                            locationLooksOff={locationLooksOff}
                            approximateLocation={!!(userLocation?.accuracy && userLocation.accuracy > 50000)}
                          />
                        ) : (
                          <div className="grid place-items-center h-[60vh] rounded-3xl border bg-slate-100 text-slate-600">Allow location to load nearby pins.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  {mapQuestItems.length ? mapQuestItems.map((item) => {
                    const creatorProfile = getCreatorProfile(item.quest);
                    const isActive = selectedMapQuest?.id === item.quest.id;
                    return (
                      <div
                        key={item.quest.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedMapQuestId((current) => (current === item.quest.id ? null : item.quest.id));
                          setFocusedMapQuestId(item.quest.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedMapQuestId((current) => (current === item.quest.id ? null : item.quest.id));
                            setFocusedMapQuestId(item.quest.id);
                          }
                        }}
                        className={`w-full rounded-2xl border p-4 text-left transition ${isActive ? "bg-black text-white border-black" : "bg-white border-slate-200 hover:border-slate-300"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h4 className={`font-semibold ${isActive ? "text-white" : "text-slate-900"}`}>{item.quest.title}</h4>
                            <p className={`mt-1 text-xs font-medium ${isActive ? "text-white/75" : "text-slate-500"}`}>{getQuestCategoryDisplay(item.quest)}</p>
                            <div className="mt-2 flex items-center gap-1 flex-wrap">
                              <Link
                                href={`/listing/${item.quest.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className={`text-xs underline underline-offset-2 ${isActive ? "text-white/80" : "text-slate-600"}`}
                              >
                                Open listing ↗
                              </Link>
                            </div>
                          </div>
                          <div className="flex min-w-0 max-w-[45%] flex-col items-end gap-1 text-right">
                            {creatorProfile ? (
                              <Link href={`/profile/${item.quest.creator_id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                                <span className={`text-xs font-medium ${isActive ? "text-white/80" : "text-slate-700"}`}>{creatorProfile.display_name || "Host"}</span>
                                {creatorProfile.avatar_url ? (
                                  <img src={creatorProfile.avatar_url} alt={creatorProfile.display_name || "Host"} className="h-6 w-6 rounded-full object-cover border border-white/60" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full border border-white/60 bg-white/40" />
                                )}
                              </Link>
                            ) : null}
                            <p className={`text-xs ${isActive ? "text-white/70" : "text-slate-500"}`}>{formatQuestCityState(item.quest)}{userLocationStatus === "ready" && item.distance ? ` • ${item.distance}` : ""}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-center gap-3">
                          {!(joinedQuestIds.includes(item.quest.id) || membershipStatusByQuest[item.quest.id] === "approved" || membershipStatusByQuest[item.quest.id] === "pending") ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleJoinQuest(item.quest.id);
                              }}
                            className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                                isActive
                                  ? "bg-white text-black"
                                  : "bg-[#0c5063] text-white"
                              }`}
                            >
                              Join
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleJoinQuest(item.quest.id);
                              }}
                              className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                                isActive
                                  ? "bg-white text-black"
                                  : "bg-slate-100 text-slate-900"
                              }`}
                            >
                              Leave
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }) : <p className="text-sm text-gray-500">No nearby quests yet.</p>}
                </div>
              </div>
            )}
            {!loading && filteredQuests.length === 0 && <p className="text-sm text-gray-500">No quests yet - create the first one.</p>}
          </section>
        </div>
      </div>

      {showOnboardingWizard && (
        <div className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white border shadow-lg p-5 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Welcome to {APP_NAME}</p>
                <h3 className="text-2xl font-semibold">Set up your profile</h3>
                <p className="text-sm text-gray-500">This takes about a minute and helps people find the right outdoor plans.</p>
                <p className="mt-2 text-xs text-gray-500">
                  {[
                    onboardingDisplayName.trim() ? "name" : null,
                    onboardingCity.trim() ? "city" : null,
                    onboardingBio.trim() ? "bio" : null,
                    onboardingInterestIds.length ? "interests" : null,
                    onboardingPhotoFile ? "photo" : null,
                  ].filter(Boolean).length}
                  /5 complete
                </p>
              </div>
              <button className="border rounded-full px-3 py-1.5 text-sm" onClick={() => void skipOnboarding()} type="button">
                Skip
              </button>
            </div>

            <div className="flex gap-2">
              {["Basics", "Bio", "Interests", "Photo"].map((label, index) => {
                const done =
                  (index === 0 && onboardingDisplayName.trim() && onboardingCity.trim()) ||
                  (index === 1 && onboardingBio.trim()) ||
                  (index === 2 && onboardingInterestIds.length > 0) ||
                  (index === 3 && onboardingPhotoFile);

                return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setOnboardingStep(index)}
                  className={`flex-1 rounded-full px-3 py-2 text-center text-sm border ${index === onboardingStep ? "bg-black text-white border-black" : "bg-gray-50"}`}
                >
                  <span className="inline-flex items-center justify-center gap-1.5">
                    {done ? <AppIcon name="check" className="h-4 w-4" /> : null}
                    <span>{label}</span>
                  </span>
                </button>
                );
              })}
            </div>

            {onboardingStep === 0 && (
              <div className="grid gap-3">
                <label className="text-sm font-medium">Display name</label>
                <input className="border rounded-xl px-3 py-2.5" value={onboardingDisplayName} onChange={(e) => setOnboardingDisplayName(e.target.value)} placeholder="How people should see you" />
                <CityAutocompleteInput label="City" value={onboardingCity} onChange={setOnboardingCity} placeholder="Where are you based?" countryCode="US" />
              </div>
            )}

            {onboardingStep === 1 && (
              <div className="grid gap-3">
                <label className="text-sm font-medium">Short bio</label>
                <textarea className="border rounded-xl px-3 py-2.5 min-h-28" value={onboardingBio} onChange={(e) => setOnboardingBio(e.target.value)} placeholder="Tell people what you like doing outside..." />
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="grid gap-3">
                <div>
                  <label className="text-sm font-medium">Pick a few interests</label>
                  <p className="text-xs text-gray-500">We’ll use these to personalize your feed and suggestions.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.slice(0, 12).map((option) => {
                    const active = onboardingInterestIds.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setOnboardingInterestIds((prev) => active ? prev.filter((id) => id !== option.id) : [...prev, option.id])}
                        className={`rounded-full border px-3 py-2 text-sm ${active ? "bg-black text-white border-black" : "bg-gray-50"}`}
                      >
                        {option.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="grid gap-3">
                <div>
                  <label className="text-sm font-medium">Add a profile photo</label>
                  <p className="text-xs text-gray-500">This helps people recognize you faster.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-black transition-all" style={{ width: onboardingPhotoFile || onboardingExistingAvatarUrl ? "100%" : "42%" }} />
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{onboardingPhotoFile || onboardingExistingAvatarUrl ? "Ready" : "Optional"}</span>
                </div>
                {onboardingExistingAvatarUrl && !onboardingPhotoPreviewUrl ? (
                  <div className="grid gap-2">
                    <p className="text-xs text-gray-500">Current photo</p>
                    <div className="h-40 w-40 rounded-3xl border overflow-hidden bg-gray-50">
                      <img src={onboardingExistingAvatarUrl} alt="Current profile photo" className="h-full w-full object-cover" />
                    </div>
                  </div>
                ) : null}
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="border rounded-xl px-3 py-2 bg-white text-sm"
                  onChange={(e) => {
                    const picked = e.target.files?.[0] ?? null;
                    if (!picked) return;
                    setOnboardingPhotoFile(picked);
                    if (onboardingPhotoPreviewUrl) URL.revokeObjectURL(onboardingPhotoPreviewUrl);
                    setOnboardingPhotoPreviewUrl(URL.createObjectURL(picked));
                    setOnboardingPhotoZoom(1.2);
                    setOnboardingPhotoOffsetX(0);
                    setOnboardingPhotoOffsetY(0);
                  }}
                />
                {(onboardingPhotoPreviewUrl || onboardingExistingAvatarUrl) && (
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_136px] lg:items-start">
                    <div className="grid gap-2">
                      <p className="text-xs text-gray-500">{onboardingPhotoPreviewUrl ? "Selected preview" : "Preview from your profile"}</p>
                    <div
                        className="relative h-44 sm:h-52 w-full overflow-hidden rounded-3xl border bg-black touch-none cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => {
                          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                          setOnboardingPhotoDragging(true);
                          setOnboardingPhotoLastPointer({ x: e.clientX, y: e.clientY });
                        }}
                        onPointerMove={(e) => {
                          if (!onboardingPhotoDragging || !onboardingPhotoLastPointer) return;
                          const dx = e.clientX - onboardingPhotoLastPointer.x;
                          const dy = e.clientY - onboardingPhotoLastPointer.y;
                          setOnboardingPhotoOffsetX((v) => v + dx);
                          setOnboardingPhotoOffsetY((v) => v + dy);
                          setOnboardingPhotoLastPointer({ x: e.clientX, y: e.clientY });
                        }}
                        onPointerUp={() => {
                          setOnboardingPhotoDragging(false);
                          setOnboardingPhotoLastPointer(null);
                        }}
                      >
                        <img
                          src={onboardingPhotoPreviewUrl || onboardingExistingAvatarUrl}
                          alt="Onboarding preview"
                          className="absolute inset-0 h-full w-full object-cover"
                          style={{
                            transform: `translate(${onboardingPhotoOffsetX}px, ${onboardingPhotoOffsetY}px) scale(${onboardingPhotoZoom})`,
                            transformOrigin: "center center",
                          }}
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-2 text-[11px] text-white">
                          Drag to reposition
                        </div>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="2"
                        step="0.01"
                        value={onboardingPhotoZoom}
                        onChange={(e) => setOnboardingPhotoZoom(Number(e.target.value))}
                      />
                      <button type="button" className="border rounded-full px-3 py-2 text-sm self-start" onClick={() => resetOnboardingPhoto()}>
                        Remove photo
                      </button>
                    </div>
                    <div className="grid gap-2 justify-items-center lg:pt-7">
                      <p className="text-xs text-gray-500">Final avatar</p>
                      <div className="h-32 w-32 rounded-full border overflow-hidden bg-gray-50 shadow-sm">
                        <img
                          src={onboardingPhotoPreviewUrl || onboardingExistingAvatarUrl}
                          alt="Final avatar preview"
                          className="h-full w-full object-cover"
                          style={{
                            transform: `translate(${onboardingPhotoOffsetX}px, ${onboardingPhotoOffsetY}px) scale(${onboardingPhotoZoom})`,
                            transformOrigin: "center center",
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-gray-500 text-center">This is roughly how your profile picture will appear.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-1 backdrop-blur flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[color:var(--surface-elevated)]/95 dark:bg-[color:var(--surface-elevated)]/95">
              <button
                type="button"
                className="rounded-full px-4 py-2 border border-[var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
                onClick={() => setOnboardingStep((s) => Math.max(0, s - 1))}
                disabled={onboardingStep === 0 || onboardingSaving}
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Step {onboardingStep + 1} of 4
                </span>
                {onboardingStep < 3 ? (
                  <button
                    type="button"
                    className="rounded-full px-4 py-2 bg-[color:var(--accent-secondary)] text-white shadow-md shadow-black/10 dark:bg-[#6daec2] dark:text-white"
                    onClick={() => setOnboardingStep((s) => Math.min(3, s + 1))}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-full px-4 py-2 bg-[color:var(--accent-secondary)] text-white shadow-md shadow-black/10 disabled:opacity-50 dark:bg-[#6daec2] dark:text-white"
                    disabled={onboardingSaving}
                    onClick={() => void saveOnboarding()}
                  >
                    {onboardingSaving ? "Saving..." : "Finish setup"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-stretch sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
          <div className="w-full sm:w-full sm:max-w-lg rounded-none sm:rounded-2xl bg-[color:var(--surface-elevated)] border-0 sm:border border-[var(--border)] p-4 sm:p-5 space-y-3 sm:space-y-4 shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto overflow-x-hidden my-0 sm:my-auto pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 box-border overscroll-contain touch-pan-y [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
            <div className="flex justify-between items-start gap-3">
              <div className="space-y-1">
                <h3 className="font-semibold text-lg">{authMode === "signup" ? "Create your account" : "Welcome back"}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {authMode === "signup"
                    ? "Make a profile and start joining real plans."
                    : "Pick up where you left off and get back in."}
                </p>
              </div>
              <button onClick={() => setShowAuthModal(false)} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm">
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-full bg-[color:var(--muted)] p-1">
              <button
                type="button"
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${authMode === "signup" ? "bg-[color:var(--accent-secondary)] text-white shadow-md" : "text-[color:var(--foreground)]/80"}`}
                onClick={() => setAuthMode("signup")}
              >
                Sign up
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${authMode === "login" ? "bg-[color:var(--accent-secondary)] text-white shadow-md" : "text-[color:var(--foreground)]/80"}`}
                onClick={() => setAuthMode("login")}
              >
                Log in
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm">
              {authMode === "signup" ? (
                <button
                  type="button"
                  className="text-gray-600 dark:text-gray-400 underline underline-offset-2"
                  onClick={() => setAuthMode("login")}
                >
                  Already have an account?
                </button>
              ) : (
                <button
                  type="button"
                  className="text-gray-600 dark:text-gray-400 underline underline-offset-2"
                  onClick={() => setAuthMode("signup")}
                >
                  New here?
                </button>
              )}
            </div>

            {status && <div className="text-sm rounded-xl border border-amber-300 bg-amber-100/90 text-amber-950 px-3 py-2">{status}</div>}

            <form onSubmit={authMode === "signup" ? signUpWithPassword : signInWithPassword} className="grid gap-2 sm:gap-3" autoComplete="on">
              <label className="text-xs font-medium text-gray-600">Email</label>
              <input className="border rounded-xl px-3 py-3" placeholder="you@email.com" type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {authMode === "signup" && (
                <>
                  <label className="text-xs font-medium text-gray-600">Full name</label>
                  <input className="border rounded-xl px-3 py-3" placeholder="Your name" name="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  <label className="text-sm font-medium">Date of birth (DOB)</label>
                  <input className="border rounded-xl px-3 py-3" type="date" name="bday" autoComplete="bday" value={dob} onChange={(e) => setDob(e.target.value)} required />
                  <p className="text-xs text-gray-500">Use your birthday (MM/DD/YYYY).</p>
                </>
              )}
              <label className="text-xs font-medium text-gray-600">Password</label>
              <div className="flex gap-2">
                <input className="border rounded-xl px-3 py-3 flex-1" placeholder="Password" type={showPassword ? "text" : "password"} name={authMode === "signup" ? "new-password" : "current-password"} autoComplete={authMode === "signup" ? "new-password" : "current-password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" className="rounded-xl border border-[var(--border)] px-3" onClick={() => setShowPassword((s) => !s)}>{showPassword ? "Hide" : "Show"}</button>
              </div>

              {authMode === "signup" && (
                <>
                  <label className="text-xs font-medium text-gray-600">Confirm password</label>
                  <div className="flex gap-2">
                    <input className="border rounded-xl px-3 py-3 flex-1" placeholder="Confirm password" type={showConfirmPassword ? "text" : "password"} name="confirm-password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                    <button type="button" className="rounded-xl border border-[var(--border)] px-3" onClick={() => setShowConfirmPassword((s) => !s)}>{showConfirmPassword ? "Hide" : "Show"}</button>
                  </div>
                  <div className="text-xs rounded-xl border border-[var(--border)] p-2.5 bg-[color:var(--muted)] leading-5">
                    <p>{passwordChecks.minLength ? "✅" : "⬜"} 8+ characters</p>
                    <p>{passwordChecks.uppercase ? "✅" : "⬜"} uppercase</p>
                    <p>{passwordChecks.lowercase ? "✅" : "⬜"} lowercase</p>
                    <p>{passwordChecks.number ? "✅" : "⬜"} number</p>
                    <p>{passwordChecks.special ? "✅" : "⬜"} special</p>
                    <p>{passwordChecks.match ? "✅" : "⬜"} passwords match</p>
                  </div>
                  <label className="text-sm flex gap-2 items-start leading-5"><input className="mt-0.5" type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} /><span>I accept the <a href="/terms" target="_blank" className="underline">Terms</a>.</span></label>
                  <label className="text-sm flex gap-2 items-start leading-5"><input className="mt-0.5" type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} /><span>Send me updates/promos (optional).</span></label>
                </>
              )}

              <button className="rounded-xl bg-[color:var(--accent-secondary)] py-3 font-semibold text-white shadow-md shadow-black/10">{authMode === "signup" ? "Create account" : "Log in"}</button>
            </form>

            <div className="pt-1 sm:pt-2 space-y-3">
              <div className="grid gap-2 sm:gap-3 sm:grid-cols-3">
                <button type="button" className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[color:var(--muted)] active:translate-y-0" onClick={() => void socialLogin("apple")}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 opacity-90 transition group-hover:opacity-100" aria-hidden="true" fill="currentColor">
                    <path d="M16.7 13.1c0-1.9 1-3.5 2.6-4.6-1-1.4-2.6-2.3-4.1-2.4-1.7-.2-3.2 1-4 .9-.9-.1-2.3-.9-3.8-.9-2 .1-3.8 1.1-4.8 2.7-2 3.3-.5 8.2 1.4 10.9 1 1.3 2.1 2.8 3.7 2.7 1.5-.1 2.1-1 4-1s2.5 1 4.1 1c1.6 0 2.6-1.3 3.6-2.7.8-1.2 1.2-2.4 1.2-2.5-.1 0-2.9-1.1-2.9-4.1ZM14.9 5.7c.8-1 1.3-2.3 1.1-3.6-1.2.1-2.6.8-3.4 1.8-.8.9-1.4 2.2-1.2 3.5 1.3.1 2.7-.7 3.5-1.7Z" />
                  </svg>
                  <span>Apple</span>
                </button>
                <button type="button" className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[color:var(--muted)] active:translate-y-0" onClick={() => void socialLogin("google")}>
                  <img src="/google-g.svg" alt="Google" className="h-4 w-4 shrink-0" />
                  <span>Google</span>
                </button>
                <button type="button" className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[color:var(--muted)] active:translate-y-0" onClick={() => void socialLogin("facebook")}>
                  <img src="/facebook-f.svg" alt="Facebook" className="h-4 w-4 shrink-0" />
                  <span>Facebook</span>
                </button>
              </div>
              {authMode === "login" && <button type="button" className="text-sm font-medium underline underline-offset-2" onClick={() => setShowTroubleModal(true)}>Trouble signing in?</button>}
            </div>

            {!!pendingVerifyEmail && <div className="text-sm rounded-xl border border-emerald-300 bg-emerald-50 p-3">Sent to <b>{pendingVerifyEmail}</b>. <button className="underline" disabled={resendCooldown > 0} onClick={() => void resendVerification()}>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend"}</button></div>}
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
                const picked = e.target.files?.[0] ?? null;
                if (!picked) {
                  setPhotoStepFile(null);
                  if (photoStepPreviewUrl) URL.revokeObjectURL(photoStepPreviewUrl);
                  setPhotoStepPreviewUrl("");
                  setPhotoStepState("idle");
                  return;
                }

                void (async () => {
                  try {
                    const file = await prepareImageForUpload(picked, { maxWidth: 2200, maxHeight: 2200, quality: 0.9 });
                    setPhotoStepFile(file);
                    setPhotoStepZoom(1.2);
                    setPhotoStepOffsetX(0);
                    setPhotoStepOffsetY(0);
                    if (photoStepPreviewUrl) URL.revokeObjectURL(photoStepPreviewUrl);
                    setPhotoStepPreviewUrl(URL.createObjectURL(file));
                    setPhotoStepState("ready");
                  } catch (err) {
                    setPhotoStepFile(null);
                    if (photoStepPreviewUrl) URL.revokeObjectURL(photoStepPreviewUrl);
                    setPhotoStepPreviewUrl("");
                    setPhotoStepState("idle");
                    setStatus(err instanceof Error ? err.message : "Could not process image.");
                  }
                })();
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
        <div className="fixed inset-0 z-50 bg-black/45 flex items-stretch sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
          <div className="w-full sm:w-full sm:max-w-xl rounded-none sm:rounded-2xl border-0 sm:border bg-white p-3 sm:p-4 space-y-2 h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto overflow-x-hidden my-0 sm:my-auto pb-28 md:pb-4 box-border">
            <div className="sticky top-0 z-10 -mx-3 sm:mx-0 px-3 sm:px-0 py-2 bg-white/95 dark:bg-black/95 backdrop-blur flex justify-between items-center gap-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-lg sm:text-xl text-slate-900 dark:text-white">{editingQuestId ? "Edit Listing" : "Create Quest"}</h3>
              <button disabled={savingQuest} onClick={() => { setShowCreateModal(false); resetQuestForm(); }} className="border rounded-full px-2 py-1 text-sm sm:text-base disabled:opacity-50">Close</button>
            </div>
            <form ref={createQuestFormRef} id="create-quest-form" onSubmit={createQuest} className="grid gap-2 pb-28 md:pb-4">
              {/* Core Fields */}
              <label className={`text-xs font-medium uppercase tracking-wide ${fieldErrors.category ? "text-red-600" : "text-slate-600"}`}>Category *</label>
              <div className="relative">
                <button
                  type="button"
                  className={`create-select-trigger w-full ${fieldErrors.category ? "is-invalid" : ""}`}
                  onClick={() => setCategoryDropdownOpen((open) => !open)}
                >
                  <span className={categoryInput.trim() ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"}>
                    {categoryInput.trim() || "Select a category"}
                  </span>
                  <AppIcon name="chevronDown" className={`h-4 w-4 text-slate-500 transition-transform ${categoryDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {categoryDropdownOpen ? (
                  <div className="create-select-menu category-select-menu absolute left-0 right-0 top-full z-20 mt-1">
                    <button
                      type="button"
                      className="create-select-option"
                      onClick={() => {
                        setUseCustomCategory(true);
                        setCustomCategory("");
                        setCategoryInput("");
                        setHobbyId("");
                        clearFieldError("category");
                        setCategoryDropdownOpen(false);
                      }}
                    >
                      Custom category...
                    </button>
                    {categoryOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="create-select-option"
                        onClick={() => {
                          setCategoryInput(option.name);
                          setUseCustomCategory(false);
                          setCustomCategory("");
                          setHobbyId(option.id.startsWith("canonical:") ? "" : option.id);
                          clearFieldError("category");
                          setCategoryDropdownOpen(false);
                        }}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
                {useCustomCategory ? (
                <input
                  className={`border rounded-xl px-2.5 py-2 w-full bg-white dark:bg-slate-900 text-sm sm:px-3 sm:py-2.5 sm:text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ${fieldErrors.category ? "border-red-500 ring-1 ring-red-300" : ""}`}
                  value={customCategory}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCustomCategory(value);
                    setCategoryInput(value);
                    clearFieldError("category");
                    setHobbyId("");
                  }}
                  placeholder="Enter a custom category"
                />
              ) : null}
              <p className="w-full text-[10px] leading-4 sm:text-xs text-gray-500 break-words break-all">
                {canonicalCategoryMatch && categoryInput.trim() && categoryInput.trim().toLowerCase() !== canonicalCategoryMatch.toLowerCase()
                  ? <>Mapped to: <span className="font-medium">{canonicalCategoryMatch}</span> · </>
                  : null}
                <span className="block whitespace-normal">Category suggestions: <span className="italic">{canonicalCategorySuggestions.join(", ")}</span></span>
                <br />
                <span className="block whitespace-normal">Title suggestion: <span className="italic">{categoryTitleHint}</span></span>
              </p>
              <div className="flex flex-wrap gap-1.5 min-w-0 max-w-full">
                {categoryTitleSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion}-${index}`}
                    type="button"
                    className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 py-[5px] text-[10px] sm:px-3 sm:py-1.5 sm:text-xs font-medium transition active:scale-[0.98] ${
                      index === 0
                        ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    }`}
                    onClick={() => {
                      setTitle(suggestion);
                      clearFieldError("title");
                    }}
                  >
                    <span className={`text-xs leading-none shrink-0 ${index === 0 ? "dark:text-slate-950" : "dark:text-slate-300"}`}>{index === 0 ? "✨" : "•"}</span>
                    <span className="min-w-0 whitespace-normal break-words">{suggestion}</span>
                  </button>
                ))}
              </div>

              <label className={`text-xs font-medium uppercase tracking-wide ${fieldErrors.title ? "text-red-600" : "text-slate-600"}`}>Title *</label>
              <input className={`border rounded-xl px-2.5 py-2 text-sm sm:px-3 sm:py-2.5 sm:text-base ${fieldErrors.title ? "border-red-500 ring-1 ring-red-300" : ""}`} placeholder={titlePlaceholder} value={title} onChange={(e) => { setTitle(e.target.value); clearFieldError("title"); }} />

              <label className="text-xs font-medium uppercase tracking-wide text-slate-600">Availability *</label>
              <div className="grid gap-1.5 text-sm sm:gap-2">
                <label className="flex items-center gap-2"><input type="radio" checked={availabilityMode === "specific_time"} onChange={() => setAvailabilityMode("specific_time")} className="scale-90" /> <span className="text-sm sm:text-base">Start at a specific time</span></label>
                <label className="flex items-center gap-2"><input type="radio" checked={availabilityMode === "find_best_time"} onChange={() => setAvailabilityMode("find_best_time")} className="scale-90" /> <span className="text-sm sm:text-base">Let's see which time works best</span></label>
              </div>
              {availabilityMode === "specific_time" && (
                <input type="datetime-local" className="border rounded-xl px-2.5 py-2 text-sm sm:px-3 sm:py-2.5 sm:text-base" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="scale-90" /> <span className="text-sm">Recurring</span>
              </label>
              {isRecurring && (
                <div className="grid gap-2">
                  <CreateSelect
                    value={recurringFrequency}
                    placeholder="Choose frequency"
                    options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]}
                    onChange={(next) => setRecurringFrequency(next as "daily" | "weekly" | "monthly")}
                  />
                  <input type="date" className="border rounded-xl px-2.5 py-2 text-sm sm:px-3 sm:py-2.5 sm:text-base" value={recurringStartDate} onChange={(e) => setRecurringStartDate(e.target.value)} placeholder="Start date" />
                </div>
              )}

              <label className="text-xs font-medium uppercase tracking-wide text-slate-600">Join Mode *</label>
              <CreateSelect
                value={joinMode}
                placeholder="Choose join mode"
                options={[{ value: "open", label: "Anyone can join instantly" }, { value: "approval_required", label: "Host must approve members" }]}
                onChange={(next) => setJoinMode(next as "open" | "approval_required")}
              />

              <div
                ref={locationVisibilityRef}
                className={`create-location-panel rounded-2xl border p-2 sm:p-3 space-y-2 sm:space-y-3 transition ${
                  highlightLocationVisibility || fieldErrors.locationVisibility || fieldErrors.location ? "border-red-200 bg-red-50" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className={`text-sm sm:text-base font-medium ${fieldErrors.locationVisibility ? "text-red-600" : ""}`}>Location *</label>
                    <p className="text-[10px] leading-4 sm:text-xs text-slate-500">Choose remote or in person, then add the details below.</p>
                  </div>
                </div>
                <div className="grid gap-1">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-slate-600">Meeting type</label>
                  <div className="grid gap-2 sm:gap-2.5">
                    <button
                      type="button"
                      className={`rounded-xl border px-2.5 py-2 text-left transition ${
                        locationMode === "in_person" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:bg-slate-100"
                      }`}
                      onClick={() => {
                        setLocationMode("in_person");
                        clearFieldError("location");
                      }}
                    >
                      <div className="font-medium text-sm sm:text-base">In person</div>
                      <div className={`text-[11px] leading-4 sm:text-xs ${locationMode === "in_person" ? "text-white/80" : "text-slate-500"}`}>Meet at a place you choose</div>
                    </button>
                    <button
                      type="button"
                      className={`rounded-xl border px-2.5 py-2 text-left transition ${
                        locationMode === "remote" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:bg-slate-100"
                      }`}
                      onClick={() => {
                        setLocationMode("remote");
                        setExactLocationVisibility("private");
                        setPublicVisibilityConfirmed(false);
                        clearFieldError("location");
                        clearFieldError("locationVisibility");
                      }}
                    >
                      <div className="font-medium text-sm sm:text-base">Remote</div>
                      <div className={`text-[11px] leading-4 sm:text-xs ${locationMode === "remote" ? "text-white/80" : "text-slate-500"}`}>Paste a meeting link</div>
                    </button>
                  </div>
                </div>
                {locationMode === "in_person" ? (
                  <div className="grid gap-1">
                    <label className={`text-[11px] font-medium uppercase tracking-wide ${fieldErrors.locationVisibility ? "text-red-600" : "text-slate-600"}`}>Privacy</label>
                    <CreateSelect
                      value={exactLocationVisibility}
                      placeholder="Choose privacy"
                      invalid={Boolean(fieldErrors.locationVisibility)}
                      options={[
                        { value: "private", label: "Private (manual share)" },
                        ...(joinMode !== "open" ? [{ value: "approved_members", label: "Auto-share with approved members" }] : []),
                        { value: "public", label: "Public (everyone)" },
                      ]}
                      onChange={(value) => {
                        const next = value as "private" | "public" | "approved_members";
                        if (next === "private" && !manualShareWarningBypassRef.current) {
                          setPendingManualShareVisibility(next);
                          setShowManualShareConfirm(true);
                          return;
                        }
                        setExactLocationVisibility(next);
                        clearFieldError("locationVisibility");
                        setPublicVisibilityConfirmed(false);
                      }}
                    />
                  </div>
                ) : null}
                <div className="grid gap-1">
                  <label className={`text-[11px] font-medium uppercase tracking-wide ${fieldErrors.location ? "text-red-600" : "text-slate-600"}`}>
                    {locationMode === "remote" ? "Meeting link" : "Meetup location"}
                  </label>
                  <div className="relative">
                    <input
                      className={`border rounded-xl px-2.5 py-2 w-full bg-white text-sm sm:px-3 sm:py-2.5 sm:text-base ${fieldErrors.location ? "border-red-500 ring-1 ring-red-300" : ""}`}
                      placeholder={locationMode === "remote" ? "Paste a Google Meet, Zoom, or Teams link" : "We recommend a public place"}
                      value={exactAddress}
                      onChange={(e) => {
                        setExactAddress(e.target.value);
                        clearFieldError("location");
                      }}
                    />
                    {locationMode === "in_person" && citySuggestions.length > 0 && (
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

              <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
                <div className="grid gap-1">
                  <label className={`text-xs font-medium uppercase tracking-wide ${fieldErrors.country ? "text-red-600" : "text-slate-600"}`}>Country *</label>
                  <CreateSelect
                    value={countryQuery}
                    placeholder="Choose a country"
                    searchable
                    invalid={Boolean(fieldErrors.country)}
                    options={countryOptions.map((country) => ({ value: country.name, label: country.name }))}
                    onChange={(next) => {
                      setCountryQuery(next);
                      setCountryCode(resolveCountryCodeByName(next));
                      clearFieldError("country");
                    }}
                  />
                </div>
              </div>

              <label className="text-xs font-medium uppercase tracking-wide text-slate-600">Media</label>
              <div className="grid gap-2 rounded-xl border p-2 sm:p-3 bg-gray-50">
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(e) => {
                    void handleQuestMediaPicked(e.target.files);
                    e.currentTarget.value = "";
                  }}
                  className="border rounded-xl px-2.5 py-2 text-sm sm:px-3 sm:py-2.5 sm:text-base"
                />
                <p className="text-[10px] leading-4 sm:text-xs text-gray-500">Drag thumbnails to reorder. First item is Main. Tap an item to edit its caption below.</p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 auto-rows-fr">
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
                        className={`relative aspect-[4/3] overflow-hidden rounded-xl border bg-white ${selectedMediaId === item.id ? "ring-2 ring-blue-500" : ""}`}
                      >
                        {item.type === "image" ? (
                          <img src={previewUrl} alt={item.label || "Media preview"} className="h-full w-full object-cover" />
                        ) : (
                          <video src={previewUrl} poster={item.thumbnailUrl || undefined} className="h-full w-full object-cover bg-black" muted playsInline preload="metadata" />
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
                  <div className="grid gap-2 rounded-2xl border bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Selected media</div>
                        <div className="text-sm font-semibold text-gray-900">{selectedMediaItem.type === "image" ? "Photo" : "Video"} preview</div>
                      </div>
                      <div className="text-[11px] text-gray-500">Edit caption and frame below</div>
                    </div>
                    <div className="overflow-hidden rounded-xl border bg-black/5">
                      {selectedMediaItem.type === "image" ? (
                        <img src={mediaPreviewUrls.get(selectedMediaItem.id) || ""} alt={selectedMediaItem.label || "Media preview"} className="h-56 w-full object-cover sm:h-64" />
                      ) : (
                        <video
                          ref={selectedMediaVideoRef}
                          src={mediaPreviewUrls.get(selectedMediaItem.id) || ""}
                          className="h-56 w-full bg-black object-cover sm:h-64"
                          controls
                          playsInline
                          preload="metadata"
                          onLoadedMetadata={() => {
                            const vid = selectedMediaVideoRef.current;
                            if (vid && Number.isFinite(vid.duration) && vid.duration > 0) {
                              setSelectedMediaVideoDuration(vid.duration);
                              vid.currentTime = Math.min(vid.currentTime || 0, vid.duration);
                            }
                          }}
                        />
                      )}
                    </div>
                    <input
                      className="border rounded-xl px-2.5 py-2 text-sm"
                      placeholder={`e.g., ${MEDIA_LABEL_HINTS[0]}`}
                      value={selectedMediaItem.label}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMediaDraftItems((prev) => prev.map((m) => m.id === selectedMediaItem.id ? { ...m, label: value } : m));
                      }}
                    />
                    {selectedMediaItem.type === "video" ? (
                      <div className="grid gap-2 rounded-lg border bg-gray-50 p-2">
                        <div className="text-[11px] font-medium text-gray-700">Video frame</div>
                        <input
                          type="range"
                          min="0"
                          max={Math.max(1, selectedMediaVideoDuration || 1)}
                          step="0.05"
                          defaultValue="0"
                          onChange={(e) => {
                            const vid = selectedMediaVideoRef.current;
                            if (!vid) return;
                            const nextTime = Number(e.target.value);
                            if (Number.isFinite(nextTime)) vid.currentTime = nextTime;
                          }}
                          className="w-full"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="rounded-full bg-black px-3 py-1.5 text-[11px] font-medium text-white"
                            onClick={async () => {
                              setVideoThumbStatus("Capturing thumbnail…");
                              try {
                                const thumbnailUrl = await captureSelectedVideoThumbnail();
                                setMediaDraftItems((prev) => prev.map((m) => m.id === selectedMediaItem.id ? { ...m, thumbnailUrl } : m));
                                setVideoThumbStatus("Thumbnail saved ✅");
                              } catch (err) {
                                setVideoThumbStatus(err instanceof Error ? err.message : "Could not capture thumbnail.");
                              }
                            }}
                          >
                            Use current frame
                          </button>
                          <span className="text-[10px] text-gray-500 leading-4">{videoThumbStatus || (selectedMediaItem.thumbnailUrl ? "Thumbnail selected" : "Pick a frame, then save it.")}</span>
                        </div>
                        {selectedMediaItem.thumbnailUrl ? (
                          <div className="grid gap-1">
                            <div className="text-xs text-gray-500">Current thumbnail</div>
                            <img src={selectedMediaItem.thumbnailUrl} alt="Video thumbnail" className="w-full max-h-24 rounded-md object-cover" />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Advanced Settings - Collapsible */}
              <button
                type="button"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 mt-2"
              >
                <AppIcon name="tune" className="h-4 w-4" />
                <span>Advanced settings (optional)</span>
              </button>

              {showAdvancedSettings && (
                <div className="grid gap-3 border-l-2 border-gray-200 pl-3">
                  <label className="text-sm font-medium">Description (optional)</label>
                  <textarea className="border rounded px-3 py-2" placeholder="What are you trying to do?" value={description} onChange={(e) => setDescription(e.target.value)} />

                  <label className="text-sm font-medium">Skill level (optional)</label>
                  <CreateSelect
                    value={skillLevel}
                    placeholder="Choose skill level"
                    options={[{ value: "any", label: "Any" }, { value: "beginner", label: "Beginner" }, { value: "returning", label: "Returning" }, { value: "intermediate", label: "Intermediate" }, { value: "advanced", label: "Advanced" }]}
                    onChange={setSkillLevel}
                  />

                  <label className="text-sm font-medium">Group size (optional)</label>
                  <CreateSelect
                    value={groupSizeChoice}
                    placeholder="Choose group size"
                    options={[...GROUP_SIZE_OPTIONS.map((v) => ({ value: v, label: v === "any" ? "Any" : v })), { value: "custom", label: "Custom number…" }]}
                    onChange={setGroupSizeChoice}
                  />
                  {groupSizeChoice === "custom" && (
                    <input type="number" min={2} max={50} className={`border rounded px-3 py-2 ${fieldErrors.groupSize ? "border-red-500 ring-1 ring-red-300" : ""}`} value={groupSizeCustom} onChange={(e) => { setGroupSizeCustom(e.target.value); clearFieldError("groupSize"); }} placeholder="Enter custom group size" />
                  )}
                </div>
              )}

              {savingQuest && <div className="text-sm rounded border bg-blue-50 px-3 py-2">Working on it… uploading media and saving listing.</div>}
            </form>
          </div>
          <div className="fixed bottom-0 left-0 right-0 z-[60] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:pb-4">
            <div className="create-action-dock mx-auto w-full max-w-xl rounded-t-2xl border px-4 py-3 shadow-[0_-10px_35px_rgba(15,23,42,0.14)] backdrop-blur-xl">
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <button form="create-quest-form" type="submit" className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed" disabled={savingQuest}>
                  {savingQuest ? "Saving..." : (editingQuestId ? "Save changes" : "Post quest")}
                </button>
                {editingQuestId && (
                  <button type="button" className="w-full sm:w-auto rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-50 active:scale-[0.99]" onClick={() => void deleteQuest(editingQuestId)}>
                    Delete listing
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showReportModal && reportTarget && (
        <div className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Report listing</h3>
              <button className="border rounded px-2 py-1" onClick={() => setShowReportModal(false)}>Close</button>
            </div>
            <p className="text-sm text-gray-600">About: <b>{reportTarget.title}</b></p>

            <label className="text-sm font-medium">What are you reporting?</label>
            <select
              className="border rounded px-3 py-2"
              value={reportContext}
              onChange={(e) => {
                const next = e.target.value as "listing_content" | "chat_behavior" | "profile_account" | "in_person";
                setReportContext(next);
                setReportReason(REPORT_REASONS[next][0]?.code || "other");
              }}
            >
              <option value="listing_content">Listing content</option>
              <option value="chat_behavior">Chat / in-app behavior</option>
              <option value="profile_account">Profile/account</option>
              <option value="in_person">In-person meetup behavior</option>
            </select>

            <label className="text-sm font-medium">Reason</label>
            <select className="border rounded px-3 py-2" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
              {(REPORT_REASONS[reportContext] || []).map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>

            <label className="text-sm font-medium">Details {reportContext === "in_person" ? "*" : "(optional)"}</label>
            <textarea
              className="border rounded px-3 py-2"
              placeholder={reportContext === "in_person" ? "Please describe what happened." : "Add any details that can help us review."}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
            />

            <div className="flex items-end justify-between gap-3">
              <div className={`min-w-0 flex-1 text-sm ${reportFeedbackTone === "error" ? "text-red-700" : reportFeedbackTone === "success" ? "text-emerald-700" : "text-slate-700"}`}>
                {reportFeedback ? <span>{reportFeedback}</span> : null}
              </div>
              <div className="flex justify-end gap-2 shrink-0">
                <button className="border rounded px-3 py-2" onClick={() => { setShowReportModal(false); setReportFeedback(""); }}>Cancel</button>
                <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={submittingReport} onClick={() => void submitReport()}>
                  {submittingReport ? "Submitting..." : "Submit report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPublicLocationConfirm && (
        <div className="fixed inset-0 z-[80] bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-3">
            <h3 className="font-semibold">Public location warning</h3>
            <p className="text-sm text-gray-700">Because Location Visibility is set to <b>Public</b>, anyone can see the meetup location for this quest.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={snoozePublicLocationWarning} onChange={(e) => setSnoozePublicLocationWarning(e.target.checked)} />
              Don’t remind me again for a month
            </label>
            <p className="text-xs text-gray-500">You can change this later in Settings → Safety (Public location warning).</p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="border rounded px-3 py-2"
                onClick={() => {
                  publicVisibilityBypassRef.current = false;
                  setSnoozePublicLocationWarning(false);
                  setShowPublicLocationConfirm(false);
                  setHighlightLocationVisibility(true);
                  setFieldErrors((prev) => ({ ...prev, locationVisibility: true }));
                  locationVisibilityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                Go back
              </button>
              <button
                type="button"
                className="bg-black text-white rounded px-3 py-2"
                onClick={() => {
                  if (snoozePublicLocationWarning && typeof window !== "undefined") {
                    const mutedUntil = Date.now() + 30 * 24 * 60 * 60 * 1000;
                    window.localStorage.setItem("sidequest_public_location_warning_muted_until", String(mutedUntil));
                    publicWarningMutedUntilRef.current = mutedUntil;
                  }
                  publicVisibilityBypassRef.current = true;
                  setPublicVisibilityConfirmed(true);
                  setShowPublicLocationConfirm(false);
                  setSnoozePublicLocationWarning(false);
                  clearFieldError("locationVisibility");
                  createQuestFormRef.current?.requestSubmit();
                }}
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {showManualShareConfirm && (
        <div className="fixed inset-0 z-[80] bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-3">
            <h3 className="font-semibold">Manual share warning</h3>
            <p className="text-sm text-gray-700">
              With <b>Private (manual share)</b>, joiners will not automatically see the location. This applies to both in-person meetups and virtual meetings.
            </p>
            <p className="text-sm text-gray-700">
              You must share the details yourself with each person you want to invite.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={snoozeManualShareWarning} onChange={(e) => setSnoozeManualShareWarning(e.target.checked)} />
              Don’t remind me again for a month
            </label>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="border rounded px-3 py-2"
                onClick={() => {
                  setShowManualShareConfirm(false);
                  setPendingManualShareVisibility(null);
                  setSnoozeManualShareWarning(false);
                }}
              >
                Go back
              </button>
              <button
                type="button"
                className="bg-black text-white rounded px-3 py-2"
                onClick={() => {
                  if (snoozeManualShareWarning && typeof window !== "undefined") {
                    const mutedUntil = Date.now() + 30 * 24 * 60 * 60 * 1000;
                    window.localStorage.setItem("sidequest_manual_share_warning_muted_until", String(mutedUntil));
                    manualShareWarningBypassRef.current = true;
                  }
                  if (pendingManualShareVisibility) setExactLocationVisibility(pendingManualShareVisibility);
                  clearFieldError("locationVisibility");
                  setShowManualShareConfirm(false);
                  setPendingManualShareVisibility(null);
                  setSnoozeManualShareWarning(false);
                }}
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {showCityMapModal && (
        <div className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-3xl bg-white border shadow-lg overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
              <div>
                <h3 className="text-base font-semibold">City map</h3>
                <p className="text-xs text-slate-500">{cityMapTitle}</p>
              </div>
              <button className="border rounded-full px-3 py-2 text-sm" onClick={() => setShowCityMapModal(false)}>Close</button>
            </div>
            <div className="bg-slate-100">
              {cityMapLoading ? (
                <div className="grid place-items-center h-[70vh] text-slate-600">Loading map…</div>
              ) : cityMapUrl ? (
                <iframe
                  title={cityMapTitle || "City map"}
                  src={cityMapUrl}
                  className="h-[70vh] w-full"
                  loading="lazy"
                />
              ) : (
                <div className="grid place-items-center h-[70vh] text-slate-600">Map unavailable.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {expandedMedia && expandedMedia.items.length > 0 && (
        <div className="fixed inset-0 z-[70] bg-black" onClick={() => setExpandedMedia(null)}>
          <div className="relative h-screen w-screen" onClick={(e) => e.stopPropagation()}>
            <div
              ref={expandedMediaStripRef}
              className="h-screen w-screen overflow-x-auto overflow-y-hidden flex snap-x snap-mandatory"
              onScroll={(e: UIEvent<HTMLDivElement>) => {
                const el = e.currentTarget;
                const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                setExpandedMedia((s) => (s ? { ...s, index: Math.min(s.items.length - 1, Math.max(0, idx)) } : s));
              }}
            >
              {expandedMedia.items.map((item, i) => (
                <div key={`${item.url}-${i}`} className="h-screen w-screen shrink-0 snap-start flex items-center justify-center bg-black">
                  {item.type === "image" ? (
                    <img src={item.url} alt={item.label || "Expanded media"} className="h-full w-full object-contain" />
                  ) : (
                    <video src={item.url} controls autoPlay={i === expandedMedia.index} className="h-full w-full object-contain bg-black" />
                  )}
                </div>
              ))}
            </div>

            <button type="button" className="absolute top-4 right-4 border rounded px-3 py-2 bg-white/90" onClick={() => setExpandedMedia(null)}>Close</button>

            {expandedMedia.items.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 border rounded-full h-10 w-10 bg-white/90"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedMedia((s) => {
                      if (!s) return s;
                      const next = (s.index - 1 + s.items.length) % s.items.length;
                      expandedMediaStripRef.current?.scrollTo({ left: next * window.innerWidth, behavior: "smooth" });
                      return { ...s, index: next };
                    });
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 border rounded-full h-10 w-10 bg-white/90"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedMedia((s) => {
                      if (!s) return s;
                      const next = (s.index + 1) % s.items.length;
                      expandedMediaStripRef.current?.scrollTo({ left: next * window.innerWidth, behavior: "smooth" });
                      return { ...s, index: next };
                    });
                  }}
                >
                  ›
                </button>
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
                  {expandedMedia.items.map((_, i) => (
                    <span key={i} className={`h-2.5 w-2.5 rounded-full ${i === expandedMedia.index ? "bg-white" : "bg-white/45"}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showQuestionModal && questionTarget && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{questionMode === "public" ? "Comment" : "Direct message"}</h3>
              <button className="border rounded px-2 py-1" onClick={() => setShowQuestionModal(false)}>Close</button>
            </div>
            <p className="text-sm text-gray-600">About: <b>{questionTarget.title}</b></p>
            {questionMode === "public" ? (
              <>
                <p className="text-xs text-gray-600">Comments are visible on this listing.</p>
                <div className="max-h-56 overflow-auto space-y-2 rounded-xl border bg-gray-50 p-3">
                  {questionComments.length ? questionComments.map((comment) => {
                    const profile = Array.isArray(comment.profiles) ? (comment.profiles[0] || null) : comment.profiles;
                    return (
                      <div key={comment.id} className="rounded-lg border bg-white px-3 py-2">
                        <div className="flex items-center gap-2">
                          {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt={profile.display_name || "Commenter"} className="h-6 w-6 rounded-full object-cover border" />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-gray-100 border" />
                          )}
                          <Link href={`/profile/${comment.sender_id}`} className="text-xs font-medium underline">
                            {(profile?.display_name || "Member").trim().split(/\s+/)[0] || "Member"}
                          </Link>
                          <span className="text-[11px] text-gray-500">{new Date(comment.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-700">{comment.body.replace(/^\[PUBLIC\]\s?/, "")}</p>
                      </div>
                    );
                  }) : <p className="text-xs text-gray-500">No comments yet.</p>}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-600">Direct messages are private.</p>
              </>
            )}
            <textarea className="border rounded px-3 py-2 w-full" placeholder={questionMode === "public" ? "Write your comment..." : "Write your direct message..."} value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
            <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={sendingQuestion || !questionText.trim()} onClick={() => void sendQuestionFromModal()}>{sendingQuestion ? "Sending..." : "Send"}</button>
          </div>
        </div>
      )}

      {showDistanceJoinModal && (
        <div className="fixed inset-0 z-[55] bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold">Long-distance join</h3>
              <p className="text-sm text-gray-700">
                This quest is about {pendingDistanceJoinLabel || "this far"} away from you. It is more than 15 miles away.
                Do you want to continue?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="border rounded px-3 py-2"
                onClick={() => {
                  setShowDistanceJoinModal(false);
                  setPendingDistanceJoinQuestId(null);
                  setPendingDistanceJoinLabel("");
                }}
              >
                Cancel
              </button>
              <button className="bg-black text-white rounded px-3 py-2" onClick={() => void confirmDistanceJoinQuest()}>OK</button>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw]">
          <div className="rounded-xl bg-black text-white px-4 py-3 text-sm shadow-lg border border-white/20 flex items-center gap-3">
            <span>{status}</span>
            {status === "Location access is required to request or join this event." ? (
              <button className="text-xs underline opacity-90" onClick={() => void enableLocationAndRetry()} type="button">
                Enable location
              </button>
            ) : null}
            <button className="text-xs underline opacity-90" onClick={() => setStatus("")} type="button">dismiss</button>
          </div>
        </div>
      )}
    </main>
  );
}
