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

  // Hide the account before cleanup starts so a retry never exposes a
  // partially deleted account.
  await admin
    .from("profiles")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("id", user.id);
  await admin.from("push_tokens").update({ active: false }).eq("user_id", user.id);

  const cleanupWarnings: string[] = [];
  for (const bucket of ["profile-photos", "quest-media", "quest-videos"]) {
    const { data: objects, error: listError } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
    if (listError) {
      cleanupWarnings.push(`${bucket}: ${listError.message}`);
      continue;
    }
    const paths = (objects || []).filter((item) => item.name).map((item) => `${user.id}/${item.name}`);
    if (paths.length) {
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) cleanupWarnings.push(`${bucket}: ${removeError.message}`);
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return json({ ok: false, error: deleteError.message, cleanupWarnings }, 500);
  }

  return json({ ok: true, deleted: true, cleanupWarnings });
});
