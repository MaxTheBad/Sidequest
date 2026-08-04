import { createClient } from "npm:@supabase/supabase-js@2";

function chunk<T>(array: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

const DISPATCH_SECRET = "questhat-push-dispatch-v1";
const LIVE_ACTIVITY_TOPIC_SUFFIX = ".push-type.liveactivity";
let cachedApnsJwt: { value: string; createdAt: number } | null = null;

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

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
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

  const incomingSecret = req.headers.get("x-push-dispatch-secret");
  if (incomingSecret !== DISPATCH_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const userId = payload.userId;
  const title = String(payload.title || "").trim();
  const body = String(payload.body || "").trim();
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};

  if (!userId || !title || !body) {
    return Response.json({ ok: false, error: "Missing userId, title, or body." }, { status: 400 });
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
    .select("id, expo_push_token")
    .eq("user_id", userId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (tokenError) {
    return Response.json({ ok: false, error: tokenError.message }, { status: 500 });
  }

  const tokens = (tokenRows || []).map((row) => ({ id: row.id, token: row.expo_push_token })).filter((row) => row.token);
  if (!tokens.length) {
    return Response.json({ ok: true, sent: 0, skipped: true, reason: "no_active_tokens", liveActivity });
  }

  const batches = chunk(tokens, 100);
  const allResults: unknown[] = [];
  let sent = 0;

  for (const batch of batches) {
    const messages = batch.map((row) => ({
      to: row.token,
      sound: "default",
      title,
      body,
      badge: unreadCount,
      priority: "high",
      _contentAvailable: true,
      data: { ...data, unreadCount },
    }));

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoJson = await expoResponse.json().catch(() => null);
    allResults.push(expoJson);

    const tickets = Array.isArray(expoJson?.data) ? expoJson.data : [];
    sent += tickets.filter((ticket: { status?: string }) => ticket?.status === "ok").length;

    for (let i = 0; i < tickets.length; i += 1) {
      const ticket = tickets[i];
      if (ticket?.status === "error") {
        const errorMessage = String(ticket?.details?.error || ticket?.message || "");
        if (errorMessage.includes("DeviceNotRegistered") || errorMessage.includes("PushTokenNotRegistered")) {
          const row = batch[i];
          if (row?.id) {
            await supabase.from("push_tokens").update({ active: false }).eq("id", row.id);
          }
        }
      }
    }
  }

  return Response.json({ ok: true, sent, batches: batches.length, results: allResults, liveActivity });
});
