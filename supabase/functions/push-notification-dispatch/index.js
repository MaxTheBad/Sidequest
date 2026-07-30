import { createClient } from "npm:@supabase/supabase-js@2";

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

const DISPATCH_SECRET = "questhat-push-dispatch-v1";

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

  const { count: unreadCountRaw, error: unreadCountError } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (unreadCountError) {
    return Response.json({ ok: false, error: unreadCountError.message }, { status: 500 });
  }

  const unreadCount = Math.max(0, unreadCountRaw ?? 0);

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
    return Response.json({ ok: true, sent: 0, skipped: true, reason: "no_active_tokens" });
  }

  const batches = chunk(tokens, 100);
  const allResults = [];
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
    sent += tickets.filter((ticket) => ticket?.status === "ok").length;

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

  return Response.json({ ok: true, sent, batches: batches.length, results: allResults });
});
