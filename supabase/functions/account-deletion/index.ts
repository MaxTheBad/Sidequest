import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "Account deletion is not configured." }, 500);
  }
  if (!accessToken) return json({ ok: false, error: "Authentication required." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user) return json({ ok: false, error: "Your session has expired. Sign in again and retry." }, 401);

  const payload = await req.json().catch(() => ({}));
  if (payload?.confirmation !== "DELETE") {
    return json({ ok: false, error: "Type DELETE to confirm permanent account deletion." }, 400);
  }

  // Supabase does not retain the Apple refresh/access token needed for Apple's
  // server-side revoke endpoint. Apple says deletion must still complete when
  // that token is unavailable, followed by clear manual revocation guidance.
  const usedAppleSignIn = (user.identities || []).some((identity) => identity.provider === "apple");

  const cleanupWarnings: string[] = [];
  for (const bucket of ["profile-photos", "quest-media", "quest-videos"]) {
    const paths: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: objects, error: listError } = await admin.storage.from(bucket).list(user.id, { limit: 1000, offset });
      if (listError) {
        cleanupWarnings.push(`${bucket}: ${listError.message}`);
        break;
      }
      paths.push(...(objects || []).filter((item) => item.name).map((item) => `${user.id}/${item.name}`));
      if ((objects || []).length < 1000) break;
    }
    for (let index = 0; index < paths.length; index += 100) {
      const { error: removeError } = await admin.storage.from(bucket).remove(paths.slice(index, index + 100));
      if (removeError) cleanupWarnings.push(`${bucket}: ${removeError.message}`);
    }
  }

  if (cleanupWarnings.length) {
    return json({
      ok: false,
      error: "Media cleanup could not finish. Retry deletion or contact support@questhat.com.",
      cleanupWarnings,
    }, 500);
  }

  // Hide the account and stop pushes immediately before deleting the auth
  // user. If auth deletion fails, the account remains safely deactivated.
  await admin
    .from("profiles")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("id", user.id);
  await admin.from("push_tokens").update({ active: false }).eq("user_id", user.id);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return json({ ok: false, error: deleteError.message, cleanupWarnings }, 500);
  }

  return json({
    ok: true,
    deleted: true,
    cleanupWarnings,
    appleRevocationRequired: usedAppleSignIn,
    appleAccountUrl: usedAppleSignIn ? "https://account.apple.com/" : undefined,
  });
});
