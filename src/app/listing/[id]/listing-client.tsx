"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatActivityTime, formatPostedTime } from "@/lib/activity-time";
import { readStoredUserLocation, writeStoredUserLocation } from "@/lib/location-distance";
import { getSupabaseClient } from "@/lib/supabase";
import { resolveCanonicalCategory } from "@/lib/category-suggestions.js";
import { AppIcon } from "@/components/app-icons";
import { formatReportReference } from "@/lib/reporting";
import { recordSecurityAudit } from "@/lib/security-audit";
import { GENDER_IDENTITY_OPTIONS } from "@/lib/people-discovery";
import { downloadQuestCalendarFile } from "@/lib/quest-calendar";

type Listing = {
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
  starts_at?: string | null;
  time_flexible?: boolean | null;
  host_coordination_reminders_disabled?: boolean | null;
  host_coordination_reminders_snoozed_until?: string | null;
  media_video_url: string | null;
  media_source: "live" | "upload" | null;
  media_items?: { url: string; type: "image" | "video"; label?: string | null; thumbnailUrl?: string | null }[] | null;
  hobbies?: { name: string | null; category: string | null }[] | null;
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }[] | null;
};

type MemberProfile = { id: string; display_name: string | null; avatar_url: string | null };
type MemberLocationProfile = MemberProfile & { city?: string | null };

type MemberRow = {
  user_id: string;
  role: "creator" | "cohost" | "member";
  status?: "pending" | "approved" | "declined";
  profiles?: MemberLocationProfile[] | MemberLocationProfile | null;
};

type ListingComment = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  profiles?: MemberProfile[] | MemberProfile | null;
};

type QuestCheckIn = {
  user_id: string;
  checked_in_at: string;
  profiles?: MemberProfile[] | MemberProfile | null;
};

type PeopleDiscoveryResult = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  gender_identity: string | null;
  age: number;
  distance_km: number;
  shared_interests: number;
};

export default function ListingPage() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const pathname = usePathname();
  const listingId = pathname.match(/^\/listing\/([^/]+)/)?.[1];
  const [listing, setListing] = useState<Listing | null>(null);
  const [status, setStatus] = useState("Loading listing...");
  const [userId, setUserId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [myMembershipStatus, setMyMembershipStatus] = useState<"pending" | "approved" | "declined" | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [exactAccessUserIds, setExactAccessUserIds] = useState<string[]>([]);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [questionMode, setQuestionMode] = useState<"public" | "private">("public");
  const [questionText, setQuestionText] = useState("");
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [lastQuestionMs, setLastQuestionMs] = useState(0);
  const [comments, setComments] = useState<ListingComment[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [expandedMediaIndex, setExpandedMediaIndex] = useState<number | null>(null);
  const [generatedVideoThumbs, setGeneratedVideoThumbs] = useState<Record<string, string>>({});
  const [memberDistanceByUserId, setMemberDistanceByUserId] = useState<Record<string, string>>({});
  const [myDistanceLabel, setMyDistanceLabel] = useState("");
  const [myDistanceMiles, setMyDistanceMiles] = useState<number | null>(null);
  const [myLocationStatus, setMyLocationStatus] = useState<"idle" | "loading" | "ready" | "denied" | "error">("idle");
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showDistanceJoinModal, setShowDistanceJoinModal] = useState(false);
  const [reportTargetUserId, setReportTargetUserId] = useState<string | null>(null);
  const [blockTargetUserId, setBlockTargetUserId] = useState<string | null>(null);
  const [reportContext, setReportContext] = useState<"listing_content" | "chat_behavior" | "profile_account" | "in_person">("in_person");
  const [reportReason, setReportReason] = useState("unsafe_behavior");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportFeedback, setReportFeedback] = useState("");
  const [renderedAt] = useState(() => Date.now());
  const [showPeopleFinder, setShowPeopleFinder] = useState(false);
  const [peopleResults, setPeopleResults] = useState<PeopleDiscoveryResult[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleSelectedIds, setPeopleSelectedIds] = useState<string[]>([]);
  const [peopleMessage, setPeopleMessage] = useState("");
  const [peopleMinAge, setPeopleMinAge] = useState(18);
  const [peopleMaxAge, setPeopleMaxAge] = useState(100);
  const [peopleMaxDistanceKm, setPeopleMaxDistanceKm] = useState(40);
  const [peopleGenderFilters, setPeopleGenderFilters] = useState<string[]>([]);
  const [peopleSending, setPeopleSending] = useState(false);
  const [checkIns, setCheckIns] = useState<QuestCheckIn[]>([]);
  const [checkInAction, setCheckInAction] = useState<"check-in" | "leave" | null>(null);
  const [coordinationReminderAction, setCoordinationReminderAction] = useState<"snooze" | "disable" | "enable" | null>(null);

  function sanitizeLocationLabel(input?: string | null) {
    const raw = (input || "").trim();
    if (!raw) return "";
    return raw.replace(/,\s*(Florida|FL)$/i, "").replace(/\s+\b(Florida|FL)\b$/i, "").trim();
  }

  function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 3958.8;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function distanceLabelMiles(miles: number) {
    if (!Number.isFinite(miles)) return "";
    if (miles < 1) return `${Math.max(0.1, Math.round(miles * 10) / 10)} mi away`;
    if (miles < 10) return `${Math.round(miles * 10) / 10} mi away`;
    return `${Math.round(miles)} mi away`;
  }

  const cityCoordinateCacheRef = useRef<Record<string, { lat: number; lon: number }>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [listingId]);

  function getListingHostName() {
    if (!listing) return null;
    const profile = Array.isArray(listing.profiles) ? listing.profiles[0] : listing.profiles;
    return profile?.display_name || listing.creator_id || null;
  }

  async function loadPeople() {
    if (!supabase || !listing || !isOwner) return;
    setPeopleLoading(true);
    setStatus("");
    const { data, error } = await supabase.rpc("find_people", {
      p_min_age: peopleMinAge,
      p_max_age: peopleMaxAge,
      p_gender_identities: peopleGenderFilters.length ? peopleGenderFilters : null,
      p_max_distance_km: peopleMaxDistanceKm,
      p_limit: 50,
      p_offset: 0,
    });
    setPeopleLoading(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setPeopleResults((data || []) as PeopleDiscoveryResult[]);
  }

  async function sendPeopleInvitations() {
    if (!supabase || !listing || !peopleSelectedIds.length || peopleSending) return;
    setPeopleSending(true);
    const results = await Promise.all(peopleSelectedIds.map((recipientId) => supabase.rpc("send_quest_invitation", {
      p_quest_id: listing.id,
      p_recipient_id: recipientId,
      p_message: peopleMessage.trim() || null,
    })));
    setPeopleSending(false);
    const failed = results.filter((result) => result.error);
    const sent = results.length - failed.length;
    setStatus(failed.length ? `${sent} invitation${sent === 1 ? "" : "s"} sent. ${failed[0].error?.message || "Some could not be sent."}` : `${sent} invitation${sent === 1 ? "" : "s"} sent.`);
    if (sent) setPeopleSelectedIds([]);
  }

  async function messageDiscoveredPerson(person: PeopleDiscoveryResult) {
    if (!supabase || !listing || !userId) return;
    const body = peopleMessage.trim();
    if (!body) return setStatus("Write a message first.");
    const { error } = await supabase.from("messages").insert({
      quest_id: listing.id,
      sender_id: userId,
      body: `[PRIVATE to=${person.id}] ${body}`,
    });
    setStatus(error ? error.message : `Message sent to ${person.display_name || person.username || "this person"}.`);
  }

  function getReportedUserRole(targetUserId: string | null) {
    if (!targetUserId || !listing?.creator_id) return "attendee";
    if (targetUserId === listing.creator_id) return "host";
    const member = members.find((row) => row.user_id === targetUserId);
    return member?.role || "attendee";
  }

  function normalizeDistanceLocationQuery(input?: string | null) {
    const raw = sanitizeLocationLabel(input);
    if (!raw) return "";
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)[0]
      ?.replace(/^(city|town|village)\s+of\s+/i, "")
      .trim() || raw;
  }

  function postalDistanceLocationQuery(input?: string | null) {
    const raw = sanitizeLocationLabel(input);
    return raw.split(",").map((part) => part.trim()).find((part) => /^\d{4,}$/.test(part)) || "";
  }

  function isStateOnlyLocation(input?: string | null) {
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

  function isVirtualListing() {
    const exactAddress = (listing?.exact_address || "").trim();
    if (!exactAddress) return false;
    const lowered = exactAddress.toLowerCase();
    if (/(https?:\/\/|www\.|:\/\/)/i.test(exactAddress)) return true;
    if (/(zoom|google meet|meet\.google|teams\.microsoft|webex|gotomeeting|ringcentral|whereby|discord\.gg|discord|slack|jitsi|bluejeans|join)/i.test(lowered)) return true;
    if (/\.[a-z]{2,}(?:\/|$)/i.test(exactAddress) && !/(street|st\.|road|rd\.|avenue|ave\.|boulevard|blvd\.|drive|dr\.|lane|ln\.|way|court|ct\.|place|pl\.|trail|trl\.|circle|cir\.)/i.test(lowered)) return true;
    return false;
  }

  function locationSummary(input?: string | null) {
    const raw = (input || "").trim();
    if (!raw) return "";
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
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

    return [city, postal, country].filter(Boolean).join(", ");
  }

  function locationQueriesForDistance() {
    if (!listing || isVirtualListing()) return [];
    return [
      isStateOnlyLocation(listing.city) ? "" : normalizeDistanceLocationQuery(listing.city),
      normalizeDistanceLocationQuery(locationSummary(listing.exact_address)),
      normalizeDistanceLocationQuery(listing.exact_address),
      postalDistanceLocationQuery(listing.city),
      postalDistanceLocationQuery(listing.exact_address),
    ].filter((query, index, queries) => query && queries.indexOf(query) === index);
  }

  async function fetchCityCoordinates(query: string) {
    const key = query.trim().toLowerCase();
    if (!key) return null;
    const cached = cityCoordinateCacheRef.current[key];
    if (cached) return cached;

    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
      const json = (await res.json()) as { results?: Array<{ latitude: number; longitude: number; name?: string; admin1?: string }> };
      const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
      const city = parts[0]?.toLowerCase() || "";
      const state = parts.find((part) => /^[A-Z]{2}$/.test(part))?.toLowerCase() || "";
      const postal = parts.find((part) => /^\d{4,}$/.test(part)) || "";
      const results = json.results || [];
      const result = results
        .map((candidate) => {
          const name = (candidate.name || "").trim().toLowerCase();
          const admin1 = (candidate.admin1 || "").trim().toLowerCase();
          let score = 0;
          if (!name) return { candidate, score: -1 };
          if (/^\d{4,}$/.test(query.trim())) score += 40;
          if (postal) score += 25;
          if (city) {
            if (name === city) score += 30;
            else if (name.includes(city) || city.includes(name)) score += 18;
          }
          if (state) {
            if (admin1 === state) score += 25;
            else if (admin1.includes(state) || state.includes(admin1)) score += 12;
          }
          return { candidate, score };
        })
        .filter(({ score }) => score >= 0)
        .sort((a, b) => b.score - a.score)[0]?.candidate || null;
      if (!result) return null;
      const coords = { lat: result.latitude, lon: result.longitude };
      cityCoordinateCacheRef.current[key] = coords;
      return coords;
    } catch {
      return null;
    }
  }

  async function updateDistanceFromLocation(location: { lat: number; lon: number }) {
    const questLocations = locationQueriesForDistance();
    if (!questLocations.length) return;
    const coords = await Promise.all(questLocations.map((query) => fetchCityCoordinates(query)));
    const questCoords = coords.find(Boolean);
    if (!questCoords) return;
    const miles = haversineMiles(location.lat, location.lon, questCoords.lat, questCoords.lon);
    if (Number.isFinite(miles)) {
      setMyDistanceMiles(miles);
      setMyDistanceLabel(distanceLabelMiles(miles));
    }
  }

  function requestMyLocation() {
    if (!("geolocation" in navigator)) {
      setMyLocationStatus("error");
      return;
    }
    setMyLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy };
        writeStoredUserLocation(nextLocation);
        setMyLocationStatus("ready");
        await updateDistanceFromLocation(nextLocation);
      },
      (error) => {
        setMyLocationStatus(error.code === error.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function loadMembers(questId: string, uid: string | null) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("quest_members")
      .select("user_id,role,status,profiles:profiles!quest_members_user_id_fkey(id,display_name,avatar_url,city)")
      .eq("quest_id", questId)
      .order("joined_at", { ascending: true });

    if (error) {
      setStatus(error.message);
      return;
    }
    const rows = ((data as MemberRow[]) || []).reduce<MemberRow[]>((acc, row) => {
      if (!acc.some((x) => x.user_id === row.user_id)) acc.push(row);
      return acc;
    }, []);
    setMembers(rows);
    const mine = uid ? rows.find((m) => m.user_id === uid) : null;
    setMyMembershipStatus((mine?.status || (mine ? "approved" : null)) as "pending" | "approved" | "declined" | null);
    setHasJoined(!!mine && (mine.status || "approved") === "approved");
  }

  async function loadComments(questId: string, blockedIds: string[] = []) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("messages")
      .select("id,sender_id,body,created_at,profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)")
      .eq("quest_id", questId)
      .like("body", "[PUBLIC] %")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setStatus(error.message);
      return;
    }
    const rows = ((data || []) as ListingComment[]).filter((comment) => !blockedIds.includes(comment.sender_id));
    setComments(rows);
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

  async function enableLocationAndRetry() {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!("geolocation" in navigator)) {
          reject(new Error("Geolocation is not available on this device."));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      });
      const nextLocation = { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy };
      writeStoredUserLocation(nextLocation);
      setMyLocationStatus("ready");
      await updateDistanceFromLocation(nextLocation);
      setStatus("Location enabled ✅");
    } catch (err) {
      setMyLocationStatus("denied");
      setStatus(err instanceof Error ? err.message : "Location access is required to request or join this event.");
    }
  }

  useEffect(() => {
    if (!supabase || !listingId || !/^[0-9a-fA-F-]{36}$/.test(listingId)) return;

    const init = async () => {
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user?.id ?? null;
      setUserId(uid);

      const withMedia = await supabase
        .from("quests")
        .select("id,creator_id,created_at,title,description,city,join_mode,exact_location_visibility,exact_address,skill_level,group_size,availability,starts_at,time_flexible,host_coordination_reminders_disabled,host_coordination_reminders_snoozed_until,media_video_url,media_source,media_items,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)")
        .eq("id", listingId)
        .maybeSingle();

      let data: Listing | null = withMedia.data as Listing | null;
      let error = withMedia.error;

      // Backward compatibility when DB migration for media_items has not run yet
      if (error?.message?.includes("column quests.media_items does not exist")) {
        const fallback = await supabase
          .from("quests")
          .select("id,creator_id,created_at,title,description,city,join_mode,exact_location_visibility,exact_address,skill_level,group_size,availability,starts_at,time_flexible,media_video_url,media_source,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,avatar_url)")
          .eq("id", listingId)
          .maybeSingle();
        data = fallback.data as Listing | null;
        error = fallback.error;
      }

      if (error) return setStatus(error.message);
      if (!data) return setStatus("Listing not found.");
      if (uid) {
        const { data: privateLocation, error: privateLocationError } = await supabase
          .from("quest_private_locations")
          .select("exact_address")
          .eq("quest_id", listingId)
          .maybeSingle();
        if (privateLocationError) return setStatus(privateLocationError.message);
        if (privateLocation?.exact_address) data = { ...data, exact_address: privateLocation.exact_address };
      }
      setListing(data || null);
      setStatus("");

      let blocked: string[] = [];
      if (uid) {
        const { data: blockRows } = await supabase
          .from("friends")
          .select("requester_id,addressee_id,status")
          .eq("status", "blocked")
          .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
        blocked = Array.from(new Set((blockRows || []).flatMap((r: { requester_id: string; addressee_id: string }) => [r.requester_id, r.addressee_id]).filter((id: string) => id !== uid)));
        setBlockedUserIds(blocked);
        const { data: saved, error: savedErr } = await supabase
          .from("quest_bookmarks")
          .select("quest_id")
          .eq("user_id", uid)
          .eq("quest_id", listingId)
          .maybeSingle();
        if (!savedErr) setIsSaved(!!saved);
      }

      await loadMembers(listingId, uid);
      await loadComments(listingId, blocked);
      if (uid) {
        const [{ data: accessRows }, { data: checkInRows }] = await Promise.all([
          supabase.from("quest_exact_location_access").select("user_id").eq("quest_id", listingId),
          supabase.from("quest_checkins").select("user_id,checked_in_at,profiles:profiles!quest_checkins_user_id_fkey(id,display_name,avatar_url)").eq("quest_id", listingId).order("checked_in_at", { ascending: true }),
        ]);
        setExactAccessUserIds((accessRows || []).map((r: { user_id: string }) => r.user_id));
        setCheckIns((checkInRows || []) as QuestCheckIn[]);
      }
    };

    void init();
  }, [supabase, listingId]);

  async function checkInToQuest() {
    if (!supabase || !listing || !userId || checkInAction) return;
    if (!navigator.geolocation) return setStatus("This browser does not support location check-in.");
    setCheckInAction("check-in");
    setStatus("Verifying that you’re near the meetup…");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
      });
      const { error } = await supabase.rpc("check_in_to_quest", {
        p_quest_id: listing.id,
        p_lat: position.coords.latitude,
        p_lng: position.coords.longitude,
        p_accuracy_m: position.coords.accuracy || null,
      });
      if (error) throw error;
      const { data } = await supabase.from("quest_checkins")
        .select("user_id,checked_in_at,profiles:profiles!quest_checkins_user_id_fkey(id,display_name,avatar_url)")
        .eq("quest_id", listing.id)
        .order("checked_in_at", { ascending: true });
      setCheckIns((data || []) as QuestCheckIn[]);
      setStatus("You’re checked in. Your precise location was not shared.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not check in. Check your browser location permission and try again.");
    } finally {
      setCheckInAction(null);
    }
  }

  async function leaveQuestCheckIn() {
    if (!supabase || !listing || !userId || checkInAction) return;
    setCheckInAction("leave");
    const { error } = await supabase.rpc("leave_quest_check_in", { p_quest_id: listing.id });
    if (error) setStatus(error.message);
    else {
      setCheckIns((current) => current.filter((row) => row.user_id !== userId));
      setStatus("Check-in removed.");
    }
    setCheckInAction(null);
  }

  async function updateCoordinationReminders(action: "snooze" | "disable" | "enable") {
    if (!supabase || !listing || !isManager || coordinationReminderAction) return;
    setCoordinationReminderAction(action);
    const snoozedUntil = action === "snooze" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
    const enabled = action !== "disable";
    const { error } = await supabase.rpc("set_host_coordination_reminders", {
      p_quest_id: listing.id,
      p_enabled: enabled,
      p_snoozed_until: snoozedUntil,
    });
    if (error) setStatus(error.message);
    else {
      setListing((current) => current ? {
        ...current,
        host_coordination_reminders_disabled: !enabled,
        host_coordination_reminders_snoozed_until: snoozedUntil,
      } : current);
      setStatus(action === "disable" ? "Host reminders are off for this quest." : action === "snooze" ? "Host reminders are snoozed until tomorrow." : "Host reminders are on.");
    }
    setCoordinationReminderAction(null);
  }

  function addQuestToCalendar() {
    if (!listing?.starts_at) return setStatus("This quest does not have a start time yet.");
    try {
      downloadQuestCalendarFile({
        id: listing.id,
        title: listing.title,
        description: listing.description,
        startsAt: listing.starts_at,
        location: canViewExactAddress ? listing.exact_address || listing.city : listing.city,
        url: `${window.location.origin}/listing/${listing.id}`,
      });
      setStatus("Calendar event downloaded. Open it to add this quest to your calendar.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create the calendar event.");
    }
  }

  useEffect(() => {
    // Reset stale distance data before calculating it for the next listing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMyDistanceLabel("");
    setMyDistanceMiles(null);
    const storedLocation = readStoredUserLocation();
    if (storedLocation) {
      setMyLocationStatus("ready");
      void updateDistanceFromLocation(storedLocation);
      return;
    }
    requestMyLocation();
  }, [listing?.id]);

  async function toggleJoin() {
    if (!supabase || !userId || !listing) return setStatus("Log in to join.");
    if (listing.creator_id === userId) return setStatus("You can’t join your own listing.");

    if (myMembershipStatus === "approved" || myMembershipStatus === "pending") {
      const { error } = await supabase
        .from("quest_members")
        .delete()
        .eq("quest_id", listing.id)
        .eq("user_id", userId);
      if (error) return setStatus(error.message);

      await supabase
        .from("quest_exact_location_access")
        .delete()
        .eq("quest_id", listing.id)
        .eq("user_id", userId);
      setExactAccessUserIds((prev) => prev.filter((id) => id !== userId));

      setStatus(myMembershipStatus === "pending" ? "Join request canceled." : "Left listing.");
      setHasJoined(false);
      setMyMembershipStatus(null);
      await loadMembers(listing.id, userId);
      return;
    }

    const nextStatus = (listing.join_mode || "open") === "approval_required" ? "pending" : "approved";
    if (myMembershipStatus === "declined") {
      const { error: delErr } = await supabase
        .from("quest_members")
        .delete()
        .eq("quest_id", listing.id)
        .eq("user_id", userId);
      if (delErr) return setStatus(delErr.message);
    }

    const distanceWarningThresholdMiles = 15;
    if (
      typeof myDistanceMiles === "number" &&
      Number.isFinite(myDistanceMiles) &&
      myDistanceMiles > distanceWarningThresholdMiles
    ) {
      setShowDistanceJoinModal(true);
      return;
    }

    {
      const { error } = await supabase.from("quest_members").insert({ quest_id: listing.id, user_id: userId, role: "member", status: nextStatus });
      if (error && !error.message.includes("duplicate") && !error.message.toLowerCase().includes("unique")) return setStatus(error.message);
    }

    setStatus(nextStatus === "pending" ? "Join request sent ⏳" : "Joined listing ✅");
    setHasJoined(nextStatus === "approved");
    setMyMembershipStatus(nextStatus);
    await loadMembers(listing.id, userId);
  }

  async function confirmDistanceJoin() {
    if (!supabase || !userId || !listing) return;
    setShowDistanceJoinModal(false);

    const nextStatus = (listing.join_mode || "open") === "approval_required" ? "pending" : "approved";
    {
      const { error } = await supabase.from("quest_members").insert({ quest_id: listing.id, user_id: userId, role: "member", status: nextStatus });
      if (error && !error.message.includes("duplicate") && !error.message.toLowerCase().includes("unique")) return setStatus(error.message);
    }

    setStatus(nextStatus === "pending" ? "Join request sent ⏳" : "Joined listing ✅");
    setHasJoined(nextStatus === "approved");
    setMyMembershipStatus(nextStatus);
    await loadMembers(listing.id, userId);
  }

  async function setMemberApproval(targetUserId: string, next: "pending" | "approved") {
    if (!supabase || !listing || !isManager) return;
    const { error } = await supabase
      .from("quest_members")
      .update({ status: next })
      .eq("quest_id", listing.id)
      .eq("user_id", targetUserId)
      .neq("role", "creator");
    if (error) return setStatus(error.message);
    await loadMembers(listing.id, userId);
    setStatus(next === "approved" ? "Member approved ✅" : "Moved back to pending.");
  }

  async function declineMember(targetUserId: string) {
    if (!supabase || !listing || !isManager) return;
    const { error } = await supabase
      .from("quest_members")
      .update({ status: "declined" })
      .eq("quest_id", listing.id)
      .eq("user_id", targetUserId)
      .neq("role", "creator");
    if (error) return setStatus(error.message);
    await loadMembers(listing.id, userId);
    setStatus("Request declined.");
  }

  function openReportUser(targetUserId: string) {
    if (!userId) {
      setStatus("Log in to submit reports.");
      return;
    }
    if (targetUserId === userId) return;
    setReportTargetUserId(targetUserId);
    setReportContext("in_person");
    setReportReason("unsafe_behavior");
    setReportDetails("");
    setReportFeedback("");
    setShowReportModal(true);
  }

  const reportFeedbackTone = reportFeedback.toLowerCase().includes("couldn't") || reportFeedback.toLowerCase().includes("try again")
    ? "error"
    : reportFeedback.toLowerCase().includes("submitted")
      ? "success"
      : "neutral";

  async function submitUserReport() {
    if (!supabase || !userId || !listing || !reportTargetUserId) return;
    if (reportContext === "in_person" && !reportDetails.trim()) {
      return setStatus("Please add details for in-person reports.");
    }

    setSubmittingReport(true);
    const reportId = crypto.randomUUID();
    const { error } = await supabase.from("reports").insert({
      id: reportId,
      reporter_id: userId,
      reported_user_id: reportTargetUserId,
      quest_id: listing.id,
      context_type: reportContext,
      reason_code: reportReason,
      details: reportDetails.trim() || null,
      auto_flags: {
        reporter_name: userId,
        listing_title: listing.title || null,
        host_name: getListingHostName(),
        report_target_type: "user",
        report_target_id: reportTargetUserId,
        report_target_role: getReportedUserRole(reportTargetUserId),
        report_target_key: `user:${reportTargetUserId}`,
        report_target_label: reportTargetUserId,
      },
    });
    setSubmittingReport(false);
    if (error) {
      setReportFeedback(error.message || "We couldn't submit that report right now. Please try again in a moment.");
      return;
    }
    {
      const { data: auditSession } = await supabase.auth.getSession();
      await recordSecurityAudit(
        {
          event_type: "report_submitted",
          user_id: userId,
          metadata: {
            report_id: reportId,
            context_type: reportContext,
            target_type: "user",
            target_id: reportTargetUserId,
            quest_id: listing.id,
          },
        },
        auditSession.session?.access_token,
      );
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

  async function setMemberRole(targetUserId: string, nextRole: "member" | "cohost") {
    if (!supabase || !listing || !isOwner) return;
    const { error } = await supabase
      .from("quest_members")
      .update({ role: nextRole })
      .eq("quest_id", listing.id)
      .eq("user_id", targetUserId)
      .neq("role", "creator")
      .eq("status", "approved");
    if (error) return setStatus(error.message);
    await loadMembers(listing.id, userId);
    setStatus(nextRole === "cohost" ? "Promoted to co-host." : "Demoted to member.");
  }

  async function toggleExactAccess(targetUserId: string, allow: boolean) {
    if (!supabase || !listing || !isManager) return;
    if (allow) {
      const { error } = await supabase.from("quest_exact_location_access").upsert({ quest_id: listing.id, user_id: targetUserId, granted_by: userId });
      if (error) return setStatus(error.message);
      setExactAccessUserIds((prev) => prev.includes(targetUserId) ? prev : [...prev, targetUserId]);
      setStatus("Exact location access granted.");
      return;
    }
    const { error } = await supabase.from("quest_exact_location_access").delete().eq("quest_id", listing.id).eq("user_id", targetUserId);
    if (error) return setStatus(error.message);
    setExactAccessUserIds((prev) => prev.filter((id) => id !== targetUserId));
    setStatus("Exact location access revoked.");
  }

  async function blockMemberFromQuest(targetUserId: string) {
    if (!supabase || !listing || !isManager || !targetUserId) return;
    await supabase.from("friends").delete().eq("requester_id", userId).eq("addressee_id", targetUserId);

    const { error } = await supabase.from("friends").upsert({
      requester_id: userId,
      addressee_id: targetUserId,
      status: "blocked",
    });
    if (error) return setStatus(error.message);

    await supabase.from("quest_members").delete().eq("quest_id", listing.id).eq("user_id", targetUserId);
    await supabase.from("quest_exact_location_access").delete().eq("quest_id", listing.id).eq("user_id", targetUserId);
    setMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
    await loadMembers(listing.id, userId);
    await loadComments(listing.id, []);
    setBlockedUserIds((prev) => prev.includes(targetUserId) ? prev : [...prev, targetUserId]);
    setShowBlockConfirm(false);
    setBlockTargetUserId(null);
    setStatus("User blocked and removed from this quest.");
  }

  function askQuestion(mode: "public" | "private" = "public") {
    if (!supabase || !userId || !listing) return setStatus("Log in to comment or message listing owners.");
    setQuestionMode(mode);
    setQuestionText("");
    setShowQuestionModal(true);
  }

  async function sendQuestionFromModal() {
    if (!supabase || !userId || !listing) return;
    if (sendingQuestion) return;
    if (Date.now() - lastQuestionMs < 3000) return setStatus("Slow down a sec before sending again.");
    const trimmed = questionText.trim();
    if (!trimmed) return setStatus("Please enter your message.");
    if (trimmed.length > 500) return setStatus("Message is too long (max 500 chars).");

    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", userId)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if ((count || 0) >= 6) return setStatus("Rate limit: please wait a minute before sending more messages.");

    setSendingQuestion(true);
    const prefix = questionMode === "private"
      ? `[PRIVATE to=${listing.creator_id}] `
      : "[PUBLIC] ";
    const { error } = await supabase.from("messages").insert({
      quest_id: listing.id,
      sender_id: userId,
      body: `${prefix}${trimmed}`,
    });
    setSendingQuestion(false);
    if (error) return setStatus(error.message);
    {
      const { data: auditSession } = await supabase.auth.getSession();
      await recordSecurityAudit(
        {
          event_type: "message_sent",
          user_id: userId,
          metadata: {
            quest_id: listing.id,
            message_mode: questionMode,
          },
        },
        auditSession.session?.access_token,
      );
    }

    setShowQuestionModal(false);
    setQuestionText("");
    setLastQuestionMs(Date.now());
    setStatus(`${questionMode === "private" ? "Direct" : "Public"} message sent ✅`);
  }

  async function toggleSave() {
    if (!supabase || !userId || !listing) return setStatus("Log in to save listings.");

    if (isSaved) {
      const { error } = await supabase.from("quest_bookmarks").delete().eq("user_id", userId).eq("quest_id", listing.id);
      if (error) return setStatus(error.message);
      setIsSaved(false);
      setStatus("Removed from saved listings.");
      return;
    }

    const { error } = await supabase.from("quest_bookmarks").insert({ user_id: userId, quest_id: listing.id });
    if (error?.message.includes("quest_bookmarks")) return setStatus("Bookmarks not set up yet. Run the bookmarks SQL migration.");
    if (error && !error.message.includes("duplicate")) return setStatus(error.message);
    setIsSaved(true);
    setStatus("Saved listing ✅");
  }

  async function deleteListing() {
    if (!supabase || !userId || !listing) return;
    if (listing.creator_id !== userId) return;
    const ok = window.confirm("Delete this listing? This cannot be undone.");
    if (!ok) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return setStatus("Log in to delete this listing.");

    const res = await fetch("/api/quests/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quest_id: listing.id }),
    });
    const result = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; storageCleanupError?: string } | null;
    if (!res.ok || !result?.ok) return setStatus(result?.error || "Listing was not deleted. Please try again.");
    router.push("/");
  }

  const isOwner = !!(userId && listing && userId === listing.creator_id);
  const myMemberRow = userId ? members.find((m) => m.user_id === userId) : null;
  const isManager = !!(isOwner || (myMemberRow && myMemberRow.role === "cohost" && (myMemberRow.status || "approved") === "approved"));

  useEffect(() => {
    if (!supabase || !listingId || !userId || !(isManager || myMembershipStatus === "approved")) return;
    const refresh = async () => {
      const { data, error } = await supabase.from("quest_checkins")
        .select("user_id,checked_in_at,profiles:profiles!quest_checkins_user_id_fkey(id,display_name,avatar_url)")
        .eq("quest_id", listingId)
        .order("checked_in_at", { ascending: true });
      if (!error) setCheckIns((data || []) as QuestCheckIn[]);
    };
    const channel = supabase.channel(`web-quest-checkins-${listingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quest_checkins", filter: `quest_id=eq.${listingId}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, listingId, userId, isManager, myMembershipStatus]);

  const canViewExactAddress = !!(listing && userId && (() => {
    if (isManager) return true;
    if (listing.exact_location_visibility === "public") return true;
    if (listing.exact_location_visibility === "approved_members") {
      return myMembershipStatus === "approved" && exactAccessUserIds.includes(userId);
    }
    return exactAccessUserIds.includes(userId);
  })());

  function memberProfileOf(member: MemberRow): MemberLocationProfile | null {
    if (!member.profiles) return null;
    return Array.isArray(member.profiles) ? (member.profiles[0] || null) : member.profiles;
  }

  function commentProfileOf(comment: ListingComment): MemberProfile | null {
    if (!comment.profiles) return null;
    return Array.isArray(comment.profiles) ? (comment.profiles[0] || null) : comment.profiles;
  }

  useEffect(() => {
    if (!listing || !members.length) {
      // Clear distances when there are no members to display.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMemberDistanceByUserId({});
      return;
    }

    let cancelled = false;
    const questLocation = sanitizeLocationLabel(listing.city) || sanitizeLocationLabel(listing.exact_address) || "";
    if (!questLocation) {
      setMemberDistanceByUserId({});
      return;
    }

    void (async () => {
      const questCoords = await fetchCityCoordinates(questLocation);
      if (!questCoords || cancelled) return;

      const next: Record<string, string> = {};
      for (const member of members) {
        const memberCity = sanitizeLocationLabel(memberProfileOf(member)?.city || null);
        if (!memberCity) continue;
        const memberCoords = await fetchCityCoordinates(memberCity);
        if (!memberCoords || cancelled) continue;
        const miles = haversineMiles(questCoords.lat, questCoords.lon, memberCoords.lat, memberCoords.lon);
        if (Number.isFinite(miles)) next[member.user_id] = distanceLabelMiles(miles);
      }
      if (!cancelled) setMemberDistanceByUserId(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [listing, members]);

  function listingCategoryLabel() {
    const hobby = Array.isArray(listing?.hobbies) ? (listing?.hobbies[0] ?? null) : listing?.hobbies ?? null;
    const title = listing?.title.trim().toLowerCase() || "";
    const candidates = [hobby?.name?.trim(), hobby?.category?.trim()].filter((value): value is string => {
      if (!value) return false;
      const normalized = value.toLowerCase();
      if (/^(category|hobby|custom)$/i.test(value)) return false;
      return normalized !== title;
    });
    for (const raw of candidates) {
      if (/^creative$/i.test(raw)) return "Creative";
      if (/^social$/i.test(raw)) return "Social";
      return resolveCanonicalCategory(raw) || raw;
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

  function formatPostedLabel(createdAt?: string | null) {
    return formatPostedTime(createdAt, renderedAt);
  }

  function getEventTimingLabel(availability?: string | null) {
    if (listing?.starts_at) {
      const date = new Date(listing.starts_at);
      if (Number.isFinite(date.getTime())) {
        return `${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}${listing.time_flexible ? " · time flexible" : ""}`;
      }
    }
    const raw = (availability || "").trim();
    if (!raw) return "Event time tbd";
    return raw.replace(/^Start at:\s*/i, "Event: ");
  }

  const visibleMembers = members.filter((m) => !blockedUserIds.includes(m.user_id));
  const blockedMembers = members.filter((m) => blockedUserIds.includes(m.user_id));
  const approvedParticipant = isManager || myMembershipStatus === "approved";
  const checkInWindowOpen = Boolean(listing?.starts_at && Date.now() >= new Date(listing.starts_at).getTime() - 4 * 60 * 60 * 1000 && Date.now() <= new Date(listing.starts_at).getTime() + 12 * 60 * 60 * 1000);
  const showCheckIn = Boolean(listing && approvedParticipant && !isVirtualListing() && checkInWindowOpen);
  const myCheckIn = checkIns.find((row) => row.user_id === userId);
  const pendingMembers = members.filter((member) => member.status === "pending");
  const reminderSnoozed = Boolean(listing?.host_coordination_reminders_snoozed_until && new Date(listing.host_coordination_reminders_snoozed_until).getTime() > Date.now());

  return (
    <main className="page-shell page-listing app-page min-h-screen overflow-y-auto overscroll-contain bg-transparent p-4 [-webkit-overflow-scrolling:touch]">
      <div className="max-w-4xl mx-auto space-y-3">
        <button
          type="button"
          className="inline-block border rounded px-3 py-2 text-left app-back-button"
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
              return;
            }
            router.push("/");
          }}
        >
          ← Back to listings
        </button>

        {!listing && status ? (
          <div className="rounded-2xl border bg-white p-4 text-sm">{status}</div>
        ) : listing ? (
          <article className="rounded-2xl border bg-white p-4 space-y-4 quest-detail-panel">
            <div className="flex items-center gap-3 quest-detail-titlebar">
              {listing.profiles?.[0]?.avatar_url ? (
                <img src={listing.profiles[0].avatar_url} alt="Creator" className="h-12 w-12 rounded-full border object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-full border bg-gray-100" />
              )}
              <div>
                <p className="app-kicker">{listingCategoryLabel()}</p><h1 className="text-2xl font-bold">{listing.title}</h1>
                <Link href={`/profile/${listing.creator_id}`} className="text-sm underline text-gray-600">
                  {listing.profiles?.[0]?.display_name || "View creator profile"}
                </Link>
              </div>
            </div>

            {listing.media_video_url && (
              <div className="relative overflow-hidden rounded-xl border bg-black">
                {generatedVideoThumbs[`listing-video-${listing.id}`] ? null : (
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <div className="flex flex-col items-center gap-2 text-white/80">
                      <div className="h-12 w-12 rounded-full border border-white/30 bg-white/10 flex items-center justify-center"><AppIcon name="play" className="h-6 w-6" /></div>
                      <span className="text-xs">Loading video preview</span>
                    </div>
                  </div>
                )}
                {generatedVideoThumbs[`listing-video-${listing.id}`] ? (
                  <img
                    src={generatedVideoThumbs[`listing-video-${listing.id}`]}
                    alt="Video thumbnail"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : null}
                <video
                  className="w-full max-h-80 object-contain bg-transparent opacity-0 transition-opacity duration-200"
                  src={listing.media_video_url}
                  crossOrigin="anonymous"
                  poster={generatedVideoThumbs[`listing-video-${listing.id}`] || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    void generateVideoThumbnail(e.currentTarget, `listing-video-${listing.id}`);
                  }}
                  onLoadedData={(e) => {
                    e.currentTarget.classList.remove("opacity-0");
                    e.currentTarget.classList.add("opacity-100");
                  }}
                  onCanPlay={(e) => {
                    e.currentTarget.classList.remove("opacity-0");
                    e.currentTarget.classList.add("opacity-100");
                  }}
                />
                {listing.media_source === "live" && <span className="absolute top-2 left-2 text-xs bg-emerald-600 text-white px-2 py-1 rounded-full">Live video</span>}
              </div>
            )}

            {!!listing.media_items?.length && (
              <div className="w-full overflow-x-auto pb-1 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
                <div className="flex gap-3 min-w-max snap-x snap-mandatory">
                  {listing.media_items.map((m, i) => (
                    <button key={`${m.url}-${i}`} type="button" className="rounded-xl border p-2 bg-gray-50 w-44 shrink-0 text-left snap-start" onClick={() => setExpandedMediaIndex(i)}>
                      {m.type === "image" ? (
                        <img src={m.url} alt={m.label || "Listing media"} className="w-full h-28 object-cover rounded" />
                      ) : (
                        <div className="relative w-full h-28 overflow-hidden rounded bg-black">
                          {(m.thumbnailUrl || generatedVideoThumbs[m.url]) ? (
                            <img src={m.thumbnailUrl || generatedVideoThumbs[m.url]} alt={m.label || "Video thumbnail"} className="absolute inset-0 h-full w-full object-cover" />
                          ) : null}
                          <video
                            src={m.url}
                            crossOrigin="anonymous"
                            poster={m.thumbnailUrl || generatedVideoThumbs[m.url] || undefined}
                            className="relative z-10 w-full h-full object-cover bg-transparent opacity-0 transition-opacity duration-200"
                            preload="metadata"
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              void generateVideoThumbnail(e.currentTarget, m.url);
                            }}
                            onLoadedData={(e) => {
                              e.currentTarget.classList.remove("opacity-0");
                              e.currentTarget.classList.add("opacity-100");
                            }}
                            onCanPlay={(e) => {
                              e.currentTarget.classList.remove("opacity-0");
                              e.currentTarget.classList.add("opacity-100");
                            }}
                          />
                        </div>
                      )}
                        {m.label && <p className="text-xs mt-1 text-gray-600 truncate">{m.label}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="quest-detail-tags"><span>{getSkillLevelLabel(listing.skill_level)}</span><span>{listing.join_mode === "approval_required" ? "Approval required" : "Open join"}</span><span>Up to {listing.group_size}</span></div>
            <div className="quest-detail-description"><p>{listing.description || "The host has not added a description yet."}</p></div>
            <div className="quest-detail-facts">
              <div><span className="quest-detail-fact-icon"><AppIcon name="location" className="h-5 w-5" /></span><div><small>Meetup</small><strong>{isVirtualListing() ? "Virtual" : (sanitizeLocationLabel(listing.city) || sanitizeLocationLabel(locationSummary(listing.exact_address)) || "Location to be confirmed")}</strong><p>{myDistanceLabel || (myLocationStatus === "denied" ? "Enable location for distance" : "Location and directions")}</p></div></div>
              <div><span className="quest-detail-fact-icon"><AppIcon name="clock" className="h-5 w-5" /></span><div><small>Starts</small><strong>{getEventTimingLabel(listing.availability)}</strong><p>{formatPostedLabel(listing.created_at)}</p>{approvedParticipant && listing.starts_at ? <button type="button" className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-full border bg-white px-3 py-2 text-xs font-bold text-slate-800" onClick={addQuestToCalendar}><AppIcon name="calendar" className="h-4 w-4" /> Add to calendar</button> : null}</div></div>
              <div><span className="quest-detail-fact-icon"><AppIcon name="shield" className="h-5 w-5" /></span><div><small>Exact location</small><strong>{canViewExactAddress ? "Available to you" : "Protected"}</strong><p>{isVirtualListing()
                ? (listing.exact_location_visibility === "public" ? "Shared with everyone" : listing.exact_location_visibility === "approved_members" ? "Shared with approved guests" : canViewExactAddress ? "Meeting link shared" : "Host shares when ready")
                : canViewExactAddress && listing.exact_address ? listing.exact_address : "The host shares it based on their privacy setting."}</p></div></div>
            </div>

            {showCheckIn ? (
              <section className="rounded-2xl border border-cyan-200 bg-[#0b202a] p-4 text-white shadow-lg shadow-cyan-950/10" aria-labelledby="quest-presence-title">
                <div className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${myCheckIn ? "bg-[#9bd8e4] text-[#082f3a]" : "bg-white/10 text-[#9bd8e4]"}`}><AppIcon name={myCheckIn ? "check" : "location"} className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1"><p className="text-[10px] font-black tracking-[0.18em] text-cyan-200">QUEST PRESENCE</p><h2 id="quest-presence-title" className="text-lg font-black">{checkIns.length ? `${checkIns.length} ${checkIns.length === 1 ? "person is" : "people are"} here` : "Let everyone know you arrived"}</h2>{checkIns.length ? <p className="mt-1 text-xs text-white/70">{checkIns.map((row) => { const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; return profile?.display_name || "QuestHat member"; }).join(" · ")}</p> : null}</div>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/75">Check-in works only within one mile of the meetup. Your precise location verifies distance and is never shown to the host or attendees.</p>
                {myCheckIn ? <div className="mt-3 flex items-center justify-between"><span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-2 text-sm font-bold text-emerald-200"><AppIcon name="check" className="h-4 w-4" /> You’re checked in</span><button type="button" disabled={Boolean(checkInAction)} className="text-sm font-bold text-cyan-200 underline disabled:opacity-50" onClick={() => void leaveQuestCheckIn()}>{checkInAction === "leave" ? "Removing…" : "Undo"}</button></div> : <button type="button" disabled={Boolean(checkInAction)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#9bd8e4] px-4 py-3 font-black text-[#082f3a] disabled:opacity-60" onClick={() => void checkInToQuest()}><AppIcon name="location" className="h-5 w-5" />{checkInAction === "check-in" ? "Verifying…" : "I’m here"}</button>}
              </section>
            ) : null}

            {isManager && pendingMembers.length ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-slate-950" aria-labelledby="host-checklist-title">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black tracking-[0.18em] text-amber-700">HOST CHECKLIST</p><h2 id="host-checklist-title" className="text-lg font-black">{pendingMembers.length} {pendingMembers.length === 1 ? "request needs" : "requests need"} you</h2><p className="mt-1 text-sm text-slate-600">Approve or decline so people can plan.</p></div>{listing.host_coordination_reminders_disabled || reminderSnoozed ? <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-black text-white">{listing.host_coordination_reminders_disabled ? "OFF" : "SNOOZED"}</span> : null}</div>
                <div className="mt-3 flex flex-wrap gap-2">{listing.host_coordination_reminders_disabled ? <button type="button" disabled={Boolean(coordinationReminderAction)} className="rounded-full border bg-white px-3 py-2 text-xs font-bold" onClick={() => void updateCoordinationReminders("enable")}>Turn reminders on</button> : <><button type="button" disabled={Boolean(coordinationReminderAction)} className="rounded-full border bg-white px-3 py-2 text-xs font-bold" onClick={() => void updateCoordinationReminders("snooze")}>Remind tomorrow</button><button type="button" disabled={Boolean(coordinationReminderAction)} className="rounded-full border bg-white px-3 py-2 text-xs font-bold" onClick={() => void updateCoordinationReminders("disable")}>Turn off for this quest</button></>}</div>
              </section>
            ) : null}

            <div className="rounded-xl border bg-gray-50 p-3 quest-detail-section quest-members-section">
              <p className="text-sm font-medium mb-2">Joined members ({visibleMembers.filter((m) => (m.status || "approved") === "approved").length})</p>
              {visibleMembers.some((m) => (m.status || "approved") === "approved" && (m.role === "creator" || m.role === "cohost")) && (
                <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  <AppIcon name="star" className="h-3.5 w-3.5" /> Hosts: {visibleMembers
                    .filter((m) => (m.status || "approved") === "approved" && (m.role === "creator" || m.role === "cohost"))
                    .map((m) => (memberProfileOf(m)?.display_name || "Host").trim().split(/\s+/)[0] || "Host")
                    .join(", ")}
                </div>
              )}
              {visibleMembers.length ? (
                <div className="space-y-2">
                  {visibleMembers.filter((m) => (m.status || "approved") === "approved").map((m) => {
                    const p = memberProfileOf(m);
                    const firstName = (p?.display_name || "Member").trim().split(/\s+/)[0] || "Member";
                    const hasExactAccess = exactAccessUserIds.includes(m.user_id);
                    return (
                      <div key={`${m.user_id}-${m.role}`} className="inline-flex items-center gap-2 border rounded-full bg-white px-2 py-1 mr-2 mb-2">
                        <div className="inline-flex items-center gap-2 min-w-0">
                          <Link href={`/profile/${m.user_id}`} className="inline-flex items-center gap-2 min-w-0">
                            {p?.avatar_url ? (
                              <img src={p.avatar_url} alt={p?.display_name || "Member"} className="h-6 w-6 rounded-full object-cover border" />
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-gray-100 border" />
                            )}
                            <span className="text-xs">{firstName}</span>
                          </Link>
                          {memberDistanceByUserId[m.user_id] ? (
                            <span className="text-[11px] text-gray-500 truncate">{memberDistanceByUserId[m.user_id]}</span>
                          ) : null}
                        </div>
                        {m.role === "creator" && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"><AppIcon name="star" className="h-3 w-3" /> Organizer</span>}
                        {m.role === "cohost" && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700"><AppIcon name="star" className="h-3 w-3" /> Co-host</span>}
                        {blockedUserIds.includes(m.user_id) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Blocked</span>}
                        {isManager && m.role !== "creator" && (
                          <button
                            type="button"
                            className={`text-xs border rounded px-2 py-0.5 font-semibold leading-none ${hasExactAccess ? "bg-emerald-200 border-emerald-500 text-emerald-950" : "bg-red-200 border-red-500 text-red-950"}`}
                            onClick={() => void toggleExactAccess(m.user_id, !hasExactAccess)}
                          >
                            {hasExactAccess ? "Exact: on" : "Exact: off"}
                          </button>
                        )}
                        {isOwner && m.role !== "creator" && (m.status || "approved") === "approved" && (
                          <button
                            type="button"
                            className="text-xs border rounded px-2 py-0.5 font-semibold leading-none bg-white border-slate-300 text-slate-800"
                            onClick={() => void setMemberRole(m.user_id, m.role === "cohost" ? "member" : "cohost")}
                          >
                            {m.role === "cohost" ? "Demote" : "Promote"}
                          </button>
                        )}
                        {userId && m.user_id !== userId && (
                          <>
                            {isManager && (
                              <button
                                type="button"
                                className="text-xs border rounded px-2 py-0.5 text-red-700 border-red-300 bg-red-50"
                                onClick={() => {
                                  setBlockTargetUserId(m.user_id);
                                  setShowBlockConfirm(true);
                                }}
                              >
                                Block
                              </button>
                            )}
                            <button
                              type="button"
                              className="text-xs border rounded px-2 py-0.5"
                              onClick={() => openReportUser(m.user_id)}
                            >
                              Report
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}

                  {isManager && members.some((m) => m.status === "pending") && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium mb-2">Pending join requests</p>
                      <div className="grid gap-2">
                        {members.filter((m) => m.status === "pending").map((m) => {
                          const p = memberProfileOf(m);
                          const firstName = (p?.display_name || "Member").trim().split(/\s+/)[0] || "Member";
                          const distanceHint = memberDistanceByUserId[m.user_id] || "";
                          return (
                            <div key={`pending-${m.user_id}`} className="flex items-center justify-between rounded border bg-white px-2 py-1">
                              <div className="min-w-0">
                                <Link href={`/profile/${m.user_id}`} className="text-xs underline">{firstName}</Link>
                                {distanceHint && <p className="text-[11px] text-gray-500 truncate">{distanceHint}</p>}
                              </div>
                              <div className="flex gap-1">
                                <button type="button" className="text-xs border rounded px-2 py-1" onClick={() => void setMemberApproval(m.user_id, "approved")}>Approve</button>
                                <button type="button" className="text-xs border rounded px-2 py-1" onClick={() => void declineMember(m.user_id)}>Decline</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isManager && members.some((m) => m.status === "declined") && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium mb-2">Declined requests</p>
                      <div className="flex flex-wrap gap-2">
                        {members.filter((m) => m.status === "declined").map((m) => {
                          const p = memberProfileOf(m);
                          const firstName = (p?.display_name || "Member").trim().split(/\s+/)[0] || "Member";
                          return <span key={`declined-${m.user_id}`} className="text-xs px-2 py-1 rounded border bg-white">{firstName}</span>;
                        })}
                      </div>
                    </div>
                  )}
                  {blockedMembers.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium mb-2 text-red-700">Blocked users are present in this quest.</p>
                      <div className="flex flex-wrap gap-2">
                        {blockedMembers.map((m) => {
                          const p = memberProfileOf(m);
                          const firstName = (p?.display_name || "Member").trim().split(/\s+/)[0] || "Member";
                          return (
                            <span key={`blocked-${m.user_id}`} className="text-xs px-2 py-1 rounded-full border bg-red-50 text-red-700">
                              {firstName} · Blocked
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No members yet.</p>
              )}
            </div>

            {isOwner && (
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 quest-detail-section">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">Find people for this quest</p>
                    <p className="mt-1 text-xs text-slate-600">Browse adults who opted in, then message them or send a quest invitation. Distances are rounded and exact locations stay private.</p>
                  </div>
                  <button type="button" className="shrink-0 rounded-full bg-[#9bd8e4] px-4 py-2 text-sm font-bold text-[#082f3a]" onClick={() => { setShowPeopleFinder((value) => !value); if (!showPeopleFinder && !peopleResults.length) void loadPeople(); }}>
                    {showPeopleFinder ? "Close" : "Find people"}
                  </button>
                </div>

                {showPeopleFinder && (
                  <div className="mt-4 space-y-3 border-t border-cyan-200 pt-4">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="grid gap-1 text-xs font-medium">Age range<span className="flex items-center gap-1"><input aria-label="Minimum age" type="number" min={18} max={100} className="w-full rounded-lg border bg-white px-2 py-2" value={peopleMinAge} onChange={(e) => setPeopleMinAge(Number(e.target.value))} /><span>to</span><input aria-label="Maximum age" type="number" min={18} max={100} className="w-full rounded-lg border bg-white px-2 py-2" value={peopleMaxAge} onChange={(e) => setPeopleMaxAge(Number(e.target.value))} /></span></label>
                      <label className="grid gap-1 text-xs font-medium">Within<select className="rounded-lg border bg-white px-2 py-2" value={peopleMaxDistanceKm} onChange={(e) => setPeopleMaxDistanceKm(Number(e.target.value))}><option value={8}>5 miles</option><option value={16}>10 miles</option><option value={40}>25 miles</option><option value={80}>50 miles</option><option value={160}>100 miles</option></select></label>
                      <button type="button" className="self-end rounded-lg border bg-white px-3 py-2 text-sm font-semibold" onClick={() => void loadPeople()}>Apply filters</button>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium">Gender (optional filter)</p>
                      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                        {GENDER_IDENTITY_OPTIONS.map((option) => {
                          const selected = peopleGenderFilters.includes(option);
                          return <button key={option} type="button" className={`rounded-full border px-2.5 py-1 text-xs ${selected ? "border-cyan-700 bg-cyan-700 text-white" : "bg-white text-slate-700"}`} onClick={() => setPeopleGenderFilters((current) => selected ? current.filter((value) => value !== option) : [...current, option])}>{option}</button>;
                        })}
                      </div>
                    </div>
                    <textarea className="min-h-20 w-full rounded-xl border bg-white px-3 py-2 text-sm" maxLength={500} placeholder="Add one message for invitations, or write a message before tapping Message…" value={peopleMessage} onChange={(e) => setPeopleMessage(e.target.value)} />
                    {peopleLoading ? <p className="text-sm text-slate-600">Finding people…</p> : peopleResults.length ? (
                      <div className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
                        {peopleResults.map((person) => {
                          const selected = peopleSelectedIds.includes(person.id);
                          return <div key={person.id} className={`rounded-xl border p-3 ${selected ? "border-cyan-700 bg-white" : "border-slate-200 bg-white/80"}`}>
                            <div className="flex items-start gap-3">
                              {person.avatar_url ? <img src={person.avatar_url} alt="" className="h-11 w-11 rounded-full border object-cover" /> : <div className="h-11 w-11 rounded-full border bg-slate-100" />}
                              <div className="min-w-0 flex-1"><Link href={`/profile/${person.id}`} className="font-semibold underline">{person.display_name || person.username || "QuestHat member"}</Link><p className="text-xs text-slate-600">Age {person.age} · {(person.distance_km * 0.621371).toFixed(person.distance_km < 16 ? 1 : 0)} mi away{person.shared_interests ? ` · ${person.shared_interests} shared interest${person.shared_interests === 1 ? "" : "s"}` : ""}</p>{person.bio ? <p className="mt-1 line-clamp-2 text-sm text-slate-700">{person.bio}</p> : null}</div>
                            </div>
                            <div className="mt-2 flex gap-2"><button type="button" className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold" onClick={() => void messageDiscoveredPerson(person)}>Message</button><button type="button" className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${selected ? "bg-cyan-700 text-white" : "bg-slate-900 text-white"}`} onClick={() => setPeopleSelectedIds((current) => selected ? current.filter((id) => id !== person.id) : [...current, person.id])}>{selected ? "Selected" : "Select to invite"}</button></div>
                          </div>;
                        })}
                      </div>
                    ) : <p className="rounded-xl border border-dashed bg-white/70 p-4 text-sm text-slate-600">No opted-in people match these filters yet. Try a wider distance or age range.</p>}
                    <button type="button" disabled={!peopleSelectedIds.length || peopleSending} className="w-full rounded-xl bg-[#0f7486] px-4 py-3 font-bold text-white disabled:opacity-40" onClick={() => void sendPeopleInvitations()}>{peopleSending ? "Sending…" : `Invite ${peopleSelectedIds.length || "selected"}`}</button>
                  </div>
                )}
              </div>
            )}

            {isManager && (
              <div className="rounded-xl border bg-gray-50 p-3">
                <p className="text-sm font-medium mb-2">Exact address access</p>
                {members.filter((m) => exactAccessUserIds.includes(m.user_id)).length ? (
                  <div className="flex flex-wrap gap-2">
                    {members.filter((m) => exactAccessUserIds.includes(m.user_id)).map((m) => {
                      const p = memberProfileOf(m);
                      const firstName = (p?.display_name || "Member").trim().split(/\s+/)[0] || "Member";
                      return (
                        <button key={`exact-${m.user_id}`} type="button" className="text-xs border rounded-full bg-white px-2 py-1" onClick={() => void toggleExactAccess(m.user_id, false)}>
                          {firstName} · Revoke
                        </button>
                      );
                    })}
                  </div>
                ) : <p className="text-xs text-gray-500">No one has manual exact-address access.</p>}
              </div>
            )}

            <div className="rounded-xl border bg-gray-50 p-3 quest-detail-section quest-comments-section">
              <p className="text-sm font-medium mb-2">Comments ({comments.length})</p>
              {comments.length ? (
                <div className="space-y-2">
                  {comments.map((comment) => {
                    const profile = commentProfileOf(comment);
                    return (
                      <div key={comment.id} className="rounded-xl border bg-white px-3 py-2">
                        <div className="flex items-center gap-2">
                          {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt={profile.display_name || "Commenter"} className="h-6 w-6 rounded-full object-cover border" />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-gray-100 border" />
                          )}
                          <Link href={`/profile/${comment.sender_id}`} className="text-xs font-medium underline">
                            {(profile?.display_name || "Member").trim().split(/\s+/)[0] || "Member"}
                          </Link>
                          {blockedUserIds.includes(comment.sender_id) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Blocked</span>}
                          <span className="text-[11px] text-gray-500">{formatActivityTime(comment.created_at, renderedAt)}</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-700">{comment.body.replace(/^\[PUBLIC\]\s?/, "")}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No comments yet.</p>
              )}
            </div>

            <div className="pt-2 flex gap-2 flex-wrap quest-detail-actions">
              {!isOwner ? (
                <>
                  <button className="border rounded px-3 py-2 bg-black text-white" onClick={() => void toggleJoin()}>{myMembershipStatus === "pending" ? "Cancel request" : (myMembershipStatus === "declined" ? "Request again" : (hasJoined ? "Leave" : ((listing.join_mode || "open") === "approval_required" ? "Request to join" : "Join")))}</button>
                </>
              ) : (
                <>
                  <Link href={`/listing/${listing.id}/edit`} className="border rounded px-3 py-2 inline-block">Edit listing</Link>
                  <Link href="/inbox" className="border rounded px-3 py-2 inline-block">Open inbox</Link>
                  <button className="border border-red-300 text-red-700 rounded px-3 py-2" onClick={() => void deleteListing()}>Delete listing</button>
                </>
              )}
              <button className="border rounded px-3 py-2" onClick={() => void askQuestion("public")}>Comment</button>
              <button className="border rounded px-3 py-2" onClick={() => void askQuestion("private")}>Message</button>
              <button className="border rounded px-3 py-2" onClick={() => void toggleSave()}>{isSaved ? "★ Saved" : "☆ Save"}</button>
            </div>

            {status && (
              <p className="text-xs text-gray-600">
                {status}
                {status === "Location access is required to request or join this event." ? (
                  <>
                    {" "}
                    <button type="button" className="underline font-medium" onClick={() => void enableLocationAndRetry()}>
                      Enable location
                    </button>
                  </>
                ) : null}
              </p>
            )}
          </article>
        ) : null}
        {expandedMediaIndex !== null && !!listing?.media_items?.length && (
          <div
            className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4"
            onClick={() => setExpandedMediaIndex(null)}
            onTouchStart={(e) => setTouchStartX(e.changedTouches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const endX = e.changedTouches[0]?.clientX;
              if (touchStartX === null || endX === undefined) return;
              const delta = endX - touchStartX;
              if (Math.abs(delta) < 40) return;
              setExpandedMediaIndex((idx) => {
                if (idx === null || !listing.media_items?.length) return idx;
                const len = listing.media_items.length;
                return delta < 0 ? (idx + 1) % len : (idx - 1 + len) % len;
              });
            }}
          >
            {(() => {
              const items = listing.media_items || [];
              const item = items[expandedMediaIndex] || null;
              if (!item) return null;
              return item.type === "image" ? (
                <img src={item.url} alt={item.label || "Expanded media"} className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
              ) : (
                <video src={item.url} poster={item.thumbnailUrl || undefined} controls autoPlay className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain bg-black" onClick={(e) => e.stopPropagation()} />
              );
            })()}
            <button type="button" className="absolute top-4 right-4 border rounded px-3 py-2 bg-white" onClick={() => setExpandedMediaIndex(null)}>Close</button>
            <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 border rounded-full h-10 w-10 bg-white" onClick={(e) => { e.stopPropagation(); setExpandedMediaIndex((idx) => (idx === null || !listing.media_items?.length ? idx : (idx - 1 + listing.media_items.length) % listing.media_items.length)); }}>‹</button>
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 border rounded-full h-10 w-10 bg-white" onClick={(e) => { e.stopPropagation(); setExpandedMediaIndex((idx) => (idx === null || !listing.media_items?.length ? idx : (idx + 1) % listing.media_items.length)); }}>›</button>
          </div>
        )}
      {showReportModal && listing && reportTargetUserId && (
        <div className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Report participant</h3>
              <button className="border rounded px-2 py-1" onClick={() => { setShowReportModal(false); setReportFeedback(""); }}>Close</button>
            </div>
            <label className="text-sm font-medium">Context</label>
            <select className="border rounded px-3 py-2" value={reportContext} onChange={(e) => setReportContext(e.target.value as "listing_content" | "chat_behavior" | "profile_account" | "in_person") }>
              <option value="in_person">In-person meetup behavior</option>
              <option value="chat_behavior">Chat / in-app behavior</option>
              <option value="listing_content">Listing content</option>
              <option value="profile_account">Profile/account</option>
            </select>
            <label className="text-sm font-medium">Reason</label>
            <input className="border rounded px-3 py-2" value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="e.g. unsafe_behavior, no_show" />
            <label className="text-sm font-medium">Details {reportContext === "in_person" ? "*" : "(optional)"}</label>
            <textarea className="border rounded px-3 py-2 w-full" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="Describe what happened." />
            <div className="flex items-end justify-between gap-3">
              <div className={`min-w-0 flex-1 text-sm ${reportFeedbackTone === "error" ? "text-red-700" : reportFeedbackTone === "success" ? "text-emerald-700" : "text-slate-700"}`}>
                {reportFeedback ? <span>{reportFeedback}</span> : null}
              </div>
              <div className="flex justify-end gap-2 shrink-0">
                <button className="border rounded px-3 py-2" onClick={() => { setShowReportModal(false); setReportFeedback(""); }}>Cancel</button>
                <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={submittingReport} onClick={() => void submitUserReport()}>{submittingReport ? "Submitting..." : "Submit report"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBlockConfirm && listing && blockTargetUserId && (
        <div className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Block user</h3>
          <button className="border rounded px-2 py-1" onClick={() => setShowBlockConfirm(false)}>Close</button>
        </div>
        <p className="text-sm text-gray-700">Block this user from your quest? They’ll be removed from this listing and won’t be able to message or friend you from the app. Their own block of you, if any, stays separate.</p>
        <div className="flex justify-end gap-2">
          <button className="border rounded px-3 py-2" onClick={() => setShowBlockConfirm(false)}>Cancel</button>
          <button className="bg-red-600 text-white rounded px-3 py-2" onClick={() => void blockMemberFromQuest(blockTargetUserId)}>Block user</button>
        </div>
      </div>
        </div>
      )}

      {showDistanceJoinModal && listing && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border p-4 space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold">Long-distance join</h3>
              <p className="text-sm text-gray-700">
                This quest is about {myDistanceLabel || "this far"} away from you. It is more than 15 miles away.
                Do you want to continue?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button className="border rounded px-3 py-2" onClick={() => setShowDistanceJoinModal(false)}>Cancel</button>
              <button className="bg-black text-white rounded px-3 py-2" onClick={() => void confirmDistanceJoin()}>OK</button>
            </div>
          </div>
        </div>
      )}

        {showQuestionModal && listing && (
          <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{questionMode === "public" ? "Comment" : "Direct message"}</h3>
                <button className="border rounded px-2 py-1" onClick={() => setShowQuestionModal(false)}>Close</button>
              </div>
              {questionMode === "public" ? (
                <>
                  <p className="text-xs text-gray-600">Comments are visible on this listing.</p>
                  <div className="max-h-56 overflow-auto space-y-2 rounded-xl border bg-gray-50 p-3">
                    {comments.length ? comments.map((comment) => {
                      const profile = commentProfileOf(comment);
                      return (
                        <div key={`modal-${comment.id}`} className="rounded-lg border bg-white px-3 py-2">
                          <div className="flex items-center gap-2">
                            {profile?.avatar_url ? (
                              <img src={profile.avatar_url} alt={profile.display_name || "Commenter"} className="h-6 w-6 rounded-full object-cover border" />
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-gray-100 border" />
                            )}
                            <Link href={`/profile/${comment.sender_id}`} className="text-xs font-medium underline">
                              {(profile?.display_name || "Member").trim().split(/\s+/)[0] || "Member"}
                            </Link>
                            <span className="text-[11px] text-gray-500">{formatActivityTime(comment.created_at, renderedAt)}</span>
                          </div>
                          <p className="mt-2 text-sm text-gray-700">{comment.body.replace(/^\[PUBLIC\]\s?/, "")}</p>
                        </div>
                      );
                    }) : <p className="text-xs text-gray-500">No comments yet.</p>}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-600">Direct messages go to the listing owner only.</p>
                </>
              )}
              <textarea className="border rounded px-3 py-2 w-full" placeholder={questionMode === "public" ? "Write your comment..." : "Write your direct message..."} value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
              <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={sendingQuestion || !questionText.trim()} onClick={() => void sendQuestionFromModal()}>{sendingQuestion ? "Sending..." : "Send"}</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
