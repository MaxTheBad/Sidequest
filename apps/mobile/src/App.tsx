import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { Video, ResizeMode } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { APP_NAME, CANONICAL_CATEGORIES, validateUsername } from "@questhat/shared";
import { supabase } from "./lib/supabase";

WebBrowser.maybeCompleteAuthSession();

type AuthState = "loading" | "signed-out" | "signed-in";
type AuthMode = "login" | "signup";
type AuthStep = "email" | "code";
type TabKey = "home" | "create" | "saved" | "joined" | "inbox" | "notifications" | "profile" | "settings";
type Provider = "apple" | "google" | "facebook";

type QuestPreview = {
  id: string;
  creator_id?: string | null;
  title: string;
  description?: string | null;
  city: string | null;
  availability: string | null;
  skill_level: string | null;
  exact_address?: string | null;
  created_at?: string | null;
  media_items?: Array<{ url: string; type: "image" | "video"; label?: string | null; thumbnailUrl?: string | null }> | null;
  hobbies?: { name: string | null; category: string | null }[] | { name: string | null; category: string | null } | null;
};

type Hobby = { id: string; name: string; category: string | null };
type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  city: string | null;
  bio: string | null;
  avatar_url?: string | null;
  show_location?: boolean | null;
  radius_km?: number | null;
};
type MessageRow = {
  id: string;
  body: string | null;
  created_at: string;
  quests?: { title: string | null }[] | { title: string | null } | null;
  profiles?: { display_name: string | null }[] | { display_name: string | null } | null;
};
type NotificationRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type QuestDetail = QuestPreview & {
  join_mode?: string | null;
  exact_location_visibility?: string | null;
  exact_address?: string | null;
  media_video_url?: string | null;
  media_source?: string | null;
  profiles?: { display_name: string | null; username: string | null; city: string | null; bio: string | null }[] | { display_name: string | null; username: string | null; city: string | null; bio: string | null } | null;
};

const tabs: Array<{ key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; auth?: boolean }> = [
  { key: "home", label: "Home", icon: "home-outline" },
  { key: "create", label: "Create", icon: "add-circle-outline", auth: true },
  { key: "saved", label: "Saved", icon: "bookmark-outline", auth: true },
  { key: "joined", label: "Joined", icon: "people-outline", auth: true },
  { key: "inbox", label: "Inbox", icon: "chatbubble-ellipses-outline", auth: true },
  { key: "notifications", label: "Alerts", icon: "notifications-outline", auth: true },
  { key: "profile", label: "Profile", icon: "person-outline", auth: true },
  { key: "settings", label: "Settings", icon: "settings-outline", auth: true },
];

function getRedirectUrl() {
  return Linking.createURL("auth/callback");
}

function getQueryParams(url: string) {
  const params = new URLSearchParams();
  const query = url.split("?")[1]?.split("#")[0] || "";
  const hash = url.split("#")[1] || "";
  for (const part of [query, hash]) {
    const next = new URLSearchParams(part);
    next.forEach((value, key) => params.set(key, value));
  }
  return params;
}

function getRelationOne<T>(value: T[] | T | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getCategory(quest: QuestPreview) {
  const hobby = getRelationOne(quest.hobbies);
  return hobby?.category || hobby?.name || "Quest";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>{title}</Text>
      {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function EmptyState({ label }: { label: string }) {
  return <Text style={styles.muted}>{label}</Text>;
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>(supabase ? "loading" : "signed-out");
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authStep, setAuthStep] = useState<AuthStep>("email");
  const [otpCode, setOtpCode] = useState("");
  const [status, setStatus] = useState(supabase ? "" : "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  const [userId, setUserId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [quests, setQuests] = useState<QuestPreview[]>([]);
  const [savedQuests, setSavedQuests] = useState<QuestPreview[]>([]);
  const [joinedQuests, setJoinedQuests] = useState<QuestPreview[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [draftAvailability, setDraftAvailability] = useState("");
  const [draftHobbyId, setDraftHobbyId] = useState("");
  const [draftExactAddress, setDraftExactAddress] = useState("");
  const [draftJoinMode, setDraftJoinMode] = useState<"approval_required" | "open">("approval_required");
  const [draftLocationVisibility, setDraftLocationVisibility] = useState<"private" | "approved_members" | "public">("private");
  const [draftGroupSize, setDraftGroupSize] = useState("4");
  const [draftMedia, setDraftMedia] = useState<{
    uri: string;
    mimeType: string;
    fileName: string;
    type: "image" | "video";
    duration?: number;
    trimStart?: number;
    trimEnd?: number;
  } | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [videoPosition, setVideoPosition] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsUsername, setSettingsUsername] = useState("");
  const [settingsCity, setSettingsCity] = useState("");
  const [settingsBio, setSettingsBio] = useState("");
  const [settingsAvatarUri, setSettingsAvatarUri] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [selectedQuest, setSelectedQuest] = useState<QuestDetail | null>(null);
  const [selectedQuestLoading, setSelectedQuestLoading] = useState(false);
  const [selectedQuestSaved, setSelectedQuestSaved] = useState(false);
  const [selectedQuestJoined, setSelectedQuestJoined] = useState(false);

  const signedIn = authState === "signed-in";
  const visibleTabs = useMemo(() => tabs.filter((tab) => signedIn || !tab.auth), [signedIn]);

  async function handleAuthUrl(url: string) {
    if (!supabase) return;
    const params = getQueryParams(url);
    const error = params.get("error_description") || params.get("error");
    if (error) {
      setStatus(error);
      return;
    }

    const code = params.get("code");
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) setStatus(exchangeError.message);
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) setStatus(sessionError.message);
    }
  }

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    void client.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setAuthState(data.session?.user ? "signed-in" : "signed-out");
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setAuthState(session?.user ? "signed-in" : "signed-out");
      if (session?.user) setActiveTab((current) => (current === "home" ? current : current));
    });

    const linkSub = Linking.addEventListener("url", ({ url }) => {
      void handleAuthUrl(url);
    });
    void Linking.getInitialURL().then((url) => {
      if (url) void handleAuthUrl(url);
    });

    return () => {
      data.subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  async function loadHome() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("quests")
      .select("id,creator_id,title,description,city,availability,skill_level,created_at,hobbies(name,category)")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    setQuests((data || []) as QuestPreview[]);
  }

  async function loadHobbies() {
    if (!supabase) return;
    const { data, error } = await supabase.from("hobbies").select("id,name,category").order("name");
    if (error) throw error;
    const rows = (data || []) as Hobby[];
    setHobbies(rows);
    setDraftHobbyId((current) => current || rows[0]?.id || "");
  }

  async function loadAuthedData(uid: string) {
    if (!supabase) return;
    const [{ data: profileData }, { data: bookmarkRows }, { data: memberRows }, { data: messageRows }, { data: notificationRows }] = await Promise.all([
      supabase.from("profiles").select("id,display_name,username,city,bio,avatar_url,show_location,radius_km").eq("id", uid).maybeSingle(),
      supabase.from("quest_bookmarks").select("quest_id").eq("user_id", uid),
      supabase.from("quest_members").select("quest_id,status,quests(id,title,description,city,availability,skill_level,created_at,hobbies(name,category))").eq("user_id", uid).order("joined_at", { ascending: false }),
      supabase.from("messages").select("id,body,created_at,quests(title),profiles:profiles!messages_sender_id_fkey(display_name)").neq("sender_id", uid).order("created_at", { ascending: false }).limit(30),
      supabase.from("notifications").select("id,title,body,created_at,read_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
    ]);

    const nextProfile = (profileData || null) as Profile | null;
    setProfile(nextProfile);
    setSettingsName(nextProfile?.display_name || "");
    setSettingsUsername(nextProfile?.username || "");
    setSettingsCity(nextProfile?.city || "");
    setSettingsBio(nextProfile?.bio || "");
    setSettingsAvatarUri(nextProfile?.avatar_url || "");
    setMessages((messageRows || []) as MessageRow[]);
    setNotifications((notificationRows || []) as NotificationRow[]);

    const savedIds = ((bookmarkRows || []) as Array<{ quest_id: string }>).map((row) => row.quest_id);
    if (savedIds.length) {
      const { data } = await supabase
        .from("quests")
        .select("id,creator_id,title,description,city,availability,skill_level,created_at,hobbies(name,category)")
        .in("id", savedIds);
      setSavedQuests((data || []) as QuestPreview[]);
    } else {
      setSavedQuests([]);
    }

    const joined = ((memberRows || []) as Array<{ quests?: QuestPreview[] | QuestPreview | null }>)
      .map((row) => getRelationOne(row.quests))
      .filter((quest): quest is QuestPreview => Boolean(quest));
    setJoinedQuests(joined);
  }

  async function loadSelectedQuestDetails(questId: string) {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("quests")
      .select("id,creator_id,title,description,city,availability,skill_level,created_at,join_mode,exact_location_visibility,exact_address,media_video_url,media_source,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(display_name,username,city,bio)")
      .eq("id", questId)
      .maybeSingle();
    if (error) throw error;
    return (data || null) as QuestDetail | null;
  }

  async function openQuestDetail(questId: string) {
    if (!supabase) return;
    setSelectedQuestLoading(true);
    try {
      const detail = await loadSelectedQuestDetails(questId);
      if (!detail) {
        setStatus("Quest not found.");
        return;
      }
      setSelectedQuest(detail);
      if (userId) {
        const [{ data: savedRow }, { data: memberRow }] = await Promise.all([
          supabase.from("quest_bookmarks").select("quest_id").eq("user_id", userId).eq("quest_id", questId).maybeSingle(),
          supabase.from("quest_members").select("status").eq("user_id", userId).eq("quest_id", questId).maybeSingle(),
        ]);
        setSelectedQuestSaved(Boolean(savedRow));
        setSelectedQuestJoined(Boolean(memberRow));
      } else {
        setSelectedQuestSaved(false);
        setSelectedQuestJoined(false);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load quest.");
    } finally {
      setSelectedQuestLoading(false);
    }
  }

  async function toggleSaveSelectedQuest() {
    if (!supabase || !userId || !selectedQuest) return;
    const nextSaved = !selectedQuestSaved;
    const response = nextSaved
      ? await supabase.from("quest_bookmarks").upsert({ user_id: userId, quest_id: selectedQuest.id })
      : await supabase.from("quest_bookmarks").delete().eq("user_id", userId).eq("quest_id", selectedQuest.id);
    if (response.error) {
      setStatus(response.error.message);
      return;
    }
    setSelectedQuestSaved(nextSaved);
    await refreshAll();
  }

  async function toggleJoinSelectedQuest() {
    if (!supabase || !userId || !selectedQuest) return;
    const nextJoined = !selectedQuestJoined;
    const response = nextJoined
      ? await supabase.from("quest_members").upsert({ quest_id: selectedQuest.id, user_id: userId, role: "member", status: "approved" })
      : await supabase.from("quest_members").delete().eq("quest_id", selectedQuest.id).eq("user_id", userId);
    if (response.error) {
      setStatus(response.error.message);
      return;
    }
    setSelectedQuestJoined(nextJoined);
    await refreshAll();
  }

  async function refreshAll() {
    if (!supabase) return;
    setRefreshing(true);
    setStatus("");
    try {
      await Promise.all([loadHome(), loadHobbies()]);
      if (userId) await loadAuthedData(userId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not refresh.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    // Initial and session-change refreshes are intentionally keyed by user id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function passwordAuth() {
    if (!supabase) return;
    setStatus(authMode === "signup" ? "Creating account..." : "Signing in...");
    const cleanEmail = email.trim();
    const redirectTo = getRedirectUrl();
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: redirectTo } })
      : await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setStatus(result.error ? result.error.message : authMode === "signup" && !result.data.session ? "Check your email to confirm your account." : "");
  }

  async function sendEmailCode() {
    if (!supabase) return;
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setStatus("Enter your email first.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: getRedirectUrl(),
        shouldCreateUser: authMode === "signup",
      },
    });
    if (error) {
      setStatus(error.message);
      return;
    }
    setAuthStep("code");
    setOtpCode("");
    setStatus("Check your email for the 8-digit code.");
  }

  async function verifyEmailCode() {
    if (!supabase) return;
    const cleanEmail = email.trim();
    const code = otpCode.trim();
    if (!cleanEmail) {
      setStatus("Enter your email first.");
      return;
    }
    if (!/^\d{8}$/.test(code)) {
      setStatus("Enter the 8-digit code.");
      return;
    }
    const { error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: code,
      type: "email",
    });
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("");
    setAuthStep("email");
    setOtpCode("");
  }

  async function socialLogin(provider: Provider) {
    if (!supabase) return;
    setStatus("");
    const redirectTo = getRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      setStatus(error.message);
      return;
    }
    if (!data.url) {
      setStatus("No OAuth URL returned.");
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === "success") await handleAuthUrl(result.url);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setActiveTab("home");
    setSavedQuests([]);
    setJoinedQuests([]);
    setMessages([]);
    setNotifications([]);
    setProfile(null);
    setAuthStep("email");
    setOtpCode("");
  }

  async function createQuest() {
    if (!supabase || !userId) return;
    if (!draftTitle.trim() || !draftCity.trim() || !draftAvailability.trim() || !draftHobbyId) {
      setStatus("Title, city, availability, and category are required.");
      return;
    }
    const parsedGroupSize = Number.parseInt(draftGroupSize, 10);
    const groupSize = Number.isFinite(parsedGroupSize) && parsedGroupSize > 0 ? parsedGroupSize : 4;
    let mediaItems: Array<{ url: string; type: "image" | "video"; label?: string | null; thumbnailUrl?: string | null; trimStartSeconds?: number; trimEndSeconds?: number }> | null = null;
    if (draftMedia) {
      setUploadingMedia(true);
      try {
        if (draftMedia.type === "image") {
          const uploadedUrl = await uploadQuestImage(draftMedia);
          mediaItems = [{ url: uploadedUrl, type: "image", label: "Cover image", thumbnailUrl: null }];
        } else {
          const uploadedUrl = await uploadQuestVideo(draftMedia);
          mediaItems = [{
            url: uploadedUrl,
            type: "video",
            label: "Cover video",
            thumbnailUrl: null,
            trimStartSeconds: draftMedia.trimStart ?? 0,
            trimEndSeconds: draftMedia.trimEnd ?? draftMedia.duration ?? videoDuration,
          }];
        }
      } catch (error) {
        setUploadingMedia(false);
        setStatus(error instanceof Error ? error.message : "Could not upload quest image.");
        return;
      }
      setUploadingMedia(false);
    }
    setStatus("Creating quest...");
    const { data, error } = await supabase
      .from("quests")
      .insert({
        creator_id: userId,
        title: draftTitle.trim(),
        description: draftDescription.trim() || null,
        city: draftCity.trim(),
        availability: draftAvailability.trim(),
        skill_level: "Any level",
        group_size: groupSize,
        hobby_id: draftHobbyId,
        join_mode: draftJoinMode,
        exact_location_visibility: draftLocationVisibility,
        exact_address: draftExactAddress.trim() || null,
        media_items: mediaItems,
        media_source: mediaItems?.length ? "upload" : null,
        media_video_url: null,
      })
      .select("id")
      .single();
    if (error) {
      setStatus(error.message);
      return;
    }
    if (data?.id) {
      await supabase.from("quest_members").insert({ quest_id: data.id, user_id: userId, role: "creator", status: "approved" });
    }
    setDraftTitle("");
    setDraftDescription("");
    setDraftCity("");
    setDraftAvailability("");
    setDraftExactAddress("");
    setDraftJoinMode("approval_required");
    setDraftLocationVisibility("private");
    setDraftGroupSize("4");
    setDraftMedia(null);
    setStatus("Quest created.");
    await refreshAll();
    setActiveTab("home");
  }

  async function uploadQuestImage(file: { uri: string; mimeType: string; fileName: string }) {
    if (!supabase || !userId) throw new Error("Not signed in.");
    const response = await fetch(file.uri);
    const blob = await response.blob();
    if (!blob.size) throw new Error("Selected file is empty.");
    if (!file.mimeType.startsWith("image/")) throw new Error("Please choose an image file.");
    if (blob.size > 8 * 1024 * 1024) throw new Error("Image must be under 8MB.");

    const ext = (file.fileName.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("quest-media").upload(path, blob, {
      upsert: false,
      contentType: file.mimeType || "image/jpeg",
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("quest-media").getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadQuestVideo(file: { uri: string; mimeType: string; fileName: string }) {
    if (!supabase || !userId) throw new Error("Not signed in.");
    const response = await fetch(file.uri);
    const blob = await response.blob();
    if (!blob.size) throw new Error("Selected file is empty.");
    if (!file.mimeType.startsWith("video/")) throw new Error("Please choose a video file.");
    if (blob.size > 60 * 1024 * 1024) throw new Error("Video must be under 60MB.");
    const ext = (file.fileName.split(".").pop() || "mp4").toLowerCase();
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("quest-videos").upload(path, blob, {
      upsert: false,
      contentType: file.mimeType || "video/mp4",
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("quest-videos").getPublicUrl(path);
    return data.publicUrl;
  }

  async function pickQuestMedia() {
    if (uploadingMedia) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatus("Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const pickedType = asset.type === "video" || (asset.mimeType || "").startsWith("video/") ? "video" : "image";
    const nextVideoDuration = typeof asset.duration === "number"
      ? (asset.duration > 1000 ? asset.duration / 1000 : asset.duration)
      : 0;
    setVideoPosition(0);
    setVideoDuration(nextVideoDuration);
    setVideoReady(false);
    setVideoPlaying(false);
    setDraftMedia({
      uri: asset.uri,
      mimeType: asset.mimeType || "image/jpeg",
      fileName: asset.fileName || "quest-image.jpg",
      type: pickedType,
      duration: nextVideoDuration || undefined,
      trimStart: 0,
      trimEnd: nextVideoDuration || undefined,
    });
  }

  async function saveProfile() {
    if (!supabase || !userId) return;
    const usernameError = settingsUsername.trim() ? validateUsername(settingsUsername) : "";
    if (usernameError) {
      setStatus(usernameError);
      return;
    }
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      display_name: settingsName.trim() || null,
      username: settingsUsername.trim().toLowerCase() || null,
      city: settingsCity.trim() || null,
      bio: settingsBio.trim() || null,
    });
    setStatus(error ? error.message : "Profile saved.");
    if (!error) await loadAuthedData(userId);
  }

  async function uploadProfilePhoto() {
    if (!supabase || !userId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatus("Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset.uri) return;
    setUploadingAvatar(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      if (!blob.size) throw new Error("Selected file is empty.");
      if (!asset.mimeType?.startsWith("image/") && asset.mimeType) throw new Error("Please choose an image file.");
      if (blob.size > 8 * 1024 * 1024) throw new Error("Image must be under 8MB.");
      const fileName = asset.fileName || "profile-photo.jpg";
      const ext = (fileName.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, blob, {
        upsert: false,
        contentType: asset.mimeType || "image/jpeg",
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
      const avatarUrl = data.publicUrl;
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        avatar_url: avatarUrl,
        avatar_source_url: avatarUrl,
        photo_onboarding_done: true,
      });
      if (profileError && !profileError.message.toLowerCase().includes("column")) {
        throw profileError;
      }
      const { error: metaError } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
      if (metaError) throw new Error(metaError.message);
      setSettingsAvatarUri(avatarUrl);
      setStatus("Profile photo updated.");
      await loadAuthedData(userId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not upload profile photo.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function openAuthedTab(tab: TabKey) {
    const config = tabs.find((item) => item.key === tab);
    if (config?.auth && !signedIn) {
      setStatus("Log in to use that tab.");
      setActiveTab("home");
      return;
    }
    setActiveTab(tab);
  }

  function renderAuthCard() {
    return (
      <View style={styles.panel}>
        <View style={styles.segment}>
          <Pressable style={[styles.segmentButton, authMode === "login" && styles.segmentActive]} onPress={() => setAuthMode("login")}>
            <Text style={[styles.segmentText, authMode === "login" && styles.segmentTextActive]}>Log in</Text>
          </Pressable>
          <Pressable style={[styles.segmentButton, authMode === "signup" && styles.segmentActive]} onPress={() => setAuthMode("signup")}>
            <Text style={[styles.segmentText, authMode === "signup" && styles.segmentTextActive]}>Sign up</Text>
          </Pressable>
        </View>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={(value) => {
            setEmail(value);
            if (authStep === "code") setAuthStep("email");
          }}
          placeholder="Email"
          placeholderTextColor="#8b7d70"
          style={styles.input}
          value={email}
        />
        {authStep === "email" ? (
          <>
            <TextInput
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#8b7d70"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <Pressable style={styles.primaryButton} onPress={passwordAuth}>
              <Text style={styles.primaryButtonText}>{authMode === "signup" ? "Create account" : "Log in"}</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void sendEmailCode()}>
              <Text style={styles.secondaryButtonText}>Use email code</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              autoCapitalize="none"
              autoComplete="one-time-code"
              autoCorrect={false}
              keyboardType="number-pad"
              maxLength={8}
              onChangeText={setOtpCode}
              placeholder="8-digit code"
              placeholderTextColor="#8b7d70"
              style={styles.input}
              value={otpCode}
            />
            <Pressable style={styles.primaryButton} onPress={() => void verifyEmailCode()}>
              <Text style={styles.primaryButtonText}>Verify code</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void sendEmailCode()}>
              <Text style={styles.secondaryButtonText}>Resend code</Text>
            </Pressable>
            <Pressable style={styles.tertiaryButton} onPress={() => setAuthStep("email")}>
              <Text style={styles.tertiaryButtonText}>Back to email</Text>
            </Pressable>
          </>
        )}
        <View style={styles.oauthGrid}>
          <Pressable style={styles.oauthButton} onPress={() => void socialLogin("apple")}>
            <Ionicons name="logo-apple" size={18} color="#1f2933" />
            <Text style={styles.oauthText}>Apple</Text>
          </Pressable>
          <Pressable style={styles.oauthButton} onPress={() => void socialLogin("google")}>
            <Ionicons name="logo-google" size={18} color="#1f2933" />
            <Text style={styles.oauthText}>Google</Text>
          </Pressable>
          <Pressable style={styles.oauthButton} onPress={() => void socialLogin("facebook")}>
            <Ionicons name="logo-facebook" size={18} color="#1f2933" />
            <Text style={styles.oauthText}>Facebook</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderQuestList(rows: QuestPreview[], empty: string) {
    if (!rows.length) return <EmptyState label={empty} />;
    return rows.map((quest) => (
      <Pressable key={quest.id} style={styles.questCard} onPress={() => void openQuestDetail(quest.id)}>
        <View style={styles.row}>
          <Text style={styles.questCategory}>{getCategory(quest)}</Text>
          <Text style={styles.date}>{formatDate(quest.created_at)}</Text>
        </View>
        <Text style={styles.questTitle}>{quest.title}</Text>
        {quest.description ? <Text style={styles.questDescription}>{quest.description}</Text> : null}
        <Text style={styles.questMeta}>
          {[quest.city || "City tbd", quest.availability || "Availability tbd", quest.skill_level || "Any level"].join("  /  ")}
        </Text>
        {quest.exact_address ? <Text style={styles.questMeta}>{quest.exact_address}</Text> : null}
      </Pressable>
    ));
  }

  function renderScreen() {
    if (authState === "loading") {
      return (
        <View style={styles.centerPanel}>
          <ActivityIndicator />
        </View>
      );
    }

    if (!signedIn && activeTab !== "home") return renderAuthCard();

    if (activeTab === "home") {
      return (
        <>
          <ScreenHeader title="Nearby quests" subtitle="Browse what people are trying to do this week." />
          {!signedIn ? renderAuthCard() : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {CANONICAL_CATEGORIES.slice(0, 10).map((category) => (
              <View key={category} style={styles.chip}>
                <Text style={styles.chipText}>{category}</Text>
              </View>
            ))}
          </ScrollView>
          {renderQuestList(quests, "No quests loaded yet.")}
        </>
      );
    }

    if (activeTab === "create") {
      return (
        <>
          <ScreenHeader title="Create quest" subtitle="Post a specific plan people can join." />
          <View style={styles.panel}>
            <TextInput placeholder="Title" placeholderTextColor="#8b7d70" style={styles.input} value={draftTitle} onChangeText={setDraftTitle} />
            <TextInput
              multiline
              placeholder="Description"
              placeholderTextColor="#8b7d70"
              style={[styles.input, styles.textArea]}
              value={draftDescription}
              onChangeText={setDraftDescription}
            />
            <TextInput placeholder="City" placeholderTextColor="#8b7d70" style={styles.input} value={draftCity} onChangeText={setDraftCity} />
            <TextInput placeholder="Availability" placeholderTextColor="#8b7d70" style={styles.input} value={draftAvailability} onChangeText={setDraftAvailability} />
            <TextInput placeholder="Meetup location or link" placeholderTextColor="#8b7d70" style={styles.input} value={draftExactAddress} onChangeText={setDraftExactAddress} />
            <TextInput placeholder="Group size" placeholderTextColor="#8b7d70" keyboardType="number-pad" style={styles.input} value={draftGroupSize} onChangeText={setDraftGroupSize} />
            <View style={styles.mediaPickerRow}>
              <Pressable style={styles.secondaryButton} onPress={() => void pickQuestMedia()}>
                <Text style={styles.secondaryButtonText}>{draftMedia ? "Change media" : "Add media"}</Text>
              </Pressable>
              <Text style={styles.muted}>{draftMedia ? "Selected" : "Optional"}</Text>
            </View>
            {draftMedia ? (
              <View style={styles.mediaPreview}>
                {draftMedia.type === "image" ? (
                  <Image source={{ uri: draftMedia.uri }} style={styles.mediaPreviewImage} />
                ) : (
                  <View style={styles.videoEditor}>
                    <Video
                      key={draftMedia.uri}
                      source={{ uri: draftMedia.uri }}
                      style={styles.mediaPreviewImage}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={videoPlaying}
                      onPlaybackStatusUpdate={(statusUpdate) => {
                        if (!statusUpdate.isLoaded) return;
                        setVideoReady(true);
                        setVideoPosition(statusUpdate.positionMillis / 1000);
                        setVideoDuration((statusUpdate.durationMillis || 0) / 1000);
                      }}
                    />
                    <View style={styles.editorRow}>
                      <Pressable style={styles.secondaryButton} onPress={() => setVideoPlaying((current) => !current)}>
                        <Text style={styles.secondaryButtonText}>{videoPlaying ? "Pause preview" : "Play preview"}</Text>
                      </Pressable>
                      <Text style={styles.muted}>{videoReady ? `${videoPosition.toFixed(1)}s / ${videoDuration.toFixed(1)}s` : "Loading preview..."}</Text>
                    </View>
                    <View style={styles.sliderBlock}>
                      <Text style={styles.questMeta}>Trim start</Text>
                      <Slider
                        minimumValue={0}
                        maximumValue={Math.max(0.2, videoDuration || draftMedia.duration || 0.2)}
                        value={draftMedia.trimStart ?? 0}
                        minimumTrackTintColor="#1f2933"
                        maximumTrackTintColor="#d6c8b9"
                        onValueChange={(value) => {
                          setDraftMedia((current) => current ? { ...current, trimStart: Math.min(value, (current.trimEnd ?? videoDuration ?? current.duration ?? value) - 0.2) } : current);
                        }}
                      />
                      <Text style={styles.questMeta}>{(draftMedia.trimStart ?? 0).toFixed(1)}s</Text>
                    </View>
                    <View style={styles.sliderBlock}>
                      <Text style={styles.questMeta}>Trim end</Text>
                      <Slider
                        minimumValue={0.2}
                        maximumValue={Math.max(0.2, videoDuration || draftMedia.duration || 0.2)}
                        value={draftMedia.trimEnd ?? videoDuration ?? draftMedia.duration ?? 0.2}
                        minimumTrackTintColor="#1f2933"
                        maximumTrackTintColor="#d6c8b9"
                        onValueChange={(value) => {
                          setDraftMedia((current) => current ? { ...current, trimEnd: Math.max(value, (current.trimStart ?? 0) + 0.2) } : current);
                        }}
                      />
                      <Text style={styles.questMeta}>{(draftMedia.trimEnd ?? videoDuration ?? draftMedia.duration ?? 0).toFixed(1)}s</Text>
                    </View>
                    <Text style={styles.muted}>Trimmed video will be saved with these start/end points.</Text>
                  </View>
                )}
                <Text style={styles.questMeta}>{draftMedia.fileName}</Text>
              </View>
            ) : null}
            <View style={styles.segment}>
              <Pressable style={[styles.segmentButton, draftJoinMode === "approval_required" && styles.segmentActive]} onPress={() => setDraftJoinMode("approval_required")}>
                <Text style={[styles.segmentText, draftJoinMode === "approval_required" && styles.segmentTextActive]}>Approval</Text>
              </Pressable>
              <Pressable style={[styles.segmentButton, draftJoinMode === "open" && styles.segmentActive]} onPress={() => setDraftJoinMode("open")}>
                <Text style={[styles.segmentText, draftJoinMode === "open" && styles.segmentTextActive]}>Open</Text>
              </Pressable>
            </View>
            <View style={styles.segment}>
              <Pressable style={[styles.segmentButton, draftLocationVisibility === "private" && styles.segmentActive]} onPress={() => setDraftLocationVisibility("private")}>
                <Text style={[styles.segmentText, draftLocationVisibility === "private" && styles.segmentTextActive]}>Private</Text>
              </Pressable>
              <Pressable style={[styles.segmentButton, draftLocationVisibility === "approved_members" && styles.segmentActive]} onPress={() => setDraftLocationVisibility("approved_members")}>
                <Text style={[styles.segmentText, draftLocationVisibility === "approved_members" && styles.segmentTextActive]}>Members</Text>
              </Pressable>
              <Pressable style={[styles.segmentButton, draftLocationVisibility === "public" && styles.segmentActive]} onPress={() => setDraftLocationVisibility("public")}>
                <Text style={[styles.segmentText, draftLocationVisibility === "public" && styles.segmentTextActive]}>Public</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {hobbies.map((hobby) => (
                <Pressable key={hobby.id} style={[styles.chip, draftHobbyId === hobby.id && styles.chipSelected]} onPress={() => setDraftHobbyId(hobby.id)}>
                  <Text style={styles.chipText}>{hobby.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.primaryButton} onPress={() => void createQuest()} disabled={uploadingMedia}>
              <Text style={styles.primaryButtonText}>{uploadingMedia ? "Uploading..." : "Publish quest"}</Text>
            </Pressable>
          </View>
        </>
      );
    }

    if (activeTab === "saved") return <><ScreenHeader title="Saved" subtitle="Quests you bookmarked." />{renderQuestList(savedQuests, "No saved quests yet.")}</>;
    if (activeTab === "joined") return <><ScreenHeader title="Joined" subtitle="Quests where you are a member or organizer." />{renderQuestList(joinedQuests, "No joined quests yet.")}</>;

    if (activeTab === "inbox") {
      return (
        <>
          <ScreenHeader title="Inbox" subtitle="Recent messages across your quests." />
          {!messages.length ? <EmptyState label="No messages yet." /> : messages.map((message) => {
            const quest = getRelationOne(message.quests);
            const profileRow = getRelationOne(message.profiles);
            return (
              <View key={message.id} style={styles.questCard}>
                <Text style={styles.questCategory}>{quest?.title || "Quest message"}</Text>
                <Text style={styles.questTitle}>{profileRow?.display_name || "Someone"}</Text>
                <Text style={styles.questDescription}>{message.body}</Text>
                <Text style={styles.date}>{formatDate(message.created_at)}</Text>
              </View>
            );
          })}
        </>
      );
    }

    if (activeTab === "notifications") {
      return (
        <>
          <ScreenHeader title="Notifications" subtitle="Messages, requests, approvals, and system updates." />
          {!notifications.length ? <EmptyState label="No notifications yet." /> : notifications.map((item) => (
            <View key={item.id} style={styles.questCard}>
              <View style={styles.row}>
                <Text style={styles.questCategory}>{item.read_at ? "Read" : "New"}</Text>
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
              </View>
              <Text style={styles.questTitle}>{item.title}</Text>
              <Text style={styles.questDescription}>{item.body}</Text>
            </View>
          ))}
        </>
      );
    }

    if (activeTab === "profile") {
      return (
        <>
          <ScreenHeader title="Profile" subtitle="How other QuestHat users see you." />
          <View style={styles.panel}>
            <Text style={styles.profileName}>{profile?.display_name || profile?.username || "QuestHat user"}</Text>
            <Text style={styles.questMeta}>{[profile?.username ? `@${profile.username}` : "", profile?.city || ""].filter(Boolean).join("  /  ") || "Profile details not set"}</Text>
            {profile?.bio ? <Text style={styles.questDescription}>{profile.bio}</Text> : <Text style={styles.muted}>Add a bio in Settings.</Text>}
          </View>
        </>
      );
    }

    return (
      <>
        <ScreenHeader title="Settings" subtitle="Account basics and profile fields." />
        <View style={styles.panel}>
          <TextInput placeholder="Display name" placeholderTextColor="#8b7d70" style={styles.input} value={settingsName} onChangeText={setSettingsName} />
          <TextInput autoCapitalize="none" placeholder="Username" placeholderTextColor="#8b7d70" style={styles.input} value={settingsUsername} onChangeText={setSettingsUsername} />
          <TextInput placeholder="City" placeholderTextColor="#8b7d70" style={styles.input} value={settingsCity} onChangeText={setSettingsCity} />
          <TextInput multiline placeholder="Bio" placeholderTextColor="#8b7d70" style={[styles.input, styles.textArea]} value={settingsBio} onChangeText={setSettingsBio} />
          <View style={styles.mediaPickerRow}>
            <Pressable style={styles.secondaryButton} onPress={() => void uploadProfilePhoto()} disabled={uploadingAvatar}>
              <Text style={styles.secondaryButtonText}>{uploadingAvatar ? "Uploading..." : "Change profile photo"}</Text>
            </Pressable>
            <Text style={styles.muted}>{settingsAvatarUri ? "Set" : "Optional"}</Text>
          </View>
          {settingsAvatarUri ? (
            <View style={styles.mediaPreview}>
              <Image source={{ uri: settingsAvatarUri }} style={styles.avatarPreview} />
            </View>
          ) : null}
          <Pressable style={styles.primaryButton} onPress={saveProfile}>
            <Text style={styles.primaryButtonText}>Save profile</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => Alert.alert("Sign out", "Sign out of QuestHat on this phone?", [{ text: "Cancel" }, { text: "Sign out", onPress: signOut }])}>
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </View>
      </>
    );
  }

  function renderQuestDetailModal() {
    if (!selectedQuest) return null;
    const creator = getRelationOne(selectedQuest.profiles);
    return (
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {selectedQuestLoading ? <ActivityIndicator /> : null}
            <View style={styles.row}>
              <Text style={styles.questCategory}>{getCategory(selectedQuest)}</Text>
              <Pressable onPress={() => setSelectedQuest(null)}>
                <Text style={styles.link}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.questTitle}>{selectedQuest.title}</Text>
            <Text style={styles.questMeta}>
              {[selectedQuest.city || "City tbd", selectedQuest.availability || "Availability tbd", selectedQuest.skill_level || "Any level"].join("  /  ")}
            </Text>
            {selectedQuest.description ? <Text style={styles.questDescription}>{selectedQuest.description}</Text> : null}
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Creator</Text>
              <Text style={styles.detailValue}>{creator?.display_name || creator?.username || "Unknown"}</Text>
              <Text style={styles.detailMuted}>{creator?.city || "City not set"}</Text>
            </View>
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Join mode</Text>
              <Text style={styles.detailValue}>{selectedQuest.join_mode || "approval_required"}</Text>
              <Text style={styles.detailMuted}>{selectedQuest.exact_location_visibility || "private"}</Text>
            </View>
            {selectedQuest.media_items?.length ? (
              <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>Media</Text>
                <Text style={styles.detailValue}>{selectedQuest.media_items.length} attached image{selectedQuest.media_items.length === 1 ? "" : "s"}</Text>
              </View>
            ) : null}
            {selectedQuest.exact_address ? (
              <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue}>{selectedQuest.exact_address}</Text>
              </View>
            ) : null}
            <View style={styles.detailActions}>
              <Pressable style={styles.primaryButton} onPress={() => void toggleSaveSelectedQuest()}>
                <Text style={styles.primaryButtonText}>{selectedQuestSaved ? "Unsave" : "Save"}</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => void toggleJoinSelectedQuest()}>
                <Text style={styles.secondaryButtonText}>{selectedQuestJoined ? "Leave" : "Join"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.app} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.logo}>{APP_NAME}</Text>
            <Text style={styles.tagline}>{signedIn ? "Native mobile build" : "Find real plans with nearby people."}</Text>
          </View>
          <Pressable style={styles.refreshButton} onPress={refreshAll}>
            <Ionicons name="refresh" size={20} color="#1f2933" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.screen}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
        >
          {renderScreen()}
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </ScrollView>
        {renderQuestDetailModal()}

        <View style={styles.tabBar}>
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable key={tab.key} style={styles.tabButton} onPress={() => openAuthedTab(tab.key)}>
                <Ionicons name={tab.icon} size={22} color={active ? "#1f2933" : "#8b7d70"} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f0e8",
  },
  app: {
    flex: 1,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: "#fffaf3",
    borderColor: "#e0d2c3",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  screen: {
    gap: 14,
    paddingHorizontal: 18,
    paddingBottom: 112,
  },
  logo: {
    color: "#1f2933",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0,
  },
  tagline: {
    color: "#52616b",
    fontSize: 14,
  },
  screenHeader: {
    gap: 4,
  },
  screenTitle: {
    color: "#1f2933",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0,
  },
  screenSubtitle: {
    color: "#52616b",
    fontSize: 14,
    lineHeight: 19,
  },
  centerPanel: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    backgroundColor: "#fffaf3",
    borderColor: "#e0d2c3",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#d6c8b9",
    borderRadius: 8,
    borderWidth: 1,
    color: "#1f2933",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  textArea: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#1f2933",
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#e8f0dd",
    borderRadius: 8,
    minHeight: 46,
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#314023",
    fontSize: 15,
    fontWeight: "800",
  },
  tertiaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  tertiaryButtonText: {
    color: "#52616b",
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  oauthGrid: {
    flexDirection: "row",
    gap: 8,
  },
  oauthButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d6c8b9",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    justifyContent: "center",
    minHeight: 48,
  },
  oauthText: {
    color: "#1f2933",
    fontSize: 12,
    fontWeight: "800",
  },
  segment: {
    backgroundColor: "#eadfce",
    borderRadius: 8,
    flexDirection: "row",
    padding: 3,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    minHeight: 38,
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: "#fffaf3",
  },
  segmentText: {
    color: "#6b5f53",
    fontWeight: "800",
  },
  segmentTextActive: {
    color: "#1f2933",
  },
  mediaPickerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  mediaPreview: {
    gap: 8,
  },
  mediaPreviewImage: {
    borderRadius: 12,
    height: 180,
    width: "100%",
  },
  videoEditor: {
    gap: 10,
  },
  editorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  sliderBlock: {
    gap: 4,
  },
  avatarPreview: {
    borderRadius: 999,
    height: 96,
    width: 96,
  },
  muted: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 18,
  },
  chips: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    backgroundColor: "#e8f0dd",
    borderColor: "#d8e4ca",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipSelected: {
    backgroundColor: "#cddfba",
    borderColor: "#8ba66e",
  },
  chipText: {
    color: "#314023",
    fontSize: 12,
    fontWeight: "800",
  },
  questCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e4d7ca",
    borderRadius: 8,
    borderWidth: 1,
    gap: 7,
    padding: 14,
  },
  questCategory: {
    color: "#7c5c33",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  questTitle: {
    color: "#1f2933",
    fontSize: 18,
    fontWeight: "900",
  },
  questDescription: {
    color: "#3f4d57",
    fontSize: 14,
    lineHeight: 20,
  },
  questMeta: {
    color: "#52616b",
    fontSize: 13,
    lineHeight: 18,
  },
  profileName: {
    color: "#1f2933",
    fontSize: 24,
    fontWeight: "900",
  },
  detailBox: {
    backgroundColor: "#fff",
    borderColor: "#e4d7ca",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  detailLabel: {
    color: "#7c5c33",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#1f2933",
    fontSize: 16,
    fontWeight: "800",
  },
  detailMuted: {
    color: "#6b7280",
    fontSize: 13,
  },
  detailActions: {
    gap: 10,
  },
  modalOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
    zIndex: 40,
  },
  modalCard: {
    backgroundColor: "#fdf7ef",
    borderColor: "#e0d2c3",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    maxHeight: "86%",
    padding: 16,
  },
  modalContent: {
    gap: 12,
    paddingBottom: 16,
  },
  date: {
    color: "#8b7d70",
    fontSize: 12,
    fontWeight: "700",
  },
  status: {
    color: "#9f1239",
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    color: "#1f2933",
    fontWeight: "800",
  },
  tabBar: {
    backgroundColor: "#fffaf3",
    borderColor: "#e0d2c3",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: 2,
    left: 0,
    paddingBottom: 8,
    paddingHorizontal: 4,
    paddingTop: 8,
    position: "absolute",
    right: 0,
  },
  tabButton: {
    alignItems: "center",
    flex: 1,
    gap: 3,
    minHeight: 48,
    justifyContent: "center",
  },
  tabLabel: {
    color: "#8b7d70",
    fontSize: 10,
    fontWeight: "800",
  },
  tabLabelActive: {
    color: "#1f2933",
  },
});
