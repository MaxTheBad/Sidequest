import { getServiceSupabase } from "@/lib/security-audit-server";
import { getBearerUserId, type TikTokConnectionStatus } from "@/lib/tiktok-oauth";

export const runtime = "edge";

export async function GET(req: Request) {
  const { userId, error } = await getBearerUserId(req);
  if (!userId) return Response.json({ ok: false, error }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ ok: false, error: "Missing Supabase admin credentials." }, { status: 500 });
  const { data, error: readError } = await supabase
    .from("user_tiktok_accounts")
    .select("display_name,avatar_url,scopes,created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) return Response.json({ ok: false, error: readError.message }, { status: 500 });
  const status: TikTokConnectionStatus = data
    ? { connected: true, displayName: data.display_name, avatarUrl: data.avatar_url, scopes: data.scopes || [], connectedAt: data.created_at }
    : { connected: false };
  return Response.json({ ok: true, status });
}
