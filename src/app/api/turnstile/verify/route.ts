import { deriveDeviceLabel, getRequestMetadata, getServiceSupabase, hashIp } from "@/lib/security-audit-server";

export const runtime = "edge";

type VerifyBody = { token?: string; action?: string };

export async function POST(req: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return Response.json({ ok: false, error: "Missing TURNSTILE_SECRET_KEY." }, { status: 500 });

  const body = (await req.json().catch(() => null)) as VerifyBody | null;
  if (!body?.token) return Response.json({ ok: false, error: "Missing token." }, { status: 400 });

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", body.token);

  const remoteip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (remoteip) form.set("remoteip", remoteip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const result = await res.json().catch(() => null) as { success?: boolean; "error-codes"?: string[] } | null;
  if (!result?.success) {
    return Response.json({ ok: false, error: "Turnstile verification failed.", codes: result?.["error-codes"] || [] }, { status: 400 });
  }
  try {
    const supabase = getServiceSupabase();
    if (supabase) {
      const requestMetadata = getRequestMetadata(req);
      await supabase.from("security_events").insert({
        event_type: "turnstile_verified",
        raw_ip: requestMetadata.raw_ip,
        ip_hash: await hashIp(requestMetadata.raw_ip),
        user_agent: requestMetadata.user_agent,
        device_label: deriveDeviceLabel(requestMetadata.user_agent),
        cf_ray: requestMetadata.cf_ray,
        cf_ipcountry: requestMetadata.cf_ipcountry,
        turnstile_success: true,
        metadata: { action: body.action || null },
      });
    }
  } catch {
    // Best-effort audit logging only.
  }
  return Response.json({ ok: true });
}
