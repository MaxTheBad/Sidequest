"use client";

import Link from "next/link";
import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import CityAutocompleteInput from "@/components/city-autocomplete-input";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { getSupabaseClient } from "@/lib/supabase";
import { isImageLikeFile, prepareImageForUpload } from "@/lib/media-optimize";
import { useUsernameAvailability } from "@/lib/use-username-availability";
import { normalizeUsername } from "@/lib/username";
import { recordSecurityAudit } from "@/lib/security-audit";
import { AppIcon, type AppIconName } from "@/components/app-icons";

type Tab = "profile" | "account" | "preferences" | "notifications" | "friends" | "blocked";
type NotificationPreferences = {
  messages: boolean;
  comments: boolean;
  joined_comments: boolean;
  join_updates: boolean;
  join_requests: boolean;
  friend_requests: boolean;
  followed_posts: boolean;
  liked_categories: boolean;
  quest_reminders: boolean;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messages: true,
  comments: true,
  joined_comments: false,
  join_updates: true,
  join_requests: true,
  friend_requests: true,
  followed_posts: false,
  liked_categories: false,
  quest_reminders: true,
};
type SocialProfile = { id: string; display_name: string | null; avatar_url: string | null; username: string | null };
type FriendEdge = {
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
};
type FriendRow = SocialProfile & { edge: FriendEdge };
type RequestRow = SocialProfile & { edge: FriendEdge; direction: "incoming" | "outgoing" };
type BlockedProfile = SocialProfile;

export default function SettingsPage() {
  const supabase = getSupabaseClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [status, setStatus] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [actualName, setActualName] = useState("");
  const [username, setUsername] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [radiusKm, setRadiusKm] = useState(15);
  const [bio, setBio] = useState("");
  const [friendsVisibility, setFriendsVisibility] = useState<"public" | "private">("public");
  const [showLocation, setShowLocation] = useState(false);
  const [dob, setDob] = useState("");
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
  const [publicLocationWarningEnabled, setPublicLocationWarningEnabled] = useState(true);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notificationPreferencesLoading, setNotificationPreferencesLoading] = useState(false);
  const [notificationPreferencesSaving, setNotificationPreferencesSaving] = useState(false);
  const [friendsProfiles, setFriendsProfiles] = useState<FriendRow[]>([]);
  const [friendRequests, setFriendRequests] = useState<RequestRow[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<BlockedProfile[]>([]);
  const [blockedRefreshTick, setBlockedRefreshTick] = useState(0);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [deactivatedAt, setDeactivatedAt] = useState<string | null>(null);
  const [accountActionLoading, setAccountActionLoading] = useState<"deactivate" | "restore" | "delete" | null>(null);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState("");
  const initialProfileSnapshotRef = useRef<string>("");
  const initialProfileSnapshot = (() => {
    if (!initialProfileSnapshotRef.current) return null;
    try {
      return JSON.parse(initialProfileSnapshotRef.current) as {
        actualName?: string;
        username?: string;
        countryCode?: string;
        city?: string;
        region?: string;
        bio?: string;
        showLocation?: boolean;
        friendsVisibility?: "public" | "private";
        usernameChangedAt?: string | null;
      };
    } catch {
      return null;
    }
  })();
  const initialUsername = initialProfileSnapshot?.username || "";
  const usernameAvailability = useUsernameAvailability(username, userId, initialUsername);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("section") === "notifications") {
      setTab("notifications");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem("sidequest_public_location_warning_muted_until");
      const mutedUntil = raw ? Number(raw) : 0;
      setPublicLocationWarningEnabled(!(Number.isFinite(mutedUntil) && mutedUntil > Date.now()));
    }
  }, []);

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
        .select("display_name,username,username_changed_at,city,region,country_code,bio,friends_visibility,show_location,radius_km,avatar_url,avatar_source_url,deactivated_at")
        .eq("id", uid)
        .maybeSingle();

      const { data: authUser } = await supabase.auth.getUser();
      const authMeta = (authUser.user?.user_metadata || {}) as Record<string, unknown>;

      setCity(profile?.city ?? (typeof authMeta.city === "string" ? authMeta.city : ""));
      setRegion(profile?.region ?? (typeof authMeta.region === "string" ? authMeta.region : ""));
      setRadiusKm(Number(profile?.radius_km || 15));
      setBio(profile?.bio ?? (typeof authMeta.bio === "string" ? authMeta.bio : ""));
      setFriendsVisibility(((profile?.friends_visibility as "public" | "private") || "public"));
      setShowLocation(typeof profile?.show_location === "boolean" ? profile.show_location : Boolean(authMeta.show_location));
      const metaName = (typeof authMeta.full_name === "string" && authMeta.full_name) || (typeof authMeta.name === "string" && authMeta.name) || "";
      setActualName(profile?.display_name || metaName || "");
      setUsername(profile?.username || "");
      const metaAvatar = typeof authMeta.avatar_url === "string" ? authMeta.avatar_url : "";
      const resolvedAvatar = profile?.avatar_url || metaAvatar || "";
      setAvatarUrl(resolvedAvatar);
      setDeactivatedAt(profile?.deactivated_at || null);

      if (!profile?.avatar_url && metaAvatar) {
        await supabase.from("profiles").upsert({ id: uid, avatar_url: metaAvatar });
      }
      setMarketingOptIn(Boolean(authMeta.marketing_opt_in));
      if (typeof authMeta.dob === "string") setDob(authMeta.dob);
      const metaCountry = typeof authMeta.country_code === "string" ? authMeta.country_code : "";
      const browserCountry =
        typeof navigator !== "undefined" ? (navigator.language.split("-")[1] || "US").toUpperCase() : "US";
      const resolvedCountryCode = (profile?.country_code || metaCountry || (browserCountry.length === 2 ? browserCountry : "US")).toUpperCase();
      setCountryCode(resolvedCountryCode);
      initialProfileSnapshotRef.current = JSON.stringify({
        actualName: profile?.display_name || metaName || "",
        username: profile?.username || "",
        countryCode: resolvedCountryCode,
        city: profile?.city ?? (typeof authMeta.city === "string" ? authMeta.city : ""),
        region: profile?.region ?? (typeof authMeta.region === "string" ? authMeta.region : ""),
        bio: profile?.bio ?? (typeof authMeta.bio === "string" ? authMeta.bio : ""),
        showLocation: typeof profile?.show_location === "boolean" ? profile.show_location : Boolean(authMeta.show_location),
        friendsVisibility: ((profile?.friends_visibility as "public" | "private") || "public"),
        usernameChangedAt: profile?.username_changed_at || null,
      });

      const { data: acceptedRows } = await supabase
        .from("friends")
        .select("requester_id,addressee_id,status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
      const acceptedEdges = ((acceptedRows || []) as FriendEdge[]).filter((row) => row.requester_id !== row.addressee_id);
      const acceptedFriendIds = Array.from(new Set(acceptedEdges.map((row) => (row.requester_id === uid ? row.addressee_id : row.requester_id)).filter((id) => id !== uid)));
      const acceptedMap = new Map(acceptedEdges.map((row) => [row.requester_id === uid ? row.addressee_id : row.requester_id, row]));
      if (acceptedFriendIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id,display_name,avatar_url,username")
          .in("id", acceptedFriendIds);
        setFriendsProfiles(((profiles || []) as SocialProfile[]).map((profile) => ({
          ...profile,
          edge: acceptedMap.get(profile.id)!,
        })));
      } else {
        setFriendsProfiles([]);
      }

      const { data: pendingRows } = await supabase
        .from("friends")
        .select("requester_id,addressee_id,status")
        .eq("status", "pending")
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
      const pendingEdges = ((pendingRows || []) as FriendEdge[]).filter((row) => row.requester_id !== row.addressee_id);
      const pendingIds = Array.from(new Set(pendingEdges.flatMap((row) => [row.requester_id, row.addressee_id]).filter((id) => id !== uid)));
      if (pendingIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id,display_name,avatar_url,username")
          .in("id", pendingIds);
        const profileMap = new Map(((profiles || []) as SocialProfile[]).map((profile) => [profile.id, profile]));
        const rows: RequestRow[] = [];
        pendingEdges.forEach((edge) => {
          if (edge.requester_id === uid) {
            const profile = profileMap.get(edge.addressee_id);
            if (profile) rows.push({ ...profile, edge, direction: "outgoing" });
            return;
          }
          const profile = profileMap.get(edge.requester_id);
          if (profile) rows.push({ ...profile, edge, direction: "incoming" });
        });
        setFriendRequests(rows);
      } else {
        setFriendRequests([]);
      }

      const { data: blockRows } = await supabase
        .from("friends")
        .select("requester_id,addressee_id,status")
        .eq("status", "blocked")
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
      const blockedEdges = ((blockRows || []) as FriendEdge[]).filter((row) => row.requester_id !== row.addressee_id);
      const blockedIds = Array.from(new Set(blockedEdges.flatMap((r) => [r.requester_id, r.addressee_id]).filter((id) => id !== uid)));
      if (blockedIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id,display_name,avatar_url,username")
          .in("id", blockedIds);
        const blockedMap = new Map(((profiles || []) as SocialProfile[]).map((profile) => [profile.id, profile]));
        const rows: BlockedProfile[] = [];
        blockedEdges.forEach((edge) => {
          const targetId = edge.requester_id === uid ? edge.addressee_id : edge.requester_id;
          const profile = blockedMap.get(targetId);
          if (profile) rows.push(profile);
        });
        setBlockedProfiles(rows);
      } else {
        setBlockedProfiles([]);
      }
    };

    void run();
  }, [supabase, blockedRefreshTick]);

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    const load = async () => {
      setNotificationPreferencesLoading(true);
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("messages,comments,joined_comments,join_updates,join_requests,friend_requests,followed_posts,liked_categories,quest_reminders")
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled && !error && data) {
        setNotificationPreferences({
          messages: data.messages !== false,
          comments: data.comments !== false,
          joined_comments: data.joined_comments === true,
          join_updates: data.join_updates !== false,
          join_requests: data.join_requests !== false,
          friend_requests: data.friend_requests !== false,
          followed_posts: data.followed_posts === true,
          liked_categories: data.liked_categories === true,
          quest_reminders: data.quest_reminders !== false,
        });
      }
      if (!cancelled) {
        if (error) setStatus(error.message);
        setNotificationPreferencesLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [supabase, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("sidequest_theme_pref");
    if (saved === "auto" || saved === "light" || saved === "dark") {
      setThemePref(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const resolved = themePref === "auto" ? (mq.matches ? "dark" : "light") : themePref;
    document.documentElement.dataset.theme = resolved;
    window.localStorage.setItem("sidequest_theme_pref", themePref);
  }, [themePref]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !userId) return setStatus("Not signed in.");
    const initial = initialProfileSnapshot || {
      actualName: "",
      username: "",
      countryCode: "",
      city: "",
      region: "",
      bio: "",
      showLocation: false,
      friendsVisibility: "public" as const,
      usernameChangedAt: null,
    };
    const changedFields = [
      initial.username !== username ? "username" : null,
      initial.countryCode !== countryCode ? "country" : null,
      initial.city !== city ? "city" : null,
      initial.region !== region ? "state/region" : null,
      initial.bio !== bio ? "bio" : null,
      initial.showLocation !== showLocation ? "location visibility" : null,
      initial.friendsVisibility !== friendsVisibility ? "friends visibility" : null,
    ].filter(Boolean) as string[];
    const usernameChanged = normalizeUsername(username) !== normalizeUsername(initial.username || "");
    const usernameChangedAtMs = initial.usernameChangedAt ? new Date(initial.usernameChangedAt).getTime() : 0;
    const usernameCooldownActive =
      usernameChanged &&
      Number.isFinite(usernameChangedAtMs) &&
      usernameChangedAtMs > 0 &&
      Date.now() - usernameChangedAtMs < 24 * 60 * 60 * 1000;
    let usernameBlocked = usernameCooldownActive;
    const nextUsernameChangedAt = usernameChanged && !usernameCooldownActive ? new Date().toISOString() : initial.usernameChangedAt || null;

    const saveBaseProfile = async () =>
      supabase
        .from("profiles")
        .upsert({
          id: userId,
          city,
          region: region || null,
          country_code: countryCode || null,
          bio,
          friends_visibility: friendsVisibility,
          show_location: showLocation,
          radius_km: radiusKm,
          avatar_url: avatarUrl || null,
        });

    const saveNameAndBase = async () =>
      supabase.from("profiles").upsert({
        id: userId,
        username,
        display_name: actualName,
        username_changed_at: nextUsernameChangedAt,
        city,
        region: region || null,
        country_code: countryCode || null,
        bio,
        friends_visibility: friendsVisibility,
        show_location: showLocation,
        radius_km: radiusKm,
        avatar_url: avatarUrl || null,
      });

    const profileSaveResult =
      usernameChanged && !usernameCooldownActive
        ? await saveNameAndBase()
        : await saveBaseProfile();
    let { error } = profileSaveResult;

    if (usernameChanged && !usernameCooldownActive && error?.message.toLowerCase().includes("once every 24 hours")) {
      usernameBlocked = true;
      ({ error } = await saveBaseProfile());
    }

    if (error) return setStatus(error.message);
    const savedUsername = usernameBlocked ? initial.username || username : username;
    const savedActualName = usernameBlocked ? initial.actualName || savedUsername : actualName;

    const { error: metaErr } = await supabase.auth.updateUser({
      data: {
        full_name: savedActualName,
        dob: dob || null,
        country_code: countryCode,
        city: city || null,
        region: region || null,
        bio: bio || null,
        show_location: showLocation,
        avatar_url: avatarUrl || null,
      },
    });

    if (metaErr) return setStatus(metaErr.message);
    if (usernameBlocked) {
      const otherChanges = changedFields.filter((field) => field !== "username");
      setActualName(savedActualName);
      setUsername(savedUsername);
      setStatus(
        `You can only change your username once every 24 hours.${
          otherChanges.length ? ` Other changes saved: ${otherChanges.join(", ")}.` : ""
        }`,
      );
    } else {
      setStatus(`Profile saved ✅${changedFields.length ? ` Updated: ${changedFields.join(", ")}.` : ""}`);
    }
    initialProfileSnapshotRef.current = JSON.stringify({
      actualName: savedActualName,
      username: savedUsername,
      countryCode,
      city,
      region,
      bio,
      showLocation,
      friendsVisibility,
      usernameChangedAt: usernameBlocked ? initial.usernameChangedAt || null : nextUsernameChangedAt,
    });
  }

  const isProfileDirty = useMemo(() => {
    const normalizedInitialUsername = normalizeUsername(initialProfileSnapshot?.username || "");
    const normalizedCurrentUsername = normalizeUsername(username);
    const current = JSON.stringify({
      actualName,
      username,
      countryCode,
      city,
      region,
      bio,
      showLocation,
      friendsVisibility,
      usernameChangedAt: initialProfileSnapshot?.usernameChangedAt || null,
    });
    return current !== initialProfileSnapshotRef.current || normalizedCurrentUsername !== normalizedInitialUsername;
  }, [actualName, username, countryCode, city, region, bio, showLocation, friendsVisibility, initialProfileSnapshot]);

  function resetProfileForm() {
    if (!initialProfileSnapshot) return;
    setActualName(initialProfileSnapshot.actualName || "");
    setUsername(initialProfileSnapshot.username || "");
    setCountryCode(initialProfileSnapshot.countryCode || "US");
    setCity(initialProfileSnapshot.city || "");
    setRegion(initialProfileSnapshot.region || "");
    setBio(initialProfileSnapshot.bio || "");
    setShowLocation(Boolean(initialProfileSnapshot.showLocation));
    setFriendsVisibility(initialProfileSnapshot.friendsVisibility || "public");
    setStatus("");
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
    if (!supabase || !userId || !avatarUrl) return;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_source_url,avatar_url")
        .eq("id", userId)
        .maybeSingle();
      const sourceUrl = profile?.avatar_source_url || profile?.avatar_url || avatarUrl;
      const res = await fetch(sourceUrl);
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
    if (!isImageLikeFile(photoFile)) return setStatus("Please choose an image file.");

    setUploadingPhoto(true);

    let cropped: Blob;
    try {
      const normalized = await prepareImageForUpload(photoFile, { maxWidth: 2200, maxHeight: 2200, quality: 0.9 });
      cropped = await makeCroppedAvatar(normalized);
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
    const originalFilePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}-original.jpg`;
    const { error: originalUploadError } = await supabase.storage
      .from("profile-photos")
      .upload(originalFilePath, photoFile, { upsert: false, contentType: photoFile.type || "image/jpeg" });
    if (originalUploadError) {
      setUploadingPhoto(false);
      return setStatus(`Photo upload failed: ${originalUploadError.message}`);
    }
    const { data: originalData } = supabase.storage.from("profile-photos").getPublicUrl(originalFilePath);
    const { data: auditSession } = await supabase.auth.getSession();
    await recordSecurityAudit(
      {
        event_type: "media_uploaded",
        user_id: userId,
        media: {
          user_id: userId,
          bucket_id: "profile-photos",
          object_path: filePath,
          public_url: publicData.publicUrl,
          media_type: "image",
          mime_type: "image/jpeg",
          size_bytes: cropped.size,
          source_context: "profile_photo",
        },
      },
      auditSession.session?.access_token,
    );
    await recordSecurityAudit(
      {
        event_type: "media_uploaded",
        user_id: userId,
        media: {
          user_id: userId,
          bucket_id: "profile-photos",
          object_path: originalFilePath,
          public_url: originalData.publicUrl,
          media_type: "image",
          mime_type: photoFile.type || "image/jpeg",
          size_bytes: photoFile.size,
          source_context: "profile_photo_original",
        },
      },
      auditSession.session?.access_token,
    );

    let { error: profileErr } = await supabase
      .from("profiles")
      .upsert({ id: userId, avatar_url: publicData.publicUrl, avatar_source_url: originalData.publicUrl, avatar_capture_method: "camera", photo_onboarding_done: true });

    if (profileErr?.message?.includes("column") && (profileErr.message.includes("avatar_capture_method") || profileErr.message.includes("photo_onboarding_done"))) {
      const fallback = await supabase.from("profiles").upsert({ id: userId, avatar_url: publicData.publicUrl, avatar_source_url: originalData.publicUrl });
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

  async function deactivateAccount() {
    if (!supabase || accountActionLoading) return;
    if (!window.confirm("Deactivate your account? Your profile and listings will be hidden and notifications will stop. You can restore everything the next time you sign in.")) return;
    setAccountActionLoading("deactivate");
    setStatus("");
    try {
      const { error } = await supabase.rpc("deactivate_my_account");
      if (error) throw error;
      await supabase.auth.signOut();
      window.location.assign("/");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not deactivate the account.");
      setAccountActionLoading(null);
    }
  }

  async function restoreAccount() {
    if (!supabase || accountActionLoading) return;
    setAccountActionLoading("restore");
    setStatus("");
    try {
      const { error } = await supabase.rpc("reactivate_my_account");
      if (error) throw error;
      setDeactivatedAt(null);
      setStatus("Account restored ✅");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not restore the account.");
    } finally {
      setAccountActionLoading(null);
    }
  }

  async function permanentlyDeleteAccount() {
    if (!supabase || deleteAccountConfirmation !== "DELETE" || accountActionLoading) return;
    setAccountActionLoading("delete");
    setStatus("");
    try {
      const { data, error } = await supabase.functions.invoke("account-deletion", {
        body: { confirmation: deleteAccountConfirmation },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Could not delete the account.");
      await supabase.auth.signOut();
      window.location.assign("/");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete the account.");
      setAccountActionLoading(null);
    }
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
      if (publicLocationWarningEnabled) {
        window.localStorage.removeItem("sidequest_public_location_warning_muted_until");
      } else {
        const mutedUntil = Date.now() + 30 * 24 * 60 * 60 * 1000;
        window.localStorage.setItem("sidequest_public_location_warning_muted_until", String(mutedUntil));
      }
    }

    setStatus("Preferences saved ✅");
  }

  async function saveNotificationPreferences() {
    if (!supabase || !userId || notificationPreferencesSaving) return;
    setNotificationPreferencesSaving(true);
    setStatus("");
    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: userId,
      ...notificationPreferences,
      updated_at: new Date().toISOString(),
    });
    setNotificationPreferencesSaving(false);
    setStatus(error ? error.message : "Notification preferences saved.");
  }

  async function restartOnboarding() {
    if (!supabase || !userId) return;
    const ok = window.confirm("Restart onboarding for this account?");
    if (!ok) return;
    const { error } = await supabase.from("profiles").upsert({ id: userId, onboarding_done: false });
    if (error) return setStatus(error.message);
    window.localStorage.removeItem(`sidequest_onboarding_done:${userId}`);
    setStatus("Onboarding reset. Refresh the home page or sign out and back in.");
  }

  async function unblockProfile(targetId: string) {
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("friends")
      .delete()
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId})`);
    if (error) return setStatus(error.message);
    setStatus("User unblocked.");
    setBlockedRefreshTick((x) => x + 1);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="page-shell page-settings app-page min-h-screen bg-transparent p-4">
      <datalist id="country-list">{COUNTRY_OPTIONS.map((c) => <option key={c.code} value={c.name} />)}</datalist>
      <section className="max-w-4xl mx-auto rounded-2xl border bg-white p-5 space-y-4 app-page-card">
        <div className="flex items-center justify-between app-page-header">
          <div><p className="app-kicker">Your QuestHat</p><h1 className="text-2xl font-bold">Settings</h1><p className="app-page-subtitle">Profile, privacy, notifications, and account controls.</p></div>
          <Link href="/" className="border rounded px-3 py-2 text-sm">Back</Link>
        </div>

        {status && <p className="text-sm rounded border bg-amber-50 px-3 py-2">{status}</p>}

        <div className="flex gap-2 flex-wrap app-segmented-tabs">
          <button className={`px-3 py-2 rounded ${tab === "profile" ? "bg-black text-white" : "border"}`} onClick={() => setTab("profile")}>Profile</button>
          <button className={`px-3 py-2 rounded ${tab === "account" ? "bg-black text-white" : "border"}`} onClick={() => setTab("account")}>Account</button>
          <button className={`px-3 py-2 rounded ${tab === "preferences" ? "bg-black text-white" : "border"}`} onClick={() => setTab("preferences")}>Preferences</button>
          <button className={`px-3 py-2 rounded ${tab === "notifications" ? "bg-black text-white" : "border"}`} onClick={() => setTab("notifications")}>Notifications</button>
          <button className={`px-3 py-2 rounded ${tab === "friends" ? "bg-black text-white" : "border"}`} onClick={() => setTab("friends")}>Friends</button>
          <button className={`px-3 py-2 rounded ${tab === "blocked" ? "bg-black text-white" : "border"}`} onClick={() => setTab("blocked")}>Blocked</button>
        </div>

        {!userId ? (
          <p className="text-sm text-gray-600">Please log in first.</p>
        ) : (
          <>
            {tab === "profile" && (
              <form onSubmit={saveProfile} className="grid gap-2">
                <Link href="/profile" className="w-fit rounded-full border px-3 py-2 text-sm font-medium text-slate-700">
                  View my profile
                </Link>
                <label className="text-sm font-medium">Profile photo</label>
                <div className="grid gap-2 rounded-xl border p-3 bg-gray-50">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const picked = e.target.files?.[0] ?? null;
                      if (!picked) {
                        setPhotoFile(null);
                        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                        setPhotoPreviewUrl("");
                        setShowPhotoCropper(false);
                        return;
                      }

                      void (async () => {
                        try {
                          const file = await prepareImageForUpload(picked, { maxWidth: 2200, maxHeight: 2200, quality: 0.9 });
                          setPhotoFile(file);
                          setCropZoom(1.2);
                          setCropOffsetX(0);
                          setCropOffsetY(0);
                          if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                          setPhotoPreviewUrl(URL.createObjectURL(file));
                          setShowPhotoCropper(true);
                        } catch (err) {
                          setPhotoFile(null);
                          if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                          setPhotoPreviewUrl("");
                          setShowPhotoCropper(false);
                          setStatus(err instanceof Error ? err.message : "Could not process image.");
                        }
                      })();
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

                <label className="text-sm font-medium">Username</label>
                <div className="app-username-field"><span>@</span><input className="border rounded px-3 py-2" value={username} onChange={(e) => { setUsername(e.target.value); setActualName(e.target.value); }} autoCapitalize="none" autoCorrect="off" /></div>
                <p className="text-xs text-gray-500">This is the unique name people see across QuestHat.</p>
                {usernameAvailability === "checking" ? <p className="text-sm text-gray-500">Checking username...</p> : null}
                {usernameAvailability === "available" && normalizeUsername(username) !== normalizeUsername(initialUsername) ? (
                  <p className="text-sm text-emerald-600">Username is available.</p>
                ) : null}
                {usernameAvailability === "taken" ? <p className="text-sm text-red-600">That username is already taken.</p> : null}
                {usernameAvailability === "error" ? <p className="text-sm text-amber-600">Could not check username availability.</p> : null}
                <label className="text-sm font-medium">Date of birth</label>
                <input type="date" className="border rounded px-3 py-2" value={dob} onChange={(e) => setDob(e.target.value)} />

                <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
                  <div className="grid gap-1">
                    <label className="text-sm font-medium">Country</label>
                    <select
                      className="border rounded px-3 py-2"
                      value={countryCode}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCountryCode(next);
                      }}
                    >
                      {COUNTRY_OPTIONS.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <CityAutocompleteInput label="City" value={city} onChange={setCity} placeholder="Start typing city..." countryCode={countryCode} />
                </div>

                <label className="text-sm font-medium">State / Region</label>
                <input className="border rounded px-3 py-2" value={region} onChange={(e) => setRegion(e.target.value.toUpperCase())} placeholder="e.g. CA, Ontario, Bavaria" />

                <label className="text-sm font-medium">Bio</label>
                <textarea className="border rounded px-3 py-2" value={bio} onChange={(e) => setBio(e.target.value)} />

                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={showLocation} onChange={(e) => setShowLocation(e.target.checked)} />
                  <span>Show location on profile. Hidden by default. When shown, display city, region/state, and country only.</span>
                </label>

                <label className="text-sm font-medium">Friends list visibility</label>
                <select className="border rounded px-3 py-2" value={friendsVisibility} onChange={(e) => setFriendsVisibility(e.target.value as "public" | "private")}>
                  <option value="public">Public</option>
                  <option value="private">Private (friends only)</option>
                </select>

                <div className="flex flex-col gap-1 pt-1">
                  {status.includes("24 hours") ? <p className="text-sm text-red-600">You can only change your username once every 24 hours.</p> : null}
                  {status.includes("Other changes saved:") ? (
                    <p className="text-sm text-emerald-700">
                      {`Other changes saved: ${status.split("Other changes saved: ")[1] || ""}`}
                    </p>
                  ) : null}
                  {status.startsWith("Profile saved ✅") ? <p className="text-sm text-emerald-700">{status}</p> : null}
                  <button
                    type="button"
                    className="text-sm underline underline-offset-2 text-gray-600 disabled:opacity-40"
                    onClick={resetProfileForm}
                    disabled={!isProfileDirty}
                  >
                    Revert changes
                  </button>
                </div>
                  <button
                    className="rounded px-3 py-2 mt-1 text-white disabled:cursor-not-allowed disabled:text-gray-500"
                    style={{ backgroundColor: isProfileDirty ? "#111827" : "#d1d5db" }}
                    disabled={!isProfileDirty}
                  >
                    Save profile
                  </button>
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

                <div className="border-t pt-5 space-y-3">
                  <div>
                    <h3 className="font-semibold text-lg">Account controls</h3>
                    <p className="text-sm text-gray-600">Take a reversible break or permanently remove your account.</p>
                  </div>
                  <div className="rounded-2xl border bg-gray-50 p-4 space-y-3">
                    <div>
                      <p className="font-semibold">Deactivate temporarily</p>
                      <p className="text-sm text-gray-600">Hide your profile and listings and stop notifications. Restore everything by signing in again.</p>
                    </div>
                    <button type="button" className="rounded-xl border bg-white px-3 py-2 text-sm font-medium disabled:opacity-50" onClick={() => void deactivateAccount()} disabled={Boolean(accountActionLoading)}>
                      {accountActionLoading === "deactivate" ? "Deactivating..." : "Deactivate account"}
                    </button>
                  </div>
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <div>
                      <p className="font-semibold text-red-800">Delete permanently</p>
                      <p className="text-sm text-red-700">Delete your profile, listings, messages, memberships, saved items, and uploaded media. This cannot be undone.</p>
                    </div>
                    <button
                      type="button"
                      className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                      onClick={() => {
                        setDeleteAccountConfirmation("");
                        setShowDeleteAccountConfirm(true);
                      }}
                      disabled={Boolean(accountActionLoading)}
                    >
                      Delete account
                    </button>
                  </div>
                </div>
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

                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={publicLocationWarningEnabled} onChange={(e) => setPublicLocationWarningEnabled(e.target.checked)} />
                  <span>Public location warning (recommended). Show confirmation before posting quests with public meetup visibility.</span>
                </label>

                <button type="button" className="border rounded px-3 py-2 w-fit" onClick={() => void restartOnboarding()}>Restart onboarding</button>
                <button className="border rounded px-3 py-2 w-fit">Save preferences</button>
              </form>
            )}

            {tab === "notifications" && (
              <div className="app-settings-panel space-y-4">
                <div className="app-section-heading">
                  <div className="app-section-icon"><AppIcon name="bell" className="h-5 w-5" /></div>
                  <div><h2 className="text-lg font-bold">Notification preferences</h2><p className="text-sm text-gray-500">Choose which QuestHat updates should reach you.</p></div>
                </div>
                {notificationPreferencesLoading ? <div className="h-28 rounded-2xl sq-shimmer" /> : (
                  <div className="app-preference-list">
                    {([
                      ["messages", "Direct messages", "New private messages about a quest.", "message"],
                      ["comments", "Comments on your quests", "Replies and comments on quests you host.", "message"],
                      ["joined_comments", "Comments on joined quests", "Conversation updates from quests you joined.", "message"],
                      ["join_updates", "Join decisions", "Approvals, declines, and address sharing.", "check"],
                      ["join_requests", "Join requests", "Someone asks to join a quest you host.", "people"],
                      ["friend_requests", "Friend requests", "New connection requests and updates.", "people"],
                      ["quest_reminders", "Quest reminders", "Starting-soon reminders and host coordination.", "clock"],
                      ["followed_posts", "Posts from friends", "A friend publishes a new quest.", "star"],
                      ["liked_categories", "Liked categories", "New quests matching your saved interests.", "star"],
                    ] as Array<[keyof NotificationPreferences, string, string, AppIconName]>).map(([key, title, description, icon]) => (
                      <div className="app-preference-row" key={key}>
                        <div className="app-preference-copy"><AppIcon name={icon} className="h-5 w-5" /><div><p className="font-bold">{title}</p><p>{description}</p></div></div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={notificationPreferences[key]}
                          className={`app-switch ${notificationPreferences[key] ? "is-on" : ""}`}
                          onClick={() => setNotificationPreferences((current) => ({ ...current, [key]: !current[key] }))}
                        ><span /></button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" className="app-primary-button" disabled={notificationPreferencesSaving || notificationPreferencesLoading} onClick={() => void saveNotificationPreferences()}>
                  {notificationPreferencesSaving ? "Saving…" : "Save notification settings"}
                </button>
              </div>
            )}

            {tab === "friends" && (
              <div className="space-y-5">
                <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Friends</p>
                      <p className="text-xs text-gray-500">Tap a photo or name to open a profile. Use Remove to unfriend someone.</p>
                    </div>
                    <p className="text-xs text-gray-500">{friendsProfiles.length} total</p>
                  </div>
                  {friendsProfiles.length === 0 ? (
                    <p className="text-sm text-gray-500">No friends yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {friendsProfiles.map((friend) => (
                        <div key={friend.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2">
                          <Link href={`/profile/${friend.id}`} className="flex min-w-0 items-center gap-2">
                            {friend.avatar_url ? (
                              <img src={friend.avatar_url} alt={friend.display_name || "Friend"} className="h-9 w-9 rounded-full object-cover border" />
                            ) : (
                              <div className="h-9 w-9 rounded-full border bg-gray-100" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{friend.display_name || "Friend"}</p>
                            </div>
                          </Link>
                          <button
                            type="button"
                            className="rounded-full border px-3 py-2 text-sm"
                            onClick={async () => {
                              const client = supabase;
                              if (!client || !userId) return;
                              const { error } = await client
                                .from("friends")
                                .delete()
                                .or(`and(requester_id.eq.${userId},addressee_id.eq.${friend.id}),and(requester_id.eq.${friend.id},addressee_id.eq.${userId})`);
                              if (error) return setStatus(error.message);
                              setStatus("Friend removed.");
                              setBlockedRefreshTick((x) => x + 1);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Friend requests</p>
                      <p className="text-xs text-gray-500">Incoming requests can be accepted or declined here.</p>
                    </div>
                    <p className="text-xs text-gray-500">{friendRequests.length} total</p>
                  </div>
                  {friendRequests.length === 0 ? (
                    <p className="text-sm text-gray-500">No pending requests.</p>
                  ) : (
                    <div className="space-y-2">
                      {friendRequests.map((request) => (
                        <div key={`${request.edge.requester_id}-${request.edge.addressee_id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2">
                          <Link href={`/profile/${request.id}`} className="flex min-w-0 items-center gap-2">
                            {request.avatar_url ? (
                              <img src={request.avatar_url} alt={request.display_name || "User"} className="h-9 w-9 rounded-full object-cover border" />
                            ) : (
                              <div className="h-9 w-9 rounded-full border bg-gray-100" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{request.display_name || "User"}</p>
                            </div>
                          </Link>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{request.direction === "incoming" ? "Incoming" : "Outgoing"}</span>
                            {request.direction === "incoming" ? (
                              <button
                                type="button"
                                className="rounded-full border px-3 py-2 text-sm"
                                onClick={async () => {
                                  const client = supabase;
                                  if (!client || !userId) return;
                                  const { error } = await client
                                    .from("friends")
                                    .update({ status: "accepted" })
                                    .eq("requester_id", request.edge.requester_id)
                                    .eq("addressee_id", request.edge.addressee_id);
                                  if (error) return setStatus(error.message);
                                  setStatus("Friend request accepted.");
                                  setBlockedRefreshTick((x) => x + 1);
                                }}
                              >
                                Accept
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="rounded-full border px-3 py-2 text-sm"
                              onClick={async () => {
                                const client = supabase;
                                if (!client || !userId) return;
                                const { error } = await client
                                  .from("friends")
                                  .delete()
                                  .eq("requester_id", request.edge.requester_id)
                                  .eq("addressee_id", request.edge.addressee_id)
                                  .eq("status", "pending");
                                if (error) return setStatus(error.message);
                                setStatus(request.direction === "incoming" ? "Request declined." : "Request canceled.");
                                setBlockedRefreshTick((x) => x + 1);
                              }}
                            >
                              {request.direction === "incoming" ? "Decline" : "Cancel"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "blocked" && (
              <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Blocked users</p>
                    <p className="text-xs text-gray-500">People you’ve blocked won’t appear in feeds or comments.</p>
                  </div>
                  <p className="text-xs text-gray-500">{blockedProfiles.length} total</p>
                </div>
                {blockedProfiles.length === 0 ? (
                  <p className="text-sm text-gray-500">No blocked users.</p>
                ) : (
                  <div className="space-y-2">
                    {blockedProfiles.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2">
                        <Link href={`/profile/${p.id}`} className="flex min-w-0 items-center gap-2">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt={p.display_name || "Blocked user"} className="h-9 w-9 rounded-full object-cover border" />
                          ) : (
                            <div className="h-9 w-9 rounded-full border bg-gray-100" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.display_name || "Blocked user"}</p>
                          </div>
                        </Link>
                        <button type="button" className="border rounded px-3 py-2 text-sm" onClick={() => void unblockProfile(p.id)}>Unblock</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {userId ? (
              <div className="pt-3 border-t">
                <button type="button" className="w-full rounded bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700" onClick={() => setShowSignOutConfirm(true)}>
                  Sign out
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {showSignOutConfirm ? (
        <div className="fixed inset-0 z-[140] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-3 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-lg">Sign out</h3>
                <p className="text-sm text-gray-600">Are you sure you want to sign out of QuestHat?</p>
              </div>
              <button className="border rounded px-2 py-1" onClick={() => setShowSignOutConfirm(false)}>Close</button>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="border rounded px-3 py-2" onClick={() => setShowSignOutConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="border border-red-300 bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deactivatedAt && !showDeleteAccountConfirm ? (
        <div className="fixed inset-0 z-[160] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border p-6 space-y-4 text-center shadow-2xl">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cyan-50 text-cyan-800 text-2xl">Ⅱ</div>
            <div>
              <h3 className="font-semibold text-xl">Your account is deactivated</h3>
              <p className="mt-2 text-sm text-gray-600">Your profile and listings remain hidden. Restore the account to return with your data intact.</p>
            </div>
            <button type="button" className="w-full rounded-xl bg-slate-950 px-4 py-3 font-medium text-white disabled:opacity-50" onClick={() => void restoreAccount()} disabled={Boolean(accountActionLoading)}>
              {accountActionLoading === "restore" ? "Restoring..." : "Restore account"}
            </button>
            <button type="button" className="w-full rounded-xl border px-4 py-3 font-medium disabled:opacity-50" onClick={() => void signOut()} disabled={Boolean(accountActionLoading)}>Keep deactivated and sign out</button>
            <button type="button" className="text-sm font-medium text-red-700" onClick={() => setShowDeleteAccountConfirm(true)}>Delete permanently instead</button>
          </div>
        </div>
      ) : null}

      {showDeleteAccountConfirm ? (
        <div className="fixed inset-0 z-[170] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="font-semibold text-xl text-red-800">Permanently delete account?</h3>
              <p className="mt-2 text-sm text-gray-600">This permanently removes your account data and uploaded media. It cannot be undone.</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">Type DELETE below to continue.</div>
            <input
              className="w-full rounded-xl border px-3 py-3"
              value={deleteAccountConfirmation}
              onChange={(event) => setDeleteAccountConfirmation(event.target.value.toUpperCase())}
              placeholder="Type DELETE"
              disabled={accountActionLoading === "delete"}
            />
            <button
              type="button"
              className="w-full rounded-xl bg-red-600 px-4 py-3 font-medium text-white disabled:bg-gray-300"
              onClick={() => void permanentlyDeleteAccount()}
              disabled={deleteAccountConfirmation !== "DELETE" || Boolean(accountActionLoading)}
            >
              {accountActionLoading === "delete" ? "Deleting..." : "Delete permanently"}
            </button>
            <button type="button" className="w-full rounded-xl border px-4 py-3" onClick={() => setShowDeleteAccountConfirm(false)} disabled={accountActionLoading === "delete"}>Cancel</button>
          </div>
        </div>
      ) : null}

      {showPhotoCropper && photoPreviewUrl && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Adjust profile photo</h3>
              <button className="border rounded px-2 py-1" onClick={() => setShowPhotoCropper(false)}>Done</button>
            </div>
            <p className="text-xs text-gray-600">Drag the photo in the circle to reposition it. Use zoom for framing. We keep the original upload so you can crop again later.</p>
            <div
              className="relative h-64 w-64 rounded-full overflow-hidden border mx-auto bg-black/5 touch-none cursor-grab active:cursor-grabbing"
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
                style={{ transform: `translate(${cropOffsetX}px, ${cropOffsetY}px) scale(${cropZoom})`, transformOrigin: "center center" }}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-2 text-[11px] text-white">Drag to reposition</div>
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
