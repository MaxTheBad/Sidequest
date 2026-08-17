import { createClient } from "npm:@supabase/supabase-js@2";

function chunk<T>(array: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

const LIVE_ACTIVITY_TOPIC_SUFFIX = ".push-type.liveactivity";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
let cachedApnsJwt: { value: string; createdAt: number } | null = null;
let cachedGoogleAccessToken: { value: string; createdAt: number; expiresAt: number; projectId: string } | null = null;

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return mismatch === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function jsonBase64Url(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function getApnsJwt(): Promise<string | null> {
  const keyId = Deno.env.get("APNS_KEY_ID")?.trim();
  const teamId = Deno.env.get("APNS_TEAM_ID")?.trim();
  const privateKeyRaw = Deno.env.get("APNS_PRIVATE_KEY")?.trim();
  if (!keyId || !teamId || !privateKeyRaw) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedApnsJwt && now - cachedApnsJwt.createdAt < 45 * 60) return cachedApnsJwt.value;

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const keyBody = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(keyBody), (character) => character.charCodeAt(0));
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = jsonBase64Url({ alg: "ES256", kid: keyId });
  const claims = jsonBase64Url({ iss: teamId, iat: now });
  const signingInput = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    new TextEncoder().encode(signingInput),
  ));
  cachedApnsJwt = { value: `${signingInput}.${base64Url(signature)}`, createdAt: now };
  return cachedApnsJwt.value;
}

function readGoogleServiceAccount(): GoogleServiceAccount | null {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<GoogleServiceAccount>;
      if (typeof parsed.client_email === "string" && typeof parsed.private_key === "string" && typeof parsed.project_id === "string") {
        return parsed as GoogleServiceAccount;
      }
    } catch {
      return null;
    }
  }

  const clientEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL")?.trim();
  const privateKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.trim();
  const projectId = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PROJECT_ID")?.trim();
  if (!clientEmail || !privateKey || !projectId) return null;
  return { client_email: clientEmail, private_key: privateKey, project_id: projectId };
}

async function getGoogleAccessToken(): Promise<{ accessToken: string; projectId: string } | null> {
  const serviceAccount = readGoogleServiceAccount();
  if (!serviceAccount) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleAccessToken && cachedGoogleAccessToken.projectId === serviceAccount.project_id && cachedGoogleAccessToken.expiresAt > now + 30) {
    const cached = cachedGoogleAccessToken;
    return { accessToken: cached.value, projectId: cached.projectId };
  }

  const privateKey = serviceAccount.private_key.replace(/\\n/g, "\n");
  const keyBody = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(keyBody), (character) => character.charCodeAt(0));
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const header = jsonBase64Url({ alg: "RS256", typ: "JWT" });
  const claims = jsonBase64Url({
    iss: serviceAccount.client_email,
    scope: FCM_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const signingInput = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(signingInput),
  ));
  const assertion = `${signingInput}.${base64Url(signature)}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  if (!tokenResponse.ok) return null;

  const tokenJson = await tokenResponse.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!tokenJson?.access_token) return null;

  const expiresIn = Number(tokenJson.expires_in || 3600);
  cachedGoogleAccessToken = {
    value: tokenJson.access_token,
    createdAt: now,
    expiresAt: now + Math.max(60, expiresIn - 60),
    projectId: serviceAccount.project_id,
  };
  return { accessToken: cachedGoogleAccessToken.value, projectId: cachedGoogleAccessToken.projectId };
}

function normalizeFcmData(data: Record<string, unknown>, unreadCount: number) {
  const normalized: Record<string, string> = { unreadCount: String(unreadCount) };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    normalized[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return normalized;
}

async function sendAndroidPush(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
  unreadCount: number,
  data: Record<string, unknown>,
) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "questhat-updates",
            icon: "notification_icon",
            color: "#9BD8E4",
            sound: "default",
            notification_count: unreadCount,
          },
        },
        data: normalizeFcmData(data, unreadCount),
      },
    }),
  });

  const responseJson = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return {
    ok: response.ok,
    status: response.status,
    error: responseJson?.error?.message ? String(responseJson.error.message) : undefined,
  };
}

async function startLiveActivity(
  // The Edge Function uses a service-role client without generated database types.
  supabase: any,
  userId: string,
  data: Record<string, unknown>,
) {
  const meta = data.meta && typeof data.meta === "object" ? data.meta as Record<string, unknown> : {};
  if (String(meta.kind || "") !== "quest_start_reminder") return { sent: 0, skipped: true, reason: "not_quest_reminder" };

  const questId = String(data.questId || "");
  if (!questId) return { sent: 0, skipped: true, reason: "missing_quest" };
  const apnsJwt = await getApnsJwt();
  if (!apnsJwt) return { sent: 0, skipped: true, reason: "missing_apns_credentials" };

  const [{ data: quest, error: questError }, { data: tokenRows, error: tokenError }] = await Promise.all([
    supabase.from("quests").select("id,creator_id,title,city,starts_at").eq("id", questId).maybeSingle(),
    supabase
      .from("live_activity_push_tokens")
      .select("id,token,environment")
      .eq("user_id", userId)
      .eq("active", true)
      .gte("last_seen_at", new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString())
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);
  if (questError) throw new Error(`Could not load quest for Live Activity: ${questError.message}`);
  if (tokenError) throw new Error(`Could not load Live Activity tokens: ${tokenError.message}`);
  const questRow = quest as { id: string; creator_id: string; title: string | null; city: string | null; starts_at: string | null } | null;
  const activityTokens = (tokenRows || []) as Array<{ id: string; token: string; environment: "production" | "sandbox" }>;
  if (!questRow?.starts_at) return { sent: 0, skipped: true, reason: "missing_start_time" };
  if (!activityTokens.length) return { sent: 0, skipped: true, reason: "no_live_activity_tokens" };

  if (questRow.creator_id !== userId) {
    const { data: membership, error: membershipError } = await supabase
      .from("quest_members")
      .select("quest_id")
      .eq("quest_id", questId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (membershipError) throw new Error(`Could not validate Live Activity recipient: ${membershipError.message}`);
    if (!membership) return { sent: 0, skipped: true, reason: "not_approved_participant" };
  }

  const startsAt = Math.floor(new Date(questRow.starts_at).getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(startsAt) || startsAt <= now - 15 * 60) {
    return { sent: 0, skipped: true, reason: "quest_already_started" };
  }

  const bundleId = Deno.env.get("APNS_BUNDLE_ID")?.trim() || "com.questhat.app";
  const payload = {
    aps: {
      timestamp: now,
      event: "start",
      "content-state": { startsAt, status: "upcoming" },
      "attributes-type": "QuestHatActivityAttributes",
      attributes: {
        questId,
        title: String(questRow.title || "Upcoming quest").slice(0, 100),
        location: String(questRow.city || "Location pending").slice(0, 100),
      },
      alert: {
        title: "Quest starts soon",
        body: `"${String(questRow.title || "Your quest").slice(0, 100)}" starts in about 30 minutes.`,
        sound: "default",
      },
      "relevance-score": 100,
      "stale-date": startsAt + 60 * 60,
      "dismissal-date": startsAt + 60 * 60,
    },
  };

  let sent = 0;
  const results: Array<{ status: number; reason?: string }> = [];
  for (const row of activityTokens) {
    const host = row.environment === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
    const response = await fetch(`https://${host}/3/device/${encodeURIComponent(row.token)}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${apnsJwt}`,
        "apns-topic": `${bundleId}${LIVE_ACTIVITY_TOPIC_SUFFIX}`,
        "apns-push-type": "liveactivity",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const responseBody = await response.json().catch(() => ({})) as { reason?: string };
    const reason = responseBody.reason ? String(responseBody.reason) : undefined;
    results.push({ status: response.status, reason });
    if (response.ok) {
      sent += 1;
      await supabase.from("live_activity_push_tokens").update({ last_error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
    } else {
      const invalidToken = ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(reason || "");
      await supabase.from("live_activity_push_tokens").update({
        active: invalidToken ? false : true,
        last_error: reason || `APNs HTTP ${response.status}`,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    }
  }

  return { sent, attempted: activityTokens.length, results };
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET")?.trim();

  if (!supabaseUrl || !serviceRoleKey || !dispatchSecret) {
    return Response.json({ ok: false, error: "Push dispatch is not configured." }, { status: 503 });
  }

  const incomingSecret = req.headers.get("x-push-dispatch-secret") || "";
  if (!constantTimeEqual(incomingSecret, dispatchSecret)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  if (req.method === "GET") {
    const { count, error } = await supabase
      .from("push_tokens")
      .select("id", { count: "exact", head: true })
      .eq("active", true);

    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, queued: count ?? 0 });
  }

  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405 });
  }

  const payload = await req.json().catch(() => ({}));
  const userId = typeof payload.userId === "string" ? payload.userId : "";
  const title = String(payload.title || "").trim();
  const body = String(payload.body || "").trim();
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || !title || !body) {
    return Response.json({ ok: false, error: "Missing userId, title, or body." }, { status: 400 });
  }
  if (title.length > 160 || body.length > 1000 || JSON.stringify(data).length > 8192) {
    return Response.json({ ok: false, error: "Notification payload is too large." }, { status: 413 });
  }

  const notificationKind = String(data.kind || "");
  const meta = data.meta && typeof data.meta === "object" ? data.meta as Record<string, unknown> : {};
  const discoveryKind = String(meta.kind || "");
  const commentAudience = String(meta.comment_audience || "");
  const preferenceKey =
    notificationKind === "message"
      ? meta.private === true ? "messages" : commentAudience === "joined" ? "joined_comments" : "comments"
      : notificationKind === "join_request"
        ? "join_requests"
        : notificationKind === "approval" || notificationKind === "declined"
          ? "join_updates"
          : discoveryKind === "friend_request"
            ? "friend_requests"
            : discoveryKind === "followed_post"
              ? "followed_posts"
          : discoveryKind === "host_join_request_reminder"
                ? "join_requests"
          : discoveryKind === "liked_category"
                ? "liked_categories"
                : discoveryKind === "quest_start_reminder" || discoveryKind === "host_location_reminder"
                  ? "quest_reminders"
                : null;

  if (preferenceKey) {
    const { data: preferences, error: preferencesError } = await supabase
      .from("notification_preferences")
      .select("messages,comments,joined_comments,join_updates,join_requests,friend_requests,followed_posts,liked_categories,quest_reminders")
      .eq("user_id", userId)
      .maybeSingle();

    if (preferencesError) {
      console.error("Could not read notification preferences", preferencesError.message);
    } else {
      const defaultEnabled = preferenceKey !== "liked_categories" && preferenceKey !== "followed_posts" && preferenceKey !== "joined_comments";
      const enabled = preferences
        ? preferences[preferenceKey as keyof typeof preferences] !== false
        : defaultEnabled;
      if (!enabled) {
        return Response.json({ ok: true, sent: 0, skipped: true, reason: "preference_disabled", preference: preferenceKey });
      }
    }
  }

  const { count: unreadCountRaw, error: unreadCountError } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (unreadCountError) {
    return Response.json({ ok: false, error: unreadCountError.message }, { status: 500 });
  }

  const unreadCount = Math.max(0, unreadCountRaw ?? 0);

  let liveActivity: unknown = { sent: 0, skipped: true, reason: "not_attempted" };
  try {
    liveActivity = await startLiveActivity(supabase, userId, data);
  } catch (error) {
    console.error("Live Activity dispatch failed", error instanceof Error ? error.message : String(error));
    liveActivity = { sent: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const { data: tokenRows, error: tokenError } = await supabase
    .from("push_tokens")
    .select("id, expo_push_token, platform")
    .eq("user_id", userId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (tokenError) {
    return Response.json({ ok: false, error: tokenError.message }, { status: 500 });
  }

  const tokens = (tokenRows || []).map((row) => ({
    id: row.id as string,
    platform: String((row as { platform?: string | null }).platform || "").toLowerCase(),
    token: (row as { expo_push_token?: string | null }).expo_push_token,
  })).filter((row) => row.token);
  if (!tokens.length) {
    return Response.json({ ok: true, sent: 0, skipped: true, reason: "no_active_tokens", liveActivity });
  }

  let sent = 0;
  let androidAttempted = 0;
  let expoAttempted = 0;
  const results: unknown[] = [];
  const googleAccess = await getGoogleAccessToken();

  for (const row of tokens) {
    if (row.platform === "android") {
      androidAttempted += 1;
      if (!googleAccess) {
        results.push({ platform: "android", error: "missing_google_service_account" });
        continue;
      }
      const pushResult = await sendAndroidPush(googleAccess.accessToken, googleAccess.projectId, row.token!, title, body, unreadCount, data);
      results.push({ platform: "android", ...pushResult });
      if (pushResult.ok) {
        sent += 1;
      } else if ((pushResult.error || "").includes("UNREGISTERED") || (pushResult.error || "").includes("registration-token-not-registered")) {
        await supabase.from("push_tokens").update({ active: false }).eq("id", row.id);
      }
      continue;
    }

    expoAttempted += 1;
    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          to: row.token,
          sound: "default",
          title,
          body,
          badge: unreadCount,
          priority: "high",
          _contentAvailable: true,
          data: { ...data, unreadCount },
        },
      ]),
    });

    const expoJson = await expoResponse.json().catch(() => null);
    results.push({ platform: row.platform || "expo", result: expoJson });
    const tickets = Array.isArray(expoJson?.data) ? expoJson.data : [];
    sent += tickets.filter((ticket: { status?: string }) => ticket?.status === "ok").length;

    for (let i = 0; i < tickets.length; i += 1) {
      const ticket = tickets[i];
      if (ticket?.status === "error") {
        const errorMessage = String(ticket?.details?.error || ticket?.message || "");
        if (errorMessage.includes("DeviceNotRegistered") || errorMessage.includes("PushTokenNotRegistered")) {
          await supabase.from("push_tokens").update({ active: false }).eq("id", row.id);
        }
      }
    }
  }

  return Response.json({ ok: true, sent, androidAttempted, expoAttempted, results, liveActivity });
});
