import { createClient } from "@supabase/supabase-js";
import {
  encryptAppleRefreshToken,
  readAppleSecurityConfig,
  validateAppleRefreshToken,
} from "../_shared/apple-token-security.mjs";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return json({
      ok: false,
      error: "Apple account cleanup is not configured.",
    }, 500);
  }
  if (!accessToken) {
    return json({ ok: false, error: "Authentication required." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(
    accessToken,
  );
  const user = userData.user;
  if (userError || !user) {
    return json({
      ok: false,
      error: "Your session has expired. Sign in again and retry.",
    }, 401);
  }

  const appleIdentity = (user.identities || []).find((identity) =>
    identity.provider === "apple"
  );
  if (!appleIdentity) {
    return json({
      ok: false,
      error: "This account is not connected to Sign in with Apple.",
    }, 400);
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const providerRefreshToken = validateAppleRefreshToken(
      payload?.providerRefreshToken,
    );
    const config = readAppleSecurityConfig((name: string) =>
      Deno.env.get(name)
    );
    const encrypted = await encryptAppleRefreshToken(
      providerRefreshToken,
      config,
    );
    const appleSubject = String(
      appleIdentity.identity_data?.sub || appleIdentity.id || "",
    ).trim();
    if (!appleSubject) {
      throw new Error("Apple identity subject is unavailable.");
    }

    const now = new Date().toISOString();
    const { error: storeError } = await admin.from("apple_sign_in_tokens")
      .upsert({
        user_id: user.id,
        apple_subject: appleSubject,
        client_id: config.clientId,
        token_ciphertext: encrypted.tokenCiphertext,
        token_nonce: encrypted.tokenNonce,
        key_version: encrypted.keyVersion,
        status: "active",
        updated_at: now,
        revoked_at: null,
      }, { onConflict: "user_id" });
    if (storeError) throw storeError;
    return json({ ok: true, stored: true });
  } catch {
    return json({
      ok: false,
      error:
        "Apple account cleanup could not be prepared. Please retry Sign in with Apple.",
    }, 500);
  }
});
