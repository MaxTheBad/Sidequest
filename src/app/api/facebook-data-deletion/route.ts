export const runtime = "edge";

type FacebookDeletionPayload = {
  user_id?: string;
};

function buildStatusUrl(confirmationCode: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://questhat.com";
  return `${baseUrl}/delete-account/${confirmationCode}`;
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
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

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase config.");

  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function deleteUserDataForFacebookId(facebookUserId: string) {
  const usersRes = await supabaseFetch(`/auth/v1/admin/users?per_page=1000`);
  if (!usersRes.ok) return;
  const usersJson = await usersRes.json() as { users?: Array<{ id: string; identities?: Array<{ provider?: string }>; user_metadata?: Record<string, unknown> }> };
  const matchedUser = usersJson.users?.find((user) => {
    const identities = user.identities || [];
    const hasFacebookIdentity = identities.some((identity) => identity.provider === "facebook");
    const providerId = user.user_metadata?.provider_id || user.user_metadata?.sub || user.user_metadata?.oauth_user_id;
    return hasFacebookIdentity && providerId === facebookUserId;
  });

  if (!matchedUser) return;

  await Promise.all([
    supabaseFetch(`/rest/v1/reports?or=(reporter_id.eq.${matchedUser.id},reported_user_id.eq.${matchedUser.id},reviewed_by.eq.${matchedUser.id})`, { method: "DELETE" }),
    supabaseFetch(`/rest/v1/report_actions?actor_id=eq.${matchedUser.id}`, { method: "DELETE" }),
    supabaseFetch(`/rest/v1/notification_state?user_id=eq.${matchedUser.id}`, { method: "DELETE" }),
    supabaseFetch(`/rest/v1/notifications?or=(user_id.eq.${matchedUser.id},source_user_id.eq.${matchedUser.id},membership_user_id.eq.${matchedUser.id})`, { method: "DELETE" }),
    supabaseFetch(`/rest/v1/quest_bookmarks?user_id=eq.${matchedUser.id}`, { method: "DELETE" }),
    supabaseFetch(`/rest/v1/friends?or=(requester_id.eq.${matchedUser.id},addressee_id.eq.${matchedUser.id})`, { method: "DELETE" }),
    supabaseFetch(`/rest/v1/quest_exact_location_access?or=(user_id.eq.${matchedUser.id},granted_by.eq.${matchedUser.id})`, { method: "DELETE" }),
    supabaseFetch(`/rest/v1/quest_members?user_id=eq.${matchedUser.id}`, { method: "DELETE" }),
    supabaseFetch(`/rest/v1/user_hobbies?user_id=eq.${matchedUser.id}`, { method: "DELETE" }),
    supabaseFetch(`/rest/v1/profiles?id=eq.${matchedUser.id}`, { method: "DELETE" }),
    supabaseFetch(`/auth/v1/admin/users/${matchedUser.id}`, { method: "DELETE" }),
  ]);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const signedRequest = url.searchParams.get("signed_request") || "";
  const confirmationCode = crypto.randomUUID();
  const payload = signedRequest ? parseSignedRequest(signedRequest) : null;
  if (payload?.user_id) await deleteUserDataForFacebookId(payload.user_id);

  return Response.json({
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
  if (payload?.user_id) await deleteUserDataForFacebookId(payload.user_id);

  return Response.json({
    url: buildStatusUrl(confirmationCode),
    confirmation_code: confirmationCode,
  });
}
