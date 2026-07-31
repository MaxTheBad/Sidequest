import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  PanResponder,
  RefreshControl,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Share,
  Switch,
  useColorScheme,
  Linking as RNLinking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { requireOptionalNativeModule, useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import MapView, { Marker } from "react-native-maps";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { APP_NAME, CANONICAL_CATEGORIES, haversineMiles, resolveCanonicalCategory, suggestCanonicalCategories, usernameErrorMessage, validateUsername, getCategoryTitleSuggestions, getCategoryFallbackMedia } from "@questhat/shared";
import { env } from "./lib/env";
import { supabase } from "./lib/supabase";
import { getPushPermissionStatus, registerPushTokenForUser, requestPushPermissionAndRegisterForUser } from "./lib/push";
import { COUNTRY_OPTIONS } from "./lib/countries";

WebBrowser.maybeCompleteAuthSession();
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type AuthState = "loading" | "signed-out" | "signed-in";
type AuthMode = "login" | "signup";
type AuthStep = "email" | "code";
type TabKey = "home" | "create" | "saved" | "joined" | "inbox" | "notifications" | "profile" | "settings";
type Provider = "apple" | "google" | "facebook";
type DeviceLocation = { lat: number; lon: number; accuracy?: number };
type QuestMapPoint = { quest: QuestPreview; coords: DeviceLocation; distanceLabel: string | undefined };
const FAR_AWAY_WARNING_MILES = 15;
const HOME_QUEST_LIMIT = 200;
const STORED_LOCATION_KEY = "questhat_device_location";
const STORED_PUSH_PROMPT_DISMISSED_AT = "questhat_push_prompt_dismissed_at";
const CURRENT_EULA_VERSION = "2026-07-30";
const VIDEO_MAX_DURATION_SECONDS = 15;
const VIDEO_MAX_SIZE_BYTES = 60 * 1024 * 1024;

type QuestPreview = {
  id: string;
  creator_id?: string | null;
  title: string;
  description?: string | null;
  city: string | null;
  availability: string | null;
  skill_level: string | null;
  join_mode?: string | null;
  exact_address?: string | null;
  created_at?: string | null;
  media_items?: Array<{ url: string; type: "image" | "video"; label?: string | null; thumbnailUrl?: string | null }> | null;
  hobbies?: { name: string | null; category: string | null }[] | { name: string | null; category: string | null } | null;
  profiles?: { id?: string | null; display_name: string | null; username: string | null; avatar_url?: string | null }[] | { id?: string | null; display_name: string | null; username: string | null; avatar_url?: string | null } | null;
};

type QuestMediaItem = { url: string; type: "image" | "video"; label?: string | null; thumbnailUrl?: string | null };

type Hobby = { id: string; name: string; category: string | null };
type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  username_changed_at?: string | null;
  city: string | null;
  region?: string | null;
  country_code?: string | null;
  bio: string | null;
  avatar_url?: string | null;
  show_location?: boolean | null;
  radius_km?: number | null;
  friends_visibility?: "public" | "private";
  onboarding_done?: boolean | null;
  photo_onboarding_done?: boolean | null;
  deactivated_at?: string | null;
  eula_version?: string | null;
  eula_accepted_at?: string | null;
};

type DraftMedia = {
  uri: string;
  mimeType: string;
  fileName: string;
  type: "image" | "video";
  duration?: number;
  fileSize?: number;
};

type CompressedVideoResult = {
  uri: string;
  fileSize: number;
  fileName: string;
  mimeType: string;
  compressed: boolean;
};

const videoCompressor = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ compress(source: string): Promise<CompressedVideoResult> }>("QuestHatVideoCompressor")
  : null;

async function uploadLocalFileToStorage(params: {
  bucket: string;
  path: string;
  uri: string;
  mimeType: string;
}) {
  if (!supabase) throw new Error("Storage is unavailable.");
  const endpoint = `${env.supabaseUrl}/storage/v1/object/${params.bucket}/${encodeURIComponent(params.path)}`;
  const result = await FileSystem.uploadAsync(endpoint, params.uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${env.supabaseAnonKey}`,
      apikey: env.supabaseAnonKey,
      "Content-Type": params.mimeType,
      Prefer: "return=minimal",
    },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(result.body || `Upload failed (${result.status})`);
  }
}

function getFileExtension(fileName: string, fallback: string) {
  return (fileName.split(".").pop() || fallback).toLowerCase();
}

type MessageRow = {
  id: string;
  quest_id?: string | null;
  sender_id?: string | null;
  body: string | null;
  created_at: string;
  quests?: { id?: string | null; title: string | null; creator_id?: string | null }[] | { id?: string | null; title: string | null; creator_id?: string | null } | null;
  profiles?: { id?: string | null; display_name: string | null; username?: string | null; avatar_url?: string | null }[] | { id?: string | null; display_name: string | null; username?: string | null; avatar_url?: string | null } | null;
};
type NotificationRow = {
  id: string;
  kind?: "message" | "join_request" | "approval" | "declined" | "system" | null;
  title: string;
  body: string;
  href?: string | null;
  quest_id?: string | null;
  source_user_id?: string | null;
  membership_user_id?: string | null;
  meta?: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  source_profile?: { id?: string | null; display_name: string | null; username: string | null; avatar_url: string | null }[] | { id?: string | null; display_name: string | null; username: string | null; avatar_url: string | null } | null;
};

type PushNavigationData = Record<string, unknown> & {
  href?: string;
  kind?: string;
  notificationId?: string;
  questId?: string;
  sourceUserId?: string;
};

type NotificationPreferences = {
  messages: boolean;
  comments: boolean;
  join_updates: boolean;
  join_requests: boolean;
  friend_requests: boolean;
  followed_posts: boolean;
  liked_categories: boolean;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messages: true,
  comments: true,
  join_updates: true,
  join_requests: true,
  friend_requests: true,
  followed_posts: false,
  liked_categories: false,
};

type JoinRequestNotificationState = "pending" | "approved" | "declined" | "expired";

type QuestMemberRow = {
  quest_id: string;
  status?: "pending" | "approved" | "declined" | null;
  quests?: QuestPreview[] | QuestPreview | null;
};

type QuestDetail = QuestPreview & {
  join_mode?: string | null;
  exact_location_visibility?: string | null;
  exact_address?: string | null;
  media_video_url?: string | null;
  media_source?: string | null;
  profiles?: { id?: string | null; display_name: string | null; username: string | null; city: string | null; bio: string | null; avatar_url?: string | null }[] | { id?: string | null; display_name: string | null; username: string | null; city: string | null; bio: string | null; avatar_url?: string | null } | null;
};

type QuestMemberProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role?: string | null;
  status?: "pending" | "approved" | "declined" | null;
};

type ProfileDetail = Profile & {
  quests?: QuestPreview[];
};

const tabs: Array<{ key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; auth?: boolean }> = [
  { key: "home", label: "Home", icon: "home-outline" },
  { key: "inbox", label: "Inbox", icon: "chatbox-outline", auth: true },
  { key: "create", label: "Create", icon: "add", auth: true },
  { key: "joined", label: "Joined", icon: "people-outline", auth: true },
  { key: "settings", label: "Settings", icon: "settings-outline", auth: true },
];

const supportEmails = ["support@questhat.com", "cs@questhat.com"];
const REPORT_CONTEXT_OPTIONS = [
  { value: "listing_content", label: "Listing content" },
  { value: "chat_behavior", label: "Chat / in-app behavior" },
  { value: "profile_account", label: "Profile/account" },
  { value: "in_person", label: "In-person meetup behavior" },
] as const;
const REPORT_REASON_OPTIONS: Record<(typeof REPORT_CONTEXT_OPTIONS)[number]["value"], Array<{ value: string; label: string }>> = {
  listing_content: [
    { value: "spam_scam", label: "Spam / scam" },
    { value: "sexual_content", label: "Sexual or explicit content" },
    { value: "hate_harassment", label: "Hate / harassment" },
    { value: "misleading", label: "Misleading or fake listing" },
    { value: "other", label: "Other" },
  ],
  chat_behavior: [
    { value: "harassment", label: "Harassment" },
    { value: "threats", label: "Threats" },
    { value: "hate_speech", label: "Hate speech" },
    { value: "spam", label: "Spam" },
    { value: "other", label: "Other" },
  ],
  profile_account: [
    { value: "fake_identity", label: "Fake identity" },
    { value: "impersonation", label: "Impersonation" },
    { value: "inappropriate_profile", label: "Inappropriate profile" },
    { value: "other", label: "Other" },
  ],
  in_person: [
    { value: "no_show", label: "No-show" },
    { value: "unsafe_behavior", label: "Unsafe behavior" },
    { value: "harassment", label: "Harassment" },
    { value: "fraud_payment", label: "Fraud / payment issue" },
    { value: "other", label: "Other" },
  ],
};

function getRedirectUrl() {
  return Linking.createURL("auth/callback", { scheme: "questhat" });
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

function getQuestHobby(q?: { hobbies?: { name?: string | null; category?: string | null }[] | { name?: string | null; category?: string | null } | null }) {
  if (!q?.hobbies) return null;
  return Array.isArray(q.hobbies) ? (q.hobbies[0] ?? null) : q.hobbies;
}

function getCategory(quest: QuestPreview) {
  const hobby = getQuestHobby(quest);
  const title = (quest.title || "").trim().toLowerCase();
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

function getCategoryIcon(category: string): keyof typeof Ionicons.glyphMap {
  const normalized = category.toLowerCase();
  if (normalized.includes("book")) return "book-outline";
  if (normalized.includes("music")) return "musical-notes-outline";
  if (normalized.includes("art") || normalized.includes("craft")) return "color-palette-outline";
  if (normalized.includes("food") || normalized.includes("cook")) return "restaurant-outline";
  if (normalized.includes("fitness") || normalized.includes("health") || normalized.includes("sport")) return "barbell-outline";
  if (normalized.includes("game")) return "game-controller-outline";
  if (normalized.includes("career") || normalized.includes("business")) return "briefcase-outline";
  if (normalized.includes("outdoor") || normalized.includes("nature")) return "leaf-outline";
  if (normalized.includes("tech")) return "code-slash-outline";
  if (normalized.includes("photo")) return "camera-outline";
  return "sparkles-outline";
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function pickTitleSuggestionByCategory(categoryName: string) {
  const suggestions = getCategoryTitleSuggestions(categoryName);
  return suggestions[Math.floor(Math.random() * suggestions.length)];
}

function getTitleSuggestionsByCategory(categoryName: string) {
  return getCategoryTitleSuggestions(categoryName);
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ScreenHeader({
  title,
  subtitle,
  titleColor,
  subtitleColor,
}: {
  title: string;
  subtitle?: string;
  titleColor?: string;
  subtitleColor?: string;
}) {
  return (
    <View style={styles.screenHeader}>
      <Text style={[styles.screenTitle, titleColor ? { color: titleColor } : null]}>{title}</Text>
      {subtitle ? <Text style={[styles.screenSubtitle, subtitleColor ? { color: subtitleColor } : null]}>{subtitle}</Text> : null}
    </View>
  );
}

function EmptyState({ label }: { label: string }) {
  return <Text style={styles.muted}>{label}</Text>;
}

function QuestVideoPreview({
  media,
}: {
  media: DraftMedia;
}) {
  return (
    <View style={styles.videoEditor}>
      <NativeVideoPlayer uri={media.uri} />
      <View style={styles.videoSelectionMeta}>
        <View style={styles.videoLimitBadge}>
          <Ionicons name="cut-outline" size={14} color="#082f3a" />
          <Text style={styles.videoLimitBadgeText}>Trimmed clip</Text>
        </View>
        <Text style={styles.questMeta}>
          {typeof media.duration === "number" ? `${media.duration.toFixed(1)}s` : "Short video"} / {VIDEO_MAX_DURATION_SECONDS}s max
        </Text>
      </View>
    </View>
  );
}

function NativeVideoPlayer({ uri, fullscreen = false }: { uri: string; fullscreen?: boolean }) {
  const player = useVideoPlayer({ uri }, (nextPlayer) => {
    nextPlayer.loop = false;
  });
  const { status, error } = useEvent(player, "statusChange", { status: player.status });

  return (
    <View style={[styles.nativeVideoShell, fullscreen && styles.nativeVideoShellFullscreen]}>
      <VideoView
        player={player}
        style={[styles.nativeVideo, fullscreen && styles.nativeVideoFullscreen]}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        showsTimecodes
      />
      {status === "loading" ? (
        <View pointerEvents="none" style={styles.videoStatusOverlay}>
          <ActivityIndicator color="#ffffff" />
        </View>
      ) : null}
      {status === "error" ? (
        <View pointerEvents="none" style={styles.videoStatusOverlay}>
          <Ionicons name="alert-circle-outline" size={28} color="#ffffff" />
          <Text style={styles.videoErrorText}>{error?.message || "Video preview could not be loaded."}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FeedVideoItem({ media }: { media: QuestMediaItem }) {
  const [started, setStarted] = useState(false);
  const player = useVideoPlayer({ uri: media.url }, (nextPlayer) => {
    nextPlayer.loop = false;
  });
  const { status, error } = useEvent(player, "statusChange", { status: player.status });

  function playVideo() {
    setStarted(true);
    player.play();
  }

  return (
    <View style={styles.feedVideoItem}>
      <VideoView
        player={player}
        style={styles.feedMedia}
        nativeControls={started}
        contentFit="cover"
        fullscreenOptions={{ enable: true }}
      />
      {!started ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={playVideo} accessibilityLabel="Play video">
          {media.thumbnailUrl ? <Image source={{ uri: media.thumbnailUrl }} style={styles.feedMedia} /> : <View style={styles.feedVideoPosterFallback} />}
          <View style={styles.feedVideoPlayButton}>
            <Ionicons name="play" size={25} color="#082f3a" style={styles.feedVideoPlayIcon} />
          </View>
          <View style={styles.feedVideoLabel}><Ionicons name="videocam" size={13} color="#ffffff" /><Text style={styles.feedVideoLabelText}>Video</Text></View>
        </Pressable>
      ) : null}
      {status === "loading" && started ? <View pointerEvents="none" style={styles.feedVideoStatus}><ActivityIndicator color="#ffffff" /></View> : null}
      {status === "error" ? (
        <View pointerEvents="none" style={styles.feedVideoStatus}>
          <Ionicons name="alert-circle-outline" size={24} color="#ffffff" />
          <Text style={styles.feedVideoErrorText}>{error?.message || "Video could not be loaded."}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FeedMediaCarousel({
  mediaItems,
  fallbackImageUrl,
  onPreviewImage,
}: {
  mediaItems: QuestMediaItem[];
  fallbackImageUrl: string;
  onPreviewImage: (media: QuestMediaItem) => void;
}) {
  const [viewportWidth, setViewportWidth] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const items: QuestMediaItem[] = mediaItems.length ? mediaItems : [{ url: fallbackImageUrl, type: "image", label: null }];
  const safeActiveIndex = Math.min(activeIndex, items.length - 1);

  return (
    <View style={styles.feedMediaCarousel} onLayout={(event) => setViewportWidth(Math.max(1, event.nativeEvent.layout.width))}>
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => setActiveIndex(Math.max(0, Math.min(items.length - 1, Math.round(event.nativeEvent.contentOffset.x / viewportWidth))))}
        scrollEventThrottle={16}
      >
        {items.map((item, index) => (
          <View key={`${item.url}-${index}`} style={[styles.feedMediaPage, { width: viewportWidth }]}>
            {item.type === "video" ? (
              index === safeActiveIndex ? <FeedVideoItem media={item} /> : (
                <View style={styles.feedVideoItem}>
                  {item.thumbnailUrl ? <Image source={{ uri: item.thumbnailUrl }} style={styles.feedMedia} /> : <View style={styles.feedVideoPosterFallback} />}
                  <View style={styles.feedVideoPlayButton}><Ionicons name="play" size={25} color="#082f3a" style={styles.feedVideoPlayIcon} /></View>
                </View>
              )
            ) : (
              <Pressable style={styles.feedMediaPressable} onPress={() => onPreviewImage(item)} accessibilityLabel="View image">
                <Image source={{ uri: item.url || fallbackImageUrl }} style={styles.feedMedia} />
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
      {items.length > 1 ? (
        <View pointerEvents="none" style={styles.feedMediaPagination}>
          <View style={styles.feedMediaDots}>
            {items.map((item, index) => <View key={`${item.url}-dot-${index}`} style={[styles.feedMediaDot, index === safeActiveIndex && styles.feedMediaDotActive]} />)}
          </View>
          <Text style={styles.feedMediaPageCount}>{safeActiveIndex + 1}/{items.length}</Text>
        </View>
      ) : null}
    </View>
  );
}

function QuestMediaPreviewModal({
  media,
  onClose,
  onFullscreen,
}: {
  media: { url: string; type: "image" | "video"; label?: string | null; thumbnailUrl?: string | null } | null;
  onClose: () => void;
  onFullscreen: (media: { url: string; label?: string | null }) => void;
}) {
  if (!media) return null;

  return (
    <View style={styles.mediaPreviewOverlay}>
      <Pressable style={styles.mediaPreviewBackdrop} onPress={onClose} />
      <View style={styles.mediaPreviewSheet}>
        <View style={styles.row}>
          <Text style={styles.detailLabel}>{media.label || (media.type === "video" ? "Video" : "Image")}</Text>
          <View style={styles.row}>
            {media.type === "video" ? (
              <Pressable onPress={() => onFullscreen({ url: media.url, label: media.label || "Video" })} style={styles.mediaPreviewHeaderButton}>
                <Ionicons name="expand-outline" size={20} color="#e2e8f0" />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose}>
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>
        </View>
        {media.type === "video" ? <MediaVideoPlaceholder uri={media.url} /> : <Image source={{ uri: media.url }} style={styles.mediaPreviewImageLarge} />}
      </View>
    </View>
  );
}

function MediaVideoPlaceholder({ uri }: { uri: string }) {
  return <NativeVideoPlayer uri={uri} />;
}

function FullscreenMediaViewer({
  media,
  onClose,
}: {
  media: { url: string; label?: string | null } | null;
  onClose: () => void;
}) {
  if (!media) return null;
  return (
    <View style={styles.fullscreenMediaOverlay}>
      <Pressable style={styles.mediaPreviewBackdrop} onPress={onClose} />
      <View style={styles.fullscreenMediaSheet}>
        <View style={styles.row}>
          <Text style={styles.detailLabel} numberOfLines={1}>{media.label || "Video"}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.link}>Close</Text>
          </Pressable>
        </View>
        <NativeVideoPlayer uri={media.url} fullscreen />
      </View>
    </View>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; errorMessage: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#0c0c12", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: "#f8fafc", fontSize: 20, fontWeight: "700", marginBottom: 12, textAlign: "center" }}>QuestHat hit a startup error</Text>
          <Text style={{ color: "#cbd5e1", textAlign: "center", marginBottom: 20 }}>{this.state.errorMessage || "Something went wrong while loading the app."}</Text>
          <Pressable style={{ backgroundColor: "#6daec2", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16 }} onPress={() => this.setState({ hasError: false, errorMessage: "" })}>
            <Text style={{ color: "#08121a", fontWeight: "700" }}>Try again</Text>
          </Pressable>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const systemColorScheme = useColorScheme();
  const [authState, setAuthState] = useState<AuthState>(supabase ? "loading" : "signed-out");
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authStep, setAuthStep] = useState<AuthStep>("email");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [showAuthDobPicker, setShowAuthDobPicker] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [hideCityOnBio, setHideCityOnBio] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [status, setStatus] = useState(supabase ? "" : "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  const [feedViewMode, setFeedViewMode] = useState<"list" | "map">("list");
  const [homeSearchQuery, setHomeSearchQuery] = useState("");
  const [homeCategoryFilter, setHomeCategoryFilter] = useState("All");
  const [selectedMapQuestId, setSelectedMapQuestId] = useState<string | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "ready" | "denied" | "error">("idle");
  const [questCoordsById, setQuestCoordsById] = useState<Record<string, DeviceLocation>>({});
  const [scrollOffsetY, setScrollOffsetY] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<"up" | "down">("up");
  const [topBarHidden, setTopBarHidden] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [quests, setQuests] = useState<QuestPreview[]>([]);
  const [savedQuests, setSavedQuests] = useState<QuestPreview[]>([]);
  const [joinedQuests, setJoinedQuests] = useState<QuestPreview[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [comments, setComments] = useState<MessageRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [lastInboxSeenAt, setLastInboxSeenAt] = useState<string | null>(null);
  const [lastNotificationsSeenAt, setLastNotificationsSeenAt] = useState<string | null>(null);
  const [bookmarkedQuestIds, setBookmarkedQuestIds] = useState<string[]>([]);
  const [joinedQuestIds, setJoinedQuestIds] = useState<string[]>([]);
  const [membershipStatusByQuest, setMembershipStatusByQuest] = useState<Record<string, "pending" | "approved" | "declined" | null>>({});
  const [commentCountByQuestId, setCommentCountByQuestId] = useState<Record<string, number>>({});
  const [shareCountByQuestId, setShareCountByQuestId] = useState<Record<string, number>>({});
  const [joinCountByQuestId, setJoinCountByQuestId] = useState<Record<string, number>>({});
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [categoryInput, setCategoryInput] = useState("");
  const [categoryIsCustom, setCategoryIsCustom] = useState(false);
  const [availabilityMode, setAvailabilityMode] = useState<"specific_time" | "find_best_time">("find_best_time");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [showStartAtPicker, setShowStartAtPicker] = useState(false);
  const [locationMode, setLocationMode] = useState<"in_person" | "remote">("in_person");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [recurringStartDate, setRecurringStartDate] = useState("");
  const [showRecurringStartDatePicker, setShowRecurringStartDatePicker] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [skillLevel, setSkillLevel] = useState("any");
  const [groupSizeChoice, setGroupSizeChoice] = useState("any");
  const [groupSizeCustom, setGroupSizeCustom] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAvailability, setDraftAvailability] = useState("");
  const [draftHobbyId, setDraftHobbyId] = useState("");
  const [draftCountryQuery, setDraftCountryQuery] = useState("");
  const [countrySuggestions, setCountrySuggestions] = useState<Array<{ label: string; code: string | null }>>([]);
  const [selectedCountrySuggestion, setSelectedCountrySuggestion] = useState<string | null>(null);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [draftExactAddress, setDraftExactAddress] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [selectedLocationSuggestion, setSelectedLocationSuggestion] = useState<string | null>(null);
  const [draftJoinMode, setDraftJoinMode] = useState<"approval_required" | "open">("approval_required");
  const [draftLocationVisibility, setDraftLocationVisibility] = useState<"private" | "approved_members" | "public">("private");
  const [draftGroupSize, setDraftGroupSize] = useState("4");
  const [draftMedia, setDraftMedia] = useState<DraftMedia | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [optimizingMedia, setOptimizingMedia] = useState(false);
  const [creatingQuest, setCreatingQuest] = useState(false);
  const [settingsUsername, setSettingsUsername] = useState("");
  const [settingsCity, setSettingsCity] = useState("");
  const [settingsBio, setSettingsBio] = useState("");
  const [settingsAvatarUri, setSettingsAvatarUri] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile" | "preferences" | "people" | "account">("profile");
  const [settingsCountryCode, setSettingsCountryCode] = useState("US");
  const [settingsRegion, setSettingsRegion] = useState("");
  const [settingsRadiusKm, setSettingsRadiusKm] = useState(15);
  const [settingsFriendsVisibility, setSettingsFriendsVisibility] = useState<"public" | "private">("public");
  const [settingsShowLocation, setSettingsShowLocation] = useState(false);
  const [settingsDob, setSettingsDob] = useState("");
  const [showSettingsDobPicker, setShowSettingsDobPicker] = useState(false);
  const [settingsNewEmail, setSettingsNewEmail] = useState("");
  const [settingsOldPassword, setSettingsOldPassword] = useState("");
  const [settingsNewPassword, setSettingsNewPassword] = useState("");
  const [settingsConfirmPassword, setSettingsConfirmPassword] = useState("");
  const [settingsMarketingOptIn, setSettingsMarketingOptIn] = useState(false);
  const [settingsThemePref, setSettingsThemePref] = useState<"auto" | "light" | "dark">("auto");
  const [settingsPublicLocationWarningEnabled, setSettingsPublicLocationWarningEnabled] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [settingsBlockedRefreshTick, setSettingsBlockedRefreshTick] = useState(0);
  const [settingsFriendsProfiles, setSettingsFriendsProfiles] = useState<Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>>([]);
  const [settingsFriendRequests, setSettingsFriendRequests] = useState<Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null; direction: "incoming" | "outgoing"; edge: { requester_id: string; addressee_id: string; status: string } }>>([]);
  const [settingsBlockedProfiles, setSettingsBlockedProfiles] = useState<Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [myProfileQuests, setMyProfileQuests] = useState<QuestPreview[]>([]);
  const [settingsInitialSnapshot, setSettingsInitialSnapshot] = useState<null | {
    username: string;
    dob: string;
    countryCode: string;
    city: string;
    region: string;
    bio: string;
    showLocation: boolean;
    friendsVisibility: "public" | "private";
    usernameChangedAt: string | null;
  }>(null);
  const [settingsUsernameAvailability, setSettingsUsernameAvailability] = useState<"idle" | "checking" | "available" | "taken" | "error">("idle");
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingInterestIds, setOnboardingInterestIds] = useState<string[]>([]);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [savingInterests, setSavingInterests] = useState(false);
  const [selectedQuest, setSelectedQuest] = useState<QuestDetail | null>(null);
  const [selectedQuestLoading, setSelectedQuestLoading] = useState(false);
  const [selectedQuestSaved, setSelectedQuestSaved] = useState(false);
  const [selectedQuestJoined, setSelectedQuestJoined] = useState(false);
  const [selectedQuestMembershipStatus, setSelectedQuestMembershipStatus] = useState<"pending" | "approved" | "declined" | null>(null);
  const [selectedQuestMembers, setSelectedQuestMembers] = useState<QuestMemberProfileRow[]>([]);
  const [selectedQuestPendingMembers, setSelectedQuestPendingMembers] = useState<QuestMemberProfileRow[]>([]);
  const [selectedQuestExactAccessUserIds, setSelectedQuestExactAccessUserIds] = useState<string[]>([]);
  const [selectedQuestManager, setSelectedQuestManager] = useState(false);
  const [selectedQuestComments, setSelectedQuestComments] = useState<MessageRow[]>([]);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: "image" | "video"; label?: string | null; thumbnailUrl?: string | null } | null>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<{ url: string; label?: string | null } | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ProfileDetail | null>(null);
  const [selectedProfileLoading, setSelectedProfileLoading] = useState(false);
  const [selectedProfileRelationship, setSelectedProfileRelationship] = useState<null | {
    requester_id: string;
    addressee_id: string;
    status: "pending" | "accepted" | "blocked";
  }>(null);
  const [selectedProfileFriends, setSelectedProfileFriends] = useState<Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>>([]);
  const [selectedProfileFriendsExpanded, setSelectedProfileFriendsExpanded] = useState(false);
  const pushTokenRegisteredForUserRef = useRef<string | null>(null);
  const handledPushResponseIdRef = useRef<string | null>(null);
  const [showPushPromptModal, setShowPushPromptModal] = useState(false);
  const [pushPromptLoading, setPushPromptLoading] = useState(false);
  const [pushPromptDismissedAt, setPushPromptDismissedAt] = useState<number | null>(null);
  const [pushPermissionStatus, setPushPermissionStatus] = useState<"granted" | "denied" | "undetermined" | "unavailable" | "error" | null>(null);
  const [showNotificationPreferences, setShowNotificationPreferences] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notificationPreferencesLoading, setNotificationPreferencesLoading] = useState(false);
  const [notificationPreferencesSaving, setNotificationPreferencesSaving] = useState(false);
  const [showReportProfileModal, setShowReportProfileModal] = useState(false);
  const [reportProfileReason, setReportProfileReason] = useState("inappropriate_profile");
  const [reportProfileDetails, setReportProfileDetails] = useState("");
  const [submittingProfileReport, setSubmittingProfileReport] = useState(false);
  const [showReportQuestModal, setShowReportQuestModal] = useState(false);
  const [reportQuestContext, setReportQuestContext] = useState<(typeof REPORT_CONTEXT_OPTIONS)[number]["value"]>("listing_content");
  const [reportQuestReason, setReportQuestReason] = useState("spam_scam");
  const [reportQuestDetails, setReportQuestDetails] = useState("");
  const [submittingQuestReport, setSubmittingQuestReport] = useState(false);
  const [reportQuestTarget, setReportQuestTarget] = useState<QuestPreview | QuestDetail | null>(null);
  const [showQuestActionsMenu, setShowQuestActionsMenu] = useState(false);
  const [questActionsTarget, setQuestActionsTarget] = useState<QuestPreview | null>(null);
  const [questionTarget, setQuestionTarget] = useState<QuestPreview | null>(null);
  const [questionMode, setQuestionMode] = useState<"public" | "private">("public");
  const [questionPartnerId, setQuestionPartnerId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});
  const [questionComments, setQuestionComments] = useState<MessageRow[]>([]);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [authActionLoading, setAuthActionLoading] = useState<null | "Creating account..." | "Signing in..." | "Sending code..." | "Verifying code..." | "Opening OAuth..." >(null);
  const [accountDeactivatedAt, setAccountDeactivatedAt] = useState<string | null>(null);
  const [accountActionLoading, setAccountActionLoading] = useState<null | "deactivate" | "restore" | "delete">(null);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState("");
  const [eulaRequired, setEulaRequired] = useState(false);
  const [eulaConsentChecked, setEulaConsentChecked] = useState(false);
  const [eulaSaving, setEulaSaving] = useState(false);
  const homeMapRef = useRef<MapView | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(STORED_LOCATION_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as DeviceLocation & { savedAt?: number };
        const isFresh = parsed.savedAt && Date.now() - parsed.savedAt < 24 * 60 * 60 * 1000;
        if (isFresh && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) {
          setDeviceLocation({ lat: parsed.lat, lon: parsed.lon, accuracy: parsed.accuracy });
          setLocationStatus("ready");
        }
      } catch {
        // Ignore stale or malformed cached location data.
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!quests.length) {
      setQuestCoordsById({});
      return;
    }
    setQuestCoordsById({});
    void (async () => {
      const resolved: Record<string, DeviceLocation> = {};
      let nextIndex = 0;
      const worker = async () => {
        while (!cancelled) {
          const quest = quests[nextIndex++];
          if (!quest) return;
          const coords = await getQuestMapCoordinates(quest);
          if (!coords || cancelled) continue;
          resolved[quest.id] = coords;
          setQuestCoordsById({ ...resolved });
        }
      };

      // Keep geocoder traffic bounded; blasting the whole feed causes throttling.
      await Promise.all(Array.from({ length: Math.min(3, quests.length) }, worker));
    })();
    return () => {
      cancelled = true;
    };
  }, [quests]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const normalized = settingsUsername.trim().toLowerCase();
    const initialUsername = (settingsInitialSnapshot?.username || "").trim().toLowerCase();
    const isInvalid = Boolean(normalized && validateUsername(normalized));
    const isUnchanged = Boolean(initialUsername) && normalized === initialUsername;
    if (!normalized || isInvalid || isUnchanged) {
      setSettingsUsernameAvailability(isInvalid ? "idle" : isUnchanged ? "available" : "idle");
      return;
    }

    let active = true;
    setSettingsUsernameAvailability("checking");
    const timer = setTimeout(async () => {
      const { data, error } = await client
        .from("profiles")
        .select("id")
        .ilike("username", normalized)
        .limit(1);
      if (!active) return;
      if (error) {
        setSettingsUsernameAvailability("error");
        return;
      }
      const takenByAnotherUser = (data || []).some((row) => row.id !== userId);
      setSettingsUsernameAvailability(takenByAnotherUser ? "taken" : "available");
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [settingsInitialSnapshot?.username, settingsUsername, supabase, userId]);

  useEffect(() => {
    if (locationMode !== "in_person") {
      setCountrySuggestions([]);
      setLocationSuggestions([]);
      setSelectedCountrySuggestion(null);
      setSelectedCountryCode(null);
      setSelectedLocationSuggestion(null);
      return;
    }
    const query = draftCountryQuery.trim();
    if (selectedCountrySuggestion && selectedCountrySuggestion.toLowerCase() === query.toLowerCase()) {
      setCountrySuggestions([]);
      return;
    }
    if (query.length < 1) {
      setCountrySuggestions([]);
      return;
    }

    const normalizedQuery = query.toLowerCase();
    const matches = COUNTRY_OPTIONS
      .filter((country) => country.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map((country) => ({ label: country.name, code: country.code }));
    setCountrySuggestions(matches);
  }, [draftCountryQuery, locationMode, selectedCountrySuggestion]);

  useEffect(() => {
    if (locationMode !== "in_person") {
      setLocationSuggestions([]);
      setSelectedLocationSuggestion(null);
      return;
    }
    if (!selectedCountrySuggestion || !selectedCountryCode) {
      setLocationSuggestions([]);
      setSelectedLocationSuggestion(null);
      return;
    }
    const query = draftExactAddress.trim();
    if (selectedLocationSuggestion && normalizeQuestLocationQuery(selectedLocationSuggestion) === normalizeQuestLocationQuery(query)) {
      setLocationSuggestions([]);
      return;
    }
    if (query.length < 3) {
      setLocationSuggestions([]);
      return;
    }

    const abortController = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const normalizedQuery = query.toLowerCase();
        const searchParts = [query];
        if (profile?.city && !normalizedQuery.includes(profile.city.toLowerCase())) searchParts.push(profile.city);
        if (profile?.region && !normalizedQuery.includes(profile.region.toLowerCase())) searchParts.push(profile.region);
        searchParts.push(selectedCountrySuggestion);
        const locationBias = deviceLocation
          ? `&viewbox=${deviceLocation.lon - 1.5},${deviceLocation.lat + 1},${deviceLocation.lon + 1.5},${deviceLocation.lat - 1}`
          : "";
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&dedupe=1&limit=10&accept-language=en&q=${encodeURIComponent(searchParts.join(", "))}&countrycodes=${encodeURIComponent(selectedCountryCode.toLowerCase())}${locationBias}`, {
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`Location search failed (${response.status})`);
        const payload = (await response.json()) as Array<{ display_name?: string; name?: string; address?: { city?: string; town?: string; village?: string; state?: string; county?: string; country?: string } }>;
        const unique = Array.from(
          new Map(
            (payload || [])
              .map((result) => {
                const label = (result.display_name || result.name || [result.address?.city, result.address?.state, result.address?.country].filter(Boolean).join(", ") || "").trim();
                return label ? [label.toLowerCase(), label] as const : null;
              })
              .filter((entry): entry is readonly [string, string] => Boolean(entry))
          ).values()
        );
        if (abortController.signal.aborted) return;
        setLocationSuggestions(unique);
      } catch (error) {
        if (abortController.signal.aborted) return;
        setLocationSuggestions([]);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [deviceLocation, draftExactAddress, locationMode, profile?.city, profile?.region, selectedCountryCode, selectedCountrySuggestion, selectedLocationSuggestion]);

  useEffect(() => {
    void AsyncStorage.getItem("sidequest_theme_pref").then((saved) => {
      if (saved === "auto" || saved === "light" || saved === "dark") setSettingsThemePref(saved);
    });
    void AsyncStorage.getItem("sidequest_public_location_warning_muted_until").then((raw) => {
      const mutedUntil = raw ? Number(raw) : 0;
      setSettingsPublicLocationWarningEnabled(!(Number.isFinite(mutedUntil) && mutedUntil > Date.now()));
    });
  }, []);

  const signedIn = authState === "signed-in";
  const themeMode = settingsThemePref === "auto"
    ? (systemColorScheme === "light" ? "light" : "dark")
    : settingsThemePref;
  const isLightTheme = themeMode === "light";
  const shellBackground = isLightTheme ? "#f4f7fb" : "#0c0c12";
  const shellSurface = isLightTheme ? "#ffffff" : "#11131c";
  const shellText = isLightTheme ? "#0f172a" : "#f8fafc";
  const shellMuted = isLightTheme ? "#64748b" : "#aeb6c6";
  const shellBorder = isLightTheme ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)";
  const shellPrimary = "#6daec2";
  const scrollPositionRef = useRef(0);
  const topBarVisibility = useRef(new Animated.Value(1)).current;
  const coordinateCacheRef = useRef<Record<string, DeviceLocation>>({});
  const busyLabel = authActionLoading || (accountActionLoading === "deactivate" ? "Deactivating account..." : null) || (accountActionLoading === "restore" ? "Restoring account..." : null) || (accountActionLoading === "delete" ? "Deleting account..." : null) || (refreshing ? "Refreshing..." : null) || (locationStatus === "loading" ? "Checking your location..." : null) || (creatingQuest ? "Creating quest..." : null) || (savingProfile ? "Saving profile..." : null) || (savingPreferences ? "Saving preferences..." : null) || (uploadingMedia ? "Uploading media..." : null) || (onboardingSaving ? "Saving onboarding..." : null) || (selectedQuestLoading ? "Loading quest..." : null) || (selectedProfileLoading ? "Loading profile..." : null) || (sendingQuestion ? "Sending message..." : null);
  const topBarBackground = scrollOffsetY > 12
    ? scrollDirection === "down"
      ? (isLightTheme ? "rgba(255,255,255,0.76)" : "rgba(17,19,28,0.68)")
      : shellSurface
    : shellSurface;

  useEffect(() => {
    Animated.timing(topBarVisibility, {
      toValue: topBarHidden ? 0 : 1,
      duration: topBarHidden ? 180 : 220,
      useNativeDriver: false,
    }).start();
  }, [topBarHidden, topBarVisibility]);

  useEffect(() => {
    setTopBarHidden(false);
    scrollPositionRef.current = 0;
  }, [activeTab]);
  const usernameCooldownActive = Boolean(
    settingsInitialSnapshot?.usernameChangedAt &&
      settingsUsername.trim().toLowerCase() !== (settingsInitialSnapshot.username || "").trim().toLowerCase() &&
      Number.isFinite(new Date(settingsInitialSnapshot.usernameChangedAt).getTime()) &&
      Date.now() - new Date(settingsInitialSnapshot.usernameChangedAt).getTime() < 24 * 60 * 60 * 1000
  );
  const settingsProfileDirty = useMemo(() => {
    if (!settingsInitialSnapshot) return false;
    return JSON.stringify({
      username: settingsUsername.trim(),
      dob: settingsDob.trim(),
      countryCode: settingsCountryCode.trim(),
      city: settingsCity.trim(),
      region: settingsRegion.trim(),
      bio: settingsBio.trim(),
      showLocation: settingsShowLocation,
      friendsVisibility: settingsFriendsVisibility,
      radiusKm: settingsRadiusKm,
      avatarUrl: settingsAvatarUri.trim(),
    }) !== JSON.stringify({
      username: settingsInitialSnapshot.username.trim(),
      dob: settingsInitialSnapshot.dob.trim(),
      countryCode: settingsInitialSnapshot.countryCode.trim(),
      city: settingsInitialSnapshot.city.trim(),
      region: settingsInitialSnapshot.region.trim(),
      bio: settingsInitialSnapshot.bio.trim(),
      showLocation: settingsInitialSnapshot.showLocation,
      friendsVisibility: settingsInitialSnapshot.friendsVisibility,
      radiusKm: settingsRadiusKm,
      avatarUrl: settingsAvatarUri.trim(),
    });
  }, [settingsAvatarUri, settingsBio, settingsCity, settingsCountryCode, settingsFriendsVisibility, settingsInitialSnapshot, settingsRadiusKm, settingsRegion, settingsShowLocation, settingsUsername]);

  function resetSettingsProfileForm() {
    if (!settingsInitialSnapshot) return;
    setSettingsUsername(settingsInitialSnapshot.username || "");
    setSettingsDob(settingsInitialSnapshot.dob || "");
    setSettingsCountryCode(settingsInitialSnapshot.countryCode || "US");
    setSettingsCity(settingsInitialSnapshot.city || "");
    setSettingsRegion(settingsInitialSnapshot.region || "");
    setSettingsBio(settingsInitialSnapshot.bio || "");
    setSettingsShowLocation(Boolean(settingsInitialSnapshot.showLocation));
    setSettingsFriendsVisibility(settingsInitialSnapshot.friendsVisibility || "public");
    setStatus("");
  }
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

  async function sendWelcomeEmail(accessToken?: string | null) {
    if (!accessToken) return;
    try {
      const response = await fetch(`${env.siteUrl.replace(/\/$/, "")}/api/welcome-email`, {
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
      // best effort
    }
  }

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    void client.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setAuthState(data.session?.user ? "signed-in" : "signed-out");
      if (data.session?.access_token) void sendWelcomeEmail(data.session.access_token);
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setAuthState(session?.user ? "signed-in" : "signed-out");
      if (session?.user) setActiveTab((current) => (current === "home" ? current : current));
      if (session?.access_token) void sendWelcomeEmail(session.access_token);
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

  useEffect(() => {
    if (signedIn) {
      setShowAuthModal(false);
    } else {
      setJoinedQuestIds([]);
      setMembershipStatusByQuest({});
      setJoinedQuests([]);
      setSelectedQuestJoined(false);
    }
  }, [signedIn]);

  useEffect(() => {
    if (!supabase || !signedIn || !userId) {
      setAccountDeactivatedAt(null);
      setEulaRequired(false);
      return;
    }
    const client = supabase;
    let cancelled = false;
    void (async () => {
      const [{ data, error }, { data: authUserData }] = await Promise.all([
        client
          .from("profiles")
          .select("deactivated_at,eula_version,eula_accepted_at")
          .eq("id", userId)
          .maybeSingle(),
        client.auth.getUser(),
      ]);
      if (cancelled) return;
      if (error && !error.message.toLowerCase().includes("column")) {
        console.warn("account lifecycle check failed", error.message);
        return;
      }

      setAccountDeactivatedAt((data?.deactivated_at as string | null | undefined) || null);
      const profileAccepted = Boolean(data?.eula_accepted_at && data?.eula_version === CURRENT_EULA_VERSION);
      const metadata = authUserData.user?.user_metadata || {};
      const metadataAccepted = metadata.accepted_eula === true && metadata.eula_version === CURRENT_EULA_VERSION;
      if (profileAccepted) {
        setEulaRequired(false);
        return;
      }

      // Reconcile accounts that recorded acceptance in Auth before the profile write completed.
      if (metadataAccepted) {
        const { data: reconciled } = await client.rpc("accept_current_eula", { accepted_version: CURRENT_EULA_VERSION });
        if (cancelled) return;
        setEulaRequired(reconciled !== true);
        return;
      }
      setEulaRequired(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, userId]);

  useEffect(() => {
    if (!signedIn || !userId) {
      setShowPushPromptModal(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const status = await getPushPermissionStatus();
      if (cancelled) return;

      if (status !== "undetermined") {
        setShowPushPromptModal(false);
        return;
      }

      const storageKey = `${STORED_PUSH_PROMPT_DISMISSED_AT}:${userId}`;
      const raw = await AsyncStorage.getItem(storageKey);
      if (cancelled) return;

      const dismissedAt = raw ? Number(raw) : 0;
      const promptIsFresh = Number.isFinite(dismissedAt) && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
      setPushPromptDismissedAt(promptIsFresh ? dismissedAt : null);
      setShowPushPromptModal(!promptIsFresh);
    })().catch((error) => {
      console.warn("push prompt eligibility check failed", error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
    };
  }, [signedIn, userId]);

  useEffect(() => {
    if (!signedIn || !userId) {
      setPushPermissionStatus(null);
      setShowNotificationPreferences(false);
      setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
      return;
    }

    let cancelled = false;
    const refreshPushPermissionStatus = async () => {
      const status = await getPushPermissionStatus();
      if (!cancelled) setPushPermissionStatus(status);
    };

    void refreshPushPermissionStatus();

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshPushPermissionStatus();
      }
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
    };
  }, [signedIn, userId]);

  useEffect(() => {
    if (!signedIn || !userId) return;
    void loadNotificationPreferences(userId);
  }, [signedIn, userId]);

  useEffect(() => {
    if (!signedIn || !userId || !supabase || accountDeactivatedAt) return;
    if (pushPermissionStatus !== "granted") return;
    if (pushTokenRegisteredForUserRef.current === userId) return;
    let cancelled = false;
    void registerPushTokenForUser(userId)
      .then((token) => {
        if (!cancelled && token) {
          pushTokenRegisteredForUserRef.current = userId;
        }
      })
      .catch((error) => {
        console.warn("push token registration failed", error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [accountDeactivatedAt, pushPermissionStatus, signedIn, userId]);

  useEffect(() => {
    if (!signedIn || !userId) return;

    const refreshNotifications = () => {
      void loadNotificationData(userId);
    };

    const receivedListener = Notifications.addNotificationReceivedListener(() => {
      refreshNotifications();
    });

    const handleResponse = (response: Notifications.NotificationResponse) => {
      refreshNotifications();
      const responseId = response.notification.request.identifier;
      if (handledPushResponseIdRef.current === responseId) return;
      handledPushResponseIdRef.current = responseId;
      void Notifications.clearLastNotificationResponseAsync();
      void openPushNotification(response.notification.request.content.data as PushNavigationData);
    };

    const responseListener = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });

    return () => {
      receivedListener.remove();
      responseListener.remove();
    };
  }, [signedIn, userId]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;

    const channel = client
      .channel(`questhat-live-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          void loadNotificationData(userId);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          void loadAuthedData(userId);
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [supabase, userId]);

  useEffect(() => {
    if (!signedIn || !userId) return;

    let cancelled = false;
    const refreshSignedInData = () => {
      if (cancelled) return;
      void loadNotificationData(userId);
      if (activeTab === "inbox") void loadAuthedData(userId);
    };

    if (activeTab === "inbox" || activeTab === "notifications") {
      refreshSignedInData();
    }

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshSignedInData();
        // iOS can report active before the resumed network connection is ready.
        setTimeout(refreshSignedInData, 1000);
      }
    });

    const interval = setInterval(() => {
      if (AppState.currentState === "active" && (activeTab === "inbox" || activeTab === "notifications")) {
        refreshSignedInData();
      }
    }, 15000);

    return () => {
      cancelled = true;
      appStateSub.remove();
      clearInterval(interval);
    };
  // Live notification refresh is intentionally keyed by app/tab state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, signedIn, userId]);

  async function loadNotificationData(uid: string) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("id,kind,title,body,href,quest_id,source_user_id,membership_user_id,meta,created_at,read_at,source_profile:profiles!notifications_source_user_id_fkey(id,display_name,username,avatar_url)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.warn("notification refresh failed", error.message);
      return;
    }

    const nextNotifications = (data || []) as NotificationRow[];
    setNotifications(nextNotifications);
    if (Platform.OS === "ios") {
      const unreadCount = nextNotifications.filter((item) => !item.read_at).length;
      void Notifications.setBadgeCountAsync(unreadCount).catch((badgeError) => {
        console.warn("notification refresh badge failed", badgeError instanceof Error ? badgeError.message : String(badgeError));
      });
    }
  }

  async function loadHome() {
    if (!supabase) return;
    let excludedCreatorIds: string[] = [];
    if (userId) {
      const { data: blockRows } = await supabase
        .from("friends")
        .select("requester_id,addressee_id")
        .eq("status", "blocked")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
      excludedCreatorIds = Array.from(new Set(
        ((blockRows || []) as Array<{ requester_id: string; addressee_id: string }>)
          .flatMap((row) => [row.requester_id, row.addressee_id])
          .filter((id) => id !== userId),
      ));
      setBlockedUserIds(excludedCreatorIds);
    } else {
      setBlockedUserIds([]);
    }
    const { data, error } = await supabase
      .from("quests")
      .select("id,creator_id,title,description,city,availability,skill_level,join_mode,created_at,media_items,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,username,avatar_url)")
      .order("created_at", { ascending: false })
      .limit(HOME_QUEST_LIMIT);
    if (error) throw error;
    const nextQuests = ((data || []) as QuestPreview[]).filter((quest) => !excludedCreatorIds.includes(quest.creator_id || ""));
    setQuests(nextQuests);
    await loadQuestCardCounts(nextQuests.map((quest) => quest.id));
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
    const { data: authUser } = await supabase.auth.getUser();
    const authData = authUser.user?.user_metadata || {};
    const metaName = (typeof authData.full_name === "string" && authData.full_name.trim()) || (typeof authData.name === "string" && authData.name.trim()) || "";
    const [{ data: profileData }, { data: bookmarkRows }, { data: memberRows }, { data: notificationRows }, { data: acceptedRows }, { data: pendingRows }, { data: blockRows }, { data: commentRows }, { data: myQuestRows }, { data: hobbyRows }, { data: myListingIds }] = await Promise.all([
      supabase.from("profiles").select("id,display_name,username,username_changed_at,city,region,country_code,bio,avatar_url,show_location,radius_km,friends_visibility,onboarding_done,photo_onboarding_done,eula_version,eula_accepted_at").eq("id", uid).maybeSingle(),
      supabase.from("quest_bookmarks").select("quest_id").eq("user_id", uid),
      supabase.from("quest_members").select("quest_id,status,quests(id,creator_id,title,description,city,availability,skill_level,join_mode,created_at,media_items,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,username,avatar_url))").eq("user_id", uid).order("joined_at", { ascending: false }),
      supabase.from("notifications").select("id,kind,title,body,href,quest_id,source_user_id,membership_user_id,meta,created_at,read_at,source_profile:profiles!notifications_source_user_id_fkey(id,display_name,username,avatar_url)").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
      supabase.from("friends").select("requester_id,addressee_id,status").eq("status", "accepted").or(`requester_id.eq.${uid},addressee_id.eq.${uid}`),
      supabase.from("friends").select("requester_id,addressee_id,status").eq("status", "pending").or(`requester_id.eq.${uid},addressee_id.eq.${uid}`),
      supabase.from("friends").select("requester_id,addressee_id,status").eq("status", "blocked").or(`requester_id.eq.${uid},addressee_id.eq.${uid}`),
      supabase.from("messages").select("id,quest_id,sender_id,body,created_at,quests(title),profiles:profiles!messages_sender_id_fkey(display_name,avatar_url)").ilike("body", "[PUBLIC] %").order("created_at", { ascending: false }).limit(30),
      supabase.from("quests").select("id,creator_id,title,description,city,availability,skill_level,join_mode,created_at,media_items,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,username,avatar_url)").eq("creator_id", uid).order("created_at", { ascending: false }).limit(12),
      supabase.from("user_hobbies").select("hobby_id,is_primary").eq("user_id", uid),
      supabase.from("quests").select("id").eq("creator_id", uid),
    ]);

    const ownerQuestIds = ((myListingIds || []) as Array<{ id: string }>).map((row) => row.id);
    const [sentPrivateRes, ownedPrivateRes, privateForMeRes] = await Promise.all([
      supabase
        .from("messages")
        .select("id,quest_id,sender_id,body,created_at,quests(id,title,creator_id),profiles:profiles!messages_sender_id_fkey(id,display_name,username,avatar_url)")
        .eq("sender_id", uid)
        .like("body", "[PRIVATE%")
        .order("created_at", { ascending: false })
        .limit(300),
      ownerQuestIds.length
        ? supabase
            .from("messages")
            .select("id,quest_id,sender_id,body,created_at,quests(id,title,creator_id),profiles:profiles!messages_sender_id_fkey(id,display_name,username,avatar_url)")
            .in("quest_id", ownerQuestIds)
            .like("body", "[PRIVATE%")
            .order("created_at", { ascending: false })
            .limit(300)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("messages")
        .select("id,quest_id,sender_id,body,created_at,quests(id,title,creator_id),profiles:profiles!messages_sender_id_fkey(id,display_name,username,avatar_url)")
        .like("body", `[PRIVATE to=${uid}] %`)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const nextProfile = (profileData || null) as Profile | null;
    const metadataEulaAccepted = authData.accepted_eula === true && authData.eula_version === CURRENT_EULA_VERSION;
    setEulaRequired(!metadataEulaAccepted && (!nextProfile?.eula_accepted_at || nextProfile.eula_version !== CURRENT_EULA_VERSION));
    if (!nextProfile) {
      await supabase.from("profiles").upsert({
        id: uid,
        display_name: metaName || (typeof authData.display_name === "string" ? authData.display_name : "") || null,
        username: typeof authData.username === "string" ? authData.username || null : null,
        city: typeof authData.city === "string" ? authData.city || null : null,
        region: typeof authData.region === "string" ? authData.region || null : null,
        country_code: typeof authData.country_code === "string" ? authData.country_code || "US" : "US",
        bio: typeof authData.bio === "string" ? authData.bio || null : null,
        avatar_url: typeof authData.avatar_url === "string" ? authData.avatar_url || null : null,
        show_location: typeof authData.show_location === "boolean" ? authData.show_location : false,
        radius_km: Number(authData.radius_km || 15),
        friends_visibility: "public",
        onboarding_done: false,
        photo_onboarding_done: false,
      });
    }
    const fallbackProfile: Profile = {
      id: uid,
      display_name: metaName || (typeof authData.display_name === "string" ? authData.display_name : "") || null,
      username: (typeof authData.username === "string" ? authData.username : "") || null,
      username_changed_at: null,
      city: typeof authData.city === "string" ? authData.city : null,
      region: typeof authData.region === "string" ? authData.region : null,
      country_code: typeof authData.country_code === "string" ? authData.country_code : "US",
      bio: "",
      avatar_url: typeof authData.avatar_url === "string" ? authData.avatar_url : undefined,
      show_location: typeof authData.show_location === "boolean" ? authData.show_location : false,
      radius_km: 15,
      friends_visibility: "public",
      onboarding_done: false,
      photo_onboarding_done: false,
    };
    setProfile(nextProfile || fallbackProfile);
    const canonicalUsername = nextProfile?.username || (typeof authData.username === "string" ? authData.username : "") || "";
    setSettingsUsername(canonicalUsername);
    setSettingsCity(nextProfile?.city || (typeof authData.city === "string" ? authData.city : "") || "");
    setSettingsBio(nextProfile?.bio || (typeof authData.bio === "string" ? authData.bio : "") || "");
    setSettingsAvatarUri(nextProfile?.avatar_url || (typeof authData.avatar_url === "string" ? authData.avatar_url : "") || "");
    setSettingsCountryCode(nextProfile?.country_code || (typeof authData.country_code === "string" ? authData.country_code : "US") || "US");
    setSettingsRegion(nextProfile?.region || (typeof authData.region === "string" ? authData.region : "") || "");
    setSettingsRadiusKm(Number(nextProfile?.radius_km || authData.radius_km || 15));
    setSettingsFriendsVisibility((nextProfile?.friends_visibility as "public" | "private") || (authData.friends_visibility as "public" | "private") || "public");
    setSettingsShowLocation(typeof nextProfile?.show_location === "boolean" ? nextProfile.show_location : typeof authData.show_location === "boolean" ? authData.show_location : false);
    setSettingsDob(typeof authData.dob === "string" ? authData.dob : "");
    setOnboardingInterestIds(((hobbyRows || []) as Array<{ hobby_id: string; is_primary?: boolean | null }>).map((row) => row.hobby_id));
    setShowOnboardingWizard(Boolean(nextProfile && !nextProfile.onboarding_done));
    setOnboardingStep(0);
    setSettingsInitialSnapshot({
        username: canonicalUsername,
        dob: typeof authData.dob === "string" ? authData.dob : "",
        countryCode: nextProfile?.country_code || (typeof authData.country_code === "string" ? authData.country_code : "US") || "US",
        city: nextProfile?.city || (typeof authData.city === "string" ? authData.city : "") || "",
        region: nextProfile?.region || (typeof authData.region === "string" ? authData.region : "") || "",
        bio: nextProfile?.bio || (typeof authData.bio === "string" ? authData.bio : "") || "",
        showLocation: typeof nextProfile?.show_location === "boolean" ? nextProfile.show_location : typeof authData.show_location === "boolean" ? authData.show_location : false,
        friendsVisibility: (nextProfile?.friends_visibility as "public" | "private") || (authData.friends_visibility as "public" | "private") || "public",
        usernameChangedAt: nextProfile?.username_changed_at || null,
      });
    const privateMessageBlockedIds = Array.from(
      new Set(
        ((blockRows || []) as Array<{ requester_id: string; addressee_id: string; status: string }>)
          .flatMap((row) => [row.requester_id, row.addressee_id])
          .filter((id) => id !== uid),
      ),
    );
    setBlockedUserIds(privateMessageBlockedIds);
    setQuests((current) => current.filter((quest) => !privateMessageBlockedIds.includes(quest.creator_id || "")));
    const privateMessages = [
      ...(((sentPrivateRes.data || []) as MessageRow[])),
      ...(((ownedPrivateRes.data || []) as MessageRow[])),
      ...(((privateForMeRes.data || []) as MessageRow[])),
    ]
      .filter((row) => !row.sender_id || !privateMessageBlockedIds.includes(row.sender_id));
    const dedupedPrivate = Array.from(new Map(privateMessages.map((row) => [row.id, row])).values())
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

    setMessages(dedupedPrivate);
    setComments(((commentRows || []) as MessageRow[]).filter((row) => !row.sender_id || !privateMessageBlockedIds.includes(row.sender_id)));
    const nextNotifications = ((notificationRows || []) as NotificationRow[]).filter((row) => !row.source_user_id || !privateMessageBlockedIds.includes(row.source_user_id));
    setNotifications(nextNotifications);
    if (Platform.OS === "ios") {
      const unreadCount = nextNotifications.filter((item) => !item.read_at).length;
      void Notifications.setBadgeCountAsync(unreadCount).catch((badgeError) => {
        console.warn("authenticated refresh badge failed", badgeError instanceof Error ? badgeError.message : String(badgeError));
      });
    }
    setMyProfileQuests((myQuestRows || []) as QuestPreview[]);

    const acceptedEdges = ((acceptedRows || []) as Array<{ requester_id: string; addressee_id: string; status: string }>).filter((row) => row.requester_id !== row.addressee_id);
    const acceptedFriendIds = Array.from(new Set(acceptedEdges.map((row) => (row.requester_id === uid ? row.addressee_id : row.requester_id)).filter((id) => id !== uid)));
    if (acceptedFriendIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,display_name,avatar_url,username").in("id", acceptedFriendIds);
      setSettingsFriendsProfiles(((profiles || []) as Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>));
    } else {
      setSettingsFriendsProfiles([]);
    }

    const pendingEdges = ((pendingRows || []) as Array<{ requester_id: string; addressee_id: string; status: string }>).filter((row) => row.requester_id !== row.addressee_id);
    const pendingIds = Array.from(new Set(pendingEdges.flatMap((row) => [row.requester_id, row.addressee_id]).filter((id) => id !== uid)));
    if (pendingIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,display_name,avatar_url,username").in("id", pendingIds);
      const profileMap = new Map(((profiles || []) as Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>).map((profile) => [profile.id, profile]));
      const rows: Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null; direction: "incoming" | "outgoing"; edge: { requester_id: string; addressee_id: string; status: string } }> = [];
      pendingEdges.forEach((edge) => {
        if (edge.requester_id === uid) {
          const profile = profileMap.get(edge.addressee_id);
          if (profile) rows.push({ ...profile, direction: "outgoing", edge });
          return;
        }
        const profile = profileMap.get(edge.requester_id);
        if (profile) rows.push({ ...profile, direction: "incoming", edge });
      });
      setSettingsFriendRequests(rows);
    } else {
      setSettingsFriendRequests([]);
    }

    const blockedEdges = ((blockRows || []) as Array<{ requester_id: string; addressee_id: string; status: string }>).filter((row) => row.requester_id !== row.addressee_id);
    const blockedIds = Array.from(new Set(blockedEdges.flatMap((row) => [row.requester_id, row.addressee_id]).filter((id) => id !== uid)));
    if (blockedIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,display_name,avatar_url,username").in("id", blockedIds);
      const blockedMap = new Map(((profiles || []) as Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>).map((profile) => [profile.id, profile]));
      const rows = blockedEdges
        .map((edge) => blockedMap.get(edge.requester_id === uid ? edge.addressee_id : edge.requester_id))
        .filter((profile): profile is { id: string; display_name: string | null; username: string | null; avatar_url: string | null } => Boolean(profile));
      setSettingsBlockedProfiles(rows);
    } else {
      setSettingsBlockedProfiles([]);
    }

    const savedIds = ((bookmarkRows || []) as Array<{ quest_id: string }>).map((row) => row.quest_id);
    setBookmarkedQuestIds(savedIds);
    if (savedIds.length) {
      const { data } = await supabase
        .from("quests")
        .select("id,creator_id,title,description,city,availability,skill_level,join_mode,created_at,media_items,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,username,avatar_url)")
        .in("id", savedIds);
      setSavedQuests((data || []) as QuestPreview[]);
    } else {
      setSavedQuests([]);
    }

    const members = (memberRows || []) as QuestMemberRow[];
    setMembershipStatusByQuest(Object.fromEntries(members.map((row) => [row.quest_id, row.status || null])));
    const joinedIds = members.filter((row) => row.status === "approved").map((row) => row.quest_id);
    setJoinedQuestIds(joinedIds);
    const joined = members
      .filter((row) => row.status === "approved")
      .map((row) => getRelationOne((row as { quests?: QuestPreview[] | QuestPreview | null }).quests))
      .filter((quest): quest is QuestPreview => Boolean(quest));
    setJoinedQuests(joined);

    const publicCommentCounts = ((commentRows || []) as Array<{ quest_id?: string | null; body?: string | null }>)
      .reduce<Record<string, number>>((acc, row) => {
        if (!row.quest_id) return acc;
        acc[row.quest_id] = (acc[row.quest_id] || 0) + 1;
        return acc;
      }, {});
    setCommentCountByQuestId(publicCommentCounts);
  }

  async function loadQuestCardCounts(questIds: string[]) {
    if (!supabase || !questIds.length) {
      setCommentCountByQuestId({});
      setShareCountByQuestId({});
      setJoinCountByQuestId({});
      return;
    }
    const [{ data: messageRows }, { data: shareRows }, { data: memberRows }] = await Promise.all([
      supabase.from("messages").select("quest_id,body").in("quest_id", questIds).like("body", "[PUBLIC] %"),
      supabase.from("quest_shares").select("quest_id").in("quest_id", questIds),
      supabase.from("quest_members").select("quest_id,status").in("quest_id", questIds),
    ]);

    const comments = ((messageRows || []) as Array<{ quest_id?: string | null; body?: string | null }>)
      .reduce<Record<string, number>>((acc, row) => {
        if (!row.quest_id) return acc;
        acc[row.quest_id] = (acc[row.quest_id] || 0) + 1;
        return acc;
      }, {});
    const shares = ((shareRows || []) as Array<{ quest_id?: string | null }>)
      .reduce<Record<string, number>>((acc, row) => {
        if (!row.quest_id) return acc;
        acc[row.quest_id] = (acc[row.quest_id] || 0) + 1;
        return acc;
      }, {});
    const joins = ((memberRows || []) as Array<{ quest_id?: string | null; status?: string | null }>)
      .filter((row) => row.status === "approved")
      .reduce<Record<string, number>>((acc, row) => {
        if (!row.quest_id) return acc;
        acc[row.quest_id] = (acc[row.quest_id] || 0) + 1;
        return acc;
      }, {});

    setCommentCountByQuestId(comments);
    setShareCountByQuestId(shares);
    setJoinCountByQuestId(joins);
  }

  async function loadSelectedQuestDetails(questId: string) {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("quests")
      .select("id,creator_id,title,description,city,availability,skill_level,created_at,join_mode,exact_location_visibility,exact_address,media_video_url,media_source,media_items,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,username,city,bio,avatar_url)")
      .eq("id", questId)
      .maybeSingle();
    if (error) throw error;
    return (data || null) as QuestDetail | null;
  }

function normalizeMessageBody(body: string | null | undefined) {
  if (!body) return "";
  return body.replace(/^\[(PUBLIC|PRIVATE[^\]]*)\]\s*/i, "");
}

function isPrivateMessageBody(body: string | null | undefined) {
  return Boolean(body && /^\[PRIVATE/i.test(body));
}

function isPublicMessageBody(body: string | null | undefined) {
  return Boolean(body && /^\[PUBLIC\]/i.test(body));
}

function getPrivateRecipientId(body: string | null | undefined) {
  if (!body) return null;
  const match = body.match(/^\[PRIVATE\s+to=([0-9a-fA-F-]{36})\]/i);
  return match?.[1] || null;
}

function getJoinRequestNotificationState(item: NotificationRow): JoinRequestNotificationState {
  const status = typeof item.meta?.request_status === "string" ? item.meta.request_status : null;
  if (status === "approved" || status === "declined" || status === "expired") return status;
  return "pending";
}

function isSupersededJoinRequestNotification(
  item: NotificationRow,
  allNotifications: NotificationRow[],
) {
  if (item.kind !== "join_request" || !item.quest_id || !item.membership_user_id) return false;
  return allNotifications.some((candidate) => (
    candidate.id !== item.id &&
    candidate.kind === "join_request" &&
    candidate.quest_id === item.quest_id &&
    candidate.membership_user_id === item.membership_user_id &&
    +new Date(candidate.created_at) > +new Date(item.created_at)
  ));
}

function privateThreadIncludesUsers(
  row: Pick<MessageRow, "body" | "sender_id">,
  viewerId: string,
  partnerId: string,
) {
  if (!isPrivateMessageBody(row.body)) return false;
  const recipientId = getPrivateRecipientId(row.body);
  if (!recipientId || !row.sender_id) return false;
  return (
    (row.sender_id === viewerId && recipientId === partnerId) ||
    (row.sender_id === partnerId && recipientId === viewerId)
  );
}

  function getQuestionDraftKey(questId: string, mode: "public" | "private") {
    return `${questId}:${mode}`;
  }

  function saveQuestionDraft(questId?: string | null, mode?: "public" | "private", text?: string) {
    if (!questId || !mode) return;
    const key = getQuestionDraftKey(questId, mode);
    setQuestionDrafts((current) => {
      const next = { ...current };
      const value = text ?? questionText;
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  function closeQuestionModal(clearTarget = true) {
    saveQuestionDraft(questionTarget?.id, questionMode);
    setShowQuestionModal(false);
    if (clearTarget) {
      setQuestionTarget(null);
      setQuestionPartnerId(null);
    }
    setQuestionComments([]);
  }

  async function openQuestConversation(quest: QuestPreview, mode: "public" | "private" = "public", partnerId?: string | null) {
    if (!supabase || !userId) {
      promptAuth("login");
      return;
    }
    const resolvedPartnerId = mode === "private"
      ? (partnerId || (quest.creator_id === userId ? null : quest.creator_id) || null)
      : null;
    if (mode === "private" && !resolvedPartnerId) {
      setStatus("Choose a participant to open this private conversation.");
      return;
    }
    setQuestionTarget(quest);
    setQuestionMode(mode);
    setQuestionPartnerId(resolvedPartnerId);
    setQuestionText(questionDrafts[getQuestionDraftKey(quest.id, mode)] || "");
    setShowQuestionModal(true);
    const { data } = await supabase
      .from("messages")
      .select("id,quest_id,sender_id,body,created_at,profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)")
      .eq("quest_id", quest.id)
      .order("created_at", { ascending: false })
      .limit(100);
    const rows = ((data || []) as MessageRow[]).filter((row) => {
      if (mode === "public") return isPublicMessageBody(row.body);
      return resolvedPartnerId ? privateThreadIncludesUsers(row, userId, resolvedPartnerId) : false;
    });
    setQuestionComments(rows);
  }

  async function openPushNotification(data: PushNavigationData) {
    if (!supabase || !userId) return;

    const href = typeof data.href === "string" ? data.href : "";
    const questIdFromHref = href.match(/^\/listing\/([0-9a-f-]+)/i)?.[1]
      || href.match(/[?&]thread=([0-9a-f-]+)/i)?.[1]
      || null;
    const questId = typeof data.questId === "string" ? data.questId : questIdFromHref;
    const sourceUserId = typeof data.sourceUserId === "string" ? data.sourceUserId : null;
    const kind = typeof data.kind === "string" ? data.kind : "";
    const isPrivateMessage = kind === "message" && (data.meta as Record<string, unknown> | undefined)?.private === true;

    const notificationId = typeof data.notificationId === "string" ? data.notificationId : null;
    if (notificationId) {
      const readAt = new Date().toISOString();
      void supabase.from("notifications").update({ read_at: readAt }).eq("id", notificationId).eq("user_id", userId);
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, read_at: readAt } : item));
    }

    setSelectedQuest(null);
    setShowQuestionModal(false);

    if ((isPrivateMessage || href.startsWith("/inbox")) && questId) {
      const quest = await loadSelectedQuestDetails(questId);
      if (quest) {
        setActiveTab("inbox");
        void markInboxSeen();
        await openQuestConversation(quest, "private", sourceUserId);
        return;
      }
    }

    if (questId) {
      setActiveTab("home");
      await openQuestDetail(questId);
      return;
    }

    setActiveTab(href.startsWith("/inbox") ? "inbox" : "notifications");
  }

  async function openDeliveredNotification(item: NotificationRow) {
    await openPushNotification({
      href: item.href || undefined,
      kind: item.kind || undefined,
      notificationId: item.id,
      questId: item.quest_id || undefined,
      sourceUserId: item.source_user_id || undefined,
      meta: item.meta || {},
    });
  }

  async function openQuestDetail(questId: string) {
    if (!supabase) return;
    setSelectedQuestLoading(true);
    setSelectedQuestMembers([]);
    setSelectedQuestPendingMembers([]);
    setSelectedQuestExactAccessUserIds([]);
    setSelectedQuestManager(false);
    setSelectedQuestMembershipStatus(null);
    setSelectedQuestComments([]);
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
          supabase.from("quest_members").select("status,role").eq("user_id", userId).eq("quest_id", questId).maybeSingle(),
        ]);
        setSelectedQuestSaved(Boolean(savedRow));
        const membershipStatus = (memberRow?.status as "pending" | "approved" | "declined" | null) || null;
        const memberRole = (memberRow?.role as string | null) || null;
        const isManager = Boolean(
          detail.creator_id === userId ||
          (membershipStatus === "approved" && memberRole === "cohost"),
        );
        setSelectedQuestJoined(membershipStatus === "approved");
        setSelectedQuestMembershipStatus(membershipStatus);
        setSelectedQuestManager(isManager);
        const [{ data: memberRows }, { data: commentRows }, { data: accessRows }] = await Promise.all([
          supabase.from("quest_members").select("user_id,role,status,profiles:profiles!quest_members_user_id_fkey(id,display_name,username,avatar_url)").eq("quest_id", questId),
          supabase.from("messages").select("id,sender_id,body,created_at,profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)").eq("quest_id", questId).like("body", "[PUBLIC] %").order("created_at", { ascending: false }).limit(100),
          supabase.from("quest_exact_location_access").select("user_id").eq("quest_id", questId),
        ]);
        const allMembers = ((memberRows || []) as Array<{ user_id: string; role?: string | null; status?: "pending" | "approved" | "declined" | null; profiles?: Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }> | { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null }>)
          .map((row) => {
            const profile = getRelationOne(row.profiles);
            const member: QuestMemberProfileRow | null = profile
              ? { ...profile, id: profile.id || row.user_id, role: row.role ?? null, status: row.status ?? null }
              : null;
            return member;
          })
          .filter((value): value is QuestMemberProfileRow => Boolean(value));
        const canViewMembers = isManager || membershipStatus === "approved";
        setSelectedQuestMembers(canViewMembers ? allMembers.filter((member) => member.status === "approved") : []);
        setSelectedQuestPendingMembers(isManager ? allMembers.filter((member) => member.status === "pending") : []);
        setSelectedQuestExactAccessUserIds(((accessRows || []) as Array<{ user_id: string | null }>).map((row) => row.user_id).filter((value): value is string => Boolean(value)));
        setSelectedQuestComments((commentRows || []) as MessageRow[]);
      } else {
        setSelectedQuestSaved(false);
        setSelectedQuestJoined(false);
        setSelectedQuestMembers([]);
        setSelectedQuestPendingMembers([]);
        const { data: commentRows } = await supabase.from("messages").select("id,sender_id,body,created_at,profiles:profiles!messages_sender_id_fkey(id,display_name,avatar_url)").eq("quest_id", questId).like("body", "[PUBLIC] %").order("created_at", { ascending: false }).limit(100);
        setSelectedQuestComments((commentRows || []) as MessageRow[]);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load quest.");
    } finally {
      setSelectedQuestLoading(false);
    }
  }

  async function toggleSaveSelectedQuest() {
    if (!supabase || !userId || !selectedQuest) {
      promptAuth("login");
      return;
    }
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
    if (!supabase || !userId || !selectedQuest) {
      promptAuth("login");
      return;
    }
    if (selectedQuest.creator_id === userId) {
      setStatus("You can't join your own listing.");
      return;
    }
    const currentStatus = selectedQuestMembershipStatus || membershipStatusByQuest[selectedQuest.id] || null;
    const hasJoined = currentStatus === "approved";
    const hasPending = currentStatus === "pending";
    if (hasJoined || hasPending) {
      const { error } = await supabase.from("quest_members").delete().eq("quest_id", selectedQuest.id).eq("user_id", userId);
      if (error) {
        setStatus(error.message);
        return;
      }
      await supabase.from("quest_exact_location_access").delete().eq("quest_id", selectedQuest.id).eq("user_id", userId);
      setSelectedQuestJoined(false);
      setSelectedQuestMembershipStatus(null);
      setSelectedQuestExactAccessUserIds((current) => current.filter((id) => id !== userId));
      setStatus(hasPending ? "Join request canceled." : "Left quest.");
      await Promise.all([refreshAll(), openQuestDetail(selectedQuest.id)]);
      return;
    }
    const canJoin = await confirmQuestDistance(selectedQuest, "join");
    if (!canJoin) return;
    const nextStatus = (selectedQuest.join_mode || "open") === "approval_required" ? "pending" : "approved";
    if (currentStatus === "declined") {
      const { error: deleteError } = await supabase.from("quest_members").delete().eq("quest_id", selectedQuest.id).eq("user_id", userId);
      if (deleteError) {
        setStatus(deleteError.message);
        return;
      }
    }
    const response = await supabase.from("quest_members").insert({ quest_id: selectedQuest.id, user_id: userId, role: "member", status: nextStatus });
    if (response.error && !response.error.message.includes("duplicate") && !response.error.message.toLowerCase().includes("unique")) {
      setStatus(response.error.message);
      return;
    }
    setSelectedQuestJoined(nextStatus === "approved");
    setSelectedQuestMembershipStatus(nextStatus);
    setStatus(nextStatus === "pending" ? "Request to join sent ✅" : "Joined quest ✅");
    await Promise.all([refreshAll(), openQuestDetail(selectedQuest.id)]);
  }

  async function toggleBookmark(quest: QuestPreview) {
    if (!supabase || !userId) {
      promptAuth("login");
      return;
    }
    const isSaved = bookmarkedQuestIds.includes(quest.id);
    const response = isSaved
      ? await supabase.from("quest_bookmarks").delete().eq("user_id", userId).eq("quest_id", quest.id)
      : await supabase.from("quest_bookmarks").insert({ user_id: userId, quest_id: quest.id });
    if (response.error) {
      setStatus(response.error.message);
      return;
    }
    setBookmarkedQuestIds((current) => isSaved ? current.filter((id) => id !== quest.id) : [...current, quest.id]);
    await refreshAll();
  }

  async function toggleJoinQuestMobile(quest: QuestPreview) {
    if (!supabase || !userId) {
      promptAuth("login");
      return;
    }
    if (quest.creator_id === userId) {
      setStatus("You can't join your own listing.");
      return;
    }
    const currentStatus = membershipStatusByQuest[quest.id] || null;
    const hasJoined = currentStatus === "approved";
    const hasPending = currentStatus === "pending";
    if (hasJoined || hasPending) {
      const { error } = await supabase.from("quest_members").delete().eq("quest_id", quest.id).eq("user_id", userId);
      if (error) {
        setStatus(error.message);
        return;
      }
      await supabase.from("quest_exact_location_access").delete().eq("quest_id", quest.id).eq("user_id", userId);
      setJoinedQuestIds((current) => current.filter((id) => id !== quest.id));
      setMembershipStatusByQuest((current) => ({ ...current, [quest.id]: null }));
      setStatus(hasPending ? "Join request canceled." : "Left quest.");
      await refreshAll();
      return;
    }
    const canJoin = await confirmQuestDistance(quest, "join");
    if (!canJoin) return;
    const nextStatus = (quest.join_mode || "open") === "approval_required" ? "pending" : "approved";
    if (currentStatus === "declined") {
      const { error: deleteError } = await supabase.from("quest_members").delete().eq("quest_id", quest.id).eq("user_id", userId);
      if (deleteError) {
        setStatus(deleteError.message);
        return;
      }
    }
    const { error } = await supabase.from("quest_members").insert({ quest_id: quest.id, user_id: userId, role: "member", status: nextStatus });
    if (error && !error.message.includes("duplicate") && !error.message.toLowerCase().includes("unique")) {
      setStatus(error.message);
      return;
    }
    setMembershipStatusByQuest((current) => ({ ...current, [quest.id]: nextStatus }));
    if (nextStatus === "approved") setJoinedQuestIds((current) => [...new Set([...current, quest.id])]);
    setStatus(nextStatus === "pending" ? "Request to join sent ✅" : "Joined quest ✅");
    await refreshAll();
  }

  async function resolveJoinRequestNotifications(
    questId: string,
    membershipUserId: string,
    nextState: Exclude<JoinRequestNotificationState, "pending">,
  ) {
    if (!supabase || !userId) return;
    const client = supabase;

    const related = notifications
      .filter((item) => item.kind === "join_request" && item.quest_id === questId && item.membership_user_id === membershipUserId)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

    if (!related.length) return;

    const timestamp = new Date().toISOString();
    const resolvedIds: string[] = [];
    const expiredIds: string[] = [];

    related.forEach((item, index) => {
      if (index === 0) {
        resolvedIds.push(item.id);
      } else {
        expiredIds.push(item.id);
      }
    });

    const buildMeta = (item: NotificationRow, requestStatus: JoinRequestNotificationState) => ({
      ...(item.meta || {}),
      request_status: requestStatus,
      resolved_at: timestamp,
    });

    if (resolvedIds.length) {
      const resolvedItems = related.filter((item) => resolvedIds.includes(item.id));
      await Promise.all(resolvedItems.map((item) => (
        client
          .from("notifications")
          .update({ meta: buildMeta(item, nextState), read_at: timestamp })
          .eq("id", item.id)
          .eq("user_id", userId)
      )));
    }

    if (expiredIds.length) {
      const expiredItems = related.filter((item) => expiredIds.includes(item.id));
      await Promise.all(expiredItems.map((item) => (
        client
          .from("notifications")
          .update({ meta: buildMeta(item, "expired"), read_at: timestamp })
          .eq("id", item.id)
          .eq("user_id", userId)
      )));
    }

    setNotifications((current) => current.map((item) => {
      if (!related.some((candidate) => candidate.id === item.id)) return item;
      const isLatest = item.id === resolvedIds[0];
      return {
        ...item,
        read_at: timestamp,
        meta: {
          ...(item.meta || {}),
          request_status: isLatest ? nextState : "expired",
          resolved_at: timestamp,
        },
      };
    }));
  }

  async function enableNotificationsFromApp() {
    if (!userId) return;
    const currentStatus = await getPushPermissionStatus();
    setPushPermissionStatus(currentStatus);
    if (currentStatus === "granted") {
      await registerPushTokenForUser(userId);
      setStatus("Notifications are already enabled.");
      return;
    }
    if (currentStatus === "denied") {
      await RNLinking.openSettings();
      return;
    }
    const token = await requestPushPermissionAndRegisterForUser(userId);
    const refreshedStatus = await getPushPermissionStatus();
    setPushPermissionStatus(refreshedStatus);
    if (token) {
      pushTokenRegisteredForUserRef.current = userId;
      setStatus("Notifications enabled.");
    }
  }

  async function loadNotificationPreferences(uid: string) {
    if (!supabase) return;
    setNotificationPreferencesLoading(true);
    try {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("messages,comments,join_updates,join_requests,friend_requests,followed_posts,liked_categories")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw error;
      setNotificationPreferences(data ? {
        messages: data.messages !== false,
        comments: data.comments !== false,
        join_updates: data.join_updates !== false,
        join_requests: data.join_requests !== false,
        friend_requests: data.friend_requests !== false,
        followed_posts: data.followed_posts === true,
        liked_categories: data.liked_categories === true,
      } : DEFAULT_NOTIFICATION_PREFERENCES);
    } catch (error) {
      console.warn("notification preferences load failed", error instanceof Error ? error.message : String(error));
    } finally {
      setNotificationPreferencesLoading(false);
    }
  }

  async function saveNotificationPreferences() {
    if (!supabase || !userId) return;
    setNotificationPreferencesSaving(true);
    try {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({
          user_id: userId,
          ...notificationPreferences,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      setStatus("Notification preferences saved.");
      setShowNotificationPreferences(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save notification preferences.");
    } finally {
      setNotificationPreferencesSaving(false);
    }
  }

  async function updateQuestMembershipStatus(
    questId: string,
    targetUserId: string,
    nextStatus: "approved" | "declined" | "pending",
    options?: { shareExactAddress?: boolean },
  ) {
    if (!supabase || !userId) return;
    const { data: questRow, error: questError } = await supabase
      .from("quests")
      .select("id,title,creator_id")
      .eq("id", questId)
      .maybeSingle();
    if (questError || !questRow) {
      setStatus(questError?.message || "Quest not found.");
      return;
    }
    const { error } = await supabase
      .from("quest_members")
      .update({ status: nextStatus })
      .eq("quest_id", questId)
      .eq("user_id", targetUserId)
      .neq("role", "creator");
    if (error) {
      setStatus(error.message);
      return;
    }
    if (nextStatus !== "approved") {
      await supabase.from("quest_exact_location_access").delete().eq("quest_id", questId).eq("user_id", targetUserId);
    } else if (options?.shareExactAddress) {
      await supabase.from("quest_exact_location_access").upsert({ quest_id: questId, user_id: targetUserId, granted_by: userId });
    }
    if (nextStatus === "approved" || nextStatus === "declined") {
      await resolveJoinRequestNotifications(questId, targetUserId, nextStatus);
    }
    setStatus(
      nextStatus === "approved"
        ? (options?.shareExactAddress ? "Member approved and address shared." : "Member approved ✅")
        : nextStatus === "declined"
          ? "Request declined."
          : "Moved back to pending.",
    );
    await Promise.all([
      loadAuthedData(userId),
      refreshAll(),
    ]);
  }

  async function setQuestExactAddressAccess(questId: string, targetUserId: string, allow: boolean) {
    if (!supabase || !userId) return;
    if (allow) {
      const { error } = await supabase.from("quest_exact_location_access").upsert({ quest_id: questId, user_id: targetUserId, granted_by: userId });
      if (error) {
        setStatus(error.message);
        return;
      }
      setStatus("Exact address shared.");
    } else {
      const { error } = await supabase.from("quest_exact_location_access").delete().eq("quest_id", questId).eq("user_id", targetUserId);
      if (error) {
        setStatus(error.message);
        return;
      }
      setStatus("Exact address hidden.");
    }
    await Promise.all([
      openQuestDetail(questId),
      loadAuthedData(userId),
      refreshAll(),
    ]);
  }

  async function sendQuestionFromModal() {
    if (!supabase || !userId || !questionTarget) return;
    const trimmed = questionText.trim();
    if (!trimmed) {
      setStatus("Please enter your question.");
      return;
    }
    if (trimmed.length > 500) {
      setStatus("Question is too long (max 500 chars).");
      return;
    }
    setSendingQuestion(true);
    const privateRecipientId = questionMode === "private"
      ? (questionPartnerId || questionTarget.creator_id || null)
      : null;
    if (questionMode === "private" && !privateRecipientId) {
      setSendingQuestion(false);
      setStatus("We couldn't determine who should receive this message.");
      return;
    }
    const prefix = questionMode === "private" ? `[PRIVATE to=${privateRecipientId}] ` : "[PUBLIC] ";
    const { error } = await supabase.from("messages").insert({
      quest_id: questionTarget.id,
      sender_id: userId,
      body: `${prefix}${trimmed}`,
    });
    setSendingQuestion(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setQuestionDrafts((current) => {
      const next = { ...current };
      delete next[getQuestionDraftKey(questionTarget.id, questionMode)];
      return next;
    });
    setShowQuestionModal(false);
    setQuestionTarget(null);
    setQuestionPartnerId(null);
    setQuestionText("");
    setQuestionComments([]);
    setStatus(`${questionMode === "private" ? "Private" : "Public"} question sent ✅ Check Inbox for replies.`);
    await refreshAll();
  }

  async function shareQuest(quest: QuestPreview) {
    const url = `https://questhat.com/listing/${quest.id}`;
    try {
      await Share.share({ message: `${quest.title} ${url}`, url });
    } catch {
      setStatus("Could not open share sheet.");
    }
  }

  async function openProfile(profileId?: string | null) {
    if (!profileId) return;
    if (!supabase) return;
    setSelectedProfileLoading(true);
    setSelectedProfile(null);
    setSelectedProfileRelationship(null);
    setSelectedProfileFriends([]);
    setSelectedProfileFriendsExpanded(false);
    try {
      const [{ data: profileData }, { data: questData }] = await Promise.all([
        supabase.from("profiles").select("id,display_name,username,city,region,country_code,bio,avatar_url,show_location,radius_km,friends_visibility").eq("id", profileId).maybeSingle(),
        supabase.from("quests").select("id,creator_id,title,description,city,availability,skill_level,join_mode,exact_address,created_at,media_items,hobbies(name,category),profiles:profiles!quests_creator_id_fkey(id,display_name,username,avatar_url)").eq("creator_id", profileId).order("created_at", { ascending: false }).limit(12),
      ]);
      if (!profileData && profileId === userId && profile) {
        setSelectedProfile({ ...(profile as ProfileDetail), quests: (questData || []) as QuestPreview[] });
      } else if (!profileData && profileId === userId) {
        const authUser = await supabase.auth.getUser();
        const authData = authUser.data.user?.user_metadata || {};
        const fallbackSelf: ProfileDetail = {
          id: profileId,
          display_name: typeof authData.full_name === "string" ? authData.full_name : typeof authData.name === "string" ? authData.name : null,
          username: typeof authData.username === "string" ? authData.username : null,
          city: typeof authData.city === "string" ? authData.city : null,
          region: typeof authData.region === "string" ? authData.region : null,
          country_code: typeof authData.country_code === "string" ? authData.country_code : "US",
          bio: typeof authData.bio === "string" ? authData.bio : null,
          avatar_url: typeof authData.avatar_url === "string" ? authData.avatar_url : null,
          show_location: typeof authData.show_location === "boolean" ? authData.show_location : false,
          radius_km: Number(authData.radius_km || 15),
          friends_visibility: "public",
          onboarding_done: false,
          photo_onboarding_done: false,
          quests: (questData || []) as QuestPreview[],
        };
        setSelectedProfile(fallbackSelf);
      } else if (profileData) {
        setSelectedProfile({ ...(profileData as ProfileDetail), quests: (questData || []) as QuestPreview[] });
      } else {
        return;
      }
      if (userId && userId !== profileId) {
        const { data: relation } = await supabase
          .from("friends")
          .select("requester_id,addressee_id,status")
          .or(`and(requester_id.eq.${userId},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${userId})`)
          .maybeSingle();
        setSelectedProfileRelationship((relation as { requester_id: string; addressee_id: string; status: "pending" | "accepted" | "blocked" } | null) || null);
      }
      const { data: allEdges } = await supabase
        .from("friends")
        .select("requester_id,addressee_id,status")
        .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);
      const acceptedEdges = ((allEdges || []) as Array<{ requester_id: string; addressee_id: string; status: string }>).filter((edge) => edge.status === "accepted");
      const friendIds = acceptedEdges
        .map((edge) => (edge.requester_id === profileId ? edge.addressee_id : edge.requester_id))
        .filter((id) => id && id !== profileId);
      const canSeeFriends = Boolean(profileData && (profileData as Profile).friends_visibility !== "private") || Boolean(userId && userId === profileId) || Boolean(userId && selectedProfileRelationship?.status === "accepted");
      if (canSeeFriends && friendIds.length) {
        const { data: friendRows } = await supabase.from("profiles").select("id,display_name,username,avatar_url").in("id", friendIds);
        setSelectedProfileFriends(((friendRows || []) as Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>));
      } else {
        setSelectedProfileFriends([]);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open profile.");
    } finally {
      setSelectedProfileLoading(false);
    }
  }

  async function openProfileFromQuest(profileId?: string | null) {
    if (!profileId) return;
    setSelectedQuest(null);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await openProfile(profileId);
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
    const cleanEmail = email.trim();
    if (authMode === "signup") {
      if (!fullName.trim()) return setStatus("Enter your full name.");
      if (!dob.trim()) return setStatus("Enter your date of birth.");
      if (!acceptTerms) return setStatus("You must accept the Terms to continue.");
      if (!passwordChecks.minLength || !passwordChecks.uppercase || !passwordChecks.lowercase || !passwordChecks.number || !passwordChecks.special) {
        return setStatus("Your password does not meet the requirements.");
      }
      if (!passwordChecks.match) return setStatus("Passwords do not match.");
    }
    const actionLabel = authMode === "signup" ? "Creating account..." : "Signing in...";
    setAuthActionLoading(actionLabel);
    setStatus(actionLabel);
    const redirectTo = getRedirectUrl();
    try {
      const result = authMode === "signup"
        ? await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              emailRedirectTo: redirectTo,
              data: {
                full_name: fullName.trim(),
                dob,
                hide_city_on_bio: hideCityOnBio,
                marketing_opt_in: marketingOptIn,
                accepted_eula: true,
                eula_version: CURRENT_EULA_VERSION,
              },
            },
          })
        : await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (authMode === "signup" && result.data.user?.id) {
        await supabase.from("profiles").upsert({
          id: result.data.user.id,
          display_name: fullName.trim() || null,
          show_location: true,
          onboarding_done: false,
          eula_version: CURRENT_EULA_VERSION,
          eula_accepted_at: new Date().toISOString(),
        });
      }
      setStatus(result.error ? result.error.message : authMode === "signup" && !result.data.session ? "Check your email to confirm your account." : "");
    } finally {
      setAuthActionLoading(null);
    }
  }

  async function sendEmailCode() {
    if (!supabase) return;
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setStatus("Enter your email first.");
      return;
    }
    if (authMode === "signup" && !acceptTerms) {
      setStatus("You must accept the EULA and zero-tolerance safety policy.");
      return;
    }
    setAuthActionLoading("Sending code...");
    setStatus("Sending code...");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: getRedirectUrl(),
          shouldCreateUser: authMode === "signup",
          data: authMode === "signup" ? { accepted_eula: true, eula_version: CURRENT_EULA_VERSION } : undefined,
        },
      });
      if (error) {
        setStatus(error.message);
        return;
      }
      setAuthStep("code");
      setOtpCode("");
      setStatus("Check your email for the 8-digit code.");
    } finally {
      setAuthActionLoading(null);
    }
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
    setAuthActionLoading("Verifying code...");
    setStatus("Verifying code...");
    try {
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
    } finally {
      setAuthActionLoading(null);
    }
  }

  async function socialLogin(provider: Provider) {
    if (!supabase) return;
    if (authMode === "signup" && !acceptTerms) {
      setStatus("You must accept the EULA and zero-tolerance safety policy.");
      return;
    }
    setStatus("");
    const redirectTo = getRedirectUrl();
    setAuthActionLoading("Opening OAuth...");
    setStatus(`Opening ${provider} login...`);
    try {
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
      if (result.type === "success") {
        await handleAuthUrl(result.url);
        return;
      }
      if (result.type === "dismiss" || result.type === "cancel") {
        await supabase.auth.getSession().then(({ data }) => {
          if (data.session?.user) {
            setUserId(data.session.user.id);
            setAuthState("signed-in");
          }
        });
      }
    } finally {
      setAuthActionLoading(null);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setActiveTab("home");
    setSavedQuests([]);
    setJoinedQuests([]);
    setJoinedQuestIds([]);
    setMembershipStatusByQuest({});
    setMessages([]);
    setNotifications([]);
    setProfile(null);
    setSelectedQuestJoined(false);
    setAuthStep("email");
    setOtpCode("");
    setShowOnboardingWizard(false);
    setOnboardingStep(0);
    setAccountDeactivatedAt(null);
    setShowDeleteAccountModal(false);
    setDeleteAccountConfirmation("");
    setEulaRequired(false);
    setEulaConsentChecked(false);
    pushTokenRegisteredForUserRef.current = null;
  }

  async function openSupportEmail() {
    const to = supportEmails[0];
    const cc = supportEmails.slice(1).join(",");
    const subject = encodeURIComponent("QuestHat support");
    const body = encodeURIComponent("Hi QuestHat support,\n\nI need help with...");
    const mailto = `mailto:${to}${cc ? `?cc=${encodeURIComponent(cc)}&` : "?"}subject=${subject}&body=${body}`;
    const canOpen = await Linking.canOpenURL(mailto);
    if (!canOpen) {
      setStatus(`Support email: ${supportEmails.join(" / ")}`);
      return;
    }
    await Linking.openURL(mailto);
  }

  function deriveCityFromLocation(input: string) {
    const parts = input.split(",").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return "";
    const city = parts.find((part, index) => index > 0 && !/county/i.test(part) && /[A-Za-z]/.test(part) && !/(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|court|ct\.?|place|pl\.?|trail|trl\.?|circle|cir\.?)/i.test(part)) || "";
    return city || parts[0] || "";
  }

  function distanceLabelMiles(miles: number) {
    if (!Number.isFinite(miles)) return "";
    if (miles < 1) return `${Math.max(0.1, Math.round(miles * 10) / 10)} mi away`;
    if (miles < 10) return `${Math.round(miles * 10) / 10} mi away`;
    return `${Math.round(miles)} mi away`;
  }

  function normalizeQuestLocationQuery(input?: string | null) {
    return (input || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s+,/g, ",")
      .replace(/,+/g, ",")
      .replace(/^,+|,+$/g, "");
  }

  function getQuestDistanceQueries(quest: QuestPreview | QuestDetail) {
    const rawCity = normalizeQuestLocationQuery(quest.city);
    const exact = normalizeQuestLocationQuery(quest.exact_address);
    const cityFromExact = normalizeQuestLocationQuery(deriveCityFromLocation(exact));
    return Array.from(new Set([rawCity, cityFromExact, exact].filter(Boolean)));
  }

  function getQuestMapQueries(quest: QuestPreview | QuestDetail) {
    const rawCity = normalizeQuestLocationQuery(quest.city);
    const exact = normalizeQuestLocationQuery(quest.exact_address);
    const cityFromExact = normalizeQuestLocationQuery(deriveCityFromLocation(exact));
    const region = normalizeQuestLocationQuery((quest as QuestPreview & { region?: string | null }).region);
    const country = normalizeQuestLocationQuery((quest as QuestPreview & { country_code?: string | null }).country_code ? String((quest as QuestPreview & { country_code?: string | null }).country_code).toUpperCase() : null);
    const rawParts = rawCity.split(",").map((part) => part.trim()).filter(Boolean);
    const exactParts = exact.split(",").map((part) => part.trim()).filter(Boolean);
    const postalCode = [...rawParts, ...exactParts].find((part) => /^\d{4,6}$/.test(part));
    const simpleCity = rawParts.find((part) => /[a-z]/i.test(part) && !/^(united states|usa)$/i.test(part));
    return Array.from(new Set([rawCity, simpleCity, postalCode, cityFromExact, exact, region, country].filter(Boolean)));
  }

  async function fetchQuestCoordinates(query: string): Promise<DeviceLocation | null> {
    const normalized = normalizeQuestLocationQuery(query);
    if (!normalized) return null;
    const cached = coordinateCacheRef.current[normalized];
    if (cached) return cached;
    try {
      const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
      const city = parts[0]?.toLowerCase() || "";
      const state = parts.find((part) => /^[A-Z]{2}$/.test(part))?.toLowerCase() || "";
      const postal = parts.find((part) => /^\d{4,}$/.test(part)) || "";
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(normalized)}&count=5&language=en&format=json`);
      const payload = (await response.json()) as { results?: Array<{ latitude: number; longitude: number; name?: string; admin1?: string; country?: string; country_code?: string }> };
      const candidates = payload.results || [];
      const best = candidates
        .map((candidate) => {
          const name = (candidate.name || "").trim().toLowerCase();
          const admin1 = (candidate.admin1 || "").trim().toLowerCase();
          const country = (candidate.country || "").trim().toLowerCase();
          let score = 0;
          if (!name) return { candidate, score: -1 };
          if (/^\d{4,}$/.test(normalized)) score += 40;
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
          return { candidate, score };
        })
        .filter(({ score }) => score >= 0)
        .sort((a, b) => b.score - a.score)[0]?.candidate;
      if (!best) return null;
      const coords = { lat: best.latitude, lon: best.longitude };
      coordinateCacheRef.current[normalized] = coords;
      return coords;
    } catch {
      return null;
    }
  }

  async function getQuestCoordinates(quest: QuestPreview | QuestDetail) {
    const queries = getQuestDistanceQueries(quest);
    for (const query of queries) {
      const coords = await fetchQuestCoordinates(query);
      if (coords) return coords;
    }
    return null;
  }

  async function getQuestMapCoordinates(quest: QuestPreview | QuestDetail) {
    const queries = getQuestMapQueries(quest);
    for (const query of queries) {
      const coords = await fetchQuestCoordinates(query);
      if (coords) return coords;
    }
    return null;
  }

  async function requestDeviceLocation(requiredMessage = "Location access is required for this action.") {
    setLocationStatus("loading");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationStatus("denied");
        setStatus(requiredMessage);
        return null;
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = {
        lat: current.coords.latitude,
        lon: current.coords.longitude,
        accuracy: current.coords.accuracy ?? undefined,
      };
      setDeviceLocation(next);
      setLocationStatus("ready");
      void AsyncStorage.setItem(STORED_LOCATION_KEY, JSON.stringify({ ...next, savedAt: Date.now() }));
      return next;
    } catch {
      setLocationStatus("error");
      setStatus("Could not read your location. Please try again.");
      return null;
    }
  }

  async function getDeviceLocation(requiredMessage?: string) {
    if (deviceLocation) return deviceLocation;
    return requestDeviceLocation(requiredMessage);
  }

  function confirmDistanceWarning(message: string) {
    return new Promise<boolean>((resolve) => {
      Alert.alert("This quest is far away", message, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ]);
    });
  }

  async function confirmQuestDistance(quest: QuestPreview | QuestDetail, action: "join" | "create") {
    const loc = await getDeviceLocation(action === "join" ? "Location access is required to request or join this quest." : "Location access is required to create an in-person quest.");
    if (!loc) return false;
    const coords = action === "create"
      ? await fetchQuestCoordinates(draftExactAddress || quest.city || "")
      : await getQuestCoordinates(quest);
    if (!coords) {
      if (action === "create") setStatus("Location enabled. We could not estimate distance for this address.");
      return true;
    }
    const miles = haversineMiles(loc.lat, loc.lon, coords.lat, coords.lon);
    if (!Number.isFinite(miles) || miles < FAR_AWAY_WARNING_MILES) return true;
    return confirmDistanceWarning(
      action === "join"
        ? `This quest looks about ${distanceLabelMiles(miles)}. Join anyway?`
        : `This listing looks about ${distanceLabelMiles(miles)} from you. Post it anyway?`
    );
  }

  async function createQuest() {
    if (!supabase || !userId) return;
    if (optimizingMedia) {
      setStatus("Wait for video optimization to finish.");
      return;
    }
    const typedCategory = resolveCanonicalCategory(categoryInput) || categoryInput.trim();
    const parsedCustomGroupSize = Number.parseInt(groupSizeCustom || draftGroupSize, 10);
    const selectedGroupSize = groupSizeChoice === "custom" ? parsedCustomGroupSize : Number.parseInt(draftGroupSize, 10);
    if (!draftTitle.trim() || !typedCategory) {
      setStatus("Title and category are required.");
      return;
    }
    if (locationMode === "in_person" && !selectedCountrySuggestion) {
      setStatus("Choose a country first.");
      return;
    }
    if (!draftExactAddress.trim()) {
      setStatus(locationMode === "remote" ? "Meeting link is required." : "Meetup address is required.");
      return;
    }
    if (locationMode === "in_person" && (!selectedLocationSuggestion || normalizeQuestLocationQuery(selectedLocationSuggestion) !== normalizeQuestLocationQuery(draftExactAddress))) {
      setStatus("Please choose a location suggestion from the list.");
      return;
    }
    if (availabilityMode === "specific_time" && !startAt.trim()) {
      setStatus("Pick a specific start time.");
      return;
    }
    if (isRecurring && !recurringStartDate.trim()) {
      setStatus("Pick a recurring start date.");
      return;
    }
    if (!Number.isFinite(selectedGroupSize) || selectedGroupSize <= 0) {
      setStatus("Group size is required.");
      return;
    }

    let finalHobbyId = draftHobbyId;
    if (!finalHobbyId && typedCategory) {
      const existingHobby = hobbies.find((hobby) => hobby.name.trim().toLowerCase() === typedCategory.toLowerCase());
      if (existingHobby?.id) {
        finalHobbyId = existingHobby.id;
      } else {
        const { data: existing } = await supabase.from("hobbies").select("id,name").ilike("name", typedCategory).limit(1).maybeSingle();
        if (existing?.id) {
          finalHobbyId = existing.id;
        } else {
          const { data: created, error: hobbyErr } = await supabase
            .from("hobbies")
            .insert({ slug: slugify(typedCategory), name: typedCategory, category: typedCategory })
            .select("id")
            .single();
          if (hobbyErr) {
            setStatus(`Could not create category "${typedCategory}": ${hobbyErr.message}`);
            return;
          }
          if (created?.id) finalHobbyId = created.id;
        }
      }
    }
    if (!finalHobbyId) {
      setStatus("Category is required. Please select or enter one again.");
      return;
    }

    const derivedCity = locationMode === "remote" ? "Virtual" : deriveCityFromLocation(draftExactAddress) || draftExactAddress.split(",")[0]?.trim() || "";
    const availabilityParts = [
      availabilityMode === "specific_time" ? `Start at: ${new Date(startAt).toLocaleString()}` : "Let's find the best time",
      isRecurring ? `Recurring ${recurringFrequency} from ${recurringStartDate}` : null,
    ].filter(Boolean);
    const availabilityText = availabilityParts.join(" · ");

    setCreatingQuest(true);
    try {
      if (locationMode === "in_person") {
        setStatus("Checking distance...");
        const canCreate = await confirmQuestDistance({
          id: "draft",
          title: draftTitle.trim(),
          city: derivedCity || draftExactAddress.trim(),
          availability: availabilityText,
          skill_level: skillLevel,
          exact_address: draftExactAddress.trim(),
        }, "create");
        if (!canCreate) {
          setCreatingQuest(false);
          setStatus("Quest was not posted.");
          return;
        }
      }
      let mediaItems: Array<{ url: string; type: "image" | "video"; label?: string | null; thumbnailUrl?: string | null }> = [];
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
            }];
          }
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not upload quest image.");
          return;
        } finally {
          setUploadingMedia(false);
        }
      }
      setStatus("Creating quest...");
      const { data, error } = await supabase
        .from("quests")
        .insert({
          creator_id: userId,
          title: draftTitle.trim(),
          description: draftDescription.trim() || null,
          city: derivedCity || null,
          availability: availabilityText,
          ...(skillLevel && skillLevel !== "any" ? { skill_level: skillLevel } : {}),
          group_size: selectedGroupSize,
          hobby_id: finalHobbyId,
          join_mode: draftJoinMode,
          exact_location_visibility: draftLocationVisibility,
          exact_address: draftExactAddress.trim() || null,
          media_items: mediaItems,
          media_source: mediaItems.length ? "upload" : null,
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
      resetQuestDrafts();
      setStatus("Quest created.");
      await refreshAll();
      setActiveTab("home");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create quest.");
    } finally {
      setCreatingQuest(false);
    }
  }

  function resetQuestDrafts() {
    setDraftTitle("");
    setDraftDescription("");
    setDraftAvailability("");
    setDraftExactAddress("");
    setLocationSuggestions([]);
    setCategoryInput("");
    setCategoryIsCustom(false);
    setDraftHobbyId("");
    setAvailabilityMode("find_best_time");
    setStartAt("");
    setIsRecurring(false);
    setRecurringFrequency("weekly");
    setRecurringStartDate("");
    setShowRecurringStartDatePicker(false);
    setDraftCountryQuery("");
    setCountrySuggestions([]);
    setSelectedCountrySuggestion(null);
    setSelectedCountryCode(null);
    setSelectedLocationSuggestion(null);
    setSkillLevel("any");
    setGroupSizeChoice("any");
    setGroupSizeCustom("");
    setDraftJoinMode("approval_required");
    setDraftLocationVisibility("private");
    setDraftGroupSize("4");
    setDraftMedia(null);
    setShowAdvancedSettings(false);
  }

  async function uploadQuestImage(file: { uri: string; mimeType: string; fileName: string }) {
    if (!supabase || !userId) throw new Error("Not signed in.");
    if (!file.mimeType.startsWith("image/")) throw new Error("Please choose an image file.");

    const ext = getFileExtension(file.fileName, "jpg");
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await uploadLocalFileToStorage({
      bucket: "quest-media",
      path,
      uri: file.uri,
      mimeType: file.mimeType || "image/jpeg",
    });
    const { data } = supabase.storage.from("quest-media").getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadQuestVideo(file: DraftMedia) {
    if (!supabase || !userId) throw new Error("Not signed in.");
    if (!file.mimeType.startsWith("video/")) throw new Error("Please choose a video file.");
    if (typeof file.duration !== "number") throw new Error("Could not verify this video's length. Please choose it again.");
    if (file.duration > VIDEO_MAX_DURATION_SECONDS + 0.2) {
      throw new Error(`Video must be ${VIDEO_MAX_DURATION_SECONDS} seconds or less.`);
    }
    if (typeof file.fileSize === "number" && file.fileSize > VIDEO_MAX_SIZE_BYTES) {
      throw new Error("Video must be under 60MB.");
    }
    const ext = getFileExtension(file.fileName, "mp4");
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await uploadLocalFileToStorage({
      bucket: "quest-videos",
      path,
      uri: file.uri,
      mimeType: file.mimeType || "video/mp4",
    });
    const { data } = supabase.storage.from("quest-videos").getPublicUrl(path);
    return data.publicUrl;
  }

  async function pickQuestMedia() {
    if (uploadingMedia || optimizingMedia) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatus("Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      videoMaxDuration: VIDEO_MAX_DURATION_SECONDS,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const pickedType = asset.type === "video" || (asset.mimeType || "").startsWith("video/") ? "video" : "image";
    const nextVideoDuration = pickedType === "video" && typeof asset.duration === "number"
      ? asset.duration / 1000
      : 0;
    if (pickedType === "video" && !nextVideoDuration) {
      setStatus("Could not verify this video's length. Please choose it again.");
      return;
    }
    if (pickedType === "video" && nextVideoDuration > VIDEO_MAX_DURATION_SECONDS + 0.2) {
      setStatus(`Video must be trimmed to ${VIDEO_MAX_DURATION_SECONDS} seconds or less.`);
      Alert.alert(
        "Video is too long",
        `Choose the video again and use the yellow trim handles to select a clip up to ${VIDEO_MAX_DURATION_SECONDS} seconds.`,
      );
      return;
    }
    let selectedMedia: DraftMedia = {
      uri: asset.uri,
      mimeType: asset.mimeType || (pickedType === "video" ? "video/mp4" : "image/jpeg"),
      fileName: asset.fileName || (pickedType === "video" ? "quest-video.mp4" : "quest-image.jpg"),
      type: pickedType,
      duration: nextVideoDuration || undefined,
      fileSize: asset.fileSize || undefined,
    };

    if (pickedType === "video" && videoCompressor) {
      setOptimizingMedia(true);
      setStatus("Optimizing video without visible quality loss...");
      try {
        const optimized = await videoCompressor.compress(asset.uri);
        selectedMedia = {
          ...selectedMedia,
          uri: optimized.uri,
          mimeType: optimized.mimeType,
          fileName: optimized.fileName,
          fileSize: optimized.fileSize,
        };
        setStatus(optimized.compressed ? "Video optimized and ready to preview." : "Video is already optimized and ready to preview.");
      } catch (error) {
        console.warn("video optimization failed", error instanceof Error ? error.message : String(error));
        setStatus("Video is ready to preview. The original file will be used.");
      } finally {
        setOptimizingMedia(false);
      }
    } else {
      setStatus(pickedType === "video" ? "Video trimmed and ready to preview." : "Image ready to preview.");
    }

    if (pickedType === "video" && typeof selectedMedia.fileSize === "number" && selectedMedia.fileSize > VIDEO_MAX_SIZE_BYTES) {
      setStatus("This video is still over 60MB after optimization. Choose a different clip.");
      Alert.alert("Video is too large", "The optimized video is still over the 60MB upload limit.");
      return;
    }

    setDraftMedia(selectedMedia);
  }

  async function saveProfile() {
    if (!supabase || !userId) return;
    const client = supabase;
    const initial = settingsInitialSnapshot || {
      username: "",
      dob: "",
      countryCode: "US",
      city: "",
      region: "",
      bio: "",
      showLocation: false,
      friendsVisibility: "public" as const,
      usernameChangedAt: null,
    };
    const normalizedUsername = settingsUsername.trim().toLowerCase();
    const normalizedInitialUsername = (initial.username || "").trim().toLowerCase();
    const usernameChanged = normalizedUsername !== normalizedInitialUsername;
    const usernameError = normalizedUsername ? validateUsername(normalizedUsername).replace(/^Username/, "Name") : "Choose a name.";
    if (usernameError) {
      setStatus(usernameError);
      return;
    }
    if (usernameChanged && settingsUsernameAvailability === "taken") {
      setStatus("That name is already taken.");
      return;
    }
    if (usernameChanged && settingsUsernameAvailability === "checking") {
      setStatus("Wait for the availability check to finish.");
      return;
    }
    setSavingProfile(true);

    const usernameChangedAtMs = initial.usernameChangedAt ? new Date(initial.usernameChangedAt).getTime() : 0;
    const usernameCooldownActive =
      usernameChanged &&
      Number.isFinite(usernameChangedAtMs) &&
      usernameChangedAtMs > 0 &&
      Date.now() - usernameChangedAtMs < 24 * 60 * 60 * 1000;

    const changedFields = [
      initial.countryCode !== settingsCountryCode ? "country" : null,
      initial.city !== settingsCity ? "city" : null,
      initial.region !== settingsRegion ? "state/region" : null,
      initial.bio !== settingsBio ? "bio" : null,
      initial.showLocation !== settingsShowLocation ? "location visibility" : null,
      initial.friendsVisibility !== settingsFriendsVisibility ? "friends visibility" : null,
      usernameChanged ? "name" : null,
    ].filter(Boolean) as string[];

    const usernameBlocked = usernameChanged && usernameCooldownActive;
    const savedUsername = usernameBlocked ? normalizedInitialUsername : normalizedUsername;
    const profileUpdate = {
      id: userId,
      display_name: savedUsername,
      username: savedUsername,
      username_changed_at: usernameChanged && !usernameBlocked ? new Date().toISOString() : initial.usernameChangedAt || null,
      city: settingsCity.trim() || null,
      region: settingsRegion.trim() || null,
      country_code: settingsCountryCode || null,
      bio: settingsBio.trim() || null,
      show_location: settingsShowLocation,
      radius_km: settingsRadiusKm,
      friends_visibility: settingsFriendsVisibility,
      avatar_url: settingsAvatarUri || null,
      onboarding_done: true,
    };

    try {
      const { error } = await client.from("profiles").upsert(profileUpdate);
      if (error) {
        setStatus(usernameErrorMessage(error.message).replace(/username/gi, "name"));
        return;
      }

      const nextInitial = {
        username: savedUsername,
        dob: settingsDob.trim(),
        countryCode: settingsCountryCode || "US",
        city: settingsCity.trim() || "",
        region: settingsRegion.trim() || "",
        bio: settingsBio.trim() || "",
        showLocation: settingsShowLocation,
        friendsVisibility: settingsFriendsVisibility,
        usernameChangedAt: profileUpdate.username_changed_at,
      };
      setSettingsInitialSnapshot(nextInitial);
      setProfile((current) => current ? ({ ...current, display_name: savedUsername, username: savedUsername, username_changed_at: nextInitial.usernameChangedAt, city: settingsCity.trim() || null, region: settingsRegion.trim() || null, country_code: settingsCountryCode || null, bio: settingsBio.trim() || null, show_location: settingsShowLocation, radius_km: settingsRadiusKm, friends_visibility: settingsFriendsVisibility, avatar_url: settingsAvatarUri || null }) : current);
      setStatus(
        usernameBlocked
          ? `You can only change your name once every 24 hours.${changedFields.filter((field) => field !== "name").length ? ` Other changes saved: ${changedFields.filter((field) => field !== "name").join(", ")}.` : ""}`
          : `Profile saved${changedFields.length ? `: ${changedFields.join(", ")}.` : "."}`,
      );
      setSettingsUsername(savedUsername);
      await supabase.auth.updateUser({
        data: {
          full_name: savedUsername,
          name: savedUsername,
          username: savedUsername,
          dob: settingsDob.trim(),
          hide_city_on_bio: false,
          marketing_opt_in: settingsMarketingOptIn,
          city: settingsCity.trim(),
          region: settingsRegion.trim(),
          country_code: settingsCountryCode || "US",
          show_location: settingsShowLocation,
        },
      });
      await loadAuthedData(userId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function persistUserInterests(interestIds: string[]) {
    if (!supabase || !userId) throw new Error("Sign in to save your interests.");
    const uniqueIds = [...new Set(interestIds)];
    const { error: deleteError } = await supabase.from("user_hobbies").delete().eq("user_id", userId);
    if (deleteError) throw deleteError;
    if (!uniqueIds.length) return;
    const { error: insertError } = await supabase.from("user_hobbies").insert(
      uniqueIds.map((hobbyId, index) => ({
        user_id: userId,
        hobby_id: hobbyId,
        is_primary: index === 0,
      })),
    );
    if (insertError) throw insertError;
  }

  async function saveInterests() {
    if (!supabase || !userId) return;
    setSavingInterests(true);
    try {
      await persistUserInterests(onboardingInterestIds);
      setStatus("Interests saved. Your recommendations will adjust as new quests appear.");
      await loadAuthedData(userId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save interests.");
    } finally {
      setSavingInterests(false);
    }
  }

  async function saveOnboarding() {
    if (!supabase || !userId) return;
    setOnboardingSaving(true);
    try {
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        display_name: settingsUsername.trim().toLowerCase() || null,
        username: settingsUsername.trim().toLowerCase() || null,
        city: settingsCity.trim() || null,
        region: settingsRegion.trim() || null,
        country_code: settingsCountryCode || null,
        bio: settingsBio.trim() || null,
        show_location: settingsShowLocation,
        radius_km: settingsRadiusKm,
        friends_visibility: settingsFriendsVisibility,
        onboarding_done: true,
      });
      if (profileError) throw profileError;

      await persistUserInterests(onboardingInterestIds);

      await supabase.auth.updateUser({
        data: {
          full_name: settingsUsername.trim().toLowerCase(),
          name: settingsUsername.trim().toLowerCase(),
          username: settingsUsername.trim().toLowerCase(),
          dob: settingsDob.trim(),
          city: settingsCity.trim(),
          region: settingsRegion.trim(),
          country_code: settingsCountryCode || "US",
          show_location: settingsShowLocation,
          marketing_opt_in: settingsMarketingOptIn,
        },
      });

      setShowOnboardingWizard(false);
      setStatus("Onboarding saved ✅");
      await loadAuthedData(userId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save onboarding.");
    } finally {
      setOnboardingSaving(false);
    }
  }

  async function changeEmail() {
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ email: settingsNewEmail });
    setStatus(error ? error.message : "Email change requested ✅ Check both inboxes to confirm.");
  }

  async function changePassword() {
    if (!supabase || !email) return;
    if (!settingsOldPassword) return setStatus("Enter your current password.");
    if (settingsNewPassword.length < 8) return setStatus("Password must be at least 8 characters.");
    if (settingsNewPassword !== settingsConfirmPassword) return setStatus("Passwords do not match.");
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: settingsOldPassword });
    if (verifyError) return setStatus("Current password is incorrect.");
    const { error } = await supabase.auth.updateUser({ password: settingsNewPassword });
    if (error) return setStatus(error.message);
    setSettingsOldPassword("");
    setSettingsNewPassword("");
    setSettingsConfirmPassword("");
    setStatus("Password updated ✅");
  }

  function confirmTemporaryDeactivation() {
    if (accountActionLoading) return;
    Alert.alert(
      "Deactivate account?",
      "Your profile and hosted listings will be hidden, notifications will stop, and you will be signed out. Your data stays saved and you can restore the account the next time you sign in.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: () => void deactivateAccount() },
      ],
    );
  }

  async function deactivateAccount() {
    if (!supabase || !userId || accountActionLoading) return;
    setAccountActionLoading("deactivate");
    setStatus("");
    try {
      const { error } = await supabase.rpc("deactivate_my_account");
      if (error) throw error;
      await signOut();
      setStatus("Account deactivated. Sign in whenever you want to restore it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not deactivate the account.");
    } finally {
      setAccountActionLoading(null);
    }
  }

  async function restoreAccount() {
    if (!supabase || !userId || accountActionLoading) return;
    setAccountActionLoading("restore");
    setStatus("");
    try {
      const { error } = await supabase.rpc("reactivate_my_account");
      if (error) throw error;
      setAccountDeactivatedAt(null);
      pushTokenRegisteredForUserRef.current = null;
      await loadAuthedData(userId);
      setStatus("Account restored ✅");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not restore the account.");
    } finally {
      setAccountActionLoading(null);
    }
  }

  async function acceptCurrentEula() {
    if (!supabase || !userId || !eulaConsentChecked || eulaSaving) return;
    setEulaSaving(true);
    setStatus("");
    try {
      const { data: accepted, error } = await supabase.rpc("accept_current_eula", { accepted_version: CURRENT_EULA_VERSION });
      if (error) throw error;
      if (accepted !== true) throw new Error("Could not attach the EULA acceptance to your profile.");
      await supabase.auth.updateUser({
        data: { accepted_eula: true, eula_version: CURRENT_EULA_VERSION },
      });
      setEulaRequired(false);
      setEulaConsentChecked(false);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not record EULA acceptance.");
    } finally {
      setEulaSaving(false);
    }
  }

  async function permanentlyDeleteAccount() {
    if (!supabase || deleteAccountConfirmation !== "DELETE" || accountActionLoading) return;
    setAccountActionLoading("delete");
    setStatus("");
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Your session has expired. Sign in again and retry.");
      const response = await fetch(`${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/account-deletion`, {
        method: "POST",
        headers: {
          apikey: env.supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation: deleteAccountConfirmation }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not delete the account.");
      await signOut();
      setStatus("Your account was permanently deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete the account.");
    } finally {
      setAccountActionLoading(null);
    }
  }

  async function savePreferences() {
    if (!supabase) return;
    setSavingPreferences(true);
    await AsyncStorage.setItem("sidequest_theme_pref", settingsThemePref);
    if (settingsPublicLocationWarningEnabled) {
      await AsyncStorage.removeItem("sidequest_public_location_warning_muted_until");
    } else {
      await AsyncStorage.setItem("sidequest_public_location_warning_muted_until", String(Date.now() + 30 * 24 * 60 * 60 * 1000));
    }
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          marketing_opt_in: settingsMarketingOptIn,
          theme_pref: settingsThemePref,
          public_location_warning_enabled: settingsPublicLocationWarningEnabled,
        },
      });
      if (error) return setStatus(error.message);
      setStatus("Preferences saved ✅");
    } finally {
      setSavingPreferences(false);
    }
  }

  async function restartOnboarding() {
    if (!supabase || !userId) return;
    const { error } = await supabase.from("profiles").upsert({ id: userId, onboarding_done: false });
    if (error) return setStatus(error.message);
    setShowOnboardingWizard(true);
    setOnboardingStep(0);
    setStatus("Setup reopened. Your current choices are ready to edit.");
  }

  async function skipOnboarding() {
    if (!supabase || !userId) return;
    setOnboardingSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert({ id: userId, onboarding_done: true });
      if (error) throw error;
      setShowOnboardingWizard(false);
      setStatus("You can finish setup later in Settings.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not skip onboarding.");
    } finally {
      setOnboardingSaving(false);
    }
  }

  async function acceptFriendRequest(requesterId: string) {
    if (!supabase || !userId) return;
    const { error } = await supabase.from("friends").update({ status: "accepted" }).eq("requester_id", requesterId).eq("addressee_id", userId);
    if (error) return setStatus(error.message);
    setStatus("Friend request accepted ✅");
    await refreshAll();
  }

  async function declineFriendRequest(requesterId: string) {
    if (!supabase || !userId) return;
    const { error } = await supabase.from("friends").delete().eq("requester_id", requesterId).eq("addressee_id", userId);
    if (error) return setStatus(error.message);
    setStatus("Request declined.");
    await refreshAll();
  }

  async function cancelOutgoingFriendRequest(targetId: string) {
    if (!supabase || !userId) return;
    const { error } = await supabase.from("friends").delete().eq("requester_id", userId).eq("addressee_id", targetId).eq("status", "pending");
    if (error) return setStatus(error.message);
    setStatus("Friend request canceled.");
    await refreshAll();
  }

  async function addFriend(targetId: string) {
    if (!supabase || !userId || userId === targetId) return;
    const { data: reverse } = await supabase.from("friends").select("requester_id,addressee_id,status").eq("requester_id", targetId).eq("addressee_id", userId).maybeSingle();
    if ((reverse as { status?: string } | null)?.status === "pending") {
      const { error } = await supabase.from("friends").update({ status: "accepted" }).eq("requester_id", targetId).eq("addressee_id", userId);
      if (error) return setStatus(error.message);
      setStatus("Friend request accepted ✅");
    } else {
      const { error } = await supabase.from("friends").insert({ requester_id: userId, addressee_id: targetId, status: "pending" });
      if (error && !error.message.toLowerCase().includes("duplicate") && !error.message.toLowerCase().includes("unique")) return setStatus(error.message);
      setStatus("Friend request sent ✅");
    }
    await refreshAll();
  }

  async function blockProfile(targetId: string) {
    if (!supabase || !userId || userId === targetId) return;
    const { data: hostedQuests } = await supabase.from("quests").select("id").eq("creator_id", userId);
    const hostedQuestIds = ((hostedQuests || []) as Array<{ id: string }>).map((q) => q.id);
    await supabase.from("friends").delete().or(`and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId})`);
    const { error } = await supabase.from("friends").upsert({ requester_id: userId, addressee_id: targetId, status: "blocked" });
    if (error) return setStatus(error.message);
    if (hostedQuestIds.length) {
      await supabase.from("quest_members").delete().eq("user_id", targetId).in("quest_id", hostedQuestIds);
      await supabase.from("quest_exact_location_access").delete().eq("user_id", targetId).in("quest_id", hostedQuestIds);
    }
    setBlockedUserIds((current) => current.includes(targetId) ? current : [...current, targetId]);
    setQuests((current) => current.filter((quest) => quest.creator_id !== targetId));
    setSavedQuests((current) => current.filter((quest) => quest.creator_id !== targetId));
    setJoinedQuests((current) => current.filter((quest) => quest.creator_id !== targetId));
    setMessages((current) => current.filter((message) => message.sender_id !== targetId));
    setComments((current) => current.filter((comment) => comment.sender_id !== targetId));
    setNotifications((current) => current.filter((notification) => notification.source_user_id !== targetId));
    if (selectedQuest?.creator_id === targetId) setSelectedQuest(null);
    if (selectedProfile?.id === targetId) setSelectedProfile(null);
    setStatus("User blocked, removed from your feed, and reported to moderation.");
    await refreshAll();
  }

  async function unblockProfile(targetId: string) {
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("friends")
      .delete()
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId})`);
    if (error) return setStatus(error.message);
    setStatus("User unblocked.");
    await refreshAll();
  }

  async function submitProfileReport() {
    if (!supabase || !userId || !selectedProfile || selectedProfile.id === userId) return;
    setSubmittingProfileReport(true);
    try {
      const reportId = crypto.randomUUID();
      const { error } = await supabase.from("reports").insert({
        id: reportId,
        reporter_id: userId,
        reported_user_id: selectedProfile.id,
        context_type: "profile_account",
        reason_code: reportProfileReason,
        details: reportProfileDetails.trim() || null,
        severity: "normal",
        auto_flags: {
          report_target_type: "user",
          report_target_id: selectedProfile.id,
          report_target_key: `profile:${selectedProfile.id}`,
          report_target_label: selectedProfile.username ? `${selectedProfile.display_name || "User"} (@${selectedProfile.username})` : selectedProfile.display_name || selectedProfile.id,
          reported_user_name: selectedProfile.display_name || selectedProfile.id,
          reported_user_username: selectedProfile.username || null,
        },
      });
      if (error) {
        setStatus(error.message);
        return;
      }
      const notify = await fetch(`${env.siteUrl.replace(/\/$/, "")}/api/report-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId }),
      });
      if (!notify.ok) {
        const body = await notify.text().catch(() => "");
        setStatus(body || "Profile report saved, but email alert failed.");
        return;
      }
      setShowReportProfileModal(false);
      setReportProfileDetails("");
      setStatus("Profile report submitted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not submit profile report.");
    } finally {
      setSubmittingProfileReport(false);
    }
  }

  async function submitQuestReport() {
    if (!supabase || !userId || !reportQuestTarget) return;
    setSubmittingQuestReport(true);
    try {
      const creator = getRelationOne(reportQuestTarget.profiles) as { id?: string | null; display_name: string | null; username: string | null } | null;
      const reportId = crypto.randomUUID();
      const { error } = await supabase.from("reports").insert({
        id: reportId,
        reporter_id: userId,
        reported_user_id: creator?.id || reportQuestTarget.creator_id || null,
        quest_id: reportQuestTarget.id,
        context_type: reportQuestContext,
        reason_code: reportQuestReason,
        details: reportQuestDetails.trim() || null,
        severity: "normal",
        auto_flags: {
          reporter_name: profile?.display_name || profile?.username || "you",
          listing_title: reportQuestTarget.title || null,
          host_name: creator?.display_name || reportQuestTarget.creator_id || null,
          host_username: creator?.username || null,
          report_target_type: "listing",
          report_target_id: reportQuestTarget.id,
          report_target_key: `listing:${reportQuestTarget.id}`,
          report_target_label: reportQuestTarget.title || null,
        },
      });
      if (error) {
        setStatus(error.message);
        return;
      }
      const notify = await fetch(`${env.siteUrl.replace(/\/$/, "")}/api/report-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId }),
      });
      if (!notify.ok) {
        const body = await notify.text().catch(() => "");
        setStatus(body || "Listing report saved, but email alert failed.");
        return;
      }
      setShowReportQuestModal(false);
      setReportQuestTarget(null);
      setReportQuestDetails("");
      setStatus("Listing report submitted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not submit listing report.");
    } finally {
      setSubmittingQuestReport(false);
    }
  }

  function openQuestReportModal(quest: QuestPreview | QuestDetail) {
    setSelectedQuest(null);
    setQuestActionsTarget(null);
    setShowQuestActionsMenu(false);
    setReportQuestTarget(quest);
    setReportQuestContext("listing_content");
    setReportQuestReason("spam_scam");
    setReportQuestDetails("");
    setShowReportQuestModal(true);
  }

  function openQuestActionsMenu(quest: QuestPreview) {
    setQuestActionsTarget(quest);
    setShowQuestActionsMenu(true);
  }

  function closeQuestActionsMenu() {
    setShowQuestActionsMenu(false);
    setQuestActionsTarget(null);
  }

  async function deleteQuestListing(questId: string) {
    if (!supabase || !userId) {
      promptAuth("login");
      return;
    }

    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert("Delete listing", "Delete this listing? This cannot be undone.", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Delete", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
    if (!ok) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setStatus("Log in to delete this listing.");
      return;
    }

    const { data: quest, error: readError } = await supabase.from("quests").select("creator_id").eq("id", questId).maybeSingle();
    if (readError) {
      setStatus(readError.message);
      return;
    }
    if (!quest) {
      setStatus("Listing was already deleted.");
      return;
    }
    if (quest.creator_id !== userId) {
      setStatus("Only the listing creator can delete this listing.");
      return;
    }

    const response = await fetch(`${env.siteUrl.replace(/\/$/, "")}/api/quests/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quest_id: questId }),
    });
    const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !result?.ok) {
      setStatus(result?.error || "Listing was not deleted. Please try again.");
      return;
    }
    if (selectedQuest?.id === questId) {
      setSelectedQuest(null);
    }
    if (questActionsTarget?.id === questId) {
      closeQuestActionsMenu();
    }
    setStatus("Listing deleted.");
    await refreshAll();
  }

  async function removeFriend(friendId: string) {
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("friends")
      .delete()
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`);
    if (error) return setStatus(error.message);
    setStatus("Friend removed.");
    setSettingsBlockedRefreshTick((tick) => tick + 1);
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
      if (!asset.mimeType?.startsWith("image/") && asset.mimeType) throw new Error("Please choose an image file.");
      const fileName = asset.fileName || "profile-photo.jpg";
      const ext = getFileExtension(fileName, "jpg");
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      await uploadLocalFileToStorage({
        bucket: "profile-photos",
        path,
        uri: asset.uri,
        mimeType: asset.mimeType || "image/jpeg",
      });
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

  async function deleteProfilePhoto() {
    if (!supabase || !userId) return;
    setUploadingAvatar(true);
    try {
      const { error: profileError } = await supabase.from("profiles").upsert({ id: userId, avatar_url: null, avatar_source_url: null });
      if (profileError && !profileError.message.toLowerCase().includes("column")) {
        throw profileError;
      }
      const { error: metaError } = await supabase.auth.updateUser({ data: { avatar_url: null } });
      if (metaError) throw new Error(metaError.message);
      setSettingsAvatarUri("");
      setStatus("Profile photo removed.");
      await loadAuthedData(userId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete profile photo.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function promptAuth(mode: AuthMode = "login") {
    setAuthMode(mode);
    setAuthStep("email");
    setOtpCode("");
    setShowAuthModal(true);
  }

  const passwordChecks = useMemo(() => ({
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    match: password.length > 0 && password === confirmPassword,
  }), [confirmPassword, password]);

  useEffect(() => {
    void AsyncStorage.getItem("sidequest_last_inbox_seen_at").then((raw) => {
      if (raw) setLastInboxSeenAt(raw);
    });
    void AsyncStorage.getItem("sidequest_last_notifications_seen_at").then((raw) => {
      if (raw) setLastNotificationsSeenAt(raw);
    });
  }, []);

  const hasUnreadNotifications = useMemo(
    () => notifications.some((item) => !item.read_at),
    [notifications],
  );

  const unreadNotificationCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications],
  );

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    void Notifications.setBadgeCountAsync(unreadNotificationCount).catch((error) => {
      console.warn("setBadgeCountAsync failed", error instanceof Error ? error.message : String(error));
    });
  }, [unreadNotificationCount]);

  const unreadInboxMessageCount = useMemo(() => {
    if (!messages.length) return false;
    const latestSeenAt = lastInboxSeenAt ? +new Date(lastInboxSeenAt) : 0;
    return messages.filter((message) => {
      if (message.sender_id === userId) return false;
      return +new Date(message.created_at) > latestSeenAt;
    }).length;
  }, [lastInboxSeenAt, messages, userId]);

  const inboxThreads = useMemo(() => {
    const threadMap = new Map<string, {
      threadKey: string;
      quest: QuestPreview | null;
      questId: string | null;
      partnerId: string | null;
      partnerName: string;
      partnerAvatarUrl: string | null;
      lastMessage: MessageRow;
      messageCount: number;
    }>();
    messages.forEach((message) => {
      const quest = getRelationOne(message.quests) as QuestPreview | null;
      const questId = quest?.id || message.quest_id || null;
      if (!questId) return;
      const senderProfile = getRelationOne(message.profiles);
      const recipientId = getPrivateRecipientId(message.body);
      if (!recipientId) return;
      const partnerId = message.sender_id === userId ? recipientId : message.sender_id;
      if (!partnerId) return;
      const threadKey = `${questId}:${partnerId || "unknown"}`;
      const next = {
        threadKey,
        quest,
        questId,
        partnerId,
        partnerName: message.sender_id === userId
          ? "You"
          : (senderProfile?.display_name || senderProfile?.username || "Someone"),
        partnerAvatarUrl: senderProfile?.avatar_url || null,
        lastMessage: message,
        messageCount: 1,
      };
      const existing = threadMap.get(threadKey);
      if (!existing || +new Date(message.created_at) > +new Date(existing.lastMessage.created_at)) {
        threadMap.set(threadKey, {
          ...next,
          messageCount: existing ? existing.messageCount + 1 : 1,
        });
      } else {
        existing.messageCount += 1;
      }
    });
    return Array.from(threadMap.values()).sort((a, b) => +new Date(b.lastMessage.created_at) - +new Date(a.lastMessage.created_at));
  }, [messages, userId]);

  async function markInboxSeen() {
    const stamp = new Date().toISOString();
    setLastInboxSeenAt(stamp);
    await AsyncStorage.setItem("sidequest_last_inbox_seen_at", stamp);
  }

  async function markNotificationsSeen() {
    if (!supabase || !userId) return;
    const stamp = new Date().toISOString();
    setLastNotificationsSeenAt(stamp);
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: stamp })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) {
      console.warn("markNotificationsSeen failed", error.message);
    }
    if (Platform.OS === "ios") {
      void Notifications.setBadgeCountAsync(0).catch((badgeError) => {
        console.warn("clear badge failed", badgeError instanceof Error ? badgeError.message : String(badgeError));
      });
    }
    await AsyncStorage.setItem("sidequest_last_notifications_seen_at", stamp);
  }

  function openAuthedTab(tab: TabKey) {
    const config = tabs.find((item) => item.key === tab);
    if (config?.auth && !signedIn) {
      promptAuth("login");
      return;
    }
    setActiveTab(tab);
    if (tab === "inbox") {
      void markInboxSeen();
      if (signedIn && userId) void loadAuthedData(userId);
    }
    if (tab === "notifications") {
      void markNotificationsSeen();
      if (signedIn && userId) void loadAuthedData(userId);
    }
  }

  function formatDateValue(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function renderAuthCard() {
    const authBusy = Boolean(authActionLoading);
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
          autoComplete="username"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={(value) => {
            setEmail(value);
            if (authStep === "code") setAuthStep("email");
          }}
          placeholder="Email"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          textContentType="username"
          value={email}
        />
        {authBusy ? (
          <View style={styles.authLoadingRow}>
            <ActivityIndicator size="small" color="#6daec2" />
            <Text style={styles.authLoadingText}>{authActionLoading}</Text>
          </View>
        ) : null}
        {authStep === "email" && authMode === "login" ? (
          <>
            <TextInput
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              autoComplete="current-password"
              secureTextEntry
              style={styles.input}
              textContentType="password"
              value={password}
            />
            <Pressable style={styles.primaryButton} onPress={passwordAuth} disabled={authBusy}>
              <Text style={styles.primaryButtonText}>Log in</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void sendEmailCode()} disabled={authBusy}>
              <Text style={styles.secondaryButtonText}>Use email code</Text>
            </Pressable>
          </>
        ) : authStep === "email" && authMode === "signup" ? (
          <>
            <Text style={styles.sectionLabel}>Full name</Text>
            <TextInput
              autoComplete="name"
              autoCapitalize="words"
              placeholder="Your name"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              textContentType="name"
              value={fullName}
              onChangeText={setFullName}
            />
            <Text style={styles.sectionLabel}>Date of birth (DOB)</Text>
            <Pressable style={styles.dropdownField} onPress={() => setShowAuthDobPicker(true)}>
              <Text style={[styles.dropdownValue, !dob.trim() && styles.dropdownPlaceholder]} numberOfLines={1}>
                {dob.trim() || "MM/DD/YYYY"}
              </Text>
              <Ionicons name="calendar-outline" size={18} color="#64748b" />
            </Pressable>
            {showAuthDobPicker ? (
              <View style={styles.pickerModalOverlay}>
                <View style={styles.pickerModalCard}>
                  <View style={styles.row}>
                    <Text style={styles.questCategory}>Choose date of birth</Text>
                    <Pressable onPress={() => setShowAuthDobPicker(false)}>
                      <Text style={styles.link}>Close</Text>
                    </Pressable>
                  </View>
                  <View style={styles.pickerModalBody}>
                    <DateTimePicker
                      value={dob ? new Date(dob) : new Date()}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_, selectedDate) => {
                        if (selectedDate) setDob(formatDateValue(selectedDate));
                        if (Platform.OS !== "ios") setShowAuthDobPicker(false);
                      }}
                      style={styles.inlineDobPicker}
                    />
                  </View>
                  <View style={styles.createActionsRow}>
                    <Pressable style={styles.secondaryButton} onPress={() => setShowAuthDobPicker(false)}>
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.primaryButton} onPress={() => setShowAuthDobPicker(false)}>
                      <Text style={styles.primaryButtonText}>Done</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}
            <Text style={styles.dropdownHelper}>Use your birthday (MM/DD/YYYY).</Text>
            <Text style={styles.sectionLabel}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#94a3b8"
                autoComplete="new-password"
                secureTextEntry={!showPassword}
                style={styles.inputFlex}
                textContentType="newPassword"
                value={password}
              />
              <Pressable style={styles.passwordToggleButton} onPress={() => setShowPassword((current) => !current)}>
                <Text style={styles.passwordToggleText}>{showPassword ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
            <Text style={styles.sectionLabel}>Confirm password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor="#94a3b8"
                autoComplete="new-password"
                secureTextEntry={!showConfirmPassword}
                style={styles.inputFlex}
                textContentType="newPassword"
                value={confirmPassword}
              />
              <Pressable style={styles.passwordToggleButton} onPress={() => setShowConfirmPassword((current) => !current)}>
                <Text style={styles.passwordToggleText}>{showConfirmPassword ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
            <View style={styles.passwordChecklist}>
              <Text style={styles.passwordChecklistText}>{passwordChecks.minLength ? "✅" : "⬜"} 8+ characters</Text>
              <Text style={styles.passwordChecklistText}>{passwordChecks.uppercase ? "✅" : "⬜"} uppercase</Text>
              <Text style={styles.passwordChecklistText}>{passwordChecks.lowercase ? "✅" : "⬜"} lowercase</Text>
              <Text style={styles.passwordChecklistText}>{passwordChecks.number ? "✅" : "⬜"} number</Text>
              <Text style={styles.passwordChecklistText}>{passwordChecks.special ? "✅" : "⬜"} special</Text>
              <Text style={styles.passwordChecklistText}>{passwordChecks.match ? "✅" : "⬜"} passwords match</Text>
            </View>
            <View style={styles.checkboxRow}>
              <Pressable style={styles.checkboxTouch} onPress={() => setAcceptTerms((current) => !current)}>
                <View style={[styles.checkbox, acceptTerms && styles.checkboxChecked]}>
                  {acceptTerms ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text style={styles.checkboxLabel}>I accept the EULA and zero-tolerance safety policy.</Text>
              </Pressable>
            </View>
            <Pressable style={styles.legalLinkButton} onPress={() => void Linking.openURL(`${env.siteUrl.replace(/\/$/, "")}/terms`)}>
              <Ionicons name="document-text-outline" size={16} color="#9bc8d2" />
              <Text style={styles.legalLinkText}>Read the QuestHat EULA</Text>
            </Pressable>
            <View style={styles.checkboxRow}>
              <Pressable style={styles.checkboxTouch} onPress={() => setMarketingOptIn((current) => !current)}>
                <View style={[styles.checkbox, marketingOptIn && styles.checkboxChecked]}>
                  {marketingOptIn ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text style={styles.checkboxLabel}>Send me updates/promos (optional).</Text>
              </Pressable>
            </View>
            <View style={styles.checkboxRow}>
              <Pressable style={styles.checkboxTouch} onPress={() => setHideCityOnBio((current) => !current)}>
                <View style={[styles.checkbox, hideCityOnBio && styles.checkboxChecked]}>
                  {hideCityOnBio ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text style={styles.checkboxLabel}>Hide city on bio</Text>
              </Pressable>
            </View>
            <Pressable style={styles.secondaryButton} onPress={() => setShowAuthModal(false)} disabled={authBusy}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
            <Pressable style={styles.tertiaryButton} onPress={() => setAuthMode("login")} disabled={authBusy}>
              <Text style={styles.tertiaryButtonText}>Already have an account?</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={passwordAuth} disabled={authBusy}>
              <Text style={styles.primaryButtonText}>{authBusy && authActionLoading === "Creating account..." ? "Creating..." : "Create account"}</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void sendEmailCode()} disabled={authBusy}>
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
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={otpCode}
            />
            <Pressable style={styles.primaryButton} onPress={() => void verifyEmailCode()} disabled={authBusy}>
              <Text style={styles.primaryButtonText}>{authBusy && authActionLoading === "Verifying code..." ? "Verifying..." : "Verify code"}</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void sendEmailCode()} disabled={authBusy}>
              <Text style={styles.secondaryButtonText}>Resend code</Text>
            </Pressable>
            <Pressable style={styles.tertiaryButton} onPress={() => setAuthStep("email")} disabled={authBusy}>
              <Text style={styles.tertiaryButtonText}>Back to email</Text>
            </Pressable>
          </>
        )}
        <View style={styles.oauthGrid}>
          <Pressable style={styles.oauthButton} onPress={() => void socialLogin("apple")} disabled={authBusy}>
            <Ionicons name="logo-apple" size={18} color="#0f172a" />
            <Text style={styles.oauthText}>Apple</Text>
          </Pressable>
          <Pressable style={styles.oauthButton} onPress={() => void socialLogin("google")} disabled={authBusy}>
            <Ionicons name="logo-google" size={18} color="#0f172a" />
            <Text style={styles.oauthText}>Google</Text>
          </Pressable>
          <Pressable style={styles.oauthButton} onPress={() => void socialLogin("facebook")} disabled={authBusy}>
            <Ionicons name="logo-facebook" size={18} color="#0f172a" />
            <Text style={styles.oauthText}>Facebook</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderAuthModal() {
    if (!showAuthModal || signedIn) return null;
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setShowAuthModal(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalBackdropPressable} onPress={() => setShowAuthModal(false)} />
          <View style={[styles.modalSheet, styles.modalSheetTall, { backgroundColor: shellSurface, borderColor: shellBorder }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.authModalTitle, { color: shellText }]}>Sign in required</Text>
                <Text style={[styles.authModalSubtitle, { color: shellMuted }]}>Log in or create an account to continue.</Text>
              </View>
              <Pressable onPress={() => setShowAuthModal(false)}>
                <Ionicons name="close" size={24} color={shellMuted} />
              </Pressable>
            </View>
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={styles.authModalScroll}
              contentContainerStyle={styles.authModalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {renderAuthCard()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  function renderPushPromptModal() {
    if (!showPushPromptModal || !signedIn) return null;
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setShowPushPromptModal(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalBackdropPressable} onPress={() => setShowPushPromptModal(false)} />
          <View style={[styles.modalSheet, styles.pushPromptSheet, { backgroundColor: shellSurface, borderColor: shellBorder }]}>
            <View style={[styles.modalHeader, styles.pushPromptHeader]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.authModalTitle, { color: shellText }]}>Turn on notifications?</Text>
                <Text style={[styles.authModalSubtitle, { color: shellMuted }]}>
                  Get alerts for requests, messages, and quest updates.
                </Text>
              </View>
              <Pressable onPress={() => setShowPushPromptModal(false)}>
                <Ionicons name="close" size={24} color={shellMuted} />
              </Pressable>
            </View>
            <View style={styles.pushPromptBody}>
              <View style={styles.pushPromptIconWrap}>
                <Ionicons name="notifications" size={28} color={shellPrimary} />
              </View>
              <Text style={[styles.pushPromptCopy, { color: shellMuted }]}>
                You can change this anytime in Settings.
              </Text>
            </View>
            <View style={styles.pushPromptActions}>
              <Pressable
                style={[styles.secondaryButton, styles.pushPromptButton]}
                onPress={() => {
                  const stamp = Date.now();
                  const key = userId ? `${STORED_PUSH_PROMPT_DISMISSED_AT}:${userId}` : STORED_PUSH_PROMPT_DISMISSED_AT;
                  void AsyncStorage.setItem(key, String(stamp));
                  setPushPromptDismissedAt(stamp);
                  setShowPushPromptModal(false);
                }}
                disabled={pushPromptLoading}
              >
                <Text style={styles.secondaryButtonText}>Not now</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, styles.pushPromptButton]}
                onPress={() => {
                  if (!userId) return;
                  setPushPromptLoading(true);
                  void requestPushPermissionAndRegisterForUser(userId)
                    .then((token) => {
                      if (token) pushTokenRegisteredForUserRef.current = userId;
                    })
                    .catch((error) => {
                      console.warn("push permission request failed", error instanceof Error ? error.message : String(error));
                    })
                    .finally(() => {
                      setPushPromptLoading(false);
                      setShowPushPromptModal(false);
                    });
                }}
                disabled={pushPromptLoading}
              >
                <Text style={styles.primaryButtonText}>{pushPromptLoading ? "Waiting..." : "Continue"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  function renderQuestList(rows: QuestPreview[], empty: string) {
    if (!rows.length) return <EmptyState label={empty} />;
    return (
      <View style={styles.questList}>
        {rows.map((quest) => (
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
        ))}
      </View>
    );
  }

  function renderHomeDiscoveryHeader(categories: string[], resultCount: number) {
    const firstName = (profile?.display_name || profile?.username || "").trim().split(/\s+/)[0];
    const locationLabel = profile?.city || (deviceLocation ? "Near you" : "Choose your area");
    if (feedViewMode === "map") {
      return (
        <View style={styles.mapDiscovery}>
          <View style={styles.mapDiscoveryHeading}>
            <View style={styles.mapDiscoveryTitleBlock}>
              <Text style={[styles.mapDiscoveryEyebrow, { color: isLightTheme ? "#0f5f73" : "#79bfd0" }]}>EXPLORE NEARBY</Text>
              <Text style={[styles.mapDiscoveryTitle, { color: isLightTheme ? "#101827" : "#f8fafc" }]}>Find your next plan</Text>
            </View>
            <View style={[styles.mapDiscoveryLocation, { backgroundColor: isLightTheme ? "#e4f2f5" : "rgba(109,174,194,0.12)" }]}>
              <Ionicons name="navigate" size={13} color={isLightTheme ? "#0f5f73" : "#9bd8e4"} />
              <Text style={[styles.mapDiscoveryLocationText, { color: isLightTheme ? "#0f5f73" : "#9bd8e4" }]} numberOfLines={1}>{locationLabel}</Text>
            </View>
          </View>
          <View
            style={[
              styles.mapSearchShell,
              {
                backgroundColor: isLightTheme ? "#ffffff" : "#171923",
                borderColor: isLightTheme ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.08)",
              },
            ]}
          >
            <Ionicons name="search" size={19} color={isLightTheme ? "#64748b" : "#8e98a8"} />
            <TextInput
              value={homeSearchQuery}
              onChangeText={setHomeSearchQuery}
              placeholder="Search this area"
              placeholderTextColor={isLightTheme ? "#94a3b8" : "#778194"}
              style={[styles.homeSearchInput, { color: isLightTheme ? "#101827" : "#f8fafc" }]}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            <View style={[styles.mapSearchCount, { backgroundColor: isLightTheme ? "#edf6f7" : "rgba(109,174,194,0.1)" }]}>
              <Text style={[styles.mapSearchCountText, { color: isLightTheme ? "#0f5f73" : "#9bd8e4" }]}>{resultCount}</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.homeCategoryRail}>
            {categories.map((category) => {
              const active = homeCategoryFilter === category;
              return (
                <Pressable
                  key={category}
                  style={[
                    styles.homeCategoryChip,
                    {
                      backgroundColor: active ? "#0f5f73" : isLightTheme ? "#ffffff" : "#171923",
                      borderColor: active ? "#0f5f73" : isLightTheme ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.08)",
                    },
                  ]}
                  onPress={() => setHomeCategoryFilter(category)}
                >
                  <Ionicons name={category === "All" ? "compass-outline" : getCategoryIcon(category)} size={15} color={active ? "#ffffff" : "#6daec2"} />
                  <Text style={[styles.homeCategoryChipText, { color: active ? "#ffffff" : isLightTheme ? "#334155" : "#c7ced9" }]}>{category === "All" ? "All quests" : category}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      );
    }
    return (
      <View style={styles.homeDiscovery}>
        <LinearGradient colors={["#d9f1f4", "#a9d8e1", "#6daec2"]} style={styles.homeHero}>
          <View style={styles.homeHeroTop}>
            <View style={styles.homeLocalPill}>
              <Ionicons name="navigate" size={13} color="#0b5364" />
              <Text style={styles.homeLocalPillText} numberOfLines={1}>{locationLabel}</Text>
            </View>
            <View style={styles.homeLivePill}>
              <View style={styles.homeLiveDot} />
              <Text style={styles.homeLiveText}>{quests.length} live</Text>
            </View>
          </View>
          <Text style={styles.homeEyebrow}>{firstName ? `HEY ${firstName.toUpperCase()}` : "DISCOVER SOMETHING REAL"}</Text>
          <Text style={styles.homeHeroTitle}>What are you up for?</Text>
          <Text style={styles.homeHeroCopy}>Find a plan worth leaving the group chat for.</Text>
          <Pressable style={styles.homeCreateButton} onPress={() => openAuthedTab("create")}>
            <View style={styles.homeCreateIcon}><Ionicons name="add" size={20} color="#ffffff" /></View>
            <Text style={styles.homeCreateText}>Start your own quest</Text>
            <Ionicons name="arrow-forward" size={17} color="#082f3a" />
          </Pressable>
        </LinearGradient>

        <View
          style={[
            styles.homeSearchShell,
            {
              backgroundColor: isLightTheme ? "#ffffff" : "#171923",
              borderColor: isLightTheme ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.08)",
            },
          ]}
        >
          <Ionicons name="search" size={19} color={isLightTheme ? "#64748b" : "#8e98a8"} />
          <TextInput
            value={homeSearchQuery}
            onChangeText={setHomeSearchQuery}
            placeholder="Search plans, places, or interests"
            placeholderTextColor={isLightTheme ? "#94a3b8" : "#778194"}
            style={[styles.homeSearchInput, { color: isLightTheme ? "#101827" : "#f8fafc" }]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {homeSearchQuery && Platform.OS !== "ios" ? (
            <Pressable hitSlop={10} onPress={() => setHomeSearchQuery("")}>
              <Ionicons name="close-circle" size={19} color="#778194" />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.homeCategoryRail}>
          {categories.map((category) => {
            const active = homeCategoryFilter === category;
            return (
              <Pressable
                key={category}
                style={[
                  styles.homeCategoryChip,
                  {
                    backgroundColor: active ? "#0f5f73" : isLightTheme ? "#ffffff" : "#171923",
                    borderColor: active ? "#0f5f73" : isLightTheme ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.08)",
                  },
                ]}
                onPress={() => setHomeCategoryFilter(category)}
              >
                {category === "All" ? <Ionicons name="sparkles-outline" size={15} color={active ? "#ffffff" : "#6daec2"} /> : null}
                <Text style={[styles.homeCategoryChipText, { color: active ? "#ffffff" : isLightTheme ? "#334155" : "#c7ced9" }]}>{category === "All" ? "For you" : category}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.homeSectionHeading}>
          <View>
            <Text style={[styles.homeSectionEyebrow, { color: isLightTheme ? "#0f5f73" : "#6daec2" }]}>
              {homeCategoryFilter === "All" ? "FRESH PICKS" : homeCategoryFilter.toUpperCase()}
            </Text>
            <Text style={[styles.homeSectionTitle, { color: isLightTheme ? "#101827" : "#f8fafc" }]}>
              {homeSearchQuery.trim() ? "Search results" : "Plans happening now"}
            </Text>
          </View>
          <View style={[styles.homeResultPill, { backgroundColor: isLightTheme ? "#e8f3f5" : "rgba(109,174,194,0.1)" }]}>
            <Text style={[styles.homeResultText, { color: isLightTheme ? "#0f5f73" : "#9bd8e4" }]}>{resultCount}</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderFeedCard(quest: QuestPreview) {
    const creator = getRelationOne(quest.profiles);
    const mediaItems = (quest.media_items || []).filter((item): item is QuestMediaItem => Boolean(item?.url));
    const fallbackVisual = getCategoryFallbackMedia(getCategory(quest));
    const fallbackImageUrl = `https://questhat.com${fallbackVisual.imagePath}`;
    const questCoords = questCoordsById[quest.id];
    const distanceLabel = deviceLocation && questCoords
      ? distanceLabelMiles(haversineMiles(deviceLocation.lat, deviceLocation.lon, questCoords.lat, questCoords.lon))
      : "Nearby";
    const isSaved = bookmarkedQuestIds.includes(quest.id);
    const membershipStatus = membershipStatusByQuest[quest.id] || null;
    const isJoined = joinedQuestIds.includes(quest.id);
    const isOwner = Boolean(userId && quest.creator_id === userId);
    const joinIcon: keyof typeof Ionicons.glyphMap = isOwner
      ? "sparkles"
      : membershipStatus === "pending"
        ? "close"
        : membershipStatus === "declined"
          ? "refresh"
          : isJoined
            ? "exit-outline"
            : "add";
    const joinLabel = isOwner
      ? "Hosting"
      : membershipStatus === "pending"
        ? "Cancel request"
        : isJoined
          ? "Leave quest"
          : membershipStatus === "declined"
            ? "Request again"
            : quest.join_mode === "open"
              ? "Join now"
              : "Request to join";
    const category = getCategory(quest);
    const hostName = creator?.display_name || creator?.username || "QuestHat host";
    const totalJoined = joinCountByQuestId[quest.id] || 0;
    const isJoinActionDisabled = isOwner;
    const joinButtonTone = membershipStatus === "pending"
      ? styles.feedJoinButtonPending
      : isJoined || isOwner
        ? styles.feedJoinButtonJoined
        : styles.feedJoinButtonReady;
    const joinButtonMuted = membershipStatus === "pending" || isJoined || isOwner;
    const joinButtonContentColor = membershipStatus === "pending"
      ? isLightTheme ? "#8a4b08" : "#fcd34d"
      : joinButtonMuted
        ? isLightTheme ? "#0f5f73" : "#dff7fb"
        : "#082f3a";

    return (
      <View
        key={quest.id}
        style={[
          styles.feedCard,
          {
            backgroundColor: isLightTheme ? "#ffffff" : "#12141d",
            borderColor: isLightTheme ? "rgba(15,23,42,0.09)" : "rgba(255,255,255,0.08)",
          },
        ]}
      >
        <View style={styles.feedMediaWrap}>
          <FeedMediaCarousel
            mediaItems={mediaItems}
            fallbackImageUrl={fallbackImageUrl}
            onPreviewImage={(item) => setPreviewMedia(item)}
          />
          <LinearGradient
            colors={["rgba(5,10,15,0.52)", "rgba(5,10,15,0.02)", "rgba(5,10,15,0.06)", "rgba(5,10,15,0.88)"]}
            locations={[0, 0.25, 0.52, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.feedTopOverlay} pointerEvents="box-none">
            <Pressable style={styles.feedCreatorPill} onPress={() => void openProfile(creator?.id)}>
              {creator?.avatar_url ? (
                <Image source={{ uri: creator.avatar_url }} style={styles.feedAvatar} />
              ) : (
                <View style={styles.feedAvatarFallback}>
                  <Ionicons name="person" size={14} color="#dff7fb" />
                </View>
              )}
              <Text style={styles.feedCreatorName} numberOfLines={1}>{hostName}</Text>
            </Pressable>
            <View style={styles.feedTopActions}>
              <View style={styles.feedDistancePill}>
                <Ionicons name={quest.city === "Virtual" ? "videocam-outline" : "location-outline"} size={13} color="#ffffff" />
                <Text style={styles.feedDistancePillText} numberOfLines={1}>{quest.city === "Virtual" ? "Virtual" : distanceLabel}</Text>
              </View>
              <Pressable hitSlop={10} style={styles.feedMoreButton} onPress={() => openQuestActionsMenu(quest)}>
                <Ionicons name="ellipsis-horizontal" size={18} color="#ffffff" />
              </Pressable>
            </View>
          </View>
          <View style={styles.feedBottomOverlay} pointerEvents="box-none">
            <View style={styles.feedCategoryPill}>
              <Text style={styles.feedCategory}>{category}</Text>
            </View>
            <Pressable hitSlop={10} onPress={() => void openQuestDetail(quest.id)}>
              <Text style={styles.feedTitle} numberOfLines={2}>{quest.title}</Text>
            </Pressable>
            <View style={styles.feedMetaRow}>
              <Ionicons name="calendar-outline" size={14} color="#d9e2e8" />
              <Text style={styles.feedMetaText} numberOfLines={1}>{quest.availability || "Time decided together"}</Text>
            </View>
          </View>
        </View>
        <View style={styles.feedContextRow}>
          <View style={styles.feedPlaceBlock}>
            <Text style={[styles.feedPlace, { color: isLightTheme ? "#172033" : "#f0f4f7" }]} numberOfLines={1}>{quest.city || "Location to be decided"}</Text>
            <Text style={[styles.feedGoing, { color: isLightTheme ? "#64748b" : "#8893a4" }]}>
              {totalJoined ? `${totalJoined} ${totalJoined === 1 ? "person" : "people"} going` : "Be the first to join"}
            </Text>
          </View>
          <Pressable
            style={[styles.feedJoinButton, joinButtonTone]}
            onPress={() => {
              if (!isJoinActionDisabled) void toggleJoinQuestMobile(quest);
            }}
            disabled={isJoinActionDisabled}
            accessibilityLabel={joinLabel}
          >
            <Ionicons name={joinIcon} size={17} color={joinButtonContentColor} />
            <Text style={[styles.feedJoinButtonText, { color: joinButtonContentColor }]} numberOfLines={1}>{joinLabel}</Text>
          </Pressable>
        </View>
        <View style={[styles.feedActionsRow, { borderTopColor: isLightTheme ? "rgba(15,23,42,0.07)" : "rgba(255,255,255,0.06)" }]}>
          <Pressable
            style={styles.feedActionButton}
            onPress={() => void openQuestConversation(quest, "public")}
            accessibilityLabel="Open comments"
          >
            <Ionicons name="chatbox-outline" size={20} color={isLightTheme ? "#344054" : "#d5dbe5"} />
            <Text style={[styles.feedActionText, { color: isLightTheme ? "#475569" : "#b7c0cd" }]}>{commentCountByQuestId[quest.id] || 0}</Text>
          </Pressable>
          <Pressable
            style={styles.feedActionButton}
            onPress={() => void openQuestConversation(quest, "private", quest.creator_id || null)}
            accessibilityLabel={`Message ${hostName}`}
          >
            <Ionicons name="mail-outline" size={20} color={isLightTheme ? "#344054" : "#d5dbe5"} />
            <Text style={[styles.feedActionText, { color: isLightTheme ? "#475569" : "#b7c0cd" }]}>Message</Text>
          </Pressable>
          <Pressable
            style={styles.feedActionButton}
            onPress={() => void shareQuest(quest)}
            accessibilityLabel="Share quest"
          >
            <Ionicons name="share-outline" size={21} color={isLightTheme ? "#344054" : "#d5dbe5"} />
            {shareCountByQuestId[quest.id] ? <Text style={[styles.feedActionText, { color: isLightTheme ? "#475569" : "#b7c0cd" }]}>{shareCountByQuestId[quest.id]}</Text> : null}
          </Pressable>
          <View style={styles.feedActionsSpacer} />
          <Pressable
            style={[styles.feedSaveButton, isSaved && styles.feedSaveButtonActive]}
            onPress={() => void toggleBookmark(quest)}
            accessibilityLabel={isSaved ? "Remove saved quest" : "Save quest"}
          >
            <Ionicons name={isSaved ? "star" : "star-outline"} size={19} color={isSaved ? "#082f3a" : isLightTheme ? "#344054" : "#d5dbe5"} />
          </Pressable>
        </View>
      </View>
    );
  }

  function renderMapView(rows: QuestPreview[] = quests) {
    const points: QuestMapPoint[] = rows
      .map((quest) => {
        const coords = questCoordsById[quest.id];
        if (!coords) return null;
        const distanceLabel = deviceLocation
          ? distanceLabelMiles(haversineMiles(deviceLocation.lat, deviceLocation.lon, coords.lat, coords.lon))
          : undefined;
        return { quest, coords, distanceLabel };
      })
      .filter((point): point is QuestMapPoint => Boolean(point));

    const sortedPoints = points.slice().sort((a, b) => {
      if (!deviceLocation) return a.quest.title.localeCompare(b.quest.title);
      const aMiles = haversineMiles(deviceLocation.lat, deviceLocation.lon, a.coords.lat, a.coords.lon);
      const bMiles = haversineMiles(deviceLocation.lat, deviceLocation.lon, b.coords.lat, b.coords.lon);
      return aMiles - bMiles;
    });
    const selectedPoint = sortedPoints.find((point) => point.quest.id === selectedMapQuestId) || sortedPoints[0] || null;
    const mapPoints = [
      ...points.map((point) => point.coords),
      ...(deviceLocation ? [deviceLocation] : []),
    ];
    const center = deviceLocation || (mapPoints.length
      ? {
          lat: mapPoints.reduce((sum, point) => sum + point.lat, 0) / mapPoints.length,
          lon: mapPoints.reduce((sum, point) => sum + point.lon, 0) / mapPoints.length,
        }
      : null);
    const localMapDelta = Math.max(0.12, Math.min(2.5, (settingsRadiusKm / 111) * 2.5));
    const latDelta = deviceLocation
      ? localMapDelta
      : mapPoints.length
        ? Math.max(0.08, (Math.max(...mapPoints.map((point) => point.lat)) - Math.min(...mapPoints.map((point) => point.lat))) * 1.8 || 0.12)
        : 0.12;
    const lonDelta = deviceLocation
      ? localMapDelta
      : mapPoints.length
        ? Math.max(0.08, (Math.max(...mapPoints.map((point) => point.lon)) - Math.min(...mapPoints.map((point) => point.lon))) * 1.8 || 0.12)
        : 0.12;

    if (!center || !points.length) {
      return (
        <View style={[styles.mapPlaceholderCard, { backgroundColor: isLightTheme ? "#ffffff" : "#151722", borderColor: shellBorder }]}>
          <LinearGradient colors={["#d9f1f4", "#8ec6d3"]} style={styles.mapPlaceholderIcon}>
            <Ionicons name="map-outline" size={28} color="#0b5364" />
          </LinearGradient>
          <Text style={[styles.mapPlaceholderTitle, { color: shellText }]}>Nothing mapped here yet</Text>
          <Text style={[styles.mapPlaceholderText, { color: shellMuted }]}>Try another category or clear your search to widen the map.</Text>
          <Pressable
            style={styles.mapPlaceholderAction}
            onPress={() => {
              setHomeSearchQuery("");
              setHomeCategoryFilter("All");
            }}
          >
            <Ionicons name="refresh" size={16} color="#082f3a" />
            <Text style={styles.mapPlaceholderActionText}>Reset map</Text>
          </Pressable>
        </View>
      );
    }

    function focusMapPoint(point: QuestMapPoint) {
      setSelectedMapQuestId(point.quest.id);
      homeMapRef.current?.animateToRegion({
        latitude: point.coords.lat,
        longitude: point.coords.lon,
        latitudeDelta: 0.045,
        longitudeDelta: 0.045,
      }, 320);
    }

    function fitAllMapPoints() {
      const coordinates = [
        ...points.map((point) => ({ latitude: point.coords.lat, longitude: point.coords.lon })),
        ...(deviceLocation ? [{ latitude: deviceLocation.lat, longitude: deviceLocation.lon }] : []),
      ];
      if (coordinates.length === 1) {
        homeMapRef.current?.animateToRegion({
          ...coordinates[0],
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }, 320);
        return;
      }
      homeMapRef.current?.fitToCoordinates(coordinates, {
        animated: true,
        edgePadding: { top: 80, right: 54, bottom: 220, left: 54 },
      });
    }

    const selectedQuest = selectedPoint?.quest || null;
    const selectedCategory = selectedQuest ? getCategory(selectedQuest) : "";
    const selectedCreator = selectedQuest ? getRelationOne(selectedQuest.profiles) : null;
    const selectedFallback = selectedQuest ? getCategoryFallbackMedia(selectedCategory) : null;
    const selectedMedia = selectedQuest?.media_items?.[0];
    const selectedMediaUrl = selectedMedia?.thumbnailUrl || selectedMedia?.url || (selectedFallback ? `https://questhat.com${selectedFallback.imagePath}` : null);
    const selectedMembership = selectedQuest ? membershipStatusByQuest[selectedQuest.id] || null : null;
    const selectedIsJoined = selectedQuest ? joinedQuestIds.includes(selectedQuest.id) : false;
    const selectedIsOwner = Boolean(selectedQuest && userId && selectedQuest.creator_id === userId);
    const selectedIsSaved = Boolean(selectedQuest && bookmarkedQuestIds.includes(selectedQuest.id));
    const selectedJoinLabel = selectedIsOwner
      ? "Hosting"
      : selectedMembership === "pending"
        ? "Cancel request"
        : selectedIsJoined
          ? "Leave"
          : selectedMembership === "declined"
            ? "Request again"
          : selectedQuest?.join_mode === "open"
            ? "Join"
            : "Request";

    return (
      <View style={styles.mapStack}>
        <View style={[styles.mapStage, { borderColor: isLightTheme ? "rgba(15,23,42,0.11)" : "rgba(255,255,255,0.08)" }]}>
          <MapView
            key={points.map((point) => point.quest.id).sort().join("|")}
            ref={homeMapRef}
            style={styles.nativeMap}
            initialRegion={{
              latitude: center.lat,
              longitude: center.lon,
              latitudeDelta: latDelta,
              longitudeDelta: lonDelta,
            }}
            userInterfaceStyle={isLightTheme ? "light" : "dark"}
            showsUserLocation={Boolean(deviceLocation)}
            showsMyLocationButton={false}
            showsCompass={false}
            mapPadding={{ top: 58, right: 12, bottom: 190, left: 12 }}
          >
            {points.map((point) => {
              const { quest, coords } = point;
              const isSelected = selectedPoint?.quest.id === quest.id;
              const category = getCategory(quest);
              return (
              <Marker
                key={quest.id}
                coordinate={{ latitude: coords.lat, longitude: coords.lon }}
                anchor={{ x: 0.5, y: 1 }}
                zIndex={isSelected ? 2 : 1}
                onPress={() => focusMapPoint(point)}
                tracksViewChanges={isSelected}
              >
                <View style={styles.mapMarkerShell}>
                  <View style={[styles.mapMarker, isSelected && styles.mapMarkerSelected]}>
                    <Ionicons name={getCategoryIcon(category)} size={isSelected ? 18 : 16} color={isSelected ? "#082f3a" : "#ffffff"} />
                  </View>
                  <View style={[styles.mapMarkerTip, isSelected && styles.mapMarkerTipSelected]} />
                </View>
              </Marker>
              );
            })}
          </MapView>
          <View style={styles.mapTopOverlay} pointerEvents="box-none">
            <View style={styles.mapActivityPill}>
              <View style={styles.mapActivityDot} />
              <Text style={styles.mapActivityText}>{points.length} {points.length === 1 ? "quest" : "quests"} mapped</Text>
            </View>
            <View style={styles.mapControlStack}>
              <Pressable style={styles.mapControlButton} onPress={fitAllMapPoints} accessibilityLabel="Show every quest">
                <Ionicons name="scan-outline" size={19} color="#102534" />
              </Pressable>
              <Pressable
                style={[styles.mapControlButton, deviceLocation && styles.mapControlButtonActive]}
                onPress={() => {
                  if (deviceLocation) {
                    homeMapRef.current?.animateToRegion({
                      latitude: deviceLocation.lat,
                      longitude: deviceLocation.lon,
                      latitudeDelta: 0.05,
                      longitudeDelta: 0.05,
                    }, 320);
                  } else {
                    void requestDeviceLocation("Turn on location to calculate exact distance from nearby quests.").then((location) => {
                      if (!location) return;
                      homeMapRef.current?.animateToRegion({
                        latitude: location.lat,
                        longitude: location.lon,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                      }, 320);
                    });
                  }
                }}
                accessibilityLabel={deviceLocation ? "Center on my location" : "Turn on my location"}
              >
                {locationStatus === "loading" ? <ActivityIndicator size="small" color="#0f5f73" /> : <Ionicons name="navigate" size={18} color={deviceLocation ? "#ffffff" : "#102534"} />}
              </Pressable>
            </View>
          </View>
          {!deviceLocation ? (
            <Pressable
              style={styles.mapLocationNudge}
              onPress={() => void requestDeviceLocation("Turn on location to calculate exact distance from nearby quests.")}
            >
              <Ionicons name="location-outline" size={15} color="#dff7fb" />
              <Text style={styles.mapLocationNudgeText}>Turn on distance</Text>
              <Ionicons name="chevron-forward" size={13} color="#9bd8e4" />
            </Pressable>
          ) : null}
          {selectedQuest && selectedPoint ? (
            <View style={styles.mapPreviewCard}>
              <Pressable style={styles.mapPreviewMain} onPress={() => void openQuestDetail(selectedQuest.id)}>
                {selectedMediaUrl ? (
                  <Image source={{ uri: selectedMediaUrl }} style={styles.mapPreviewImage} />
                ) : (
                  <View style={styles.mapPreviewImageFallback}><Ionicons name={getCategoryIcon(selectedCategory)} size={24} color="#9bd8e4" /></View>
                )}
                <View style={styles.mapPreviewCopy}>
                  <View style={styles.mapPreviewMetaRow}>
                    <Text style={styles.mapPreviewCategory} numberOfLines={1}>{selectedCategory}</Text>
                    <Text style={styles.mapPreviewDistance} numberOfLines={1}>{selectedPoint.distanceLabel || selectedQuest.city || "On the map"}</Text>
                  </View>
                  <Text style={styles.mapPreviewTitle} numberOfLines={2}>{selectedQuest.title}</Text>
                  <View style={styles.mapPreviewHostRow}>
                    <Ionicons name="person-circle-outline" size={14} color="#8493a5" />
                    <Text style={styles.mapPreviewHost} numberOfLines={1}>
                      {selectedCreator?.display_name || selectedCreator?.username || "QuestHat host"}
                    </Text>
                    <View style={styles.mapPreviewMetaDot} />
                    <Text style={styles.mapPreviewHost} numberOfLines={1}>{selectedQuest.availability || "Time together"}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#6daec2" />
              </Pressable>
              <View style={styles.mapPreviewActions}>
                <Pressable
                  style={[styles.mapPreviewSave, selectedIsSaved && styles.mapPreviewSaveActive]}
                  onPress={() => void toggleBookmark(selectedQuest)}
                  accessibilityLabel={selectedIsSaved ? "Remove saved quest" : "Save quest"}
                >
                  <Ionicons name={selectedIsSaved ? "star" : "star-outline"} size={18} color={selectedIsSaved ? "#082f3a" : "#d7dee8"} />
                </Pressable>
                <Pressable
                  style={[styles.mapPreviewJoin, (selectedMembership === "pending" || selectedIsJoined || selectedIsOwner) && styles.mapPreviewJoinMuted]}
                  onPress={() => {
                    if (!selectedIsOwner) void toggleJoinQuestMobile(selectedQuest);
                  }}
                  disabled={selectedIsOwner}
                >
                  <Ionicons name={selectedIsOwner ? "sparkles" : selectedIsJoined ? "exit-outline" : selectedMembership === "pending" ? "close" : "add"} size={17} color="#082f3a" />
                  <Text style={styles.mapPreviewJoinText}>{selectedJoinLabel}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
        <View style={styles.mapNearbyHeading}>
          <View>
            <Text style={[styles.mapNearbyEyebrow, { color: isLightTheme ? "#0f5f73" : "#79bfd0" }]}>QUICK LOOK</Text>
            <Text style={[styles.mapNearbyTitle, { color: shellText }]}>{deviceLocation ? "Closest to you" : "Quests on this map"}</Text>
          </View>
          <Text style={[styles.mapNearbyHint, { color: shellMuted }]}>Tap to locate</Text>
        </View>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mapQuestRail}
        >
          {sortedPoints.map((point) => {
            const { quest, distanceLabel } = point;
            const category = getCategory(quest);
            const media = quest.media_items?.[0];
            const fallback = getCategoryFallbackMedia(category);
            const imageUrl = media?.thumbnailUrl || media?.url || `https://questhat.com${fallback.imagePath}`;
            const active = selectedPoint?.quest.id === quest.id;
            return (
              <Pressable
                key={quest.id}
                style={[
                  styles.mapQuestTile,
                  {
                    backgroundColor: isLightTheme ? "#ffffff" : "#151722",
                    borderColor: active ? "#6daec2" : isLightTheme ? "rgba(15,23,42,0.09)" : "rgba(255,255,255,0.07)",
                  },
                  active && styles.mapQuestTileActive,
                ]}
                onPress={() => focusMapPoint(point)}
              >
                <Image source={{ uri: imageUrl }} style={styles.mapQuestTileImage} />
                <View style={styles.mapQuestTileCopy}>
                  <View style={styles.mapQuestTileMeta}>
                    <Ionicons name={getCategoryIcon(category)} size={13} color="#6daec2" />
                    <Text style={[styles.mapQuestTileCategory, { color: isLightTheme ? "#0f5f73" : "#9bd8e4" }]} numberOfLines={1}>{category}</Text>
                  </View>
                  <Text style={[styles.mapQuestTileTitle, { color: shellText }]} numberOfLines={2}>{quest.title}</Text>
                  <Text style={[styles.mapQuestTileDistance, { color: shellMuted }]} numberOfLines={1}>{distanceLabel || quest.city || "On the map"}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  function renderScreen() {
    if (authState === "loading") {
      return (
        <View style={[styles.centerPanel, styles.loadingShell, { backgroundColor: shellBackground }]}>
          <View style={[styles.loadingCard, { backgroundColor: shellSurface, borderColor: shellBorder }]}>
            <View style={[styles.loadingIconWrap, { backgroundColor: shellPrimary }]}>
              <Ionicons name="location-outline" size={26} color="#fff" />
            </View>
            <Text style={[styles.loadingTitle, { color: shellText }]}>{APP_NAME}</Text>
            <Text style={[styles.loadingSubtitle, { color: shellMuted }]}>Loading your feed and account…</Text>
            <ActivityIndicator size="small" color={shellPrimary} />
          </View>
        </View>
      );
    }

    if (!signedIn && activeTab !== "home") return renderAuthCard();

    if (activeTab === "home") {
      const categoryCounts = quests.reduce<Record<string, number>>((counts, quest) => {
        const category = getCategory(quest);
        counts[category] = (counts[category] || 0) + 1;
        return counts;
      }, {});
      const homeCategories = [
        "All",
        ...Object.entries(categoryCounts)
          .sort(([, countA], [, countB]) => countB - countA)
          .map(([category]) => category)
          .slice(0, 10),
      ];
      const normalizedHomeSearch = homeSearchQuery.trim().toLowerCase();
      const filteredHomeQuests = quests.filter((quest) => {
        const category = getCategory(quest);
        if (homeCategoryFilter !== "All" && category !== homeCategoryFilter) return false;
        if (!normalizedHomeSearch) return true;
        const searchable = [
          quest.title,
          quest.description,
          quest.city,
          quest.availability,
          category,
          getRelationOne(quest.profiles)?.display_name,
          getRelationOne(quest.profiles)?.username,
        ].filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(normalizedHomeSearch);
      });
      return (
        <>
          {!signedIn ? renderAuthCard() : null}
          {renderHomeDiscoveryHeader(homeCategories, filteredHomeQuests.length)}
          {feedViewMode === "map" ? (
            renderMapView(filteredHomeQuests)
          ) : filteredHomeQuests.length ? (
            <View style={styles.homeFeedStack}>
              {filteredHomeQuests.map((quest) => renderFeedCard(quest))}
            </View>
          ) : (
            <View style={[styles.homeEmptyCard, { backgroundColor: isLightTheme ? "#ffffff" : "#151722", borderColor: shellBorder }]}>
              <View style={styles.homeEmptyIcon}><Ionicons name="compass-outline" size={25} color="#0f5f73" /></View>
              <Text style={[styles.homeEmptyTitle, { color: shellText }]}>No quests match that yet</Text>
              <Text style={[styles.homeEmptyCopy, { color: shellMuted }]}>Try another category or start the first one yourself.</Text>
              <View style={styles.homeEmptyActions}>
                <Pressable
                  style={styles.homeClearButton}
                  onPress={() => {
                    setHomeSearchQuery("");
                    setHomeCategoryFilter("All");
                  }}
                >
                  <Text style={styles.homeClearButtonText}>Clear filters</Text>
                </Pressable>
                <Pressable style={styles.homeEmptyCreateButton} onPress={() => openAuthedTab("create")}>
                  <Ionicons name="add" size={17} color="#082f3a" />
                  <Text style={styles.homeEmptyCreateText}>Create one</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      );
    }

    if (activeTab === "create") {
      const titleSuggestions = getTitleSuggestionsByCategory(categoryInput || draftTitle || "");
      const normalizedDraftLocation = normalizeQuestLocationQuery(draftExactAddress);
      const locationReady = locationMode === "remote"
        ? Boolean(draftExactAddress.trim())
        : Boolean(
          selectedCountrySuggestion
          && selectedLocationSuggestion
          && normalizeQuestLocationQuery(selectedLocationSuggestion) === normalizedDraftLocation
        );
      const scheduleReady = availabilityMode === "find_best_time" || Boolean(startAt.trim());
      const recurrenceReady = !isRecurring || Boolean(recurringStartDate.trim());
      const parsedCreateGroupSize = Number.parseInt(groupSizeChoice === "custom" ? groupSizeCustom : draftGroupSize, 10);
      const groupSizeReady = Number.isFinite(parsedCreateGroupSize) && parsedCreateGroupSize > 0;
      const ideaReady = Boolean(categoryInput.trim() && draftTitle.trim());
      const canPublishQuest = ideaReady && locationReady && scheduleReady && recurrenceReady && groupSizeReady && !optimizingMedia && !uploadingMedia && !creatingQuest;
      const requiredStepsComplete = [ideaReady, scheduleReady && recurrenceReady, locationReady].filter(Boolean).length;
      const visibilityCopy = locationMode === "remote"
        ? {
            private: "Only you can reveal the meeting link.",
            approved_members: "Approved members see the meeting link.",
            public: "Anyone viewing the quest sees the link.",
          }
        : {
            private: "Only you can reveal the exact address.",
            approved_members: "Approved members see the exact address.",
            public: "Anyone viewing the quest sees the address.",
          };
      const renderCreateSectionHeader = (
        step: string,
        title: string,
        subtitle: string,
        icon: keyof typeof Ionicons.glyphMap,
        complete = false,
      ) => (
        <View style={styles.createSectionHeader}>
          <View style={[styles.createSectionIcon, complete && styles.createSectionIconComplete]}>
            <Ionicons name={complete ? "checkmark" : icon} size={18} color={complete ? "#052e2b" : "#9bd8e4"} />
          </View>
          <View style={styles.createSectionHeadingCopy}>
            <Text style={styles.createSectionStep}>{step}</Text>
            <Text style={styles.createSectionTitle}>{title}</Text>
            <Text style={styles.createSectionSubtitle}>{subtitle}</Text>
          </View>
        </View>
      );
      return (
        <>
          <View style={styles.createShell}>
            <LinearGradient colors={["#174655", "#102c37", "#11141d"]} style={styles.createHero}>
              <View style={styles.createHeroTop}>
                <View style={styles.createHeroMark}><Ionicons name="sparkles" size={20} color="#082f3a" /></View>
                <View style={styles.createProgressPill}>
                  <Text style={styles.createProgressText}>{requiredStepsComplete}/3 ready</Text>
                </View>
              </View>
              <Text style={styles.createHeroEyebrow}>NEW QUEST</Text>
              <Text style={styles.createHeroTitle}>Turn an idea into a real plan.</Text>
              <Text style={styles.createHeroCopy}>Give people enough detail to confidently say yes.</Text>
              <View style={styles.createProgressTrack}>
                <View style={[styles.createProgressFill, { width: `${(requiredStepsComplete / 3) * 100}%` }]} />
              </View>
            </LinearGradient>

            <View style={styles.createSectionCard}>
              {renderCreateSectionHeader("01", "What are you doing?", "A clear title gets the right people interested.", "bulb-outline", ideaReady)}
              <View style={styles.createFieldGroup}>
                <Text style={styles.createFieldLabel}>Category</Text>
                <Pressable style={styles.createSelectField} onPress={() => setShowCategoryPicker(true)}>
                  <View style={styles.createFieldLeading}><Ionicons name="grid-outline" size={17} color="#0f5f73" /></View>
                  <Text style={[styles.createSelectValue, !categoryInput.trim() && styles.dropdownPlaceholder]} numberOfLines={1}>
                    {categoryInput.trim() || "Choose a category"}
                  </Text>
                  <Ionicons name="chevron-down" size={17} color="#64748b" />
                </Pressable>
                {categoryIsCustom ? (
                  <TextInput placeholder="Name your category" placeholderTextColor="#94a3b8" style={styles.createInput} value={categoryInput} onChangeText={setCategoryInput} autoFocus />
                ) : null}
              </View>
              <View style={styles.createFieldGroup}>
                <View style={styles.createFieldLabelRow}>
                  <Text style={styles.createFieldLabel}>Quest title</Text>
                  <Text style={styles.createOptionalLabel}>{draftTitle.trim().length}/80</Text>
                </View>
                <TextInput
                  placeholder={pickTitleSuggestionByCategory(categoryInput || draftTitle || "")}
                  placeholderTextColor="#94a3b8"
                  style={styles.createInput}
                  value={draftTitle}
                  onChangeText={(value) => setDraftTitle(value.slice(0, 80))}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.createSuggestionRail}>
                  {titleSuggestions.map((suggestion) => (
                    <Pressable key={suggestion} style={[styles.createSuggestionChip, draftTitle === suggestion && styles.createSuggestionChipActive]} onPress={() => setDraftTitle(suggestion)}>
                      <Text style={[styles.createSuggestionText, draftTitle === suggestion && styles.createSuggestionTextActive]}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.createFieldGroup}>
                <View style={styles.createFieldLabelRow}>
                  <Text style={styles.createFieldLabel}>Description</Text>
                  <Text style={styles.createOptionalLabel}>Optional</Text>
                </View>
                <TextInput
                  multiline
                  placeholder="What should people know before joining?"
                  placeholderTextColor="#94a3b8"
                  style={[styles.createInput, styles.createTextArea]}
                  value={draftDescription}
                  onChangeText={setDraftDescription}
                />
              </View>
            </View>

            <View style={styles.createSectionCard}>
              {renderCreateSectionHeader("02", "When is it happening?", "Pick a time now or decide together after people join.", "calendar-outline", scheduleReady && recurrenceReady)}
              <View style={styles.createChoiceRow}>
                <Pressable style={[styles.createChoiceCard, availabilityMode === "find_best_time" && styles.createChoiceCardActive]} onPress={() => setAvailabilityMode("find_best_time")}>
                  <Ionicons name="people-outline" size={21} color={availabilityMode === "find_best_time" ? "#082f3a" : "#9bd8e4"} />
                  <Text style={[styles.createChoiceTitle, availabilityMode === "find_best_time" && styles.createChoiceTitleActive]}>Decide together</Text>
                  <Text style={[styles.createChoiceCopy, availabilityMode === "find_best_time" && styles.createChoiceCopyActive]}>Find the best time later</Text>
                </Pressable>
                <Pressable style={[styles.createChoiceCard, availabilityMode === "specific_time" && styles.createChoiceCardActive]} onPress={() => setAvailabilityMode("specific_time")}>
                  <Ionicons name="time-outline" size={21} color={availabilityMode === "specific_time" ? "#082f3a" : "#9bd8e4"} />
                  <Text style={[styles.createChoiceTitle, availabilityMode === "specific_time" && styles.createChoiceTitleActive]}>Set a time</Text>
                  <Text style={[styles.createChoiceCopy, availabilityMode === "specific_time" && styles.createChoiceCopyActive]}>Choose date and time</Text>
                </Pressable>
              </View>
              {availabilityMode === "specific_time" ? (
                <Pressable style={styles.createSelectField} onPress={() => setShowStartAtPicker(true)}>
                  <View style={styles.createFieldLeading}><Ionicons name="calendar-clear-outline" size={17} color="#0f5f73" /></View>
                  <Text style={[styles.createSelectValue, !startAt && styles.dropdownPlaceholder]} numberOfLines={1}>
                    {startAt ? new Date(startAt).toLocaleString() : "Choose date and time"}
                  </Text>
                  <Ionicons name="chevron-forward" size={17} color="#64748b" />
                </Pressable>
              ) : null}
              <View style={styles.createSwitchRow}>
                <View style={styles.createSwitchIcon}><Ionicons name="repeat-outline" size={19} color="#9bd8e4" /></View>
                <View style={styles.createSwitchCopy}>
                  <Text style={styles.createSwitchTitle}>Repeat this quest</Text>
                  <Text style={styles.createSwitchSubtitle}>Useful for weekly clubs and recurring sessions.</Text>
                </View>
                <Switch value={isRecurring} onValueChange={setIsRecurring} trackColor={{ false: "#343846", true: "#6daec2" }} thumbColor="#ffffff" />
              </View>
              {isRecurring ? (
                <View style={styles.createNestedCard}>
                  <View style={styles.createPillRow}>
                    {(["daily", "weekly", "monthly"] as const).map((frequency) => (
                      <Pressable key={frequency} style={[styles.createPill, recurringFrequency === frequency && styles.createPillActive]} onPress={() => setRecurringFrequency(frequency)}>
                        <Text style={[styles.createPillText, recurringFrequency === frequency && styles.createPillTextActive]}>{frequency[0].toUpperCase() + frequency.slice(1)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable style={styles.createSelectField} onPress={() => setShowRecurringStartDatePicker(true)}>
                    <View style={styles.createFieldLeading}><Ionicons name="flag-outline" size={17} color="#0f5f73" /></View>
                    <Text style={[styles.createSelectValue, !recurringStartDate && styles.dropdownPlaceholder]}>
                      {recurringStartDate ? `Starts ${new Date(`${recurringStartDate}T12:00:00`).toLocaleDateString()}` : "Choose first date"}
                    </Text>
                    <Ionicons name="chevron-forward" size={17} color="#64748b" />
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={styles.createSectionCard}>
              {renderCreateSectionHeader("03", "Where will you meet?", "Choose a verified place or add a virtual meeting link.", "location-outline", locationReady)}
              <View style={styles.createChoiceRow}>
                <Pressable style={[styles.createChoiceCard, locationMode === "in_person" && styles.createChoiceCardActive]} onPress={() => setLocationMode("in_person")}>
                  <Ionicons name="location-outline" size={21} color={locationMode === "in_person" ? "#082f3a" : "#9bd8e4"} />
                  <Text style={[styles.createChoiceTitle, locationMode === "in_person" && styles.createChoiceTitleActive]}>In person</Text>
                  <Text style={[styles.createChoiceCopy, locationMode === "in_person" && styles.createChoiceCopyActive]}>A real-world place</Text>
                </Pressable>
                <Pressable style={[styles.createChoiceCard, locationMode === "remote" && styles.createChoiceCardActive]} onPress={() => setLocationMode("remote")}>
                  <Ionicons name="videocam-outline" size={21} color={locationMode === "remote" ? "#082f3a" : "#9bd8e4"} />
                  <Text style={[styles.createChoiceTitle, locationMode === "remote" && styles.createChoiceTitleActive]}>Virtual</Text>
                  <Text style={[styles.createChoiceCopy, locationMode === "remote" && styles.createChoiceCopyActive]}>Meet online</Text>
                </Pressable>
              </View>
              {locationMode === "in_person" ? (
                <View style={styles.createFieldGroup}>
                  <Text style={styles.createFieldLabel}>Country or region</Text>
                  <View style={styles.createInputShell}>
                    <Ionicons name="globe-outline" size={18} color="#0f5f73" />
                    <TextInput
                      placeholder="Search countries"
                      placeholderTextColor="#94a3b8"
                      style={styles.createInputInline}
                      value={draftCountryQuery}
                      onChangeText={(text) => {
                        setDraftCountryQuery(text);
                        setSelectedCountrySuggestion(null);
                        setSelectedCountryCode(null);
                        setDraftExactAddress("");
                        setSelectedLocationSuggestion(null);
                      }}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                    {selectedCountrySuggestion ? <Ionicons name="checkmark-circle" size={19} color="#10b981" /> : null}
                  </View>
                  {countrySuggestions.length > 0 ? (
                    <View style={styles.locationSuggestionsMenu}>
                      {countrySuggestions.map((suggestion) => (
                        <Pressable
                          key={suggestion.label}
                          style={styles.locationSuggestionItem}
                          onPress={() => {
                            setDraftCountryQuery(suggestion.label);
                            setSelectedCountrySuggestion(suggestion.label);
                            setSelectedCountryCode(suggestion.code);
                            setCountrySuggestions([]);
                            setDraftExactAddress("");
                            setSelectedLocationSuggestion(null);
                          }}
                        >
                          <Text style={styles.locationSuggestionText}>{suggestion.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.createFieldGroup}>
                <Text style={styles.createFieldLabel}>{locationMode === "remote" ? "Meeting link" : "Business, address, or city"}</Text>
                <View style={[styles.createInputShell, locationMode === "in_person" && !selectedCountrySuggestion && styles.createInputShellDisabled]}>
                  <Ionicons name={locationMode === "remote" ? "link-outline" : "search-outline"} size={18} color="#0f5f73" />
                  <TextInput
                    placeholder={locationMode === "remote" ? "Paste a Meet, Zoom, or Teams link" : selectedCountrySuggestion ? "Search nearby places" : "Choose a country first"}
                    placeholderTextColor="#94a3b8"
                    style={styles.createInputInline}
                    value={draftExactAddress}
                    onChangeText={(text) => {
                      setDraftExactAddress(text);
                      setSelectedLocationSuggestion(null);
                    }}
                    autoCapitalize="none"
                    editable={locationMode === "remote" || Boolean(selectedCountrySuggestion)}
                    keyboardType={locationMode === "remote" ? "url" : "default"}
                  />
                  {locationReady ? <Ionicons name="checkmark-circle" size={19} color="#10b981" /> : null}
                </View>
                {locationMode === "in_person" && locationSuggestions.length > 0 ? (
                  <View style={styles.locationSuggestionsMenu}>
                    {locationSuggestions.map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        style={styles.locationSuggestionItem}
                        onPress={() => {
                          setDraftExactAddress(suggestion);
                          setSelectedLocationSuggestion(suggestion);
                          setLocationSuggestions([]);
                        }}
                      >
                        <Ionicons name="location-outline" size={16} color="#0f5f73" />
                        <Text style={styles.locationSuggestionText} numberOfLines={3}>{suggestion}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.createHelperText}>
                  {locationMode === "remote"
                    ? "The link is protected using the visibility setting below."
                    : selectedLocationSuggestion
                      ? "Verified location selected."
                      : "Select a result from the list so QuestHat can publish it."}
                </Text>
              </View>
              <View style={styles.createFieldGroup}>
                <Text style={styles.createFieldLabel}>{locationMode === "remote" ? "Who sees the link?" : "Who sees the exact address?"}</Text>
                <View style={styles.createVisibilityStack}>
                  {([
                    { key: "private", label: "Private", icon: "lock-closed-outline" },
                    { key: "approved_members", label: "Members", icon: "people-outline" },
                    { key: "public", label: "Public", icon: "earth-outline" },
                  ] as const).map((option) => {
                    const active = draftLocationVisibility === option.key;
                    return (
                      <Pressable key={option.key} style={[styles.createVisibilityOption, active && styles.createVisibilityOptionActive]} onPress={() => setDraftLocationVisibility(option.key)}>
                        <View style={[styles.createVisibilityIcon, active && styles.createVisibilityIconActive]}>
                          <Ionicons name={option.icon} size={18} color={active ? "#082f3a" : "#9bd8e4"} />
                        </View>
                        <View style={styles.createVisibilityCopy}>
                          <Text style={[styles.createVisibilityTitle, active && styles.createVisibilityTitleActive]}>{option.label}</Text>
                          <Text style={[styles.createVisibilitySubtitle, active && styles.createVisibilitySubtitleActive]}>{visibilityCopy[option.key]}</Text>
                        </View>
                        <View style={[styles.createRadio, active && styles.createRadioActive]}>{active ? <View style={styles.createRadioDot} /> : null}</View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={styles.createSectionCard}>
              {renderCreateSectionHeader("04", "Who can join?", "Control approvals and fine-tune the group.", "people-outline", groupSizeReady)}
              <View style={styles.createChoiceRow}>
                <Pressable style={[styles.createChoiceCard, draftJoinMode === "approval_required" && styles.createChoiceCardActive]} onPress={() => setDraftJoinMode("approval_required")}>
                  <Ionicons name="shield-checkmark-outline" size={21} color={draftJoinMode === "approval_required" ? "#082f3a" : "#9bd8e4"} />
                  <Text style={[styles.createChoiceTitle, draftJoinMode === "approval_required" && styles.createChoiceTitleActive]}>Approve people</Text>
                  <Text style={[styles.createChoiceCopy, draftJoinMode === "approval_required" && styles.createChoiceCopyActive]}>You review requests</Text>
                </Pressable>
                <Pressable style={[styles.createChoiceCard, draftJoinMode === "open" && styles.createChoiceCardActive]} onPress={() => setDraftJoinMode("open")}>
                  <Ionicons name="flash-outline" size={21} color={draftJoinMode === "open" ? "#082f3a" : "#9bd8e4"} />
                  <Text style={[styles.createChoiceTitle, draftJoinMode === "open" && styles.createChoiceTitleActive]}>Open join</Text>
                  <Text style={[styles.createChoiceCopy, draftJoinMode === "open" && styles.createChoiceCopyActive]}>Anyone can join</Text>
                </Pressable>
              </View>
              <Pressable style={styles.createAdvancedToggle} onPress={() => setShowAdvancedSettings((current) => !current)}>
                <View style={styles.createAdvancedIcon}><Ionicons name="options-outline" size={18} color="#9bd8e4" /></View>
                <View style={styles.createSwitchCopy}>
                  <Text style={styles.createSwitchTitle}>Group preferences</Text>
                  <Text style={styles.createSwitchSubtitle}>Skill level and maximum group size.</Text>
                </View>
                <Ionicons name={showAdvancedSettings ? "chevron-up" : "chevron-down"} size={18} color="#94a3b8" />
              </Pressable>
              {showAdvancedSettings ? (
                <View style={styles.createNestedCard}>
                  <Text style={styles.createFieldLabel}>Skill level</Text>
                  <View style={styles.createPillRow}>
                    {(["any", "beginner", "intermediate", "advanced"] as const).map((level) => (
                      <Pressable key={level} style={[styles.createPill, skillLevel === level && styles.createPillActive]} onPress={() => setSkillLevel(level)}>
                        <Text style={[styles.createPillText, skillLevel === level && styles.createPillTextActive]}>{level[0].toUpperCase() + level.slice(1)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.createFieldLabel}>Group size</Text>
                  <View style={styles.createPillRow}>
                    {(["any", "4", "8", "custom"] as const).map((size) => (
                      <Pressable
                        key={size}
                        style={[styles.createPill, groupSizeChoice === size && styles.createPillActive]}
                        onPress={() => {
                          setGroupSizeChoice(size);
                          if (size === "any" || size === "4") setDraftGroupSize("4");
                          if (size === "8") setDraftGroupSize("8");
                        }}
                      >
                        <Text style={[styles.createPillText, groupSizeChoice === size && styles.createPillTextActive]}>{size === "any" ? "Flexible" : size === "custom" ? "Custom" : `${size} people`}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {groupSizeChoice === "custom" ? (
                    <TextInput placeholder="Maximum people" placeholderTextColor="#94a3b8" keyboardType="number-pad" style={styles.createInput} value={groupSizeCustom} onChangeText={setGroupSizeCustom} />
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={styles.createSectionCard}>
              {renderCreateSectionHeader("05", "Add a cover", "Optional, but a relevant photo or short video helps.", "image-outline", Boolean(draftMedia))}
              {draftMedia ? (
                <View style={styles.createMediaPreview}>
                  {draftMedia.type === "image" ? (
                    <Image source={{ uri: draftMedia.uri }} style={styles.createMediaImage} />
                  ) : (
                    <View style={styles.videoEditor}><QuestVideoPreview key={draftMedia.uri} media={draftMedia} /></View>
                  )}
                  <View style={styles.createMediaFooter}>
                    <View style={styles.createMediaFileCopy}>
                      <Text style={styles.createMediaReady}>Ready to publish</Text>
                      <Text style={styles.createMediaFilename} numberOfLines={1}>{draftMedia.fileName}</Text>
                    </View>
                    <Pressable style={styles.createMediaChangeButton} onPress={() => void pickQuestMedia()} disabled={optimizingMedia}>
                      <Ionicons name="refresh-outline" size={17} color="#dff7fb" />
                      <Text style={styles.createMediaChangeText}>Change</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={styles.createMediaDropzone} onPress={() => void pickQuestMedia()} disabled={optimizingMedia}>
                  <View style={styles.createMediaDropIcon}>
                    {optimizingMedia ? <ActivityIndicator color="#082f3a" /> : <Ionicons name="add" size={26} color="#082f3a" />}
                  </View>
                  <Text style={styles.createMediaDropTitle}>{optimizingMedia ? "Optimizing video..." : "Choose photo or video"}</Text>
                  <Text style={styles.createMediaDropCopy}>Videos open in Apple’s trimmer and can be up to {VIDEO_MAX_DURATION_SECONDS} seconds.</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.createPublishCard}>
              <View style={styles.createPublishSummary}>
                <View style={[styles.createPublishStatus, canPublishQuest && styles.createPublishStatusReady]}>
                  <Ionicons name={canPublishQuest ? "checkmark" : "ellipsis-horizontal"} size={17} color={canPublishQuest ? "#052e2b" : "#9bd8e4"} />
                </View>
                <View style={styles.createPublishCopy}>
                  <Text style={styles.createPublishTitle}>{canPublishQuest ? "Ready to publish" : "Finish the required details"}</Text>
                  <Text style={styles.createPublishSubtitle}>
                    {canPublishQuest
                      ? `${locationMode === "remote" ? "Virtual" : deriveCityFromLocation(draftExactAddress) || "In person"} · ${draftJoinMode === "open" ? "Open join" : "Approval required"}`
                      : `${requiredStepsComplete} of 3 required sections complete`}
                  </Text>
                </View>
              </View>
              <Pressable
                style={[styles.createPublishButton, !canPublishQuest && styles.createPublishButtonDisabled]}
                onPress={() => void createQuest()}
                disabled={!canPublishQuest}
              >
                {optimizingMedia || uploadingMedia || creatingQuest ? <ActivityIndicator size="small" color="#082f3a" /> : <Ionicons name="rocket-outline" size={19} color="#082f3a" />}
                <Text style={styles.createPublishButtonText}>{optimizingMedia ? "Optimizing..." : creatingQuest ? "Creating..." : uploadingMedia ? "Uploading..." : "Publish quest"}</Text>
              </Pressable>
              <Pressable
                style={styles.createDiscardButton}
                onPress={() => Alert.alert("Discard draft?", "This clears everything in this quest draft.", [
                  { text: "Keep editing", style: "cancel" },
                  { text: "Discard", style: "destructive", onPress: () => { resetQuestDrafts(); setActiveTab("home"); } },
                ])}
              >
                <Text style={styles.createDiscardText}>Discard draft</Text>
              </Pressable>
            </View>
          </View>

          {showStartAtPicker ? (
            <View style={styles.pickerModalOverlay}>
              <View style={styles.pickerModalCard}>
                <View style={styles.row}>
                  <Text style={styles.questCategory}>Choose start time</Text>
                  <Pressable onPress={() => setShowStartAtPicker(false)}><Text style={styles.link}>Close</Text></Pressable>
                </View>
                <View style={styles.pickerModalBody}>
                  <DateTimePicker
                    value={startAt ? new Date(startAt) : new Date()}
                    mode="datetime"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_, selectedDate) => {
                      if (selectedDate) setStartAt(selectedDate.toISOString());
                      if (Platform.OS !== "ios") setShowStartAtPicker(false);
                    }}
                  />
                </View>
                <Pressable style={styles.primaryButton} onPress={() => setShowStartAtPicker(false)}><Text style={styles.primaryButtonText}>Done</Text></Pressable>
              </View>
            </View>
          ) : null}
          {showRecurringStartDatePicker ? (
            <View style={styles.pickerModalOverlay}>
              <View style={styles.pickerModalCard}>
                <View style={styles.row}>
                  <Text style={styles.questCategory}>Choose first date</Text>
                  <Pressable onPress={() => setShowRecurringStartDatePicker(false)}><Text style={styles.link}>Close</Text></Pressable>
                </View>
                <View style={styles.pickerModalBody}>
                  <DateTimePicker
                    value={recurringStartDate ? new Date(`${recurringStartDate}T12:00:00`) : new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_, selectedDate) => {
                      if (selectedDate) setRecurringStartDate(formatDateValue(selectedDate));
                      if (Platform.OS !== "ios") setShowRecurringStartDatePicker(false);
                    }}
                  />
                </View>
                <Pressable style={styles.primaryButton} onPress={() => setShowRecurringStartDatePicker(false)}><Text style={styles.primaryButtonText}>Done</Text></Pressable>
              </View>
            </View>
          ) : null}
          {showCategoryPicker ? (
            <View style={styles.pickerModalOverlay}>
              <View style={styles.pickerModalCard}>
                <ScrollView style={styles.pickerModalScroll} contentContainerStyle={styles.pickerModalContent} nestedScrollEnabled showsVerticalScrollIndicator>
                  <View style={styles.row}>
                    <Text style={styles.questCategory}>Category</Text>
                    <Pressable onPress={() => setShowCategoryPicker(false)}>
                      <Text style={styles.link}>Close</Text>
                    </Pressable>
                  </View>
                  {CANONICAL_CATEGORIES.map((category) => (
                    <Pressable
                      key={category}
                      style={styles.pickerOption}
                      onPress={() => {
                        setCategoryInput(category);
                        setCategoryIsCustom(false);
                        const matchedHobby = hobbies.find((hobby) => hobby.name.trim().toLowerCase() === category.toLowerCase() || (hobby.category || "").trim().toLowerCase() === category.toLowerCase());
                        setDraftHobbyId(matchedHobby?.id ?? "");
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Text style={styles.detailValue}>{category}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    style={styles.pickerOption}
                    onPress={() => {
                      setCategoryInput("");
                      setCategoryIsCustom(true);
                      setDraftHobbyId("");
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text style={styles.detailValue}>Custom category...</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          ) : null}
        </>
      );
    }

    if (activeTab === "saved") return <><ScreenHeader title="Saved" subtitle="Quests you bookmarked." />{renderQuestList(savedQuests, "No saved quests yet.")}</>;
    if (activeTab === "joined") return <><ScreenHeader title="Joined" subtitle="Quests where you are a member or organizer." />{renderQuestList(joinedQuests, "No joined quests yet.")}</>;

    if (activeTab === "inbox") {
      return (
        <>
          <ScreenHeader title="Inbox" subtitle="Your direct messages." />
          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Threads</Text>
            <Text style={styles.helperText}>Tap a subject to open the conversation.</Text>
            {!inboxThreads.length ? <EmptyState label="No messages yet." /> : inboxThreads.map((thread) => {
              const quest = thread.quest;
              const avatarUrl = thread.partnerAvatarUrl;
              return (
                <Pressable key={thread.threadKey} style={styles.questCard} onPress={() => quest && void openQuestConversation(quest, "private", thread.partnerId || null)}>
                  <View style={styles.inboxThreadHeader}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.inboxAvatar} />
                    ) : (
                      <View style={styles.inboxAvatarFallback} />
                    )}
                    <View style={styles.inboxThreadHeaderText}>
                      <Text style={styles.questCategory}>{quest?.title || "Direct message"}</Text>
                      <Text style={styles.questTitle}>{thread.partnerName}</Text>
                    </View>
                  </View>
                  <Text style={styles.questDescription}>{normalizeMessageBody(thread.lastMessage.body)}</Text>
                  <View style={styles.row}>
                    <Text style={styles.date}>{formatDate(thread.lastMessage.created_at)}</Text>
                    <Text style={styles.date}>{thread.messageCount > 1 ? `${thread.messageCount} messages` : "1 message"}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      );
    }

    if (activeTab === "notifications") {
      return (
        <>
          <ScreenHeader title="Notifications" subtitle="Messages, requests, approvals, and system updates." titleColor={shellText} subtitleColor={shellMuted} />
          {pushPermissionStatus && pushPermissionStatus !== "granted" ? (
            <View style={styles.panel}>
              <Text style={styles.detailLabel}>Notifications off</Text>
              <Text style={styles.questDescription}>
                Turn notifications on so you get join requests, approvals, and message alerts right away.
              </Text>
              <Pressable
                style={styles.primaryButton}
                onPress={() => void enableNotificationsFromApp().catch((error) => {
                  console.warn("enable notifications failed", error instanceof Error ? error.message : String(error));
                })}
              >
                <Text style={styles.primaryButtonText}>Enable notifications</Text>
              </Pressable>
            </View>
          ) : null}
          {!notifications.length ? <EmptyState label="No notifications yet." /> : notifications.map((item) => (
            <Pressable key={item.id} style={styles.questCard} onPress={() => void openDeliveredNotification(item)}>
              <View style={styles.row}>
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
              </View>
              <View style={styles.notificationHeader}>
                {(() => {
                  const sourceProfile = getRelationOne(item.source_profile);
                  const sourceLabel = sourceProfile?.display_name || sourceProfile?.username || (item.kind === "system" ? "QuestHat" : "Someone");
                  const avatarUrl = sourceProfile?.avatar_url || null;
                  return (
                    <Pressable
                      style={styles.notificationAuthorRow}
                      onPress={sourceProfile?.id ? () => void openProfile(sourceProfile.id) : undefined}
                      disabled={!sourceProfile?.id}
                    >
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.notificationAvatar} />
                      ) : (
                        <View style={styles.notificationAvatarFallback}>
                          <Ionicons name="person" size={14} color="#9bc8d2" />
                        </View>
                      )}
                      <View style={styles.notificationAuthorTextWrap}>
                        <Text style={styles.notificationAuthorName} numberOfLines={1}>{sourceLabel}</Text>
                        <Text style={styles.notificationKind} numberOfLines={1}>{item.kind === "join_request" ? "Join request" : item.kind === "approval" ? "Approved" : item.kind === "declined" ? "Declined" : item.kind === "message" ? "Message" : "Update"}</Text>
                      </View>
                    </Pressable>
                  );
                })()}
                {!item.read_at ? <View style={styles.unreadDot} /> : null}
              </View>
              <Text style={styles.questTitle}>{item.title}</Text>
              <Text style={styles.questDescription}>{item.body}</Text>
              <View style={styles.reportStack}>
                {item.kind === "join_request" && item.quest_id && item.membership_user_id ? (
                  (() => {
                    const requestState = isSupersededJoinRequestNotification(item, notifications)
                      ? "expired"
                      : getJoinRequestNotificationState(item);
                    const isPendingRequest = requestState === "pending";
                    const statusLabel = requestState === "approved"
                      ? "Approved"
                      : requestState === "declined"
                        ? "Declined"
                        : requestState === "expired"
                          ? "Expired"
                          : null;
                    return (
                      <>
                        {statusLabel ? (
                          <View style={styles.notificationResultRow}>
                            <View style={[
                              styles.notificationResultPill,
                              requestState === "approved" ? styles.notificationResultApproved : requestState === "declined" ? styles.notificationResultDeclined : styles.notificationResultExpired,
                            ]}>
                              <Text style={styles.notificationResultText}>{statusLabel}</Text>
                            </View>
                          </View>
                        ) : null}
                        {isPendingRequest ? (
                          <>
                            <Pressable
                              style={styles.secondaryButton}
                              onPress={() => {
                                setActiveTab("home");
                                void openQuestDetail(item.quest_id || "");
                              }}
                            >
                              <Text style={styles.secondaryButtonText}>Open listing</Text>
                            </Pressable>
                            <Pressable
                              style={styles.primaryButton}
                              onPress={() => void updateQuestMembershipStatus(item.quest_id!, item.membership_user_id!, "approved")}
                            >
                              <Text style={styles.primaryButtonText}>Approve</Text>
                            </Pressable>
                            <Pressable
                              style={styles.secondaryButton}
                              onPress={() => void updateQuestMembershipStatus(item.quest_id!, item.membership_user_id!, "approved", { shareExactAddress: true })}
                            >
                              <Text style={styles.secondaryButtonText}>Approve + share address</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.secondaryButton, styles.reportButton]}
                              onPress={() => void updateQuestMembershipStatus(item.quest_id!, item.membership_user_id!, "declined")}
                            >
                              <Text style={[styles.secondaryButtonText, styles.reportButtonText]}>Decline</Text>
                            </Pressable>
                          </>
                        ) : null}
                      </>
                    );
                  })()
                ) : null}
              </View>
            </Pressable>
          ))}
        </>
      );
    }

    if (activeTab === "profile") {
      return (
        <>
          <ScreenHeader title="Profile" subtitle="How other QuestHat users see you." titleColor={shellText} subtitleColor={shellMuted} />
          <View style={styles.panel}>
            <Text style={styles.profileName}>{profile?.display_name || profile?.username || "QuestHat user"}</Text>
            <Text style={styles.questMeta}>
              {[profile?.username ? `@${profile.username}` : "", profile?.city || "", profile?.friends_visibility === "private" ? "Friends private" : ""].filter(Boolean).join("  /  ") || "Profile details not set"}
            </Text>
            {profile?.bio ? <Text style={styles.questDescription}>{profile.bio}</Text> : <Text style={styles.muted}>Add a bio in Settings.</Text>}
          </View>
          <View style={styles.panel}>
            <View style={styles.row}>
              <Text style={styles.sectionLabel}>Friends</Text>
              <Text style={styles.muted}>{settingsFriendsProfiles.length} total</Text>
            </View>
            {settingsFriendsProfiles.length ? (
              <View style={styles.profileList}>
                {settingsFriendsProfiles.slice(0, 6).map((friend) => (
                  <Pressable key={friend.id} style={styles.profileQuestRow} onPress={() => void openProfile(friend.id)}>
                    <Text style={styles.detailValue} numberOfLines={1}>{friend.display_name || friend.username || "Friend"}</Text>
                    <Text style={styles.detailMuted} numberOfLines={1}>Tap to view profile</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>No friends yet.</Text>
            )}
          </View>
          <View style={styles.panel}>
            <View style={styles.row}>
              <Text style={styles.sectionLabel}>Recent listings</Text>
              <Text style={styles.muted}>{myProfileQuests.length} posts</Text>
            </View>
            {myProfileQuests.length ? (
              <View style={styles.profileList}>
                {myProfileQuests.map((quest) => (
                  <Pressable
                    key={quest.id}
                    style={styles.profileQuestRow}
                    onPress={() => {
                      setActiveTab("home");
                      void openQuestDetail(quest.id);
                    }}
                  >
                    <Text style={styles.detailValue} numberOfLines={1}>{quest.title}</Text>
                    <Text style={styles.detailMuted} numberOfLines={1}>{quest.city || "City tbd"}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>No recent listings yet.</Text>
            )}
          </View>
        </>
      );
    }

    return (
        <>
          <ScreenHeader title="Settings" subtitle="Make QuestHat feel like yours." titleColor={shellText} subtitleColor={shellMuted} />
        <View style={styles.settingsShell}>
          <LinearGradient colors={["#173743", "#10202b", "#12141d"]} style={styles.settingsIdentityCard}>
            <View style={styles.settingsIdentityTop}>
              <View style={styles.settingsAvatarWrap}>
                {settingsAvatarUri ? (
                  <Image source={{ uri: settingsAvatarUri }} style={styles.settingsAvatar} />
                ) : (
                  <View style={styles.settingsAvatarFallback}>
                    <Text style={styles.settingsAvatarInitial}>{(settingsUsername || "Q").trim().charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Pressable style={styles.settingsAvatarEdit} onPress={() => void uploadProfilePhoto()} disabled={uploadingAvatar}>
                  <Ionicons name={uploadingAvatar ? "hourglass-outline" : "camera"} size={15} color="#082f3a" />
                </Pressable>
              </View>
              <View style={styles.settingsIdentityCopy}>
                <Text style={styles.settingsIdentityName} numberOfLines={1}>{settingsUsername ? `@${settingsUsername}` : "Choose your name"}</Text>
                <View style={styles.settingsIdentityMeta}>
                  <Ionicons name="location-outline" size={13} color="#9bc8d2" />
                  <Text style={styles.settingsIdentityMetaText} numberOfLines={1}>{[settingsCity, settingsRegion].filter(Boolean).join(", ") || "Location not set"}</Text>
                </View>
              </View>
              <Pressable style={styles.settingsProfileLink} onPress={() => (userId ? void openProfile(userId) : setStatus("Profile is still loading."))} disabled={!userId}>
                <Ionicons name="arrow-up-forward" size={18} color="#e8f7fa" />
              </Pressable>
            </View>
          </LinearGradient>

          <View style={styles.settingsNav}>
            {([
              { key: "profile", label: "Profile", icon: "person-outline" },
              { key: "preferences", label: "Preferences", icon: "options-outline" },
              { key: "people", label: "People", icon: "people-outline" },
              { key: "account", label: "Account", icon: "shield-checkmark-outline" },
            ] as const).map((item) => (
              <Pressable key={item.key} style={[styles.settingsNavItem, settingsTab === item.key && styles.settingsNavItemActive]} onPress={() => setSettingsTab(item.key)}>
                <View style={[styles.settingsNavIcon, settingsTab === item.key && styles.settingsNavIconActive]}>
                  <Ionicons name={item.icon} size={18} color={settingsTab === item.key ? "#082f3a" : "#94a3b8"} />
                </View>
                <Text style={[styles.settingsNavLabel, settingsTab === item.key && styles.settingsNavLabelActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          {settingsTab === "profile" ? (
            <View style={styles.settingsTabContent}>
              <View style={styles.settingsSectionHeader}>
                <View>
                  <Text style={styles.settingsSectionEyebrow}>PUBLIC PROFILE</Text>
                  <Text style={[styles.settingsSectionTitle, { color: shellText }]}>How people see you</Text>
                </View>
                {settingsProfileDirty ? <View style={styles.settingsUnsavedBadge}><View style={styles.settingsUnsavedDot} /><Text style={styles.settingsUnsavedText}>Unsaved</Text></View> : null}
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="finger-print-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}>
                    <Text style={styles.settingsCardTitle}>Identity</Text>
                    <Text style={styles.settingsCardSubtitle}>One unique name for your QuestHat profile.</Text>
                  </View>
                </View>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsFieldLabel}>Name</Text>
                  <View style={styles.settingsInputWithIcon}>
                    <Text style={styles.settingsInputPrefix}>@</Text>
                    <TextInput autoCapitalize="none" autoCorrect={false} placeholder="yourname" placeholderTextColor="#718096" style={styles.settingsInputInline} value={settingsUsername} onChangeText={setSettingsUsername} />
                    {settingsUsernameAvailability === "checking" ? <ActivityIndicator size="small" color="#9bd8e4" /> : null}
                    {settingsUsernameAvailability === "available" && settingsUsername.trim() ? <Ionicons name="checkmark-circle" size={18} color="#34d399" /> : null}
                  </View>
                  {settingsUsernameAvailability === "taken" ? <Text style={styles.errorText}>That name is already taken.</Text> : null}
                  {settingsUsernameAvailability === "error" ? <Text style={styles.warningText}>Could not check name availability.</Text> : null}
                  {usernameCooldownActive ? <Text style={styles.warningText}>Names can only be changed once every 24 hours.</Text> : null}
                </View>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsFieldLabel}>Birthday</Text>
                  <Pressable style={styles.settingsSelect} onPress={() => setShowSettingsDobPicker(true)}>
                    <Text style={[styles.settingsSelectText, !settingsDob.trim() && styles.settingsSelectPlaceholder]}>{settingsDob.trim() || "Add your birthday"}</Text>
                    <Ionicons name="calendar-clear-outline" size={18} color="#9bc8d2" />
                  </Pressable>
                  <Text style={styles.settingsFieldHint}>Private by default. Used for age eligibility.</Text>
                </View>
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="navigate-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}>
                    <Text style={styles.settingsCardTitle}>Location & discovery</Text>
                    <Text style={styles.settingsCardSubtitle}>Control where you appear and what you find.</Text>
                  </View>
                </View>
                <View style={styles.settingsSplitFields}>
                  <View style={[styles.settingsField, styles.settingsSplitField]}>
                    <Text style={styles.settingsFieldLabel}>Country</Text>
                    <TextInput placeholder="US" placeholderTextColor="#718096" style={styles.settingsInput} value={settingsCountryCode} onChangeText={setSettingsCountryCode} autoCapitalize="characters" maxLength={2} />
                  </View>
                  <View style={[styles.settingsField, styles.settingsSplitField]}>
                    <Text style={styles.settingsFieldLabel}>State / region</Text>
                    <TextInput placeholder="Florida" placeholderTextColor="#718096" style={styles.settingsInput} value={settingsRegion} onChangeText={setSettingsRegion} />
                  </View>
                </View>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsFieldLabel}>City</Text>
                  <TextInput placeholder="Your city" placeholderTextColor="#718096" style={styles.settingsInput} value={settingsCity} onChangeText={setSettingsCity} />
                </View>
                <View style={styles.settingsControlRow}>
                  <View style={styles.settingsControlIcon}><Ionicons name="eye-outline" size={18} color="#9bc8d2" /></View>
                  <View style={styles.settingsControlCopy}>
                    <Text style={styles.settingsControlTitle}>Show location on profile</Text>
                    <Text style={styles.settingsControlSubtitle}>Only safe city-level details are shown.</Text>
                  </View>
                  <Switch value={settingsShowLocation} onValueChange={setSettingsShowLocation} trackColor={{ false: "#343846", true: "#6daec2" }} thumbColor="#f8fafc" />
                </View>
                <View style={styles.settingsField}>
                  <View style={styles.settingsFieldLabelRow}>
                    <Text style={styles.settingsFieldLabel}>Discovery radius</Text>
                    <Text style={styles.settingsValueBadge}>{settingsRadiusKm} km</Text>
                  </View>
                  <View style={styles.settingsStepper}>
                    <Pressable style={styles.settingsStepperButton} onPress={() => setSettingsRadiusKm((value) => Math.max(1, value - 5))}><Ionicons name="remove" size={20} color="#e8f7fa" /></Pressable>
                    <View style={styles.settingsStepperTrack}><View style={[styles.settingsStepperFill, { width: `${Math.min(100, Math.max(8, settingsRadiusKm))}%` }]} /></View>
                    <Pressable style={styles.settingsStepperButton} onPress={() => setSettingsRadiusKm((value) => Math.min(100, value + 5))}><Ionicons name="add" size={20} color="#e8f7fa" /></Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="sparkles-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}>
                    <Text style={styles.settingsCardTitle}>A little about you</Text>
                    <Text style={styles.settingsCardSubtitle}>Give people a reason to join your next plan.</Text>
                  </View>
                </View>
                <TextInput multiline placeholder="What are you into? What kind of plans do you want to make?" placeholderTextColor="#718096" style={[styles.settingsInput, styles.settingsBioInput]} value={settingsBio} onChangeText={setSettingsBio} maxLength={280} />
                <Text style={styles.settingsCharacterCount}>{settingsBio.length}/280</Text>
              </View>

              <View style={styles.settingsSaveTray}>
                <Pressable style={styles.settingsRevertButton} onPress={resetSettingsProfileForm} disabled={!settingsProfileDirty || savingProfile}><Text style={[styles.settingsRevertText, !settingsProfileDirty && styles.settingsActionDisabledText]}>Reset</Text></Pressable>
                <Pressable style={[styles.settingsSaveButton, (!settingsProfileDirty || savingProfile) && styles.settingsSaveButtonDisabled]} onPress={saveProfile} disabled={!settingsProfileDirty || savingProfile}>
                  {savingProfile ? <ActivityIndicator size="small" color="#082f3a" /> : <Ionicons name="checkmark" size={19} color="#082f3a" />}
                  <Text style={styles.settingsSaveButtonText}>{savingProfile ? "Saving" : "Save changes"}</Text>
                </Pressable>
              </View>
              {settingsAvatarUri ? <Pressable style={styles.settingsQuietAction} onPress={() => void deleteProfilePhoto()} disabled={uploadingAvatar}><Ionicons name="image-outline" size={16} color="#94a3b8" /><Text style={styles.settingsQuietActionText}>Remove profile photo</Text></Pressable> : null}
            </View>
          ) : null}

          {settingsTab === "preferences" ? (
            <View style={styles.settingsTabContent}>
              <View style={styles.settingsSectionHeader}>
                <View><Text style={styles.settingsSectionEyebrow}>YOUR EXPERIENCE</Text><Text style={[styles.settingsSectionTitle, { color: shellText }]}>Look, feel & alerts</Text></View>
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="contrast-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}><Text style={styles.settingsCardTitle}>Appearance</Text><Text style={styles.settingsCardSubtitle}>Choose how QuestHat looks on this device.</Text></View>
                </View>
                <View style={styles.settingsThemeGrid}>
                  {([
                    { key: "auto", label: "System", icon: "phone-portrait-outline" },
                    { key: "light", label: "Light", icon: "sunny-outline" },
                    { key: "dark", label: "Dark", icon: "moon-outline" },
                  ] as const).map((item) => (
                    <Pressable key={item.key} style={[styles.settingsThemeOption, settingsThemePref === item.key && styles.settingsThemeOptionActive]} onPress={() => setSettingsThemePref(item.key)}>
                      <View style={[styles.settingsThemePreview, item.key === "light" ? styles.settingsThemePreviewLight : item.key === "dark" ? styles.settingsThemePreviewDark : styles.settingsThemePreviewAuto]}>
                        <Ionicons name={item.icon} size={22} color={item.key === "light" ? "#334155" : "#dff7fb"} />
                      </View>
                      <Text style={[styles.settingsThemeLabel, settingsThemePref === item.key && styles.settingsThemeLabelActive]}>{item.label}</Text>
                      {settingsThemePref === item.key ? <Ionicons name="checkmark-circle" size={17} color="#9bd8e4" /> : <View style={styles.settingsThemeCheckPlaceholder} />}
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="sparkles-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}>
                    <Text style={styles.settingsCardTitle}>Interests</Text>
                    <Text style={styles.settingsCardSubtitle}>Tune your feed and future category alerts. Pick as many as you like.</Text>
                  </View>
                  <View style={styles.settingsInterestCount}><Text style={styles.settingsInterestCountText}>{onboardingInterestIds.length}</Text></View>
                </View>
                <View style={styles.settingsInterestGrid}>
                  {hobbies.map((option) => {
                    const active = onboardingInterestIds.includes(option.id);
                    return (
                      <Pressable
                        key={option.id}
                        style={[styles.settingsInterestChip, active && styles.settingsInterestChipActive]}
                        onPress={() => setOnboardingInterestIds((current) => current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id])}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                      >
                        <Ionicons name={getCategoryIcon(option.category || option.name)} size={15} color={active ? "#082f3a" : "#9bc8d2"} />
                        <Text style={[styles.settingsInterestChipText, active && styles.settingsInterestChipTextActive]}>{option.name}</Text>
                        {active ? <Ionicons name="checkmark-circle" size={15} color="#0b5364" /> : null}
                      </Pressable>
                    );
                  })}
                </View>
                {!hobbies.length ? <Text style={styles.settingsFieldHint}>Interests are still loading. Pull to refresh and try again.</Text> : null}
                <Pressable style={[styles.settingsSaveButton, savingInterests && styles.settingsSaveButtonDisabled]} onPress={() => void saveInterests()} disabled={savingInterests || !hobbies.length}>
                  {savingInterests ? <ActivityIndicator size="small" color="#082f3a" /> : <Ionicons name="checkmark" size={19} color="#082f3a" />}
                  <Text style={styles.settingsSaveButtonText}>{savingInterests ? "Saving" : "Save interests"}</Text>
                </Pressable>
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="notifications-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}><Text style={styles.settingsCardTitle}>Notifications</Text><Text style={styles.settingsCardSubtitle}>Stay in the loop when plans move.</Text></View>
                </View>
                <View style={styles.settingsStatusRow}>
                  <View style={[styles.settingsStatusDot, pushPermissionStatus === "granted" && styles.settingsStatusDotOn]} />
                  <Text style={styles.settingsStatusText}>{pushPermissionStatus === "granted" ? "Notifications are on" : "Notifications are off"}</Text>
                  <Pressable
                    style={styles.settingsInlineButton}
                    onPress={() => {
                      setShowNotificationPreferences(true);
                      void loadNotificationPreferences(userId || "");
                    }}
                  >
                    <Text style={styles.settingsInlineButtonText}>Manage</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="shield-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}><Text style={styles.settingsCardTitle}>Privacy nudges</Text><Text style={styles.settingsCardSubtitle}>Helpful reminders before sharing publicly.</Text></View>
                </View>
                <View style={styles.settingsControlRow}>
                  <View style={styles.settingsControlIcon}><Ionicons name="location-outline" size={18} color="#9bc8d2" /></View>
                  <View style={styles.settingsControlCopy}><Text style={styles.settingsControlTitle}>Public location warning</Text><Text style={styles.settingsControlSubtitle}>Warn before posting an exact public place.</Text></View>
                  <Switch value={settingsPublicLocationWarningEnabled} onValueChange={setSettingsPublicLocationWarningEnabled} trackColor={{ false: "#343846", true: "#6daec2" }} thumbColor="#f8fafc" />
                </View>
                <View style={styles.settingsDivider} />
                <View style={styles.settingsControlRow}>
                  <View style={styles.settingsControlIcon}><Ionicons name="mail-outline" size={18} color="#9bc8d2" /></View>
                  <View style={styles.settingsControlCopy}><Text style={styles.settingsControlTitle}>Product updates</Text><Text style={styles.settingsControlSubtitle}>Occasional news, features, and promotions.</Text></View>
                  <Switch value={settingsMarketingOptIn} onValueChange={setSettingsMarketingOptIn} trackColor={{ false: "#343846", true: "#6daec2" }} thumbColor="#f8fafc" />
                </View>
              </View>

              <Pressable style={[styles.settingsSaveButton, savingPreferences && styles.settingsSaveButtonDisabled]} onPress={() => void savePreferences()} disabled={savingPreferences}>
                {savingPreferences ? <ActivityIndicator size="small" color="#082f3a" /> : <Ionicons name="checkmark" size={19} color="#082f3a" />}
                <Text style={styles.settingsSaveButtonText}>{savingPreferences ? "Saving" : "Save preferences"}</Text>
              </Pressable>

              <View style={styles.settingsUtilityCard}>
                <Pressable style={styles.settingsUtilityRow} onPress={() => void restartOnboarding()}><View style={styles.settingsUtilityIcon}><Ionicons name="refresh-outline" size={18} color="#dbe7ec" /></View><View style={styles.settingsControlCopy}><Text style={styles.settingsControlTitle}>Restart setup</Text><Text style={styles.settingsControlSubtitle}>Run through onboarding again.</Text></View><Ionicons name="chevron-forward" size={18} color="#64748b" /></Pressable>
                <View style={styles.settingsDivider} />
                <Pressable style={styles.settingsUtilityRow} onPress={() => void openSupportEmail()}><View style={styles.settingsUtilityIcon}><Ionicons name="help-buoy-outline" size={18} color="#dbe7ec" /></View><View style={styles.settingsControlCopy}><Text style={styles.settingsControlTitle}>Help & support</Text><Text style={styles.settingsControlSubtitle}>Questions, bugs, or account help.</Text></View><Ionicons name="chevron-forward" size={18} color="#64748b" /></Pressable>
              </View>
            </View>
          ) : null}

          {settingsTab === "people" ? (
            <View style={styles.settingsTabContent}>
              <View style={styles.settingsSectionHeader}>
                <View><Text style={styles.settingsSectionEyebrow}>YOUR CIRCLE</Text><Text style={[styles.settingsSectionTitle, { color: shellText }]}>People & safety</Text></View>
              </View>
              <View style={styles.settingsPeopleStats}>
                <View style={styles.settingsPeopleStat}><Text style={styles.settingsPeopleStatValue}>{settingsFriendsProfiles.length}</Text><Text style={styles.settingsPeopleStatLabel}>Friends</Text></View>
                <View style={styles.settingsPeopleStatDivider} />
                <View style={styles.settingsPeopleStat}><Text style={styles.settingsPeopleStatValue}>{settingsFriendRequests.filter((item) => item.direction === "incoming").length}</Text><Text style={styles.settingsPeopleStatLabel}>Requests</Text></View>
                <View style={styles.settingsPeopleStatDivider} />
                <View style={styles.settingsPeopleStat}><Text style={styles.settingsPeopleStatValue}>{settingsBlockedProfiles.length}</Text><Text style={styles.settingsPeopleStatLabel}>Blocked</Text></View>
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="people-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}><Text style={styles.settingsCardTitle}>Friends</Text><Text style={styles.settingsCardSubtitle}>People you have connected with.</Text></View>
                  <View style={styles.settingsCountPill}><Text style={styles.settingsCountPillText}>{settingsFriendsProfiles.length}</Text></View>
                </View>
                {!settingsFriendsProfiles.length ? (
                  <View style={styles.settingsEmptyState}><Ionicons name="people-outline" size={26} color="#65707e" /><Text style={styles.settingsEmptyTitle}>Your circle starts here</Text><Text style={styles.settingsEmptyCopy}>Connect with people from profiles and quests.</Text></View>
                ) : settingsFriendsProfiles.map((friend, index) => (
                  <View key={friend.id} style={[styles.settingsPersonRow, index > 0 && styles.settingsPersonRowBorder]}>
                    <Pressable style={styles.settingsPersonMain} onPress={() => void openProfile(friend.id)}>
                      {friend.avatar_url ? <Image source={{ uri: friend.avatar_url }} style={styles.settingsPersonAvatar} /> : <View style={styles.settingsPersonAvatarFallback}><Ionicons name="person" size={17} color="#9bc8d2" /></View>}
                      <View style={styles.settingsControlCopy}><Text style={styles.settingsPersonName}>{friend.display_name || friend.username || "Friend"}</Text><Text style={styles.settingsPersonHandle}>{friend.username ? `@${friend.username}` : "View profile"}</Text></View>
                    </Pressable>
                    <Pressable style={styles.settingsPersonMenuButton} onPress={() => void removeFriend(friend.id)}><Ionicons name="person-remove-outline" size={18} color="#94a3b8" /></Pressable>
                  </View>
                ))}
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="person-add-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}><Text style={styles.settingsCardTitle}>Friend requests</Text><Text style={styles.settingsCardSubtitle}>Incoming and sent invitations.</Text></View>
                  <View style={styles.settingsCountPill}><Text style={styles.settingsCountPillText}>{settingsFriendRequests.length}</Text></View>
                </View>
                {!settingsFriendRequests.length ? <Text style={styles.settingsEmptyInline}>No pending friend requests.</Text> : settingsFriendRequests.map((request, index) => (
                  <View key={`${request.edge.requester_id}-${request.edge.addressee_id}`} style={[styles.settingsRequestRow, index > 0 && styles.settingsPersonRowBorder]}>
                    <Pressable style={styles.settingsPersonMain} onPress={() => void openProfile(request.id)}>
                      {request.avatar_url ? <Image source={{ uri: request.avatar_url }} style={styles.settingsPersonAvatar} /> : <View style={styles.settingsPersonAvatarFallback}><Ionicons name="person" size={17} color="#9bc8d2" /></View>}
                      <View style={styles.settingsControlCopy}><Text style={styles.settingsPersonName}>{request.display_name || request.username || "User"}</Text><Text style={styles.settingsPersonHandle}>{request.direction === "incoming" ? "Wants to connect" : "Request sent"}</Text></View>
                    </Pressable>
                    {request.direction === "incoming" ? (
                      <View style={styles.settingsRequestActions}><Pressable style={styles.settingsAcceptButton} onPress={() => void acceptFriendRequest(request.edge.requester_id)}><Ionicons name="checkmark" size={18} color="#082f3a" /></Pressable><Pressable style={styles.settingsDeclineButton} onPress={() => void declineFriendRequest(request.edge.requester_id)}><Ionicons name="close" size={18} color="#cbd5e1" /></Pressable></View>
                    ) : <Pressable style={styles.settingsTextAction} onPress={() => void cancelOutgoingFriendRequest(request.id)}><Text style={styles.settingsTextActionLabel}>Cancel</Text></Pressable>}
                  </View>
                ))}
              </View>

              <View style={[styles.settingsCard, styles.settingsSafetyCard]}>
                <View style={styles.settingsCardHeading}>
                  <View style={[styles.settingsCardIcon, styles.settingsSafetyIcon]}><Ionicons name="shield-outline" size={19} color="#fbbf24" /></View>
                  <View style={styles.settingsCardHeadingCopy}><Text style={styles.settingsCardTitle}>Blocked accounts</Text><Text style={styles.settingsCardSubtitle}>Blocked people disappear from feeds, comments, and connections.</Text></View>
                </View>
                {!settingsBlockedProfiles.length ? <View style={styles.settingsSafeState}><Ionicons name="checkmark-circle-outline" size={20} color="#34d399" /><Text style={styles.settingsSafeStateText}>No blocked accounts</Text></View> : settingsBlockedProfiles.map((blocked, index) => (
                  <View key={blocked.id} style={[styles.settingsPersonRow, index > 0 && styles.settingsPersonRowBorder]}>
                    <Pressable style={styles.settingsPersonMain} onPress={() => void openProfile(blocked.id)}>
                      {blocked.avatar_url ? <Image source={{ uri: blocked.avatar_url }} style={styles.settingsPersonAvatar} /> : <View style={styles.settingsPersonAvatarFallback}><Ionicons name="person" size={17} color="#9bc8d2" /></View>}
                      <View style={styles.settingsControlCopy}><Text style={styles.settingsPersonName}>{blocked.display_name || blocked.username || "Blocked user"}</Text><Text style={styles.settingsPersonHandle}>Blocked</Text></View>
                    </Pressable>
                    <Pressable style={styles.settingsTextAction} onPress={() => void unblockProfile(blocked.id)}><Text style={styles.settingsTextActionLabel}>Unblock</Text></Pressable>
                  </View>
                ))}
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsFieldLabel}>Friends list visibility</Text>
                <View style={styles.settingsPrivacySegment}>
                  <Pressable style={[styles.settingsPrivacyOption, settingsFriendsVisibility === "public" && styles.settingsPrivacyOptionActive]} onPress={() => setSettingsFriendsVisibility("public")}><Ionicons name="globe-outline" size={18} color={settingsFriendsVisibility === "public" ? "#082f3a" : "#94a3b8"} /><Text style={[styles.settingsPrivacyOptionText, settingsFriendsVisibility === "public" && styles.settingsPrivacyOptionTextActive]}>Public</Text></Pressable>
                  <Pressable style={[styles.settingsPrivacyOption, settingsFriendsVisibility === "private" && styles.settingsPrivacyOptionActive]} onPress={() => setSettingsFriendsVisibility("private")}><Ionicons name="lock-closed-outline" size={18} color={settingsFriendsVisibility === "private" ? "#082f3a" : "#94a3b8"} /><Text style={[styles.settingsPrivacyOptionText, settingsFriendsVisibility === "private" && styles.settingsPrivacyOptionTextActive]}>Friends only</Text></Pressable>
                </View>
                <Text style={styles.settingsFieldHint}>Save this change from the Profile tab.</Text>
              </View>
            </View>
          ) : null}

          {settingsTab === "account" ? (
            <View style={styles.settingsTabContent}>
              <View style={styles.settingsSectionHeader}>
                <View><Text style={styles.settingsSectionEyebrow}>SECURITY & ACCESS</Text><Text style={[styles.settingsSectionTitle, { color: shellText }]}>Your account</Text></View>
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="mail-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}><Text style={styles.settingsCardTitle}>Email address</Text><Text style={styles.settingsCardSubtitle}>Used for sign-in and account recovery.</Text></View>
                </View>
                <View style={styles.settingsCurrentValue}><Ionicons name="checkmark-circle" size={17} color="#34d399" /><Text style={styles.settingsCurrentValueText} numberOfLines={1}>{email}</Text><Text style={styles.settingsVerifiedText}>Verified</Text></View>
                <View style={styles.settingsField}><Text style={styles.settingsFieldLabel}>New email</Text><TextInput autoCapitalize="none" keyboardType="email-address" placeholder="name@example.com" placeholderTextColor="#718096" style={styles.settingsInput} value={settingsNewEmail} onChangeText={setSettingsNewEmail} /></View>
                <Pressable style={styles.settingsOutlineButton} onPress={() => void changeEmail()}><Text style={styles.settingsOutlineButtonText}>Update email</Text><Ionicons name="arrow-forward" size={17} color="#dff7fb" /></Pressable>
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsCardHeading}>
                  <View style={styles.settingsCardIcon}><Ionicons name="key-outline" size={19} color="#9bd8e4" /></View>
                  <View style={styles.settingsCardHeadingCopy}><Text style={styles.settingsCardTitle}>Password</Text><Text style={styles.settingsCardSubtitle}>Use at least 8 characters and keep it unique.</Text></View>
                </View>
                <View style={styles.settingsField}><Text style={styles.settingsFieldLabel}>Current password</Text><TextInput secureTextEntry placeholder="Enter current password" placeholderTextColor="#718096" style={styles.settingsInput} value={settingsOldPassword} onChangeText={setSettingsOldPassword} /></View>
                <View style={styles.settingsField}><Text style={styles.settingsFieldLabel}>New password</Text><TextInput secureTextEntry placeholder="At least 8 characters" placeholderTextColor="#718096" style={styles.settingsInput} value={settingsNewPassword} onChangeText={setSettingsNewPassword} /></View>
                <View style={styles.settingsField}><Text style={styles.settingsFieldLabel}>Confirm new password</Text><TextInput secureTextEntry placeholder="Enter it again" placeholderTextColor="#718096" style={styles.settingsInput} value={settingsConfirmPassword} onChangeText={setSettingsConfirmPassword} /></View>
                <Pressable style={styles.settingsOutlineButton} onPress={() => void changePassword()}><Text style={styles.settingsOutlineButtonText}>Change password</Text><Ionicons name="arrow-forward" size={17} color="#dff7fb" /></Pressable>
              </View>

              <View style={styles.settingsUtilityCard}>
                <Pressable style={styles.settingsUtilityRow} onPress={() => void openSupportEmail()}><View style={styles.settingsUtilityIcon}><Ionicons name="help-buoy-outline" size={18} color="#dbe7ec" /></View><View style={styles.settingsControlCopy}><Text style={styles.settingsControlTitle}>Contact support</Text><Text style={styles.settingsControlSubtitle}>{supportEmails[0]}</Text></View><Ionicons name="chevron-forward" size={18} color="#64748b" /></Pressable>
                <View style={styles.settingsDivider} />
                <Pressable style={styles.settingsUtilityRow} onPress={() => Alert.alert("Sign out", "Sign out of QuestHat on this phone?", [{ text: "Cancel" }, { text: "Sign out", onPress: signOut }])}><View style={styles.settingsUtilityIcon}><Ionicons name="log-out-outline" size={18} color="#dbe7ec" /></View><View style={styles.settingsControlCopy}><Text style={styles.settingsControlTitle}>Sign out</Text><Text style={styles.settingsControlSubtitle}>Sign out on this device only.</Text></View><Ionicons name="chevron-forward" size={18} color="#64748b" /></Pressable>
              </View>

              <View style={styles.settingsDangerZone}>
                <View style={styles.settingsDangerHeading}><Ionicons name="warning-outline" size={19} color="#fb7185" /><Text style={styles.settingsDangerTitle}>Account controls</Text></View>
                <Text style={styles.settingsDangerSubtitle}>Take a reversible break or permanently remove your account and content.</Text>
                <Pressable style={styles.settingsDangerAction} onPress={confirmTemporaryDeactivation} disabled={Boolean(accountActionLoading)}>
                  <View style={styles.settingsDangerActionIcon}><Ionicons name="pause-outline" size={18} color="#f8fafc" /></View><View style={styles.settingsControlCopy}><Text style={styles.settingsDangerActionTitle}>Deactivate temporarily</Text><Text style={styles.settingsControlSubtitle}>Hide everything until you sign in again.</Text></View><Ionicons name="chevron-forward" size={18} color="#64748b" />
                </Pressable>
                <View style={styles.settingsDivider} />
                <Pressable style={styles.settingsDangerAction} onPress={() => { setDeleteAccountConfirmation(""); setShowDeleteAccountModal(true); }} disabled={Boolean(accountActionLoading)}>
                  <View style={[styles.settingsDangerActionIcon, styles.settingsDeleteActionIcon]}><Ionicons name="trash-outline" size={18} color="#fb7185" /></View><View style={styles.settingsControlCopy}><Text style={styles.settingsDeleteActionTitle}>Delete permanently</Text><Text style={styles.settingsControlSubtitle}>Erase your account and uploaded content.</Text></View><Ionicons name="chevron-forward" size={18} color="#fb7185" />
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
        {showSettingsDobPicker ? (
          <View style={styles.pickerModalOverlay}>
            <View style={styles.pickerModalCard}>
              <View style={styles.row}>
                <Text style={styles.questCategory}>Choose birthday</Text>
                <Pressable onPress={() => setShowSettingsDobPicker(false)}>
                  <Text style={styles.link}>Close</Text>
                </Pressable>
              </View>
              <View style={styles.pickerModalBody}>
                <DateTimePicker
                  value={settingsDob ? new Date(settingsDob) : new Date(1990, 0, 1)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, selectedDate) => {
                    if (!selectedDate) return;
                    setSettingsDob(formatDateValue(selectedDate));
                    if (Platform.OS !== "ios") setShowSettingsDobPicker(false);
                  }}
                />
              </View>
              <View style={styles.createActionsRow}>
                <Pressable style={styles.secondaryButton} onPress={() => setShowSettingsDobPicker(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={() => setShowSettingsDobPicker(false)}>
                  <Text style={styles.primaryButtonText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </>
    );
  }

  function renderQuestDetailModal() {
    if (!selectedQuest) return null;
    const creator = getRelationOne(selectedQuest.profiles) as { id?: string | null; display_name: string | null; username: string | null; city: string | null; avatar_url?: string | null } | null;
    const membershipStatus = selectedQuestMembershipStatus || membershipStatusByQuest[selectedQuest.id] || null;
    const isJoined = membershipStatus === "approved";
    const isOwner = Boolean(userId && selectedQuest.creator_id === userId);
    const isManager = selectedQuestManager || isOwner;
    const viewerHasExactAccess = Boolean(userId && selectedQuestExactAccessUserIds.includes(userId));
    const canViewExactAddress = Boolean(
      userId && (() => {
        if (isManager) return true;
        if (selectedQuest.exact_location_visibility === "public") return true;
        if (selectedQuest.exact_location_visibility === "approved_members") {
          return membershipStatus === "approved" && viewerHasExactAccess;
        }
        return viewerHasExactAccess;
      })()
    );
    const visibleApprovedMembers = selectedQuestMembers.filter((member) => (member.status || "approved") === "approved");
    const visibleGuests = visibleApprovedMembers.filter((member) => member.id !== selectedQuest.creator_id && member.role !== "creator");
    const showMembersSection = isManager || membershipStatus === "approved";
    const category = getCategory(selectedQuest);
    const joinedCount = joinCountByQuestId[selectedQuest.id] || 0;
    const fallbackVisual = getCategoryFallbackMedia(category);
    const fallbackImageUrl = `https://questhat.com${fallbackVisual.imagePath}`;
    const mediaItems = selectedQuest.media_items || [];
    return (
      <View style={styles.modalOverlay} pointerEvents="box-none">
        <Pressable style={styles.modalBackdropPressable} onPress={() => setSelectedQuest(null)} />
        <View style={[styles.modalCard, styles.modalCardScrollable, styles.modalCardElevated]}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {selectedQuestLoading ? <ActivityIndicator /> : null}
            <LinearGradient colors={["#173b47", "#111923", "#10121a"]} locations={[0, 0.56, 1]} style={styles.questDetailHero}>
              <View style={styles.questDetailHeroGlow} />
              <View style={styles.questDetailTopRow}>
                <View style={styles.questDetailCategoryPill}>
                  <Ionicons name={getCategoryIcon(category)} size={15} color="#082f3a" />
                  <Text style={styles.questDetailCategoryText}>{category}</Text>
                </View>
                <Pressable style={styles.questDetailCloseButton} onPress={() => setSelectedQuest(null)} accessibilityLabel="Close quest details">
                  <Ionicons name="close" size={21} color="#f8fafc" />
                </Pressable>
              </View>
              <Text style={styles.questDetailTitle}>{selectedQuest.title}</Text>
              <View style={styles.questDetailChips}>
                <View style={styles.questDetailChip}><Ionicons name="speedometer-outline" size={14} color="#b9dce4" /><Text style={styles.questDetailChipText}>{selectedQuest.skill_level || "Any level"}</Text></View>
                <View style={styles.questDetailChip}><Ionicons name={selectedQuest.join_mode === "open" ? "lock-open-outline" : "shield-checkmark-outline"} size={14} color="#b9dce4" /><Text style={styles.questDetailChipText}>{selectedQuest.join_mode === "open" ? "Open to join" : "Approval required"}</Text></View>
                <View style={styles.questDetailChip}><Ionicons name="people-outline" size={14} color="#b9dce4" /><Text style={styles.questDetailChipText}>{joinedCount} {joinedCount === 1 ? "person" : "people"} going</Text></View>
              </View>
            </LinearGradient>

            <View style={styles.questDetailDescriptionCard}>
              <View style={styles.questDetailSectionHeading}>
                <Ionicons name="reader-outline" size={17} color="#9bd8e4" />
                <Text style={styles.questDetailSectionLabel}>ABOUT THIS QUEST</Text>
              </View>
              <Text style={[styles.questDetailDescription, !selectedQuest.description && styles.questDetailDescriptionEmpty]}>
                {selectedQuest.description || "The host has not added a description yet."}
              </Text>
            </View>

            <View style={styles.questDetailFactsCard}>
              <View style={styles.questDetailFactRow}>
                <View style={styles.questDetailFactIcon}><Ionicons name="location-outline" size={19} color="#9bd8e4" /></View>
                <View style={styles.questDetailFactCopy}>
                  <Text style={styles.questDetailFactLabel}>LOCATION</Text>
                  <Text style={styles.questDetailFactValue}>{`${selectedQuest.city || "City to be decided"}${canViewExactAddress && selectedQuest.exact_address ? ` · ${selectedQuest.exact_address}` : ""}`}</Text>
                </View>
              </View>
              {!canViewExactAddress && selectedQuest.exact_address ? (
                <View style={styles.questDetailPrivacyNote}>
                  <Ionicons name="lock-closed-outline" size={15} color="#d6ad63" />
                  <Text style={styles.questDetailPrivacyText}>Exact location stays private until the host shares it with you.</Text>
                </View>
              ) : null}
              <View style={styles.questDetailFactDivider} />
              <View style={styles.questDetailFactRow}>
                <View style={styles.questDetailFactIcon}><Ionicons name="calendar-outline" size={19} color="#9bd8e4" /></View>
                <View style={styles.questDetailFactCopy}>
                  <Text style={styles.questDetailFactLabel}>WHEN</Text>
                  <Text style={styles.questDetailFactValue}>{selectedQuest.availability || "Let's find the best time"}</Text>
                </View>
              </View>
              <View style={styles.questDetailFactDivider} />
              <View style={styles.questDetailFactRow}>
                <View style={styles.questDetailFactIcon}><Ionicons name="time-outline" size={19} color="#9bd8e4" /></View>
                <View style={styles.questDetailFactCopy}>
                  <Text style={styles.questDetailFactLabel}>POSTED</Text>
                  <Text style={styles.questDetailFactValue}>{formatDate(selectedQuest.created_at) || "Recently"}</Text>
                </View>
              </View>
            </View>
            <View style={styles.peopleSection}>
              <Text style={styles.detailLabel}>Hosted by</Text>
              <Pressable
                style={styles.hostProfileRow}
                onPress={creator?.id ? () => void openProfileFromQuest(creator.id) : undefined}
                disabled={!creator?.id}
              >
                {creator?.avatar_url ? (
                  <Image source={{ uri: creator.avatar_url }} style={styles.hostAvatar} />
                ) : (
                  <View style={styles.hostAvatarFallback}>
                    <Ionicons name="person" size={20} color="#9bc8d2" />
                  </View>
                )}
                <View style={styles.personIdentity}>
                  <View style={styles.personNameRow}>
                    <Text style={styles.detailValue} numberOfLines={1}>{creator?.display_name || creator?.username || "Unknown host"}</Text>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>Host</Text>
                    </View>
                  </View>
                  <Text style={styles.detailMuted} numberOfLines={1}>{creator?.city || "Quest organizer"}</Text>
                </View>
                {creator?.id ? <Ionicons name="chevron-forward" size={20} color="#788295" /> : null}
              </Pressable>
            </View>
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Media</Text>
              {mediaItems.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
                  {mediaItems.map((item, index) => (
                    <View key={`${selectedQuest.id}-${index}`} style={styles.detailMediaCard}>
                      <Pressable
                        style={styles.detailMediaCardPressable}
                        onPress={() => setPreviewMedia({ ...item, url: item.url || fallbackImageUrl })}
                      >
                        <Image source={{ uri: item.thumbnailUrl || item.url || fallbackImageUrl }} style={styles.detailMediaImage} />
                        {item.type === "video" ? (
                          <View style={styles.detailVideoBadge}>
                            <Ionicons name="expand-outline" size={14} color="#fff" />
                          </View>
                        ) : null}
                      </Pressable>
                      <Text style={styles.detailMuted} numberOfLines={1}>{item.label || item.type}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.detailMediaFallbackCard}>
                  <Image source={{ uri: fallbackImageUrl }} style={styles.detailMediaImage} />
                  <Text style={styles.detailMuted}>No media attached yet. Placeholder pulled from the same category fallback as the website.</Text>
                </View>
              )}
            </View>
            {showMembersSection ? (
              <View style={styles.peopleSection}>
                <View style={styles.peopleSectionHeader}>
                  <Text style={styles.detailLabel}>Guests</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{visibleGuests.length}</Text>
                  </View>
                </View>
                {visibleGuests.length ? visibleGuests.map((member) => {
                  const hasExactAccess = selectedQuestExactAccessUserIds.includes(member.id);
                  return (
                    <View key={member.id} style={styles.personRow}>
                      <Pressable style={styles.personRowProfile} onPress={() => void openProfile(member.id)}>
                        {member.avatar_url ? (
                          <Image source={{ uri: member.avatar_url }} style={styles.commentAvatar} />
                        ) : (
                          <View style={styles.commentAvatarFallback}>
                            <Ionicons name="person" size={16} color="#9bc8d2" />
                          </View>
                        )}
                        <View style={styles.personIdentity}>
                          <Text style={styles.detailValue}>{member.display_name || member.username || "Member"}</Text>
                          <Text style={styles.detailMuted}>{member.role === "cohost" ? "Co-host" : "Guest"}</Text>
                        </View>
                      </Pressable>
                      {isManager && member.id !== selectedQuest.creator_id ? (
                        <Pressable
                          style={[styles.addressAccessButton, hasExactAccess && styles.addressAccessButtonActive]}
                          onPress={() => void setQuestExactAddressAccess(selectedQuest.id, member.id, !hasExactAccess)}
                        >
                          <Ionicons name={hasExactAccess ? "location" : "location-outline"} size={16} color={hasExactAccess ? "#08121a" : "#9bc8d2"} />
                          <Text style={[styles.addressAccessText, hasExactAccess && styles.addressAccessTextActive]}>{hasExactAccess ? "Shared" : "Share"}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                }) : (
                  <View style={styles.emptyPeopleRow}>
                    <Ionicons name="people-outline" size={20} color="#788295" />
                    <Text style={styles.detailMuted}>No guests have joined yet.</Text>
                  </View>
                )}
              </View>
            ) : null}
            {isManager && selectedQuestPendingMembers.length ? (
              <View style={styles.peopleSection}>
                <View style={styles.peopleSectionHeader}>
                  <Text style={styles.detailLabel}>Join requests</Text>
                  <View style={styles.requestCountBadge}>
                    <Text style={styles.requestCountBadgeText}>{selectedQuestPendingMembers.length} pending</Text>
                  </View>
                </View>
                {selectedQuestPendingMembers.map((member) => (
                  <View key={`pending-${member.id}`} style={styles.requestCard}>
                    <Pressable style={styles.personRowProfile} onPress={() => void openProfile(member.id)}>
                      {member.avatar_url ? (
                        <Image source={{ uri: member.avatar_url }} style={styles.commentAvatar} />
                      ) : (
                        <View style={styles.commentAvatarFallback}>
                          <Ionicons name="person" size={16} color="#9bc8d2" />
                        </View>
                      )}
                      <View style={styles.personIdentity}>
                        <Text style={styles.detailValue}>{member.display_name || member.username || "Member"}</Text>
                        <Text style={styles.detailMuted}>Wants to join this quest</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#788295" />
                    </Pressable>
                    <View style={styles.requestActions}>
                      <Pressable style={styles.requestApproveButton} onPress={() => void updateQuestMembershipStatus(selectedQuest.id, member.id, "approved")}>
                        <Ionicons name="checkmark" size={18} color="#08121a" />
                        <Text style={styles.requestApproveText}>Approve</Text>
                      </Pressable>
                      <Pressable style={styles.requestDeclineButton} onPress={() => void updateQuestMembershipStatus(selectedQuest.id, member.id, "declined")}>
                        <Ionicons name="close" size={18} color="#f87171" />
                        <Text style={styles.requestDeclineText}>Decline</Text>
                      </Pressable>
                    </View>
                    <Pressable style={styles.approveWithAddressButton} onPress={() => void updateQuestMembershipStatus(selectedQuest.id, member.id, "approved", { shareExactAddress: true })}>
                      <Ionicons name="location-outline" size={16} color="#9bc8d2" />
                      <Text style={styles.approveWithAddressText}>Approve and share exact address</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.commentThreadCard}>
              <View style={styles.commentThreadHeader}>
                <Pressable style={styles.commentSortPill} onPress={() => {}}>
                  <Text style={styles.commentSortText}>Most relevant</Text>
                  <Ionicons name="chevron-down" size={14} color={shellMuted} />
                </Pressable>
                <Text style={styles.detailMuted}>{selectedQuestComments.length} comments</Text>
              </View>
              {selectedQuestComments.length ? selectedQuestComments.map((comment) => {
                const commentProfile = getRelationOne(comment.profiles);
                return (
                  <Pressable key={comment.id} style={styles.commentThreadItem} onPress={commentProfile?.id ? () => void openProfile(commentProfile.id) : undefined}>
                    {commentProfile?.avatar_url ? (
                      <Image source={{ uri: commentProfile.avatar_url }} style={styles.commentThreadAvatar} />
                    ) : (
                      <View style={styles.commentThreadAvatarFallback}>
                        <Ionicons name="person" size={14} color="#9bc8d2" />
                      </View>
                    )}
                    <View style={styles.commentThreadBody}>
                      <View style={styles.commentThreadMetaRow}>
                        <Text style={styles.commentThreadName} numberOfLines={1}>
                          {commentProfile?.display_name || commentProfile?.username || "Member"}
                        </Text>
                        <Text style={styles.commentThreadTime}>{formatDate(comment.created_at)}</Text>
                      </View>
                      <Text style={styles.commentThreadText}>{normalizeMessageBody(comment.body)}</Text>
                      <View style={styles.commentThreadActionRow}>
                        <Text style={styles.commentThreadActionLabel}>Reply</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              }) : <Text style={styles.detailMuted}>No comments yet.</Text>}
            </View>
            <View style={styles.detailActionTray}>
              <Pressable style={styles.detailActionItem} onPress={() => void toggleSaveSelectedQuest()}>
                <View style={[styles.detailActionIcon, selectedQuestSaved && styles.detailActionIconActive]}>
                  <Ionicons name={selectedQuestSaved ? "bookmark" : "bookmark-outline"} size={21} color={selectedQuestSaved ? "#08121a" : "#f8fafc"} />
                </View>
                <Text style={styles.detailActionLabel}>{selectedQuestSaved ? "Saved" : "Save"}</Text>
              </Pressable>
              {!isOwner ? (
                <Pressable style={styles.detailActionItem} onPress={() => void toggleJoinSelectedQuest()}>
                  <View style={[styles.detailActionIcon, isJoined && styles.detailActionIconActive]}>
                    <Ionicons name={isJoined ? "checkmark" : "person-add-outline"} size={21} color={isJoined ? "#08121a" : "#f8fafc"} />
                  </View>
                  <Text style={styles.detailActionLabel}>
                    {membershipStatus === "pending" ? "Pending" : isJoined ? "Leave" : "Join"}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.detailActionItem}
                onStartShouldSetResponder={() => true}
                onPress={() => void openQuestConversation(selectedQuest, "public")}
              >
                <View style={styles.detailActionIcon}>
                  <Ionicons name="chatbox-outline" size={21} color="#f8fafc" />
                </View>
                <Text style={styles.detailActionLabel}>Comment</Text>
              </Pressable>
              <Pressable
                style={styles.detailActionItem}
                onStartShouldSetResponder={() => true}
                onPress={() => void openQuestConversation(selectedQuest, "private", creator?.id || selectedQuest.creator_id || null)}
              >
                <View style={styles.detailActionIcon}>
                  <Ionicons name="paper-plane-outline" size={21} color="#f8fafc" />
                </View>
                <Text style={styles.detailActionLabel}>Message</Text>
              </Pressable>
            </View>
            <View style={styles.detailDangerZone}>
              {isOwner ? (
                <Pressable
                  style={styles.detailDangerButton}
                  onPress={() => void deleteQuestListing(selectedQuest.id)}
                >
                  <Ionicons name="trash-outline" size={17} color="#f87171" />
                  <Text style={styles.detailDangerText}>Delete listing</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.detailDangerButton}
                  onPress={() => openQuestReportModal(selectedQuest)}
                >
                  <Ionicons name="flag-outline" size={17} color="#f87171" />
                  <Text style={styles.detailDangerText}>Report listing</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  function renderOnboardingWizard() {
    if (!showOnboardingWizard || !signedIn) return null;
    const steps = [
      { label: "Location", title: "Start with your area", detail: "City-level location helps us surface plans you can actually make.", icon: "navigate-outline" },
      { label: "About", title: "What should people know?", detail: "A short introduction makes joining a new plan feel less awkward.", icon: "chatbubble-ellipses-outline" },
      { label: "Interests", title: "Choose your kind of plans", detail: "These personalize your feed and can power category alerts later.", icon: "sparkles-outline" },
      { label: "Photo", title: "Put a face to the name", detail: "A recognizable photo builds trust when people meet offline.", icon: "camera-outline" },
    ] as const;
    const stepComplete = [Boolean(settingsCity.trim()), Boolean(settingsBio.trim()), onboardingInterestIds.length > 0, Boolean(settingsAvatarUri)];
    const currentStep = steps[onboardingStep];
    const doneCount = stepComplete.filter(Boolean).length;
    return (
      <View style={styles.modalOverlay} pointerEvents="box-none">
        <Pressable style={styles.modalBackdropPressable} onPress={() => undefined} />
        <View style={styles.onboardingCard}>
          <View style={styles.onboardingHeader}>
            <View style={styles.onboardingHeaderTop}>
              <View style={styles.onboardingBrandMark}><Ionicons name="location" size={19} color="#082f3a" /></View>
              <View style={styles.onboardingHeaderCopy}>
                <Text style={styles.onboardingEyebrow}>MAKE QUESTHAT YOURS</Text>
                <Text style={styles.onboardingProgressLabel}>Step {onboardingStep + 1} of {steps.length}</Text>
              </View>
              <Pressable style={styles.onboardingSkipButton} onPress={() => void skipOnboarding()} disabled={onboardingSaving}>
                <Text style={styles.onboardingSkipText}>Later</Text>
              </Pressable>
            </View>
            <View style={styles.onboardingProgressTrack}>
              <View style={[styles.onboardingProgressFill, { width: `${((onboardingStep + 1) / steps.length) * 100}%` }]} />
            </View>
            <View style={styles.onboardingStepRail}>
              {steps.map((step, index) => (
                <Pressable key={step.label} style={styles.onboardingStepItem} onPress={() => setOnboardingStep(index)}>
                  <View style={[styles.onboardingStepDot, index === onboardingStep && styles.onboardingStepDotActive, stepComplete[index] && styles.onboardingStepDotComplete]}>
                    {stepComplete[index] ? <Ionicons name="checkmark" size={11} color="#082f3a" /> : <Text style={[styles.onboardingStepNumber, index === onboardingStep && styles.onboardingStepNumberActive]}>{index + 1}</Text>}
                  </View>
                  <Text style={[styles.onboardingStepLabel, index === onboardingStep && styles.onboardingStepLabelActive]}>{step.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <ScrollView
            style={styles.onboardingScroll}
            contentContainerStyle={styles.onboardingContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <View style={styles.onboardingTitleRow}>
              <View style={styles.onboardingTitleIcon}><Ionicons name={currentStep.icon} size={24} color="#9bd8e4" /></View>
              <View style={styles.onboardingTitleCopy}>
                <Text style={styles.onboardingTitle}>{currentStep.title}</Text>
                <Text style={styles.onboardingDetail}>{currentStep.detail}</Text>
              </View>
            </View>

            {onboardingStep === 0 ? (
              <View style={styles.onboardingFormCard}>
                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingFieldLabel}>City</Text>
                  <View style={styles.onboardingInputWrap}><Ionicons name="business-outline" size={18} color="#6daec2" /><TextInput placeholder="Miami" placeholderTextColor="#64748b" style={styles.onboardingInput} value={settingsCity} onChangeText={setSettingsCity} /></View>
                </View>
                <View style={styles.onboardingSplitFields}>
                  <View style={[styles.onboardingField, styles.onboardingSplitField]}><Text style={styles.onboardingFieldLabel}>State / region</Text><TextInput placeholder="Florida" placeholderTextColor="#64748b" style={styles.onboardingStandaloneInput} value={settingsRegion} onChangeText={setSettingsRegion} /></View>
                  <View style={[styles.onboardingField, styles.onboardingCountryField]}><Text style={styles.onboardingFieldLabel}>Country</Text><TextInput placeholder="US" placeholderTextColor="#64748b" style={styles.onboardingStandaloneInput} value={settingsCountryCode} onChangeText={setSettingsCountryCode} autoCapitalize="characters" maxLength={2} /></View>
                </View>
                <View style={styles.onboardingPrivacyNote}><Ionicons name="shield-checkmark-outline" size={17} color="#9bc8d2" /><Text style={styles.onboardingPrivacyText}>We use your area for discovery. Your exact address is never added here.</Text></View>
              </View>
            ) : null}
            {onboardingStep === 1 ? (
              <View style={styles.onboardingFormCard}>
                <TextInput multiline placeholder="Example: New to the area, into live music, weekend hikes, and finding the best tacos." placeholderTextColor="#64748b" style={styles.onboardingBioInput} value={settingsBio} onChangeText={setSettingsBio} maxLength={280} textAlignVertical="top" />
                <View style={styles.onboardingBioFooter}><Text style={styles.onboardingHint}>Keep it casual. You can change this anytime.</Text><Text style={styles.onboardingCharacterCount}>{settingsBio.length}/280</Text></View>
              </View>
            ) : null}
            {onboardingStep === 2 ? (
              <View style={styles.onboardingFormCard}>
                <View style={styles.onboardingSelectionHeader}><Text style={styles.onboardingSelectionTitle}>Pick at least three</Text><Text style={styles.onboardingSelectionCount}>{onboardingInterestIds.length} selected</Text></View>
                <View style={styles.onboardingInterestGrid}>
                  {hobbies.map((option) => {
                    const active = onboardingInterestIds.includes(option.id);
                    return (
                      <Pressable
                        key={option.id}
                        style={[styles.onboardingInterestChip, active && styles.onboardingInterestChipActive]}
                        onPress={() => setOnboardingInterestIds((current) => current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id])}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                      >
                        <Ionicons name={getCategoryIcon(option.category || option.name)} size={16} color={active ? "#082f3a" : "#9bc8d2"} />
                        <Text style={[styles.onboardingInterestText, active && styles.onboardingInterestTextActive]}>{option.name}</Text>
                        {active ? <Ionicons name="checkmark" size={14} color="#082f3a" /> : null}
                      </Pressable>
                    );
                  })}
                </View>
                {!hobbies.length ? <View style={styles.onboardingLoadingRow}><ActivityIndicator size="small" color="#9bd8e4" /><Text style={styles.onboardingHint}>Loading interests...</Text></View> : null}
              </View>
            ) : null}
            {onboardingStep === 3 ? (
              <View style={styles.onboardingPhotoCard}>
                <Pressable style={styles.onboardingAvatarButton} onPress={() => void uploadProfilePhoto()} disabled={uploadingAvatar}>
                  {settingsAvatarUri ? <Image source={{ uri: settingsAvatarUri }} style={styles.onboardingAvatar} /> : <LinearGradient colors={["#1d3d49", "#0f212a"]} style={styles.onboardingAvatarFallback}><Ionicons name="person-outline" size={48} color="#9bd8e4" /></LinearGradient>}
                  <View style={styles.onboardingCameraBadge}>{uploadingAvatar ? <ActivityIndicator size="small" color="#082f3a" /> : <Ionicons name="camera" size={18} color="#082f3a" />}</View>
                </Pressable>
                <Text style={styles.onboardingPhotoTitle}>{settingsAvatarUri ? "Looking good" : "Add a clear profile photo"}</Text>
                <Text style={styles.onboardingPhotoDetail}>Use a recent photo where your face is easy to recognize.</Text>
                <Pressable style={styles.onboardingPhotoAction} onPress={() => void uploadProfilePhoto()} disabled={uploadingAvatar}><Text style={styles.onboardingPhotoActionText}>{uploadingAvatar ? "Uploading..." : settingsAvatarUri ? "Choose another photo" : "Choose a photo"}</Text></Pressable>
                {settingsAvatarUri ? <Pressable onPress={() => void deleteProfilePhoto()} disabled={uploadingAvatar}><Text style={styles.onboardingRemovePhoto}>Remove photo</Text></Pressable> : null}
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.onboardingFooter}>
            <View style={styles.onboardingFooterCopy}><Text style={styles.onboardingFooterCount}>{doneCount}/4 complete</Text><Text style={styles.onboardingFooterHint}>Editable anytime in Settings</Text></View>
            {onboardingStep > 0 ? <Pressable style={styles.onboardingBackButton} onPress={() => setOnboardingStep((current) => Math.max(0, current - 1))} disabled={onboardingSaving}><Ionicons name="arrow-back" size={20} color="#dff7fb" /></Pressable> : null}
            <Pressable style={styles.onboardingNextButton} onPress={() => onboardingStep < 3 ? setOnboardingStep((current) => Math.min(3, current + 1)) : void saveOnboarding()} disabled={onboardingSaving}>
              {onboardingSaving ? <ActivityIndicator size="small" color="#082f3a" /> : <><Text style={styles.onboardingNextText}>{onboardingStep < 3 ? "Continue" : "Finish"}</Text><Ionicons name={onboardingStep < 3 ? "arrow-forward" : "checkmark"} size={19} color="#082f3a" /></>}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  function renderQuestionModal() {
    if (!showQuestionModal || !questionTarget) return null;
    const creator = getRelationOne(questionTarget.profiles);
    return (
      <View style={styles.modalOverlay} pointerEvents="box-none">
        <Pressable style={styles.modalBackdropPressable} onPress={() => closeQuestionModal()} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ width: "100%" }}
          keyboardVerticalOffset={72}
        >
          <View style={[styles.modalCard, styles.modalCardKeyboard, styles.modalCardKeyboardRaised]}>
            <ScrollView
              contentContainerStyle={[styles.modalContent, styles.modalContentKeyboard]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.row}>
                <Text style={styles.questCategory}>{questionMode === "public" ? "Comment" : "Message"}</Text>
                <Pressable onPress={() => closeQuestionModal()}>
                  <Text style={styles.link}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.questTitle}>{questionTarget.title}</Text>
              <Text style={styles.questMeta}>{creator?.display_name || creator?.username || "QuestHat host"}</Text>
              <View style={styles.commentThreadCard}>
                <View style={styles.commentThreadHeader}>
                  <Pressable style={styles.commentSortPill} onPress={() => {}}>
                    <Text style={styles.commentSortText}>Most relevant</Text>
                    <Ionicons name="chevron-down" size={14} color={shellMuted} />
                  </Pressable>
                  <Text style={styles.detailMuted}>{questionComments.length} {questionMode === "public" ? "comments" : "messages"}</Text>
                </View>
                {questionComments.length ? questionComments.map((comment) => {
                  const commentProfile = getRelationOne(comment.profiles);
                  return (
                    <View key={comment.id} style={styles.commentThreadItem}>
                      {commentProfile?.avatar_url ? (
                        <Image source={{ uri: commentProfile.avatar_url }} style={styles.commentThreadAvatar} />
                      ) : (
                        <View style={styles.commentThreadAvatarFallback}>
                          <Ionicons name="person" size={14} color="#9bc8d2" />
                        </View>
                      )}
                      <View style={styles.commentThreadBody}>
                        <View style={styles.commentThreadMetaRow}>
                          <Text style={styles.commentThreadName} numberOfLines={1}>{commentProfile?.display_name || commentProfile?.username || "Someone"}</Text>
                          <Text style={styles.commentThreadTime}>{formatDate(comment.created_at)}</Text>
                        </View>
                        <Text style={styles.commentThreadText}>{normalizeMessageBody(comment.body)}</Text>
                      </View>
                    </View>
                  );
                }) : <Text style={styles.detailMuted}>No comments yet.</Text>}
              </View>
              <View style={styles.commentComposerCard}>
                <View style={styles.commentComposerRow}>
                  {creator?.avatar_url ? (
                    <Image source={{ uri: creator.avatar_url }} style={styles.commentComposerAvatar} />
                  ) : (
                    <View style={styles.commentComposerAvatarFallback}>
                      <Ionicons name="person" size={14} color="#9bc8d2" />
                    </View>
                  )}
                  <TextInput
                    multiline
                    placeholder={questionMode === "public" ? "Write a comment..." : "Write a direct message..."}
                    placeholderTextColor="#94a3b8"
                    style={[styles.input, styles.textArea, styles.questionInput, styles.commentComposerInput]}
                    value={questionText}
                    onChangeText={setQuestionText}
                  />
                  <Pressable style={styles.commentSendButton} onPress={() => void sendQuestionFromModal()} disabled={sendingQuestion}>
                    <Ionicons name="send" size={18} color="#ffffff" />
                  </Pressable>
                </View>
                <View style={styles.commentComposerActions}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => {
                      saveQuestionDraft(questionTarget.id, questionMode);
                      const nextMode = questionMode === "public" ? "private" : "public";
                      setQuestionMode(nextMode);
                      setQuestionText(questionDrafts[getQuestionDraftKey(questionTarget.id, nextMode)] || "");
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>{questionMode === "public" ? "Switch to message" : "Switch to comment"}</Text>
                  </Pressable>
                  <Pressable style={styles.primaryButton} onPress={() => void sendQuestionFromModal()} disabled={sendingQuestion}>
                    <Text style={styles.primaryButtonText}>{sendingQuestion ? "Sending..." : "Send"}</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  function renderProfileModal() {
    if (!selectedProfile) return null;
    const isOwnProfile = Boolean(userId && selectedProfile.id === userId);
    const relationship = selectedProfileRelationship;
    const viewerBlockedThem = Boolean(relationship && relationship.status === "blocked" && relationship.requester_id === userId);
    const outgoingPending = Boolean(relationship && relationship.status === "pending" && relationship.requester_id === userId);
    const incomingPending = Boolean(relationship && relationship.status === "pending" && relationship.addressee_id === userId);
    const isFriends = Boolean(relationship && relationship.status === "accepted");
    const locationParts = [selectedProfile.city, selectedProfile.region, selectedProfile.country_code ? selectedProfile.country_code.toUpperCase() : ""].filter(Boolean);
    const displayLocation = locationParts.length ? locationParts.join(", ") : "Profile details not set";
    return (
      <View style={styles.modalOverlay} pointerEvents="box-none">
        <Pressable style={styles.modalBackdropPressable} onPress={() => setSelectedProfile(null)} />
        <View style={[styles.modalCard, styles.modalCardScrollable, styles.modalCardElevated]}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <View style={styles.row}>
              <Text style={styles.questCategory}>Profile</Text>
              <Pressable onPress={() => setSelectedProfile(null)}>
                <Text style={styles.link}>Close</Text>
              </Pressable>
            </View>
            {selectedProfileLoading ? <ActivityIndicator /> : null}
            <View style={styles.profileHero}>
              {selectedProfile.avatar_url ? (
                <Image source={{ uri: selectedProfile.avatar_url }} style={styles.profileAvatarLarge} />
              ) : (
                <View style={styles.profileAvatarLargeFallback} />
              )}
              <Text style={styles.profileName}>{selectedProfile.display_name || selectedProfile.username || "QuestHat user"}</Text>
              <Text style={styles.questMeta}>{selectedProfile.username ? `@${selectedProfile.username}` : "Username not set"}</Text>
              <Text style={styles.questMeta}>{displayLocation}</Text>
              <Text style={styles.detailMuted}>{selectedProfile.quests?.length || 0} recent listings</Text>
            </View>
            {selectedProfile.bio ? (
              <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>Bio</Text>
                <Text style={styles.detailValue}>{selectedProfile.bio}</Text>
              </View>
            ) : null}
            <View style={styles.detailBox}>
              <View style={styles.row}>
                <Text style={styles.detailLabel}>Friends</Text>
                <Text style={styles.detailMuted}>{selectedProfileFriends.length} total</Text>
              </View>
              <Text style={styles.detailMuted}>
                {viewerBlockedThem
                  ? "This profile is blocked."
                  : isFriends
                    ? "You and this user are friends."
                    : incomingPending
                      ? "This user requested to be your friend."
                      : outgoingPending
                        ? "Your friend request is pending."
                        : "Not connected yet."}
              </Text>
              {selectedProfile.friends_visibility === "private" && !isOwnProfile && !(relationship && relationship.status === "accepted") ? (
                <Text style={styles.detailMuted}>Friends are private.</Text>
              ) : selectedProfileFriends.length ? (
                <>
                  {selectedProfileFriends.slice(0, selectedProfileFriendsExpanded ? selectedProfileFriends.length : 5).map((friend) => (
                    <Pressable key={friend.id} style={styles.profileQuestRow} onPress={() => void openProfile(friend.id)}>
                      <Text style={styles.detailValue} numberOfLines={1}>{friend.display_name || friend.username || "Friend"}</Text>
                      <Text style={styles.detailMuted} numberOfLines={1}>Tap to view profile</Text>
                    </Pressable>
                  ))}
                  {selectedProfileFriends.length > 5 ? (
                    <Pressable style={styles.secondaryButton} onPress={() => setSelectedProfileFriendsExpanded((current) => !current)}>
                      <Text style={styles.secondaryButtonText}>{selectedProfileFriendsExpanded ? "Show fewer" : "Show all friends"}</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <Text style={styles.detailMuted}>No friends yet.</Text>
              )}
            </View>
            {!isOwnProfile ? (
              <View style={styles.detailActions}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => {
                    if (viewerBlockedThem) {
                      void unblockProfile(selectedProfile.id);
                      return;
                    }
                    if (isFriends) {
                      void removeFriend(selectedProfile.id);
                      return;
                    }
                    if (incomingPending) {
                      void acceptFriendRequest(selectedProfileRelationship?.requester_id || selectedProfile.id);
                      return;
                    }
                    if (outgoingPending) {
                      void cancelOutgoingFriendRequest(selectedProfile.id);
                      return;
                    }
                    void addFriend(selectedProfile.id);
                  }}
                >
                  <Text style={styles.primaryButtonText}>
                    {viewerBlockedThem ? "Unblock" : isFriends ? "Unfriend" : incomingPending ? "Accept request" : outgoingPending ? "Cancel request" : "Add friend"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    Alert.alert(
                      "More actions",
                      "Choose an action for this profile.",
                      [
                        viewerBlockedThem
                          ? { text: "Unblock", onPress: () => void unblockProfile(selectedProfile.id) }
                          : { text: "Block", style: "destructive", onPress: () => void blockProfile(selectedProfile.id) },
                        { text: "Report", style: "destructive", onPress: () => setShowReportProfileModal(true) },
                        { text: "Close", style: "cancel" },
                      ]
                    );
                  }}
                >
                  <Text style={styles.secondaryButtonText}>More actions</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Recent quests</Text>
              <Text style={styles.detailMuted}>Tap a quest to open the full detail page.</Text>
              {selectedProfile.quests?.length ? selectedProfile.quests.map((quest) => (
                <Pressable
                  key={quest.id}
                  style={styles.profileQuestRow}
                  onPress={() => {
                    setSelectedProfile(null);
                    void openQuestDetail(quest.id);
                  }}
                >
                  <Text style={styles.detailValue} numberOfLines={1}>{quest.title}</Text>
                  <Text style={styles.detailMuted} numberOfLines={1}>{quest.city || "City tbd"}</Text>
                </Pressable>
              )) : <Text style={styles.detailMuted}>No recent quests yet.</Text>}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  function renderReportProfileModal() {
    if (!showReportProfileModal || !selectedProfile) return null;
    const currentReasons = REPORT_REASON_OPTIONS.profile_account;
    return (
      <View style={styles.modalOverlay} pointerEvents="box-none">
        <Pressable style={styles.modalBackdropPressable} onPress={() => setShowReportProfileModal(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ width: "100%" }}
          keyboardVerticalOffset={72}
        >
          <View style={[styles.modalCard, styles.modalCardKeyboard, styles.modalCardKeyboardRaised, styles.modalCardElevated]}>
            <ScrollView
              contentContainerStyle={[styles.modalContent, styles.modalContentKeyboard]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.row}>
                <Text style={styles.questCategory}>Report profile</Text>
                <Pressable onPress={() => setShowReportProfileModal(false)}>
                  <Text style={styles.link}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.questTitle}>{selectedProfile.display_name || selectedProfile.username || "User"}</Text>
              <Text style={styles.detailMuted}>Report this profile for a policy or safety issue.</Text>
              <Text style={styles.fieldLabel}>Reason</Text>
              <View style={[styles.segment, styles.reportStack]}>
                {currentReasons.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.segmentButton, styles.reportStackButton, reportProfileReason === option.value && styles.segmentActive]}
                    onPress={() => setReportProfileReason(option.value)}
                  >
                    <Text style={[styles.segmentText, reportProfileReason === option.value && styles.segmentTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                multiline
                placeholder="Add details"
                placeholderTextColor="#94a3b8"
                style={[styles.input, styles.textArea]}
                value={reportProfileDetails}
                onChangeText={setReportProfileDetails}
              />
              <View style={styles.detailActions}>
                <Pressable style={styles.primaryButton} onPress={() => void submitProfileReport()} disabled={submittingProfileReport}>
                  <Text style={styles.primaryButtonText}>{submittingProfileReport ? "Submitting..." : "Submit report"}</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => setShowReportProfileModal(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  function renderReportQuestModal() {
    if (!showReportQuestModal || !reportQuestTarget) return null;
    const currentReasons = REPORT_REASON_OPTIONS[reportQuestContext];
    return (
      <View style={[styles.modalOverlay, styles.modalOverlayRaised]} pointerEvents="box-none">
        <Pressable style={styles.modalBackdropPressable} onPress={() => setShowReportQuestModal(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ width: "100%" }}
          keyboardVerticalOffset={72}
        >
          <View style={[styles.modalCard, styles.modalCardKeyboard, styles.modalCardKeyboardRaised, styles.modalCardElevated]} onStartShouldSetResponder={() => true}>
            <ScrollView
              contentContainerStyle={[styles.modalContent, styles.modalContentKeyboard]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              automaticallyAdjustKeyboardInsets
            >
              <View style={styles.row}>
                <Text style={styles.questCategory}>Report listing</Text>
                <Pressable onPress={() => setShowReportQuestModal(false)}>
                  <Text style={styles.link}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.detailMuted}>Report this quest for a policy or safety issue.</Text>
              <Text style={styles.fieldLabel}>What are you reporting?</Text>
              <View style={[styles.segment, styles.reportStack]}>
                {REPORT_CONTEXT_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.segmentButton, styles.reportStackButton, reportQuestContext === option.value && styles.segmentActive]}
                    onPress={() => {
                      setReportQuestContext(option.value);
                      setReportQuestReason(REPORT_REASON_OPTIONS[option.value][0]?.value || "other");
                    }}
                  >
                    <Text style={[styles.segmentText, reportQuestContext === option.value && styles.segmentTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Reason</Text>
              <View style={[styles.segment, styles.reportStack]}>
                {currentReasons.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.segmentButton, styles.reportStackButton, reportQuestReason === option.value && styles.segmentActive]}
                    onPress={() => setReportQuestReason(option.value)}
                  >
                    <Text style={[styles.segmentText, reportQuestReason === option.value && styles.segmentTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                placeholder={reportQuestContext === "in_person" ? "Please describe what happened." : "Add any details that can help us review."}
                placeholderTextColor="#94a3b8"
                style={[styles.input, styles.textArea]}
                multiline
                value={reportQuestDetails}
                onChangeText={setReportQuestDetails}
              />
              <View style={styles.detailActions}>
                <Pressable style={styles.primaryButton} onPress={() => void submitQuestReport()} disabled={submittingQuestReport}>
                  <Text style={styles.primaryButtonText}>{submittingQuestReport ? "Submitting..." : "Submit report"}</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => setShowReportQuestModal(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  function renderQuestActionsMenu() {
    if (!showQuestActionsMenu || !questActionsTarget) return null;
    const isSaved = bookmarkedQuestIds.includes(questActionsTarget.id);
    const isOwner = Boolean(userId && questActionsTarget.creator_id === userId);
    return (
      <View style={styles.modalOverlay} pointerEvents="box-none">
        <Pressable style={styles.modalBackdropPressable} onPress={closeQuestActionsMenu} />
        <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
          <ScrollView contentContainerStyle={styles.modalContent} nestedScrollEnabled showsVerticalScrollIndicator>
            <View style={styles.row}>
              <Text style={styles.questCategory}>Quest actions</Text>
              <Pressable onPress={closeQuestActionsMenu}>
                <Text style={styles.link}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.detailMuted}>Choose an action for this quest.</Text>
            <View style={styles.detailActions}>
              <Pressable style={styles.secondaryButton} onPress={() => { closeQuestActionsMenu(); void openQuestDetail(questActionsTarget.id); }}>
                <Text style={styles.secondaryButtonText}>Open</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => { closeQuestActionsMenu(); void openQuestConversation(questActionsTarget, "public"); }}>
                <Text style={styles.secondaryButtonText}>Comment</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => { closeQuestActionsMenu(); void openQuestConversation(questActionsTarget, "private", questActionsTarget.creator_id || null); }}>
                <Text style={styles.secondaryButtonText}>Message</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => { closeQuestActionsMenu(); void toggleBookmark(questActionsTarget); }}>
                <Text style={styles.secondaryButtonText}>{isSaved ? "Unsave" : "Save"}</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => { closeQuestActionsMenu(); void shareQuest(questActionsTarget); }}>
                <Text style={styles.secondaryButtonText}>Share</Text>
              </Pressable>
              {isOwner ? (
                <Pressable
                  style={[styles.secondaryButton, { borderColor: "#ef4444" }]}
                  onPress={() => {
                    const target = questActionsTarget;
                    closeQuestActionsMenu();
                    if (!target) return;
                    void deleteQuestListing(target.id);
                  }}
                >
                  <Text style={[styles.secondaryButtonText, { color: "#ef4444" }]}>Delete</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.secondaryButton, { borderColor: "#ef4444" }]}
                  onPress={() => {
                    const target = questActionsTarget;
                    closeQuestActionsMenu();
                    if (!target) return;
                    openQuestReportModal(target as QuestDetail);
                  }}
                >
                  <Text style={[styles.secondaryButtonText, { color: "#ef4444" }]}>Report</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  function renderNotificationPreferencesModal() {
    if (!showNotificationPreferences) return null;
    const options: Array<{
      key: keyof NotificationPreferences;
      title: string;
      description: string;
      icon: keyof typeof Ionicons.glyphMap;
    }> = [
      { key: "messages", title: "Private messages", description: "New direct messages from other members.", icon: "mail-outline" },
      { key: "comments", title: "Comments", description: "New comments on quests you host.", icon: "chatbox-outline" },
      { key: "join_updates", title: "Join decisions", description: "When your request is accepted or declined.", icon: "checkmark-circle-outline" },
      { key: "join_requests", title: "Join requests", description: "When someone asks to join your quest.", icon: "person-add-outline" },
      { key: "friend_requests", title: "Friend requests", description: "New requests from people who want to connect.", icon: "people-outline" },
      { key: "followed_posts", title: "Posts from people you follow", description: "New quests from your accepted connections.", icon: "radio-outline" },
      { key: "liked_categories", title: "Liked category alerts", description: "New quests matching interests chosen during setup.", icon: "heart-outline" },
    ];
    const closeManager = () => {
      setShowNotificationPreferences(false);
      if (userId) void loadNotificationPreferences(userId);
    };

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeManager}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalBackdropPressable} onPress={closeManager} />
          <View style={styles.notificationPreferencesCard} onStartShouldSetResponder={() => true}>
            <View style={styles.notificationPreferencesHeader}>
              <View style={styles.notificationPreferencesIcon}>
                <Ionicons name="notifications-outline" size={23} color="#9bd8e4" />
              </View>
              <View style={styles.notificationPreferencesHeading}>
                <Text style={styles.notificationPreferencesEyebrow}>PUSH ALERTS</Text>
                <Text style={styles.notificationPreferencesTitle}>Choose what reaches you</Text>
                <Text style={styles.notificationPreferencesSubtitle}>In-app activity stays available even when a push category is off.</Text>
              </View>
              <Pressable hitSlop={10} style={styles.notificationPreferencesClose} onPress={closeManager}>
                <Ionicons name="close" size={21} color="#94a3b8" />
              </Pressable>
            </View>

            <View style={styles.notificationSystemRow}>
              <View style={[styles.settingsStatusDot, pushPermissionStatus === "granted" && styles.settingsStatusDotOn]} />
              <View style={styles.notificationSystemCopy}>
                <Text style={styles.notificationSystemTitle}>
                  {pushPermissionStatus === "granted" ? "Allowed by iPhone" : pushPermissionStatus === "denied" ? "Blocked by iPhone" : "Not enabled on iPhone"}
                </Text>
                <Text style={styles.notificationSystemSubtitle}>QuestHat categories cannot override your iOS permission.</Text>
              </View>
              <Pressable
                style={styles.notificationSystemButton}
                onPress={() => {
                  if (pushPermissionStatus === "granted") {
                    void RNLinking.openSettings();
                    return;
                  }
                  void enableNotificationsFromApp();
                }}
              >
                <Ionicons name={pushPermissionStatus === "granted" ? "settings-outline" : "notifications-outline"} size={16} color="#9bd8e4" />
              </Pressable>
            </View>

            <ScrollView style={styles.notificationPreferencesScroll} contentContainerStyle={styles.notificationPreferencesList} showsVerticalScrollIndicator={false}>
              {notificationPreferencesLoading ? (
                <View style={styles.notificationPreferencesLoading}>
                  <ActivityIndicator color="#9bd8e4" />
                  <Text style={styles.notificationPreferencesLoadingText}>Loading choices...</Text>
                </View>
              ) : options.map((option, index) => (
                <View key={option.key}>
                  <View style={styles.notificationPreferenceRow}>
                    <View style={styles.notificationPreferenceIcon}>
                      <Ionicons name={option.icon} size={18} color="#9bd8e4" />
                    </View>
                    <View style={styles.notificationPreferenceCopy}>
                      <Text style={styles.notificationPreferenceTitle}>{option.title}</Text>
                      <Text style={styles.notificationPreferenceDescription}>{option.description}</Text>
                    </View>
                    <Switch
                      value={notificationPreferences[option.key]}
                      onValueChange={(value) => setNotificationPreferences((current) => ({ ...current, [option.key]: value }))}
                      trackColor={{ false: "#343846", true: "#6daec2" }}
                      thumbColor="#f8fafc"
                    />
                  </View>
                  {index < options.length - 1 ? <View style={styles.notificationPreferenceDivider} /> : null}
                </View>
              ))}
            </ScrollView>

            <Pressable
              style={[styles.notificationPreferencesSave, (notificationPreferencesLoading || notificationPreferencesSaving) && styles.settingsSaveButtonDisabled]}
              onPress={() => void saveNotificationPreferences()}
              disabled={notificationPreferencesLoading || notificationPreferencesSaving}
            >
              {notificationPreferencesSaving ? <ActivityIndicator size="small" color="#082f3a" /> : <Ionicons name="checkmark" size={19} color="#082f3a" />}
              <Text style={styles.notificationPreferencesSaveText}>{notificationPreferencesSaving ? "Saving..." : "Save notification choices"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  function renderAccountLifecycleModal() {
    if (showDeleteAccountModal) {
      const canDelete = deleteAccountConfirmation === "DELETE" && accountActionLoading !== "delete";
      return (
        <View style={styles.modalOverlay} pointerEvents="box-none">
          <Pressable style={styles.modalBackdropPressable} onPress={() => accountActionLoading ? undefined : setShowDeleteAccountModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.accountModalWrap}>
            <View style={[styles.modalCard, styles.accountModalCard]} onStartShouldSetResponder={() => true}>
              <View style={styles.accountDeleteIconWrap}>
                <Ionicons name="trash-outline" size={26} color="#f87171" />
              </View>
              <Text style={styles.accountModalTitle}>Permanently delete account?</Text>
              <Text style={styles.accountModalBody}>This permanently removes your profile, hosted listings, messages, memberships, saved items, notification data, and uploaded media.</Text>
              <View style={styles.accountWarningBox}>
                <Ionicons name="warning-outline" size={18} color="#fbbf24" />
                <Text style={styles.accountWarningText}>This cannot be undone. Type DELETE below to continue.</Text>
              </View>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                editable={accountActionLoading !== "delete"}
                placeholder="Type DELETE"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={deleteAccountConfirmation}
                onChangeText={setDeleteAccountConfirmation}
              />
              <Pressable
                style={[styles.accountDeleteConfirmButton, !canDelete && styles.primaryButtonDisabled]}
                onPress={() => void permanentlyDeleteAccount()}
                disabled={!canDelete}
              >
                {accountActionLoading === "delete" ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="trash-outline" size={18} color="#ffffff" />}
                <Text style={styles.accountDeleteConfirmText}>{accountActionLoading === "delete" ? "Deleting..." : "Delete permanently"}</Text>
              </Pressable>
              <Pressable style={styles.tertiaryButton} onPress={() => setShowDeleteAccountModal(false)} disabled={accountActionLoading === "delete"}>
                <Text style={styles.tertiaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      );
    }

    if (!accountDeactivatedAt || !signedIn) return null;
    return (
      <View style={styles.modalOverlay} pointerEvents="box-none">
        <View style={styles.accountRestoreBackdrop} />
        <View style={[styles.modalCard, styles.accountModalCard]} onStartShouldSetResponder={() => true}>
          <View style={styles.accountRestoreIconWrap}>
            <Ionicons name="pause-circle-outline" size={30} color="#9bc8d2" />
          </View>
          <Text style={styles.accountModalTitle}>Your account is deactivated</Text>
          <Text style={styles.accountModalBody}>Your profile and listings are still hidden. Restore your account to return to QuestHat with your data intact.</Text>
          <Pressable style={styles.primaryButton} onPress={() => void restoreAccount()} disabled={Boolean(accountActionLoading)}>
            {accountActionLoading === "restore" ? <ActivityIndicator size="small" color="#08121a" /> : null}
            <Text style={styles.primaryButtonText}>{accountActionLoading === "restore" ? "Restoring..." : "Restore account"}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => void signOut()} disabled={Boolean(accountActionLoading)}>
            <Text style={styles.secondaryButtonText}>Keep deactivated and sign out</Text>
          </Pressable>
          <Pressable
            style={styles.accountDeleteLink}
            onPress={() => {
              setDeleteAccountConfirmation("");
              setShowDeleteAccountModal(true);
            }}
            disabled={Boolean(accountActionLoading)}
          >
            <Text style={styles.accountDeleteLinkText}>Delete permanently instead</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderEulaModal() {
    if (!signedIn || !eulaRequired || accountDeactivatedAt || showDeleteAccountModal) return null;
    return (
      <View style={[styles.modalOverlay, styles.modalOverlayRaised]} pointerEvents="box-none">
        <View style={styles.eulaBackdrop} />
        <View style={[styles.modalCard, styles.eulaCard]} onStartShouldSetResponder={() => true}>
          <ScrollView contentContainerStyle={styles.eulaContent} showsVerticalScrollIndicator={false}>
            <View style={styles.eulaIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={28} color="#9bc8d2" />
            </View>
            <View style={styles.eulaHeading}>
              <Text style={styles.eulaEyebrow}>Required agreement</Text>
              <Text style={styles.accountModalTitle}>QuestHat EULA</Text>
              <Text style={styles.accountModalBody}>Review and accept the current safety terms to continue using QuestHat.</Text>
            </View>

            <View style={styles.eulaZeroToleranceBox}>
              <Text style={styles.eulaZeroToleranceTitle}>Zero tolerance</Text>
              <Text style={styles.eulaZeroToleranceText}>Objectionable content and abusive users are prohibited. This includes harassment, threats, hate speech, sexual exploitation, scams, self-harm encouragement, and illegal activity.</Text>
            </View>

            <View style={styles.eulaRuleList}>
              <View style={styles.eulaRuleRow}>
                <Ionicons name="filter-outline" size={19} color="#9bc8d2" />
                <Text style={styles.eulaRuleText}>Automated filters reject known objectionable text.</Text>
              </View>
              <View style={styles.eulaRuleRow}>
                <Ionicons name="flag-outline" size={19} color="#9bc8d2" />
                <Text style={styles.eulaRuleText}>Use Report to flag objectionable listings, profiles, content, or behavior.</Text>
              </View>
              <View style={styles.eulaRuleRow}>
                <Ionicons name="ban-outline" size={19} color="#9bc8d2" />
                <Text style={styles.eulaRuleText}>Blocking removes the user from your experience immediately and alerts moderation.</Text>
              </View>
              <View style={styles.eulaRuleRow}>
                <Ionicons name="time-outline" size={19} color="#9bc8d2" />
                <Text style={styles.eulaRuleText}>QuestHat reviews reports within 24 hours and removes confirmed offending content and users.</Text>
              </View>
            </View>

            <Pressable style={styles.legalLinkButton} onPress={() => void Linking.openURL(`${env.siteUrl.replace(/\/$/, "")}/terms`)}>
              <Ionicons name="open-outline" size={16} color="#9bc8d2" />
              <Text style={styles.legalLinkText}>Read the full EULA and Terms</Text>
            </Pressable>

            <Pressable style={styles.eulaConsentRow} onPress={() => setEulaConsentChecked((current) => !current)}>
              <View style={[styles.checkbox, eulaConsentChecked && styles.checkboxChecked]}>
                {eulaConsentChecked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={styles.eulaConsentText}>I agree to the EULA and understand that objectionable content and abusive behavior are not tolerated.</Text>
            </Pressable>

            <Pressable style={[styles.primaryButton, !eulaConsentChecked && styles.primaryButtonDisabled]} onPress={() => void acceptCurrentEula()} disabled={!eulaConsentChecked || eulaSaving}>
              {eulaSaving ? <ActivityIndicator size="small" color="#08121a" /> : null}
              <Text style={styles.primaryButtonText}>{eulaSaving ? "Saving..." : "Agree and continue"}</Text>
            </Pressable>
            <Pressable style={styles.tertiaryButton} onPress={() => void signOut()} disabled={eulaSaving}>
              <Text style={styles.tertiaryButtonText}>Decline and sign out</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: shellBackground }]}>
        <StatusBar style={isLightTheme ? "dark" : "light"} />
        <KeyboardAvoidingView style={[styles.app, { backgroundColor: shellBackground }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View
            style={[
              styles.topBar,
              {
                backgroundColor: topBarBackground,
                borderBottomColor: shellBorder,
                maxHeight: topBarVisibility.interpolate({ inputRange: [0, 1], outputRange: [0, 96] }),
                opacity: topBarVisibility,
                transform: [{ translateY: topBarVisibility.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
              },
            ]}
            pointerEvents={topBarHidden ? "none" : "auto"}
          >
            <View style={styles.topBarBrand}>
              <Text style={[styles.logo, { color: shellText }]}>{APP_NAME}</Text>
              {activeTab !== "home" ? <Text style={[styles.tagline, { color: shellMuted }]}>Find local people to do real plans with.</Text> : null}
            </View>
            <View style={styles.topBarActions}>
              {activeTab === "home" ? (
                <View style={[styles.feedToggle, styles.headerFeedToggle]}>
                  <Pressable style={[styles.feedToggleButton, styles.headerFeedToggleButton, feedViewMode === "list" && styles.feedToggleButtonActive]} onPress={() => setFeedViewMode("list")}>
                    <Text style={[styles.feedToggleText, styles.headerFeedToggleText, feedViewMode === "list" && styles.feedToggleTextActive]}>List</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.feedToggleButton, styles.headerFeedToggleButton, feedViewMode === "map" && styles.feedToggleButtonActive]}
                    onPress={() => setFeedViewMode("map")}
                  >
                    <Text style={[styles.feedToggleText, styles.headerFeedToggleText, feedViewMode === "map" && styles.feedToggleTextActive]}>Map</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                style={[styles.refreshButton, { backgroundColor: isLightTheme ? "rgba(237,243,248,0.82)" : "rgba(255,255,255,0.06)", borderColor: shellBorder }]}
                onPress={() => {
                  openAuthedTab("notifications");
                  void refreshAll();
                }}
              >
                <Ionicons name="notifications-outline" size={20} color={shellText} />
                {unreadNotificationCount > 0 ? (
                  <View style={styles.badgePill}>
                    <Text style={styles.badgeText}>{unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount)}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </Animated.View>
          {busyLabel ? (
            <View style={[styles.busyBanner, { backgroundColor: shellSurface, borderBottomColor: shellBorder }]}>
              <ActivityIndicator size="small" color={shellPrimary} />
              <Text style={[styles.busyBannerText, { color: shellText }]}>{busyLabel}</Text>
            </View>
          ) : null}

          <ScrollView
            contentContainerStyle={[styles.screen, { backgroundColor: shellBackground }]}
            onScroll={(event) => {
              const nextY = event.nativeEvent.contentOffset.y;
              const delta = nextY - scrollPositionRef.current;
              if (delta > 3) setScrollDirection("down");
              if (delta < -3) setScrollDirection("up");
              if (nextY < 14) {
                setTopBarHidden(false);
              } else if (delta > 5 && nextY > 34) {
                setTopBarHidden(true);
              } else if (delta < -5) {
                setTopBarHidden(false);
              }
              scrollPositionRef.current = nextY;
              setScrollOffsetY(nextY);
            }}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshAll}
                tintColor={shellPrimary}
                colors={[shellPrimary]}
                progressBackgroundColor={shellSurface}
                progressViewOffset={Platform.OS === "ios" ? 72 : 0}
              />
            }
          >
            {renderScreen()}
            {status ? <Text style={[styles.status, { color: isLightTheme ? "#b45309" : "#f9d46a" }]}>{status}</Text> : null}
          </ScrollView>
          {renderProfileModal()}
          {renderReportProfileModal()}
          {renderReportQuestModal()}
          {renderQuestActionsMenu()}
          {renderQuestDetailModal()}
          <QuestMediaPreviewModal
            media={previewMedia}
            onClose={() => setPreviewMedia(null)}
            onFullscreen={(media) => {
              setPreviewMedia(null);
              setFullscreenMedia(media);
            }}
          />
          <FullscreenMediaViewer media={fullscreenMedia} onClose={() => setFullscreenMedia(null)} />
          {renderQuestionModal()}
          {renderOnboardingWizard()}
          {renderPushPromptModal()}
          {renderNotificationPreferencesModal()}
          {renderAuthModal()}
          {renderEulaModal()}
          {renderAccountLifecycleModal()}

          <View
            style={[
              styles.tabBar,
              {
                backgroundColor: isLightTheme ? "rgba(255,255,255,0.72)" : "rgba(20,21,31,0.64)",
                borderColor: isLightTheme ? "rgba(255,255,255,0.66)" : "rgba(255,255,255,0.1)",
                shadowColor: isLightTheme ? "#000" : "transparent",
              },
            ]}
          >
            {visibleTabs.map((tab) => {
              const active = activeTab === tab.key;
              const isCreate = tab.key === "create";
              const showBadge = tab.key === "inbox"
                ? unreadInboxMessageCount
                : tab.key === "notifications"
                  ? unreadNotificationCount
                  : false;
              const iconColor = isCreate ? "#ffffff" : active ? shellPrimary : (isLightTheme ? "#64748b" : "#d5d9e3");
              return (
                <Pressable key={tab.key} style={[styles.tabButton, active && !isCreate && styles.tabButtonActive, isCreate && styles.createTabButton]} onPress={() => openAuthedTab(tab.key)}>
                  <View style={isCreate ? styles.createTabIcon : styles.tabIconWrap}>
                    <Ionicons name={tab.icon} size={isCreate ? 28 : 22} color={iconColor} />
                    {showBadge ? (
                      <View style={styles.badgePill}>
                        <Text style={styles.badgeText}>{showBadge > 99 ? "99+" : String(showBadge)}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[styles.tabLabel, active && styles.tabLabelActive, isCreate && styles.createTabLabel]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0c0c12",
  },
  app: {
    flex: 1,
    backgroundColor: "#0c0c12",
  },
  topBar: {
    alignItems: "center",
    backgroundColor: "#0f1017",
    borderBottomColor: "rgba(255,255,255,0.06)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    overflow: "hidden",
  },
  topBarBrand: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  topBarActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 8,
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    position: "relative",
    width: 44,
  },
  screen: {
    gap: 0,
    paddingBottom: 132,
  },
  busyBanner: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  busyBannerText: {
    fontSize: 13,
    fontWeight: "700",
  },
  logo: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0,
  },
  tagline: {
    color: "#aeb6c6",
    fontSize: 12,
    marginTop: 2,
  },
  screenHeader: {
    gap: 4,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  screenTitle: {
    color: "#f8fafc",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0,
  },
  screenSubtitle: {
    color: "#aeb6c6",
    fontSize: 14,
    lineHeight: 19,
  },
  createShell: {
    gap: 14,
    paddingBottom: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  createHero: {
    borderColor: "rgba(155,216,228,0.2)",
    borderRadius: 28,
    borderWidth: 1,
    gap: 7,
    overflow: "hidden",
    padding: 20,
  },
  createHeroTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  createHeroMark: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  createProgressPill: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  createProgressText: {
    color: "#dff7fb",
    fontSize: 12,
    fontWeight: "800",
  },
  createHeroEyebrow: {
    color: "#9bd8e4",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  createHeroTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 32,
    maxWidth: 320,
  },
  createHeroCopy: {
    color: "#bed1d8",
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 330,
  },
  createProgressTrack: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    height: 5,
    marginTop: 10,
    overflow: "hidden",
  },
  createProgressFill: {
    backgroundColor: "#9bd8e4",
    borderRadius: 999,
    height: "100%",
  },
  createSectionCard: {
    backgroundColor: "#151722",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 26,
    borderWidth: 1,
    gap: 16,
    padding: 16,
  },
  createSectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  createSectionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.12)",
    borderColor: "rgba(155,216,228,0.18)",
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  createSectionIconComplete: {
    backgroundColor: "#9bd8e4",
    borderColor: "#9bd8e4",
  },
  createSectionHeadingCopy: {
    flex: 1,
    gap: 2,
  },
  createSectionStep: {
    color: "#6daec2",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  createSectionTitle: {
    color: "#f8fafc",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  createSectionSubtitle: {
    color: "#929bad",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  createFieldGroup: {
    gap: 8,
  },
  createFieldLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  createFieldLabel: {
    color: "#dce3ec",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  createOptionalLabel: {
    color: "#778195",
    fontSize: 11,
    fontWeight: "700",
  },
  createSelectField: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 13,
  },
  createFieldLeading: {
    alignItems: "center",
    backgroundColor: "#e4f3f6",
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  createSelectValue: {
    color: "#101827",
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  createInput: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 17,
    borderWidth: 1,
    color: "#101827",
    fontSize: 15,
    minHeight: 54,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  createTextArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  createSuggestionRail: {
    gap: 7,
    paddingRight: 8,
  },
  createSuggestionChip: {
    backgroundColor: "rgba(255,255,255,0.045)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 240,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  createSuggestionChipActive: {
    backgroundColor: "rgba(155,216,228,0.14)",
    borderColor: "rgba(155,216,228,0.42)",
  },
  createSuggestionText: {
    color: "#aeb6c6",
    fontSize: 12,
    fontWeight: "700",
  },
  createSuggestionTextActive: {
    color: "#dff7fb",
  },
  createChoiceRow: {
    flexDirection: "row",
    gap: 9,
  },
  createChoiceCard: {
    backgroundColor: "#1b1e2a",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 17,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    minHeight: 108,
    padding: 13,
  },
  createChoiceCardActive: {
    backgroundColor: "#9bd8e4",
    borderColor: "#bceaf1",
  },
  createChoiceTitle: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 3,
  },
  createChoiceTitleActive: {
    color: "#082f3a",
  },
  createChoiceCopy: {
    color: "#8f98aa",
    fontSize: 11,
    lineHeight: 15,
  },
  createChoiceCopyActive: {
    color: "#275463",
  },
  createSwitchRow: {
    alignItems: "center",
    backgroundColor: "#1b1e2a",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  createSwitchIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.12)",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  createSwitchCopy: {
    flex: 1,
    gap: 2,
  },
  createSwitchTitle: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "800",
  },
  createSwitchSubtitle: {
    color: "#8f98aa",
    fontSize: 11,
    lineHeight: 15,
  },
  createNestedCard: {
    backgroundColor: "#10121a",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  createPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  createPill: {
    backgroundColor: "#20232f",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  createPillActive: {
    backgroundColor: "#9bd8e4",
    borderColor: "#9bd8e4",
  },
  createPillText: {
    color: "#bac2d0",
    fontSize: 12,
    fontWeight: "800",
  },
  createPillTextActive: {
    color: "#082f3a",
  },
  createInputShell: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 15,
  },
  createInputShellDisabled: {
    opacity: 0.58,
  },
  createInputInline: {
    color: "#101827",
    flex: 1,
    fontSize: 15,
    minHeight: 52,
    paddingVertical: 12,
  },
  createHelperText: {
    color: "#8993a6",
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 2,
  },
  createVisibilityStack: {
    gap: 8,
  },
  createVisibilityOption: {
    alignItems: "center",
    backgroundColor: "#1b1e2a",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    padding: 11,
  },
  createVisibilityOptionActive: {
    backgroundColor: "rgba(155,216,228,0.1)",
    borderColor: "rgba(155,216,228,0.45)",
  },
  createVisibilityIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.11)",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  createVisibilityIconActive: {
    backgroundColor: "#9bd8e4",
  },
  createVisibilityCopy: {
    flex: 1,
    gap: 2,
  },
  createVisibilityTitle: {
    color: "#e9edf4",
    fontSize: 13,
    fontWeight: "900",
  },
  createVisibilityTitleActive: {
    color: "#dff7fb",
  },
  createVisibilitySubtitle: {
    color: "#8791a3",
    fontSize: 11,
    lineHeight: 15,
  },
  createVisibilitySubtitleActive: {
    color: "#a9c8d0",
  },
  createRadio: {
    alignItems: "center",
    borderColor: "#626b7c",
    borderRadius: 999,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  createRadioActive: {
    borderColor: "#9bd8e4",
  },
  createRadioDot: {
    backgroundColor: "#9bd8e4",
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  createAdvancedToggle: {
    alignItems: "center",
    backgroundColor: "#1b1e2a",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  createAdvancedIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.12)",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  createMediaPreview: {
    backgroundColor: "#0e1017",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 19,
    borderWidth: 1,
    overflow: "hidden",
  },
  createMediaImage: {
    aspectRatio: 16 / 10,
    width: "100%",
  },
  createMediaFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  createMediaFileCopy: {
    flex: 1,
    gap: 2,
  },
  createMediaReady: {
    color: "#86efac",
    fontSize: 11,
    fontWeight: "900",
  },
  createMediaFilename: {
    color: "#aeb6c6",
    fontSize: 12,
  },
  createMediaChangeButton: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.13)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  createMediaChangeText: {
    color: "#dff7fb",
    fontSize: 12,
    fontWeight: "800",
  },
  createMediaDropzone: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.06)",
    borderColor: "rgba(155,216,228,0.32)",
    borderRadius: 19,
    borderStyle: "dashed",
    borderWidth: 1.5,
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 25,
  },
  createMediaDropIcon: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    marginBottom: 2,
    width: 48,
  },
  createMediaDropTitle: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "900",
  },
  createMediaDropCopy: {
    color: "#8993a6",
    fontSize: 11,
    lineHeight: 16,
    maxWidth: 290,
    textAlign: "center",
  },
  createPublishCard: {
    backgroundColor: "#0e2a33",
    borderColor: "rgba(155,216,228,0.24)",
    borderRadius: 26,
    borderWidth: 1,
    gap: 13,
    padding: 16,
  },
  createPublishSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  createPublishStatus: {
    alignItems: "center",
    backgroundColor: "rgba(155,216,228,0.1)",
    borderRadius: 13,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  createPublishStatusReady: {
    backgroundColor: "#9bd8e4",
  },
  createPublishCopy: {
    flex: 1,
    gap: 2,
  },
  createPublishTitle: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "900",
  },
  createPublishSubtitle: {
    color: "#9eb9c1",
    fontSize: 11,
    lineHeight: 15,
  },
  createPublishButton: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 17,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 18,
  },
  createPublishButtonDisabled: {
    opacity: 0.42,
  },
  createPublishButtonText: {
    color: "#082f3a",
    fontSize: 16,
    fontWeight: "900",
  },
  createDiscardButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
  },
  createDiscardText: {
    color: "#9eb9c1",
    fontSize: 12,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  centerPanel: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingShell: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  loadingCard: {
    alignItems: "center",
    alignSelf: "stretch",
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 26,
  },
  loadingIconWrap: {
    alignItems: "center",
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  loadingTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
  },
  loadingSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 16,
  },
  modalBackdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  modalSheet: {
    alignSelf: "center",
    borderRadius: 24,
    borderWidth: 1,
    maxHeight: "88%",
    maxWidth: 480,
    overflow: "hidden",
    padding: 16,
    width: "100%",
  },
  pushPromptSheet: {
    alignSelf: "center",
    flex: 0,
    maxWidth: 440,
    padding: 20,
    width: "100%",
  },
  pushPromptHeader: {
    marginBottom: 6,
  },
  pushPromptBody: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  pushPromptIconWrap: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.14)",
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  pushPromptCopy: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  pushPromptActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  pushPromptButton: {
    flex: 1,
  },
  authModalScroll: {
    flexGrow: 0,
  },
  authModalScrollContent: {
    paddingBottom: 4,
  },
  modalHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  passwordRow: {
    flexDirection: "row",
    gap: 10,
  },
  inputFlex: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    color: "#0f172a",
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  passwordToggleButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  passwordToggleText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  passwordChecklist: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 2,
    padding: 12,
  },
  passwordChecklistText: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 18,
  },
  settingsShell: {
    gap: 14,
    marginHorizontal: 14,
    paddingBottom: 18,
  },
  settingsIdentityCard: {
    borderColor: "rgba(155,216,228,0.16)",
    borderRadius: 26,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
  },
  settingsIdentityTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
  },
  settingsAvatarWrap: {
    position: "relative",
  },
  settingsAvatar: {
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 999,
    borderWidth: 2,
    height: 68,
    width: 68,
  },
  settingsAvatarFallback: {
    alignItems: "center",
    backgroundColor: "#6daec2",
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 999,
    borderWidth: 2,
    height: 68,
    justifyContent: "center",
    width: 68,
  },
  settingsAvatarInitial: {
    color: "#082f3a",
    fontSize: 26,
    fontWeight: "900",
  },
  settingsAvatarEdit: {
    alignItems: "center",
    backgroundColor: "#b9e6ed",
    borderColor: "#173743",
    borderRadius: 999,
    borderWidth: 2,
    bottom: -2,
    height: 28,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    width: 28,
  },
  settingsIdentityCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  settingsIdentityName: {
    color: "#f8fafc",
    fontSize: 19,
    fontWeight: "900",
  },
  settingsIdentityHandle: {
    color: "#b8c4cd",
    fontSize: 13,
    fontWeight: "700",
  },
  settingsIdentityMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  settingsIdentityMetaText: {
    color: "#9bc8d2",
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  settingsProfileLink: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  settingsNav: {
    backgroundColor: "#11131b",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    padding: 5,
  },
  settingsNavItem: {
    alignItems: "center",
    borderRadius: 17,
    flex: 1,
    gap: 4,
    minHeight: 59,
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  settingsNavItemActive: {
    backgroundColor: "rgba(109,174,194,0.11)",
  },
  settingsNavIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 29,
    justifyContent: "center",
    width: 29,
  },
  settingsNavIconActive: {
    backgroundColor: "#9bd8e4",
  },
  settingsNavLabel: {
    color: "#818b99",
    fontSize: 10,
    fontWeight: "800",
  },
  settingsNavLabelActive: {
    color: "#dff7fb",
  },
  settingsTabContent: {
    gap: 13,
  },
  settingsSectionHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 3,
    paddingTop: 3,
  },
  settingsSectionEyebrow: {
    color: "#6daec2",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  settingsSectionTitle: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  settingsUnsavedBadge: {
    alignItems: "center",
    backgroundColor: "rgba(251,191,36,0.1)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  settingsUnsavedDot: {
    backgroundColor: "#fbbf24",
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  settingsUnsavedText: {
    color: "#fcd34d",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  settingsCard: {
    backgroundColor: "#151721",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 15,
  },
  settingsCardHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  settingsCardIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.12)",
    borderRadius: 13,
    height: 39,
    justifyContent: "center",
    width: 39,
  },
  settingsCardHeadingCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  settingsCardTitle: {
    color: "#f2f6f8",
    fontSize: 16,
    fontWeight: "900",
  },
  settingsCardSubtitle: {
    color: "#8f99a8",
    fontSize: 12,
    lineHeight: 17,
  },
  settingsField: {
    gap: 7,
  },
  settingsFieldLabel: {
    color: "#cbd5df",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  settingsFieldLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  settingsFieldHint: {
    color: "#737f8e",
    fontSize: 11,
    lineHeight: 16,
  },
  settingsInput: {
    backgroundColor: "#0e1017",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 15,
    minHeight: 49,
    paddingHorizontal: 13,
  },
  settingsInputWithIcon: {
    alignItems: "center",
    backgroundColor: "#0e1017",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 49,
    paddingHorizontal: 13,
  },
  settingsInputPrefix: {
    color: "#6daec2",
    fontSize: 16,
    fontWeight: "900",
  },
  settingsInputInline: {
    color: "#f8fafc",
    flex: 1,
    fontSize: 15,
    minHeight: 47,
    paddingHorizontal: 5,
  },
  settingsSelect: {
    alignItems: "center",
    backgroundColor: "#0e1017",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 49,
    paddingHorizontal: 13,
  },
  settingsSelectText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
  settingsSelectPlaceholder: {
    color: "#718096",
    fontWeight: "500",
  },
  settingsSplitFields: {
    flexDirection: "row",
    gap: 10,
  },
  settingsSplitField: {
    flex: 1,
  },
  settingsControlRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  settingsControlIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  settingsControlCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  settingsControlTitle: {
    color: "#edf2f5",
    fontSize: 14,
    fontWeight: "800",
  },
  settingsControlSubtitle: {
    color: "#7f8997",
    fontSize: 11,
    lineHeight: 15,
  },
  settingsValueBadge: {
    color: "#9bd8e4",
    fontSize: 12,
    fontWeight: "900",
  },
  settingsStepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  settingsStepperButton: {
    alignItems: "center",
    backgroundColor: "#242733",
    borderRadius: 11,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  settingsStepperTrack: {
    backgroundColor: "#292d39",
    borderRadius: 999,
    flex: 1,
    height: 5,
    overflow: "hidden",
  },
  settingsStepperFill: {
    backgroundColor: "#6daec2",
    borderRadius: 999,
    height: 5,
  },
  settingsBioInput: {
    minHeight: 126,
    paddingTop: 13,
    textAlignVertical: "top",
  },
  settingsCharacterCount: {
    color: "#65707e",
    fontSize: 10,
    fontWeight: "700",
    marginTop: -8,
    textAlign: "right",
  },
  settingsInterestCount: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.13)",
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    minWidth: 30,
    paddingHorizontal: 8,
  },
  settingsInterestCountText: {
    color: "#9bd8e4",
    fontSize: 12,
    fontWeight: "900",
  },
  settingsInterestGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  settingsInterestChip: {
    alignItems: "center",
    backgroundColor: "#0e1017",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 11,
  },
  settingsInterestChipActive: {
    backgroundColor: "#9bd8e4",
    borderColor: "#9bd8e4",
  },
  settingsInterestChipText: {
    color: "#dbe7ec",
    fontSize: 12,
    fontWeight: "800",
  },
  settingsInterestChipTextActive: {
    color: "#082f3a",
  },
  settingsSaveTray: {
    flexDirection: "row",
    gap: 10,
  },
  settingsRevertButton: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 49,
    paddingHorizontal: 20,
  },
  settingsRevertText: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "800",
  },
  settingsActionDisabledText: {
    color: "#596271",
  },
  settingsSaveButton: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 15,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 49,
    paddingHorizontal: 18,
  },
  settingsSaveButtonDisabled: {
    opacity: 0.45,
  },
  settingsSaveButtonText: {
    color: "#082f3a",
    fontSize: 14,
    fontWeight: "900",
  },
  settingsQuietAction: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    padding: 7,
  },
  settingsQuietActionText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
  },
  settingsThemeGrid: {
    flexDirection: "row",
    gap: 8,
  },
  settingsThemeOption: {
    alignItems: "center",
    backgroundColor: "#0e1017",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    padding: 8,
  },
  settingsThemeOptionActive: {
    borderColor: "#6daec2",
  },
  settingsThemePreview: {
    alignItems: "center",
    borderRadius: 10,
    height: 46,
    justifyContent: "center",
    width: "100%",
  },
  settingsThemePreviewLight: {
    backgroundColor: "#eef3f5",
  },
  settingsThemePreviewDark: {
    backgroundColor: "#252936",
  },
  settingsThemePreviewAuto: {
    backgroundColor: "#284651",
  },
  settingsThemeLabel: {
    color: "#9aa4b1",
    fontSize: 11,
    fontWeight: "800",
  },
  settingsThemeLabelActive: {
    color: "#e5f8fb",
  },
  settingsThemeCheckPlaceholder: {
    height: 17,
    width: 17,
  },
  settingsStatusRow: {
    alignItems: "center",
    backgroundColor: "#0e1017",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  settingsStatusDot: {
    backgroundColor: "#fb7185",
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  settingsStatusDotOn: {
    backgroundColor: "#34d399",
  },
  settingsStatusText: {
    color: "#cbd5e1",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  settingsInlineButton: {
    backgroundColor: "rgba(109,174,194,0.14)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  settingsInlineButtonText: {
    color: "#9bd8e4",
    fontSize: 11,
    fontWeight: "900",
  },
  notificationPreferencesCard: {
    alignSelf: "center",
    backgroundColor: "#11131c",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 26,
    borderWidth: 1,
    maxHeight: "88%",
    maxWidth: 500,
    overflow: "hidden",
    padding: 16,
    width: "100%",
  },
  notificationPreferencesHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 11,
    marginBottom: 13,
  },
  notificationPreferencesIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.13)",
    borderRadius: 14,
    height: 43,
    justifyContent: "center",
    width: 43,
  },
  notificationPreferencesHeading: {
    flex: 1,
    gap: 2,
  },
  notificationPreferencesEyebrow: {
    color: "#6daec2",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  notificationPreferencesTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  notificationPreferencesSubtitle: {
    color: "#8f99a8",
    fontSize: 11,
    lineHeight: 16,
  },
  notificationPreferencesClose: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  notificationSystemRow: {
    alignItems: "center",
    backgroundColor: "#0b0d14",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    marginBottom: 10,
    padding: 11,
  },
  notificationSystemCopy: {
    flex: 1,
    gap: 1,
  },
  notificationSystemTitle: {
    color: "#e8edf3",
    fontSize: 12,
    fontWeight: "900",
  },
  notificationSystemSubtitle: {
    color: "#778194",
    fontSize: 10,
    lineHeight: 14,
  },
  notificationSystemButton: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.12)",
    borderRadius: 11,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  notificationPreferencesScroll: {
    flexGrow: 0,
  },
  notificationPreferencesList: {
    backgroundColor: "#171923",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 17,
    borderWidth: 1,
    overflow: "hidden",
  },
  notificationPreferencesLoading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 96,
  },
  notificationPreferencesLoadingText: {
    color: "#9aa4b1",
    fontSize: 12,
    fontWeight: "700",
  },
  notificationPreferenceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 67,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  notificationPreferenceIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.1)",
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  notificationPreferenceCopy: {
    flex: 1,
    gap: 2,
  },
  notificationPreferenceTitle: {
    color: "#edf2f5",
    fontSize: 13,
    fontWeight: "900",
  },
  notificationPreferenceDescription: {
    color: "#7f8997",
    fontSize: 10,
    lineHeight: 14,
  },
  notificationPreferenceDivider: {
    backgroundColor: "rgba(255,255,255,0.055)",
    height: 1,
    marginLeft: 57,
  },
  notificationPreferencesSave: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 15,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginTop: 11,
    minHeight: 51,
    paddingHorizontal: 16,
  },
  notificationPreferencesSaveText: {
    color: "#082f3a",
    fontSize: 13,
    fontWeight: "900",
  },
  settingsDivider: {
    backgroundColor: "rgba(255,255,255,0.07)",
    height: 1,
  },
  settingsUtilityCard: {
    backgroundColor: "#151721",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  settingsUtilityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
    minHeight: 66,
    paddingVertical: 9,
  },
  settingsUtilityIcon: {
    alignItems: "center",
    backgroundColor: "#242733",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  settingsPeopleStats: {
    alignItems: "center",
    backgroundColor: "#151721",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    paddingVertical: 13,
  },
  settingsPeopleStat: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  settingsPeopleStatValue: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "900",
  },
  settingsPeopleStatLabel: {
    color: "#7f8997",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  settingsPeopleStatDivider: {
    backgroundColor: "rgba(255,255,255,0.08)",
    height: 30,
    width: 1,
  },
  settingsCountPill: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.12)",
    borderRadius: 999,
    justifyContent: "center",
    minWidth: 27,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  settingsCountPillText: {
    color: "#9bd8e4",
    fontSize: 11,
    fontWeight: "900",
  },
  settingsPersonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    minHeight: 57,
    paddingTop: 2,
  },
  settingsPersonRowBorder: {
    borderTopColor: "rgba(255,255,255,0.06)",
    borderTopWidth: 1,
    paddingTop: 12,
  },
  settingsPersonMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  settingsPersonAvatar: {
    borderRadius: 999,
    height: 42,
    width: 42,
  },
  settingsPersonAvatarFallback: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.12)",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  settingsPersonName: {
    color: "#edf2f5",
    fontSize: 14,
    fontWeight: "900",
  },
  settingsPersonHandle: {
    color: "#74808e",
    fontSize: 11,
  },
  settingsPersonMenuButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  settingsRequestRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 57,
  },
  settingsRequestActions: {
    flexDirection: "row",
    gap: 6,
  },
  settingsAcceptButton: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 11,
    height: 35,
    justifyContent: "center",
    width: 35,
  },
  settingsDeclineButton: {
    alignItems: "center",
    backgroundColor: "#292d39",
    borderRadius: 11,
    height: 35,
    justifyContent: "center",
    width: 35,
  },
  settingsTextAction: {
    borderColor: "rgba(155,216,228,0.18)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  settingsTextActionLabel: {
    color: "#9bd8e4",
    fontSize: 11,
    fontWeight: "900",
  },
  settingsEmptyState: {
    alignItems: "center",
    gap: 5,
    paddingVertical: 14,
  },
  settingsEmptyTitle: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "900",
  },
  settingsEmptyCopy: {
    color: "#737f8e",
    fontSize: 11,
    textAlign: "center",
  },
  settingsEmptyInline: {
    color: "#737f8e",
    fontSize: 12,
    paddingVertical: 7,
  },
  settingsSafetyCard: {
    borderColor: "rgba(251,191,36,0.12)",
  },
  settingsSafetyIcon: {
    backgroundColor: "rgba(251,191,36,0.09)",
  },
  settingsSafeState: {
    alignItems: "center",
    backgroundColor: "rgba(52,211,153,0.06)",
    borderRadius: 13,
    flexDirection: "row",
    gap: 8,
    padding: 11,
  },
  settingsSafeStateText: {
    color: "#a7f3d0",
    fontSize: 12,
    fontWeight: "800",
  },
  settingsPrivacySegment: {
    backgroundColor: "#0e1017",
    borderRadius: 14,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  settingsPrivacyOption: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 40,
  },
  settingsPrivacyOptionActive: {
    backgroundColor: "#9bd8e4",
  },
  settingsPrivacyOptionText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "800",
  },
  settingsPrivacyOptionTextActive: {
    color: "#082f3a",
  },
  settingsCurrentValue: {
    alignItems: "center",
    backgroundColor: "#0e1017",
    borderRadius: 14,
    flexDirection: "row",
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  settingsCurrentValueText: {
    color: "#dbe4e9",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  settingsVerifiedText: {
    color: "#34d399",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  settingsOutlineButton: {
    alignItems: "center",
    borderColor: "rgba(155,216,228,0.22)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 45,
  },
  settingsOutlineButtonText: {
    color: "#dff7fb",
    fontSize: 13,
    fontWeight: "900",
  },
  settingsDangerZone: {
    backgroundColor: "rgba(127,29,29,0.08)",
    borderColor: "rgba(251,113,133,0.18)",
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 15,
  },
  settingsDangerHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  settingsDangerTitle: {
    color: "#fecdd3",
    fontSize: 15,
    fontWeight: "900",
  },
  settingsDangerSubtitle: {
    color: "#9f8790",
    fontSize: 11,
    lineHeight: 16,
  },
  settingsDangerAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 51,
  },
  settingsDangerActionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  settingsDangerActionTitle: {
    color: "#edf2f5",
    fontSize: 13,
    fontWeight: "900",
  },
  settingsDeleteActionIcon: {
    backgroundColor: "rgba(251,113,133,0.08)",
  },
  settingsDeleteActionTitle: {
    color: "#fb7185",
    fontSize: 13,
    fontWeight: "900",
  },
  panel: {
    backgroundColor: "#13141c",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: 16,
    padding: 14,
  },
  authModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0,
  },
  authModalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 16,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  inputDisabled: {
    backgroundColor: "#e5e7eb",
    color: "#64748b",
  },
  textArea: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#6daec2",
    borderRadius: 16,
    minHeight: 48,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignSelf: "stretch",
  },
  primaryButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
  primaryButtonText: {
    color: "#08121a",
    fontSize: 16,
    fontWeight: "800",
  },
  primaryButtonTextDisabled: {
    color: "#6b7280",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 46,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignSelf: "stretch",
  },
  secondaryButtonDisabled: {
    backgroundColor: "#e5e7eb",
    borderColor: "#d1d5db",
    opacity: 0.8,
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButtonTextDisabled: {
    color: "#6b7280",
  },
  tertiaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  tertiaryButtonText: {
    color: "#9bc8d2",
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
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
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
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
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
    backgroundColor: "#6daec2",
  },
  segmentText: {
    color: "#d5d9e3",
    fontWeight: "800",
  },
  segmentTextActive: {
    color: "#08121a",
  },
  mediaPickerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  createActionsRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-start",
  },
  mediaPreview: {
    gap: 8,
  },
  feedMediaPressable: {
    height: "100%",
    alignSelf: "stretch",
    width: "100%",
  },
  mediaPreviewImage: {
    borderRadius: 12,
    height: 180,
    width: "100%",
  },
  videoFallback: {
    alignItems: "center",
    backgroundColor: "#171925",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  videoEditor: {
    gap: 10,
  },
  nativeVideoShell: {
    backgroundColor: "#000000",
    borderRadius: 18,
    height: 280,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  nativeVideoShellFullscreen: {
    borderRadius: 0,
    flex: 1,
    height: "100%",
  },
  nativeVideo: {
    height: "100%",
    width: "100%",
  },
  nativeVideoFullscreen: {
    flex: 1,
  },
  videoStatusOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    gap: 10,
    justifyContent: "center",
    padding: 20,
  },
  videoErrorText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  videoSelectionMeta: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  videoLimitBadge: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  videoLimitBadgeText: {
    color: "#082f3a",
    fontSize: 12,
    fontWeight: "900",
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
  preferenceBlock: {
    gap: 10,
  },
  accountLifecycleSection: {
    borderTopColor: "rgba(255,255,255,0.08)",
    borderTopWidth: 1,
    gap: 12,
    marginTop: 10,
    paddingTop: 18,
  },
  accountLifecycleHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  accountLifecycleHeaderText: {
    flex: 1,
    gap: 3,
  },
  accountLifecycleTitle: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "900",
  },
  accountLifecycleCard: {
    backgroundColor: "rgba(255,255,255,0.035)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 13,
  },
  accountLifecycleCardCopy: {
    gap: 4,
  },
  accountLifecycleCardTitle: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "900",
  },
  accountDeactivateButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    flexDirection: "row",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 13,
  },
  accountDeactivateButtonText: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "800",
  },
  accountDeleteCard: {
    backgroundColor: "rgba(248,113,113,0.045)",
    borderColor: "rgba(248,113,113,0.2)",
  },
  accountDeleteTitle: {
    color: "#fca5a5",
  },
  accountDeleteButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "rgba(248,113,113,0.35)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 13,
  },
  accountDeleteButtonText: {
    color: "#f87171",
    fontSize: 13,
    fontWeight: "800",
  },
  avatarPreview: {
    borderRadius: 999,
    height: 96,
    width: 96,
  },
  friendRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  friendInfo: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  friendAvatar: {
    borderRadius: 999,
    height: 40,
    width: 40,
  },
  friendAvatarFallback: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    height: 40,
    width: 40,
  },
  friendName: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "800",
  },
  muted: {
    color: "#aeb6c6",
    fontSize: 13,
    lineHeight: 18,
  },
  successText: {
    color: "#10b981",
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: "#f87171",
    fontSize: 13,
    fontWeight: "700",
  },
  warningText: {
    color: "#f59e0b",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionLabel: {
    color: "#9bc8d2",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  helperText: {
    color: "rgba(225, 232, 240, 0.72)",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  chips: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  dropdownField: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "rgba(8,18,26,0.12)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  dropdownValue: {
    color: "#08121a",
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    paddingRight: 10,
  },
  dropdownPlaceholder: {
    color: "#94a3b8",
    fontWeight: "600",
  },
  dropdownHelper: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  locationSuggestionsMenu: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(8,18,26,0.12)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 2,
    maxHeight: 220,
    overflow: "hidden",
  },
  locationSuggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  locationSuggestionText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
  authLoadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    paddingVertical: 6,
  },
  authLoadingText: {
    color: "#9bc8d2",
    fontSize: 13,
    fontWeight: "700",
  },
  inlineDobPicker: {
    alignSelf: "stretch",
    minHeight: 180,
  },
  pickerFieldWrap: {
    gap: 8,
  },
  pickerField: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "rgba(8,18,26,0.12)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  pickerFieldValue: {
    color: "#08121a",
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    paddingRight: 10,
  },
  pickerOption: {
    backgroundColor: "#171925",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  chip: {
    backgroundColor: "#171925",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: "#6daec2",
    borderColor: "#6daec2",
  },
  chipText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkboxTouch: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  checkbox: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 6,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: "#6daec2",
    borderColor: "#6daec2",
  },
  checkboxLabel: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700",
  },
  advancedToggle: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  advancedToggleText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "800",
  },
  questList: {
    gap: 12,
    paddingBottom: 8,
  },
  questCard: {
    backgroundColor: "#151722",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 24,
    borderWidth: 1,
    gap: 7,
    marginHorizontal: 16,
    marginBottom: 2,
    overflow: "hidden",
    padding: 16,
  },
  questCategory: {
    color: "#9bc8d2",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  fieldLabel: {
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: "700",
  },
  questTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "900",
  },
  questDescription: {
    color: "#d0d5df",
    fontSize: 14,
    lineHeight: 20,
  },
  questDetailHero: {
    borderColor: "rgba(155,216,228,0.15)",
    borderRadius: 22,
    borderWidth: 1,
    gap: 15,
    overflow: "hidden",
    padding: 18,
    position: "relative",
  },
  questDetailHeroGlow: {
    backgroundColor: "rgba(109,174,194,0.13)",
    borderRadius: 999,
    height: 180,
    position: "absolute",
    right: -65,
    top: -95,
    width: 180,
  },
  questDetailTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  questDetailCategoryPill: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  questDetailCategoryText: {
    color: "#082f3a",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  questDetailCloseButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  questDetailTitle: {
    color: "#ffffff",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 32,
    maxWidth: "95%",
  },
  questDetailChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  questDetailChip: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 31,
    paddingHorizontal: 9,
  },
  questDetailChipText: {
    color: "#dce9ed",
    fontSize: 10,
    fontWeight: "800",
  },
  questDetailDescriptionCard: {
    backgroundColor: "#151923",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 9,
    padding: 15,
  },
  questDetailSectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  questDetailSectionLabel: {
    color: "#9bc8d2",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  questDetailDescription: {
    color: "#e4eaf0",
    fontSize: 14,
    lineHeight: 21,
  },
  questDetailDescriptionEmpty: {
    color: "#7f8997",
    fontStyle: "italic",
  },
  questDetailFactsCard: {
    backgroundColor: "#151923",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  questDetailFactRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
    minHeight: 50,
  },
  questDetailFactIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.1)",
    borderRadius: 12,
    height: 39,
    justifyContent: "center",
    width: 39,
  },
  questDetailFactCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  questDetailFactLabel: {
    color: "#71808e",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  questDetailFactValue: {
    color: "#eef3f6",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  questDetailFactDivider: {
    backgroundColor: "rgba(255,255,255,0.06)",
    height: 1,
    marginLeft: 50,
  },
  questDetailPrivacyNote: {
    alignItems: "flex-start",
    backgroundColor: "rgba(214,173,99,0.08)",
    borderColor: "rgba(214,173,99,0.16)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginBottom: 9,
    marginLeft: 50,
    padding: 10,
  },
  questDetailPrivacyText: {
    color: "#c6ad81",
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
  },
  notificationHeader: {
    gap: 10,
    marginBottom: 2,
  },
  notificationAuthorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  notificationAvatar: {
    borderColor: "rgba(255,255,255,0.45)",
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    width: 34,
  },
  notificationAvatarFallback: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  notificationAuthorTextWrap: {
    flex: 1,
    gap: 1,
  },
  notificationAuthorName: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },
  notificationKind: {
    color: "#9bc8d2",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  unreadDot: {
    alignSelf: "flex-start",
    backgroundColor: "#f97316",
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  inboxThreadHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  inboxThreadHeaderText: {
    flex: 1,
    gap: 2,
  },
  inboxAvatar: {
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    width: 38,
  },
  inboxAvatarFallback: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    height: 38,
    width: 38,
  },
  questMeta: {
    color: "#aeb6c6",
    fontSize: 13,
    lineHeight: 18,
  },
  profileName: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "900",
  },
  profileHero: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  profileList: {
    gap: 8,
  },
  profileAvatarLarge: {
    borderColor: "rgba(255,255,255,0.6)",
    borderRadius: 999,
    borderWidth: 1,
    height: 88,
    width: 88,
  },
  profileAvatarLargeFallback: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    height: 88,
    width: 88,
  },
  profileQuestRow: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    marginTop: 8,
    padding: 10,
  },
  detailBox: {
    backgroundColor: "#171925",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  detailLabel: {
    color: "#9bc8d2",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "800",
  },
  detailMuted: {
    color: "#aeb6c6",
    fontSize: 13,
  },
  peopleSection: {
    backgroundColor: "#171925",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  peopleSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  countBadge: {
    alignItems: "center",
    backgroundColor: "rgba(155,200,210,0.12)",
    borderRadius: 999,
    justifyContent: "center",
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countBadgeText: {
    color: "#9bc8d2",
    fontSize: 11,
    fontWeight: "900",
  },
  requestCountBadge: {
    backgroundColor: "rgba(245,158,11,0.14)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  requestCountBadgeText: {
    color: "#fbbf24",
    fontSize: 11,
    fontWeight: "800",
  },
  personIdentity: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  personNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  roleBadge: {
    backgroundColor: "rgba(109,174,194,0.16)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  roleBadgeText: {
    color: "#9bc8d2",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  hostProfileRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.035)",
    borderRadius: 14,
    flexDirection: "row",
    gap: 11,
    minHeight: 68,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  personRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.035)",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    minHeight: 62,
    padding: 10,
  },
  personRowProfile: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  emptyPeopleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  addressAccessButton: {
    alignItems: "center",
    borderColor: "rgba(155,200,210,0.24)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addressAccessButtonActive: {
    backgroundColor: "#6daec2",
    borderColor: "#6daec2",
  },
  addressAccessText: {
    color: "#9bc8d2",
    fontSize: 11,
    fontWeight: "800",
  },
  addressAccessTextActive: {
    color: "#08121a",
  },
  requestCard: {
    backgroundColor: "rgba(255,255,255,0.035)",
    borderRadius: 14,
    gap: 10,
    padding: 11,
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  requestApproveButton: {
    alignItems: "center",
    backgroundColor: "#6daec2",
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 40,
  },
  requestApproveText: {
    color: "#08121a",
    fontSize: 14,
    fontWeight: "900",
  },
  requestDeclineButton: {
    alignItems: "center",
    backgroundColor: "rgba(248,113,113,0.08)",
    borderColor: "rgba(248,113,113,0.22)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 13,
  },
  requestDeclineText: {
    color: "#f87171",
    fontSize: 13,
    fontWeight: "800",
  },
  approveWithAddressButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  approveWithAddressText: {
    color: "#9bc8d2",
    fontSize: 12,
    fontWeight: "700",
  },
  commentRow: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 3,
    marginTop: 8,
    padding: 10,
  },
  detailActions: {
    gap: 10,
  },
  detailActionTray: {
    backgroundColor: "#171925",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  detailActionItem: {
    alignItems: "center",
    flex: 1,
    gap: 6,
    justifyContent: "center",
    minWidth: 0,
  },
  detailActionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  detailActionIconActive: {
    backgroundColor: "#6daec2",
  },
  detailActionLabel: {
    color: "#dbe2ea",
    fontSize: 11,
    fontWeight: "800",
  },
  detailDangerZone: {
    alignItems: "center",
    paddingBottom: 4,
    paddingTop: 2,
  },
  detailDangerButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 14,
  },
  detailDangerText: {
    color: "#f87171",
    fontSize: 13,
    fontWeight: "700",
  },
  reportStack: {
    flexDirection: "column",
    gap: 10,
    paddingVertical: 2,
  },
  notificationResultRow: {
    alignItems: "flex-start",
    marginTop: 2,
  },
  notificationResultPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  notificationResultApproved: {
    backgroundColor: "rgba(16,185,129,0.18)",
  },
  notificationResultDeclined: {
    backgroundColor: "rgba(248,113,113,0.18)",
  },
  notificationResultExpired: {
    backgroundColor: "rgba(245,158,11,0.18)",
  },
  notificationResultText: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  reportSegment: {
    flexDirection: "column",
    gap: 8,
    padding: 10,
  },
  reportSegmentButton: {
    alignSelf: "stretch",
    flexGrow: 0,
    justifyContent: "center",
    minHeight: 48,
    width: "100%",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reportStackButton: {
    alignSelf: "stretch",
    flex: 0,
    flexGrow: 0,
    justifyContent: "center",
    minHeight: 48,
    width: "100%",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reportButton: {
    borderColor: "#ef4444",
  },
  reportButtonText: {
    color: "#ef4444",
  },
  hostRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  hostAvatar: {
    borderRadius: 999,
    height: 48,
    width: 48,
  },
  hostAvatarFallback: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  mediaStrip: {
    gap: 10,
  },
  detailMediaCard: {
    gap: 6,
    width: 160,
  },
  detailMediaCardPressable: {
    position: "relative",
  },
  detailMediaFallbackCard: {
    gap: 8,
  },
  detailMediaImage: {
    borderRadius: 14,
    height: 110,
    width: 160,
  },
  detailVideoBadge: {
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.72)",
    borderRadius: 999,
    bottom: 8,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    width: 24,
  },
  mediaPreviewHeaderButton: {
    alignItems: "center",
    justifyContent: "center",
    height: 28,
    width: 28,
  },
  mediaPreviewVideoShell: {
    backgroundColor: "#000",
    borderRadius: 18,
    overflow: "hidden",
  },
  videoPreviewFallback: {
    alignItems: "center",
    backgroundColor: "#050816",
    borderRadius: 18,
    gap: 10,
    justifyContent: "center",
    minHeight: 280,
    overflow: "hidden",
    padding: 14,
  },
  mediaPreviewVideoShellFullscreen: {
    flex: 1,
  },
  mediaPreviewOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: "rgba(2, 6, 23, 0.78)",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  mediaPreviewBackdrop: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  mediaPreviewSheet: {
    backgroundColor: "#11131c",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    maxHeight: "88%",
    overflow: "hidden",
    padding: 14,
  },
  mediaPreviewLoading: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 280,
  },
  mediaPreviewImageLarge: {
    borderRadius: 18,
    height: 320,
    width: "100%",
  },
  mediaPreviewVideo: {
    backgroundColor: "#000",
    borderRadius: 18,
    height: 320,
    width: "100%",
  },
  mediaPreviewVideoFullscreen: {
    borderRadius: 0,
    flex: 1,
    height: "100%",
    width: "100%",
  },
  fullscreenMediaOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(2, 6, 23, 0.96)",
    justifyContent: "center",
    padding: 12,
    zIndex: 70,
  },
  fullscreenMediaSheet: {
    backgroundColor: "#050816",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    overflow: "hidden",
    padding: 14,
  },
  commentHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  commentRowMain: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  commentAvatar: {
    borderRadius: 999,
    height: 38,
    width: 38,
  },
  commentAvatarFallback: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  commentThreadCard: {
    backgroundColor: "#171925",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  commentThreadHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  commentSortPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  commentSortText: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "700",
  },
  commentThreadItem: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 2,
  },
  commentThreadAvatar: {
    borderRadius: 999,
    height: 42,
    width: 42,
  },
  commentThreadAvatarFallback: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  commentThreadBody: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  commentThreadMetaRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  commentThreadName: {
    color: "#f8fafc",
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    minWidth: 0,
  },
  commentThreadTime: {
    color: "#aeb6c6",
    fontSize: 12,
    fontWeight: "700",
  },
  commentThreadText: {
    color: "#e5e7eb",
    fontSize: 15,
    lineHeight: 21,
  },
  commentThreadActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  commentThreadActionLabel: {
    color: "#9bc8d2",
    fontSize: 12,
    fontWeight: "700",
  },
  commentComposerCard: {
    backgroundColor: "#171925",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  commentComposerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  commentComposerAvatar: {
    borderRadius: 999,
    height: 40,
    width: 40,
  },
  commentComposerAvatarFallback: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  commentComposerInput: {
    flex: 1,
    minHeight: 84,
    paddingTop: 12,
    paddingBottom: 12,
  },
  commentSendButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#0f5f73",
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  commentComposerActions: {
    flexDirection: "row",
    gap: 10,
  },
  onboardingCard: {
    alignSelf: "center",
    backgroundColor: "#0e1017",
    borderColor: "rgba(155,216,228,0.16)",
    borderRadius: 28,
    borderWidth: 1,
    maxHeight: "90%",
    maxWidth: 520,
    overflow: "hidden",
    width: "100%",
  },
  onboardingHeader: {
    backgroundColor: "#141824",
    borderBottomColor: "rgba(255,255,255,0.06)",
    borderBottomWidth: 1,
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 17,
  },
  onboardingHeaderTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  onboardingBrandMark: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 13,
    height: 40,
    justifyContent: "center",
    transform: [{ rotate: "-6deg" }],
    width: 40,
  },
  onboardingHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  onboardingEyebrow: {
    color: "#9bd8e4",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  onboardingProgressLabel: {
    color: "#8c97a6",
    fontSize: 12,
    fontWeight: "700",
  },
  onboardingSkipButton: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  onboardingSkipText: {
    color: "#dbe7ec",
    fontSize: 12,
    fontWeight: "900",
  },
  onboardingProgressTrack: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    height: 4,
    overflow: "hidden",
  },
  onboardingProgressFill: {
    backgroundColor: "#6daec2",
    borderRadius: 999,
    height: 4,
  },
  onboardingStepRail: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  onboardingStepItem: {
    alignItems: "center",
    flex: 1,
    gap: 5,
    paddingBottom: 12,
  },
  onboardingStepDot: {
    alignItems: "center",
    backgroundColor: "#242936",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  onboardingStepDotActive: {
    borderColor: "#9bd8e4",
    borderWidth: 2,
  },
  onboardingStepDotComplete: {
    backgroundColor: "#9bd8e4",
    borderColor: "#9bd8e4",
  },
  onboardingStepNumber: {
    color: "#778292",
    fontSize: 10,
    fontWeight: "900",
  },
  onboardingStepNumberActive: {
    color: "#dff7fb",
  },
  onboardingStepLabel: {
    color: "#6f7988",
    fontSize: 9,
    fontWeight: "800",
  },
  onboardingStepLabelActive: {
    color: "#dff7fb",
  },
  onboardingScroll: {
    flexGrow: 0,
  },
  onboardingContent: {
    gap: 16,
    padding: 18,
  },
  onboardingTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  onboardingTitleIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109,174,194,0.12)",
    borderRadius: 15,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  onboardingTitleCopy: {
    flex: 1,
    gap: 4,
  },
  onboardingTitle: {
    color: "#f8fafc",
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.6,
    lineHeight: 28,
  },
  onboardingDetail: {
    color: "#929cab",
    fontSize: 12,
    lineHeight: 17,
  },
  onboardingFormCard: {
    backgroundColor: "#151923",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  onboardingField: {
    gap: 7,
  },
  onboardingFieldLabel: {
    color: "#cbd5df",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  onboardingInputWrap: {
    alignItems: "center",
    backgroundColor: "#0b0e14",
    borderColor: "rgba(155,216,228,0.15)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 13,
  },
  onboardingInput: {
    color: "#f8fafc",
    flex: 1,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 9,
  },
  onboardingStandaloneInput: {
    backgroundColor: "#0b0e14",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  onboardingSplitFields: {
    flexDirection: "row",
    gap: 10,
  },
  onboardingSplitField: {
    flex: 1,
  },
  onboardingCountryField: {
    width: 98,
  },
  onboardingPrivacyNote: {
    alignItems: "flex-start",
    backgroundColor: "rgba(109,174,194,0.07)",
    borderRadius: 13,
    flexDirection: "row",
    gap: 8,
    padding: 11,
  },
  onboardingPrivacyText: {
    color: "#96a5b3",
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  onboardingBioInput: {
    backgroundColor: "#0b0e14",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 15,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 15,
    lineHeight: 21,
    minHeight: 150,
    padding: 13,
  },
  onboardingBioFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  onboardingHint: {
    color: "#7f8997",
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  onboardingCharacterCount: {
    color: "#9bc8d2",
    fontSize: 11,
    fontWeight: "800",
  },
  onboardingSelectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  onboardingSelectionTitle: {
    color: "#dbe7ec",
    fontSize: 12,
    fontWeight: "800",
  },
  onboardingSelectionCount: {
    color: "#9bd8e4",
    fontSize: 11,
    fontWeight: "900",
  },
  onboardingInterestGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  onboardingInterestChip: {
    alignItems: "center",
    backgroundColor: "#0b0e14",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 39,
    paddingHorizontal: 11,
  },
  onboardingInterestChipActive: {
    backgroundColor: "#9bd8e4",
    borderColor: "#9bd8e4",
  },
  onboardingInterestText: {
    color: "#dbe7ec",
    fontSize: 12,
    fontWeight: "800",
  },
  onboardingInterestTextActive: {
    color: "#082f3a",
  },
  onboardingLoadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  onboardingPhotoCard: {
    alignItems: "center",
    backgroundColor: "#151923",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 20,
    borderWidth: 1,
    gap: 9,
    padding: 18,
  },
  onboardingAvatarButton: {
    marginBottom: 5,
    position: "relative",
  },
  onboardingAvatar: {
    borderColor: "rgba(155,216,228,0.45)",
    borderRadius: 999,
    borderWidth: 3,
    height: 126,
    width: 126,
  },
  onboardingAvatarFallback: {
    alignItems: "center",
    borderColor: "rgba(155,216,228,0.28)",
    borderRadius: 999,
    borderWidth: 2,
    height: 126,
    justifyContent: "center",
    width: 126,
  },
  onboardingCameraBadge: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderColor: "#151923",
    borderRadius: 999,
    borderWidth: 4,
    bottom: 0,
    height: 40,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    width: 40,
  },
  onboardingPhotoTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "900",
  },
  onboardingPhotoDetail: {
    color: "#8f99a8",
    fontSize: 12,
    lineHeight: 17,
    maxWidth: 290,
    textAlign: "center",
  },
  onboardingPhotoAction: {
    backgroundColor: "#f8fafc",
    borderRadius: 999,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  onboardingPhotoActionText: {
    color: "#101521",
    fontSize: 13,
    fontWeight: "900",
  },
  onboardingRemovePhoto: {
    color: "#8f99a8",
    fontSize: 11,
    fontWeight: "800",
    padding: 5,
  },
  onboardingFooter: {
    alignItems: "center",
    backgroundColor: "#141824",
    borderTopColor: "rgba(255,255,255,0.06)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 13,
  },
  onboardingFooterCopy: {
    flex: 1,
    gap: 2,
    paddingLeft: 3,
  },
  onboardingFooterCount: {
    color: "#dbe7ec",
    fontSize: 11,
    fontWeight: "900",
  },
  onboardingFooterHint: {
    color: "#737e8e",
    fontSize: 9,
    fontWeight: "700",
  },
  onboardingBackButton: {
    alignItems: "center",
    backgroundColor: "#242936",
    borderRadius: 14,
    height: 45,
    justifyContent: "center",
    width: 45,
  },
  onboardingNextButton: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 14,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 45,
    minWidth: 112,
    paddingHorizontal: 16,
  },
  onboardingNextText: {
    color: "#082f3a",
    fontSize: 13,
    fontWeight: "900",
  },
  modalOverlay: {
    alignItems: "center",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 24,
    zIndex: 40,
  },
  modalOverlayRaised: {
    zIndex: 80,
  },
  accountModalWrap: {
    justifyContent: "flex-end",
    width: "100%",
  },
  accountModalCard: {
    alignSelf: "center",
    gap: 13,
    maxWidth: 440,
    padding: 20,
    width: "100%",
  },
  accountModalTitle: {
    color: "#f8fafc",
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
  },
  accountModalBody: {
    color: "#aeb6c6",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  accountDeleteIconWrap: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(248,113,113,0.1)",
    borderRadius: 999,
    height: 54,
    justifyContent: "center",
    width: 54,
  },
  accountRestoreIconWrap: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(109,174,194,0.12)",
    borderRadius: 999,
    height: 60,
    justifyContent: "center",
    width: 60,
  },
  accountWarningBox: {
    alignItems: "flex-start",
    backgroundColor: "rgba(245,158,11,0.1)",
    borderColor: "rgba(245,158,11,0.22)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 11,
  },
  accountWarningText: {
    color: "#fde68a",
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  accountDeleteConfirmButton: {
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  accountDeleteConfirmText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  accountRestoreBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(5,8,16,0.9)",
  },
  accountDeleteLink: {
    alignItems: "center",
    minHeight: 36,
    justifyContent: "center",
  },
  accountDeleteLinkText: {
    color: "#f87171",
    fontSize: 13,
    fontWeight: "700",
  },
  legalLinkButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    minHeight: 34,
    paddingHorizontal: 2,
  },
  legalLinkText: {
    color: "#9bc8d2",
    fontSize: 13,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  eulaBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(5,8,16,0.94)",
  },
  eulaCard: {
    alignSelf: "center",
    maxHeight: "92%",
    maxWidth: 460,
    overflow: "hidden",
    padding: 0,
    width: "100%",
  },
  eulaContent: {
    gap: 14,
    padding: 20,
  },
  eulaIconWrap: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(109,174,194,0.12)",
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  eulaHeading: {
    alignItems: "center",
    gap: 5,
  },
  eulaEyebrow: {
    color: "#9bc8d2",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  eulaZeroToleranceBox: {
    backgroundColor: "rgba(248,113,113,0.08)",
    borderColor: "rgba(248,113,113,0.22)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  eulaZeroToleranceTitle: {
    color: "#fca5a5",
    fontSize: 14,
    fontWeight: "900",
  },
  eulaZeroToleranceText: {
    color: "#fecaca",
    fontSize: 12,
    lineHeight: 18,
  },
  eulaRuleList: {
    gap: 10,
  },
  eulaRuleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  eulaRuleText: {
    color: "#dbe2ea",
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  eulaConsentRow: {
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  eulaConsentText: {
    color: "#f8fafc",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  pickerModalOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
    zIndex: 60,
  },
  pickerModalCard: {
    alignSelf: "center",
    backgroundColor: "#11131c",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    borderWidth: 1,
    maxHeight: "88%",
    overflow: "hidden",
    padding: 16,
    width: "100%",
  },
  pickerModalScroll: {
    maxHeight: "100%",
  },
  pickerModalContent: {
    gap: 12,
    paddingBottom: 12,
  },
  pickerModalBody: {
    alignItems: "center",
    paddingVertical: 4,
  },
  modalCard: {
    alignSelf: "center",
    backgroundColor: "#11131c",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    borderWidth: 1,
    maxHeight: "88%",
    maxWidth: 560,
    overflow: "hidden",
    padding: 16,
    width: "100%",
  },
  modalCardScrollable: {
    maxHeight: "88%",
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalCardElevated: {
    zIndex: 1,
    elevation: 12,
  },
  modalCardKeyboard: {
    paddingBottom: 16,
  },
  modalCardKeyboardRaised: {
    marginBottom: 6,
  },
  modalSheetTall: {
    maxHeight: "88%",
  },
  modalContent: {
    gap: 12,
    paddingBottom: 8,
  },
  modalContentKeyboard: {
    paddingBottom: 20,
  },
  questionInput: {
    minHeight: 96,
  },
  date: {
    color: "#aeb6c6",
    fontSize: 12,
    fontWeight: "700",
  },
  status: {
    color: "#f9d46a",
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: 16,
  },
  link: {
    color: "#f8fafc",
    fontWeight: "800",
  },
  tabBar: {
    alignItems: "center",
    backgroundColor: "rgba(20,21,31,0.94)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 38,
    borderWidth: 1,
    bottom: 20,
    flexDirection: "row",
    gap: 0,
    left: 16,
    minHeight: 74,
    paddingHorizontal: 10,
    paddingVertical: 9,
    position: "absolute",
    right: 16,
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  tabButton: {
    alignItems: "center",
    flex: 1,
    gap: 0,
    minHeight: 56,
    justifyContent: "center",
    borderRadius: 24,
  },
  tabButtonActive: {
    backgroundColor: "rgba(109,174,194,0.16)",
  },
  tabIconWrap: {
    position: "relative",
  },
  tabLabel: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  tabLabelActive: {
    opacity: 0,
  },
  createTabButton: {
    alignSelf: "center",
  },
  createTabIcon: {
    alignItems: "center",
    backgroundColor: "#0f5f73",
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  badgePill: {
    position: "absolute",
    top: -7,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: "#ef4444",
    borderWidth: 1.5,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },
  createTabLabel: {
    opacity: 0,
  },
  feedToggle: {
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "#0c5063",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    padding: 4,
  },
  feedToggleButton: {
    borderRadius: 999,
    minWidth: 58,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  feedToggleButtonActive: {
    backgroundColor: "#ffffff",
  },
  feedToggleText: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  feedToggleTextActive: {
    color: "#0b1220",
  },
  headerFeedToggle: {
    alignSelf: "center",
    backgroundColor: "rgba(15,95,115,0.82)",
    padding: 3,
  },
  headerFeedToggleButton: {
    minWidth: 45,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  headerFeedToggleText: {
    fontSize: 12,
  },
  homeDiscovery: {
    gap: 14,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  mapDiscovery: {
    gap: 12,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  mapDiscoveryHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  mapDiscoveryTitleBlock: {
    flex: 1,
  },
  mapDiscoveryEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  mapDiscoveryTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  mapDiscoveryLocation: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    maxWidth: "42%",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  mapDiscoveryLocationText: {
    fontSize: 10,
    fontWeight: "900",
  },
  mapSearchShell: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 51,
    paddingHorizontal: 14,
  },
  mapSearchCount: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minWidth: 29,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  mapSearchCountText: {
    fontSize: 10,
    fontWeight: "900",
  },
  homeHero: {
    borderRadius: 28,
    gap: 7,
    overflow: "hidden",
    padding: 18,
  },
  homeHeroTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  homeLocalPill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.48)",
    borderColor: "rgba(255,255,255,0.38)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    maxWidth: "65%",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  homeLocalPillText: {
    color: "#0b5364",
    fontSize: 11,
    fontWeight: "900",
  },
  homeLivePill: {
    alignItems: "center",
    backgroundColor: "rgba(8,47,58,0.1)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  homeLiveDot: {
    backgroundColor: "#0f766e",
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  homeLiveText: {
    color: "#164e63",
    fontSize: 10,
    fontWeight: "900",
  },
  homeEyebrow: {
    color: "#0b5364",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  homeHeroTitle: {
    color: "#082f3a",
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 33,
  },
  homeHeroCopy: {
    color: "#275463",
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 300,
  },
  homeCreateButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.66)",
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    paddingBottom: 5,
    paddingLeft: 5,
    paddingRight: 13,
    paddingTop: 5,
  },
  homeCreateIcon: {
    alignItems: "center",
    backgroundColor: "#0f5f73",
    borderRadius: 999,
    height: 31,
    justifyContent: "center",
    width: 31,
  },
  homeCreateText: {
    color: "#082f3a",
    fontSize: 12,
    fontWeight: "900",
  },
  homeSearchShell: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 53,
    paddingHorizontal: 14,
  },
  homeSearchInput: {
    flex: 1,
    fontSize: 14,
    minHeight: 51,
    paddingVertical: 12,
  },
  homeCategoryRail: {
    gap: 8,
    paddingRight: 12,
  },
  homeCategoryChip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 39,
    paddingHorizontal: 14,
  },
  homeCategoryChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  homeSectionHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingTop: 3,
  },
  homeSectionEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
    marginBottom: 3,
  },
  homeSectionTitle: {
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  homeResultPill: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minWidth: 31,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  homeResultText: {
    fontSize: 11,
    fontWeight: "900",
  },
  homeFeedStack: {
    gap: 16,
    paddingBottom: 12,
  },
  homeEmptyCard: {
    alignItems: "center",
    borderRadius: 26,
    borderWidth: 1,
    gap: 7,
    marginHorizontal: 14,
    padding: 24,
  },
  homeEmptyIcon: {
    alignItems: "center",
    backgroundColor: "#dff1f4",
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
    marginBottom: 4,
    width: 52,
  },
  homeEmptyTitle: {
    fontSize: 17,
    fontWeight: "900",
  },
  homeEmptyCopy: {
    fontSize: 12,
    lineHeight: 17,
    maxWidth: 270,
    textAlign: "center",
  },
  homeEmptyActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  homeClearButton: {
    alignItems: "center",
    borderColor: "rgba(109,174,194,0.3)",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 43,
    paddingHorizontal: 14,
  },
  homeClearButtonText: {
    color: "#6daec2",
    fontSize: 12,
    fontWeight: "900",
  },
  homeEmptyCreateButton: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 14,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 43,
    paddingHorizontal: 14,
  },
  homeEmptyCreateText: {
    color: "#082f3a",
    fontSize: 12,
    fontWeight: "900",
  },
  mapPlaceholderCard: {
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    marginHorizontal: 14,
    padding: 26,
  },
  mapPlaceholderIcon: {
    alignItems: "center",
    borderRadius: 22,
    height: 58,
    justifyContent: "center",
    marginBottom: 4,
    width: 58,
  },
  mapPlaceholderTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  mapPlaceholderText: {
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 270,
    textAlign: "center",
  },
  mapPlaceholderAction: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    minHeight: 42,
    paddingHorizontal: 15,
  },
  mapPlaceholderActionText: {
    color: "#082f3a",
    fontSize: 12,
    fontWeight: "900",
  },
  mapStack: {
    gap: 13,
    paddingBottom: 12,
  },
  mapStage: {
    backgroundColor: "#151722",
    borderRadius: 28,
    borderWidth: 1,
    height: 550,
    marginHorizontal: 14,
    overflow: "hidden",
    position: "relative",
  },
  nativeMap: {
    flex: 1,
  },
  mapTopOverlay: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 12,
    position: "absolute",
    right: 12,
    top: 12,
  },
  mapActivityPill: {
    alignItems: "center",
    backgroundColor: "rgba(10,20,29,0.84)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  mapActivityDot: {
    backgroundColor: "#4ade80",
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  mapActivityText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  mapControlStack: {
    gap: 8,
  },
  mapControlButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: "rgba(15,23,42,0.1)",
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    width: 42,
  },
  mapControlButtonActive: {
    backgroundColor: "#0f5f73",
    borderColor: "#0f5f73",
  },
  mapLocationNudge: {
    alignItems: "center",
    backgroundColor: "rgba(10,20,29,0.86)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: "absolute",
    top: 58,
  },
  mapLocationNudgeText: {
    color: "#dff7fb",
    fontSize: 10,
    fontWeight: "900",
  },
  mapMarkerShell: {
    alignItems: "center",
  },
  mapMarker: {
    alignItems: "center",
    backgroundColor: "#0f5f73",
    borderColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 2,
    height: 34,
    justifyContent: "center",
    shadowColor: "#00131b",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    width: 34,
  },
  mapMarkerSelected: {
    backgroundColor: "#9bd8e4",
    borderColor: "#ffffff",
    borderRadius: 19,
    height: 40,
    width: 40,
  },
  mapMarkerTip: {
    borderLeftColor: "transparent",
    borderLeftWidth: 5,
    borderRightColor: "transparent",
    borderRightWidth: 5,
    borderTopColor: "#0f5f73",
    borderTopWidth: 7,
    marginTop: -2,
  },
  mapMarkerTipSelected: {
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopColor: "#9bd8e4",
    borderTopWidth: 8,
  },
  mapPreviewCard: {
    backgroundColor: "rgba(13,18,27,0.96)",
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 22,
    borderWidth: 1,
    bottom: 12,
    left: 12,
    padding: 10,
    position: "absolute",
    right: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
  },
  mapPreviewMain: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  mapPreviewImage: {
    backgroundColor: "#20313e",
    borderRadius: 15,
    height: 78,
    width: 78,
  },
  mapPreviewImageFallback: {
    alignItems: "center",
    backgroundColor: "#20313e",
    borderRadius: 15,
    height: 78,
    justifyContent: "center",
    width: 78,
  },
  mapPreviewCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  mapPreviewMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  mapPreviewCategory: {
    color: "#9bd8e4",
    flex: 1,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  mapPreviewDistance: {
    color: "#d3dbe5",
    fontSize: 9,
    fontWeight: "800",
    marginLeft: 7,
    maxWidth: "46%",
  },
  mapPreviewTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  mapPreviewHostRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  mapPreviewHost: {
    color: "#9aa6b5",
    flexShrink: 1,
    fontSize: 9,
    fontWeight: "700",
  },
  mapPreviewMetaDot: {
    backgroundColor: "#657384",
    borderRadius: 999,
    height: 3,
    width: 3,
  },
  mapPreviewActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 9,
  },
  mapPreviewSave: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 13,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 46,
  },
  mapPreviewSaveActive: {
    backgroundColor: "#9bd8e4",
    borderColor: "#9bd8e4",
  },
  mapPreviewJoin: {
    alignItems: "center",
    backgroundColor: "#9bd8e4",
    borderRadius: 13,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 40,
    justifyContent: "center",
  },
  mapPreviewJoinMuted: {
    backgroundColor: "#6daec2",
  },
  mapPreviewJoinText: {
    color: "#082f3a",
    fontSize: 11,
    fontWeight: "900",
  },
  mapNearbyHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  mapNearbyEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  mapNearbyTitle: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  mapNearbyHint: {
    fontSize: 10,
    fontWeight: "700",
  },
  mapQuestRail: {
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  mapQuestTile: {
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 8,
    width: 258,
  },
  mapQuestTileActive: {
    shadowColor: "#0f5f73",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 9,
  },
  mapQuestTileImage: {
    backgroundColor: "#20313e",
    borderRadius: 13,
    height: 72,
    width: 68,
  },
  mapQuestTileCopy: {
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minWidth: 0,
  },
  mapQuestTileMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  mapQuestTileCategory: {
    flex: 1,
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  mapQuestTileTitle: {
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 15,
  },
  mapQuestTileDistance: {
    fontSize: 9,
    fontWeight: "700",
  },
  feedCard: {
    borderRadius: 27,
    borderWidth: 1,
    marginHorizontal: 14,
    overflow: "hidden",
    position: "relative",
  },
  feedMediaWrap: {
    height: 410,
    overflow: "hidden",
    position: "relative",
  },
  feedMediaCarousel: {
    height: "100%",
    width: "100%",
  },
  feedMediaPage: {
    height: "100%",
  },
  feedMedia: {
    height: "100%",
    width: "100%",
  },
  feedVideoItem: {
    backgroundColor: "#08121a",
    height: "100%",
    position: "relative",
    width: "100%",
  },
  feedVideoPosterFallback: {
    backgroundColor: "#173445",
    height: "100%",
    width: "100%",
  },
  feedVideoPlayButton: {
    alignItems: "center",
    backgroundColor: "rgba(223,247,251,0.92)",
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 999,
    borderWidth: 1,
    height: 62,
    justifyContent: "center",
    left: "50%",
    marginLeft: -31,
    marginTop: -31,
    position: "absolute",
    top: "50%",
    width: 62,
  },
  feedVideoPlayIcon: {
    marginLeft: 3,
  },
  feedVideoLabel: {
    alignItems: "center",
    backgroundColor: "rgba(9,16,24,0.58)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    left: 14,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: "absolute",
    top: 64,
  },
  feedVideoLabelText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  feedVideoStatus: {
    alignItems: "center",
    backgroundColor: "rgba(5,10,15,0.58)",
    gap: 7,
    justifyContent: "center",
    ...StyleSheet.absoluteFillObject,
  },
  feedVideoErrorText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    maxWidth: 230,
    textAlign: "center",
  },
  feedMediaPagination: {
    alignItems: "center",
    backgroundColor: "rgba(9,16,24,0.52)",
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    left: "50%",
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: "absolute",
    top: 65,
    transform: [{ translateX: -38 }],
  },
  feedMediaDots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  feedMediaDot: {
    backgroundColor: "rgba(255,255,255,0.42)",
    borderRadius: 999,
    height: 5,
    width: 5,
  },
  feedMediaDotActive: {
    backgroundColor: "#ffffff",
    width: 13,
  },
  feedMediaPageCount: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  feedMediaFallback: {
    backgroundColor: "#173445",
    height: "100%",
    width: "100%",
  },
  feedTopOverlay: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    paddingHorizontal: 14,
    paddingTop: 14,
    position: "absolute",
    right: 0,
    top: 0,
  },
  feedCreatorPill: {
    alignItems: "center",
    backgroundColor: "rgba(9,16,24,0.48)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    maxWidth: "57%",
    paddingBottom: 4,
    paddingLeft: 4,
    paddingRight: 10,
    paddingTop: 4,
  },
  feedAvatar: {
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    width: 30,
  },
  feedAvatarFallback: {
    alignItems: "center",
    backgroundColor: "rgba(155,216,228,0.24)",
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  feedCreatorName: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  feedTopActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  feedDistancePill: {
    alignItems: "center",
    backgroundColor: "rgba(9,16,24,0.48)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    maxWidth: 105,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  feedDistancePillText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  feedMoreButton: {
    alignItems: "center",
    backgroundColor: "rgba(9,16,24,0.48)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  feedBottomOverlay: {
    bottom: 0,
    left: 0,
    gap: 7,
    paddingBottom: 17,
    paddingHorizontal: 16,
    paddingTop: 70,
    position: "absolute",
    right: 0,
  },
  feedCategoryPill: {
    alignSelf: "flex-start",
    backgroundColor: "#9bd8e4",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  feedCategory: {
    color: "#082f3a",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  feedTitle: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.45,
    lineHeight: 29,
    textShadowColor: "rgba(0,0,0,0.36)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  feedMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  feedMetaText: {
    color: "#d9e2e8",
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  feedContextRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 13,
    paddingTop: 13,
  },
  feedPlaceBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  feedPlace: {
    fontSize: 13,
    fontWeight: "900",
  },
  feedGoing: {
    fontSize: 10,
    fontWeight: "700",
  },
  feedJoinButton: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    maxWidth: "52%",
    minHeight: 40,
    paddingHorizontal: 13,
  },
  feedJoinButtonReady: {
    backgroundColor: "#9bd8e4",
  },
  feedJoinButtonPending: {
    backgroundColor: "rgba(245,158,11,0.14)",
    borderColor: "rgba(245,158,11,0.28)",
    borderWidth: 1,
  },
  feedJoinButtonJoined: {
    backgroundColor: "rgba(109,174,194,0.13)",
    borderColor: "rgba(155,216,228,0.22)",
    borderWidth: 1,
  },
  feedJoinButtonText: {
    color: "#082f3a",
    fontSize: 11,
    fontWeight: "900",
  },
  feedJoinButtonTextMuted: {
    color: "#dff7fb",
  },
  feedActionsRow: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 3,
    marginTop: 11,
    minHeight: 52,
    paddingHorizontal: 10,
  },
  feedActionButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  feedActionText: {
    fontSize: 11,
    fontWeight: "800",
  },
  feedSaveButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  feedSaveButtonActive: {
    backgroundColor: "#9bd8e4",
  },
  feedActionsSpacer: {
    flex: 1,
  },
});
