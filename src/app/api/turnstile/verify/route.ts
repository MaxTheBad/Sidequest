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
  return Response.json({ ok: true });
}
