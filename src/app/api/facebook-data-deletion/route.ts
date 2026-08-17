import { getServiceSupabase } from "@/lib/security-audit-server";
import { hashFacebookUserId, userMatchesFacebookId, verifyFacebookSignedRequest } from "@/lib/facebook-data-deletion";

export const runtime = "edge";

const STORAGE_BUCKETS = ["profile-photos", "quest-media", "quest-videos"];

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://questhat.com").replace(/\/$/, "");
}

async function readSignedRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null) as { signed_request?: unknown } | null;
    return typeof body?.signed_request === "string" ? body.signed_request : "";
  }
  const body = await request.text();
  return new URLSearchParams(body).get("signed_request") || "";
}

async function findUserByFacebookId(admin: NonNullable<ReturnType<typeof getServiceSupabase>>, facebookUserId: string) {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => userMatchesFacebookId(user, facebookUserId));
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  throw new Error("Facebook identity search exceeded the supported account range.");
}

async function removeUserStorage(admin: NonNullable<ReturnType<typeof getServiceSupabase>>, userId: string) {
  const warnings: string[] = [];
  for (const bucket of STORAGE_BUCKETS) {
    const paths: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 1000, offset });
      if (error) {
        warnings.push(`${bucket}: ${error.message}`);
        break;
      }
      paths.push(...(data || []).filter((item) => item.name).map((item) => `${userId}/${item.name}`));
      if ((data || []).length < 1000) break;
    }
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(index, index + 100));
      if (error) warnings.push(`${bucket}: ${error.message}`);
    }
  }
  return warnings;
}

export async function GET() {
  return Response.json(
    { ok: true, service: "QuestHat Facebook data deletion callback" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const appSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || "";
  const admin = getServiceSupabase();
  if (!appSecret || !admin) {
    return Response.json({ error: "Data deletion callback is not configured." }, { status: 503 });
  }

  const signedRequest = await readSignedRequest(request);
  const payload = await verifyFacebookSignedRequest(signedRequest, appSecret);
  if (!payload?.user_id) {
    return Response.json({ error: "Invalid signed_request." }, { status: 400 });
  }

  const confirmationCode = crypto.randomUUID();
  const facebookUserIdHash = await hashFacebookUserId(payload.user_id, appSecret);
  let questhatUserId: string | null = null;

  const { error: trackingError } = await admin.from("facebook_data_deletion_requests").insert({
    confirmation_code: confirmationCode,
    facebook_user_id_hash: facebookUserIdHash,
    status: "processing",
  });
  if (trackingError) {
    return Response.json({ error: "Data deletion tracking is not configured." }, { status: 503 });
  }

  try {
    const user = await findUserByFacebookId(admin, payload.user_id);
    questhatUserId = user?.id || null;
    const cleanupWarnings = user ? await removeUserStorage(admin, user.id) : [];
    if (cleanupWarnings.length) {
      throw new Error(`Media cleanup failed: ${cleanupWarnings.join("; ")}`);
    }
    if (user) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
    }

    const { error: completionError } = await admin.from("facebook_data_deletion_requests").upsert({
      confirmation_code: confirmationCode,
      facebook_user_id_hash: facebookUserIdHash,
      questhat_user_id: questhatUserId,
      status: "completed",
      completed_at: new Date().toISOString(),
      cleanup_warnings: [],
      error_message: null,
    });
    if (completionError) throw completionError;

    return Response.json({
      url: `${siteUrl()}/delete-account/${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deletion failed.";
    await admin.from("facebook_data_deletion_requests").upsert({
      confirmation_code: confirmationCode,
      facebook_user_id_hash: facebookUserIdHash,
      questhat_user_id: questhatUserId,
      status: "failed",
      error_message: message.slice(0, 1000),
    });
    return Response.json({ error: "Could not complete deletion.", confirmation_code: confirmationCode }, { status: 500 });
  }
}
