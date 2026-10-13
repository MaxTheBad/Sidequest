import { createClient } from "@supabase/supabase-js";
import {
  decryptAppleRefreshToken,
  readAppleSecurityConfig,
  revokeAppleRefreshToken,
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
    return json(
      { ok: false, error: "Account deletion is not configured." },
      500,
    );
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

  const payload = await req.json().catch(() => ({}));
  if (payload?.confirmation !== "DELETE") {
    return json({
      ok: false,
      error: "Type DELETE to confirm permanent account deletion.",
    }, 400);
  }

  const usedAppleSignIn = (user.identities || []).some((identity) =>
    identity.provider === "apple"
  );
  const supportsAppleReauthentication =
    payload?.supportsAppleReauthentication === true;
  let legacyManualAppleRevocationRequired = false;

  let appleConfig: ReturnType<typeof readAppleSecurityConfig> | null = null;
  let appleTokenRecord: {
    client_id: string;
    key_version: number;
    status: "active" | "revoked";
    token_ciphertext: string | null;
    token_nonce: string | null;
  } | null = null;
  let appleRefreshToken: string | null = null;
  if (usedAppleSignIn) {
    const { data: tokenRecord, error: tokenError } = await admin
      .from("apple_sign_in_tokens")
      .select("client_id,key_version,status,token_ciphertext,token_nonce")
      .eq("user_id", user.id)
      .maybeSingle();
    if (tokenError) {
      return json({
        ok: false,
        error: "Could not verify Sign in with Apple cleanup readiness.",
      }, 500);
    }
    if (!tokenRecord && supportsAppleReauthentication) {
      return json({
        ok: false,
        code: "APPLE_REAUTH_REQUIRED",
        error:
          "Reconnect Sign in with Apple once, then confirm account deletion again.",
        appleReauthenticationRequired: true,
      }, 409);
    }
    if (!tokenRecord) {
      legacyManualAppleRevocationRequired = true;
    } else {
      appleTokenRecord = tokenRecord;
      try {
        appleConfig = readAppleSecurityConfig((name: string) =>
          Deno.env.get(name)
        );
      } catch {
        return json({
          ok: false,
          error: "Automatic Sign in with Apple cleanup is not configured.",
        }, 500);
      }
      if (appleTokenRecord.client_id !== appleConfig.clientId) {
        return json({
          ok: false,
          error:
            "Sign in with Apple configuration does not match this account.",
        }, 500);
      }
      if (appleTokenRecord.status === "active") {
        if (
          !appleTokenRecord.token_ciphertext || !appleTokenRecord.token_nonce
        ) {
          return json({
            ok: false,
            error: "Stored Sign in with Apple cleanup data is incomplete.",
          }, 500);
        }
        try {
          appleRefreshToken = await decryptAppleRefreshToken(
            appleTokenRecord,
            appleConfig,
          );
        } catch {
          return json({
            ok: false,
            error:
              "Stored Sign in with Apple cleanup data could not be opened.",
          }, 500);
        }
      }
    }
  }

  const cleanupWarnings: string[] = [];
  const bucketPaths = new Map<string, string[]>();
  for (const bucket of ["profile-photos", "quest-media", "quest-videos"]) {
    const paths: string[] = [];
    for (let offset = 0;; offset += 1000) {
      const { data: objects, error: listError } = await admin.storage.from(
        bucket,
      ).list(user.id, { limit: 1000, offset });
      if (listError) {
        cleanupWarnings.push(`${bucket}: ${listError.message}`);
        break;
      }
      paths.push(
        ...(objects || []).filter((item) => item.name).map((item) =>
          `${user.id}/${item.name}`
        ),
      );
      if ((objects || []).length < 1000) break;
    }
    bucketPaths.set(bucket, paths);
  }

  if (cleanupWarnings.length) {
    return json({
      ok: false,
      error:
        "Media cleanup could not finish. Retry deletion or contact support@questhat.com.",
      cleanupWarnings,
    }, 500);
  }

  let appleRevoked = false;
  if (
    usedAppleSignIn && appleTokenRecord?.status === "active" && appleConfig &&
    appleRefreshToken
  ) {
    try {
      await revokeAppleRefreshToken(appleRefreshToken, appleConfig);
      const { error: markRevokedError } = await admin
        .from("apple_sign_in_tokens")
        .update({
          token_ciphertext: null,
          token_nonce: null,
          status: "revoked",
          updated_at: new Date().toISOString(),
          revoked_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      if (markRevokedError) throw markRevokedError;
      appleRevoked = true;
    } catch {
      return json({
        ok: false,
        error:
          "Sign in with Apple authorization could not be revoked. No account data was deleted; please retry.",
      }, 502);
    }
  } else if (usedAppleSignIn && appleTokenRecord?.status === "revoked") {
    appleRevoked = true;
  }

  for (const [bucket, paths] of bucketPaths) {
    for (let index = 0; index < paths.length; index += 100) {
      const { error: removeError } = await admin.storage.from(bucket).remove(
        paths.slice(index, index + 100),
      );
      if (removeError) {
        cleanupWarnings.push(`${bucket}: ${removeError.message}`);
      }
    }
  }

  if (cleanupWarnings.length) {
    return json({
      ok: false,
      error:
        "Media cleanup could not finish. Retry deletion or contact support@questhat.com.",
      cleanupWarnings,
      appleRevoked,
    }, 500);
  }

  // Hide the account and stop pushes immediately before deleting the auth
  // user. If auth deletion fails, the account remains safely deactivated.
  await admin
    .from("profiles")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("id", user.id);
  await admin.from("push_tokens").update({ active: false }).eq(
    "user_id",
    user.id,
  );

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return json(
      { ok: false, error: deleteError.message, cleanupWarnings },
      500,
    );
  }

  return json({
    ok: true,
    deleted: true,
    cleanupWarnings,
    appleRevoked,
    appleRevocationRequired: legacyManualAppleRevocationRequired,
    appleAccountUrl: legacyManualAppleRevocationRequired
      ? "https://account.apple.com/"
      : undefined,
  });
});
