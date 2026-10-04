import { getServiceSupabase } from "@/lib/security-audit-server";
import { getBearerUserId } from "@/lib/tiktok-oauth";

export const runtime = "edge";

export async function POST(req: Request) {
  const { userId, error } = await getBearerUserId(req);
  if (!userId) return Response.json({ ok: false, error }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ ok: false, error: "Missing Supabase admin credentials." }, { status: 500 });
  const { error: deleteError } = await supabase.from("user_tiktok_accounts").delete().eq("user_id", userId);
  if (deleteError) return Response.json({ ok: false, error: deleteError.message }, { status: 500 });
  return Response.json({ ok: true });
}
