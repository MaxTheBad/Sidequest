import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type FacebookDeletionPayload = {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
};

function buildStatusUrl(confirmationCode: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://questhat.com";
  return `${baseUrl}/delete-account/${confirmationCode}`;
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function parseSignedRequest(signedRequest: string): FacebookDeletionPayload | null {
  const [encodedPayload] = signedRequest.split(".");
  if (!encodedPayload) return null;

  try {
    return JSON.parse(decodeBase64Url(encodedPayload)) as FacebookDeletionPayload;
  } catch {
    return null;
  }
}

async function deleteUserDataForFacebookId(facebookUserId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { deleted: false, reason: "missing_supabase_config" as const };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: users, error: listError } = await admin.auth.admin.listUsers();
  if (listError) {
    return { deleted: false, reason: listError.message };
  }

  const matchedUser = users.users.find((user) => {
    const identities = user.identities || [];
    const hasFacebookIdentity = identities.some((identity) => identity.provider === "facebook");
    const providerId = user.user_metadata?.provider_id || user.user_metadata?.sub || user.user_metadata?.oauth_user_id;
    return hasFacebookIdentity && providerId === facebookUserId;
  });

  if (!matchedUser) {
    return { deleted: false, reason: "no_matching_user_found" as const };
  }

  const { error: fileListError, data: files } = await admin.storage.from("profile-photos").list(matchedUser.id, {
    limit: 1000,
  });
  if (!fileListError && files?.length) {
    const filePaths = files.map((file) => `${matchedUser.id}/${file.name}`);
    await admin.storage.from("profile-photos").remove(filePaths);
  }

  await Promise.all([
    admin.from("reports").delete().or(`reporter_id.eq.${matchedUser.id},reported_user_id.eq.${matchedUser.id},reviewed_by.eq.${matchedUser.id}`),
    admin.from("report_actions").delete().eq("actor_id", matchedUser.id),
    admin.from("notification_state").delete().eq("user_id", matchedUser.id),
    admin.from("notifications").delete().or(`user_id.eq.${matchedUser.id},source_user_id.eq.${matchedUser.id},membership_user_id.eq.${matchedUser.id}`),
    admin.from("quest_bookmarks").delete().eq("user_id", matchedUser.id),
    admin.from("friends").delete().or(`requester_id.eq.${matchedUser.id},addressee_id.eq.${matchedUser.id}`),
    admin.from("quest_exact_location_access").delete().or(`user_id.eq.${matchedUser.id},granted_by.eq.${matchedUser.id}`),
    admin.from("quest_members").delete().eq("user_id", matchedUser.id),
    admin.from("user_hobbies").delete().eq("user_id", matchedUser.id),
  ]);

  const { data: quests } = await admin.from("quests").select("id").eq("creator_id", matchedUser.id);
  if (quests?.length) {
    const questIds = quests.map((quest) => quest.id);
    await Promise.all([
      admin.from("quest_exact_location_access").delete().in("quest_id", questIds),
      admin.from("notifications").delete().in("quest_id", questIds),
      admin.from("quest_bookmarks").delete().in("quest_id", questIds),
      admin.from("quest_members").delete().in("quest_id", questIds),
      admin.from("messages").delete().in("quest_id", questIds),
      admin.from("reports").delete().in("quest_id", questIds),
      admin.from("quests").delete().eq("creator_id", matchedUser.id),
    ]);
  }

  await admin.from("profiles").delete().eq("id", matchedUser.id);
  await admin.auth.admin.deleteUser(matchedUser.id);

  return { deleted: true as const, userId: matchedUser.id };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const signedRequest = url.searchParams.get("signed_request") || "";

  const confirmationCode = crypto.randomUUID();
  const payload = signedRequest ? parseSignedRequest(signedRequest) : null;
  if (payload?.user_id) {
    await deleteUserDataForFacebookId(payload.user_id);
  }

  return NextResponse.json({
    url: buildStatusUrl(confirmationCode),
    confirmation_code: confirmationCode,
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const signedRequest = params.get("signed_request") || new URL(request.url).searchParams.get("signed_request") || "";
  const confirmationCode = crypto.randomUUID();
  const payload = signedRequest ? parseSignedRequest(signedRequest) : null;
  if (payload?.user_id) {
    await deleteUserDataForFacebookId(payload.user_id);
  }

  return NextResponse.json({
    url: buildStatusUrl(confirmationCode),
    confirmation_code: confirmationCode,
  });
}
