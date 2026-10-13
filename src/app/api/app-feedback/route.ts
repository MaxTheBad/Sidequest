import { createClient } from "@supabase/supabase-js";
import { sendSmtpEmail } from "@/lib/smtp-email";
import { createFeedbackService } from "@/lib/app-feedback";
import { verifyTurnstileToken } from "@/lib/turnstile-verification";

export const runtime = "edge";
const recipient = "suggestions@questhat.com";
async function deliver(feedback: { category: string; message: string; replyContact: string | null; diagnostics: unknown }) {
    const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, password = process.env.SMTP_PASSWORD;
    const port = Number(process.env.SMTP_PORT || "465");
    if (!host || !user || !password || !Number.isInteger(port)) throw new Error("Delivery unavailable");
    const body = `Category: ${feedback.category}\n\n${feedback.message}\n\nReply contact: ${feedback.replyContact || "Not provided"}\nDiagnostics (explicitly shared): ${feedback.diagnostics ? JSON.stringify(feedback.diagnostics) : "Not shared"}`;
    await sendSmtpEmail({ host, port, user, password, from: process.env.SMTP_FROM || "QuestHat <alerts@questhat.com>", to: recipient, subject: `[QuestHat feedback] ${feedback.category}`, text: body, html: `<pre>${body.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre>`, replyTo: feedback.replyContact || undefined });
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return Response.json({ ok: false, error: "Sign in to send feedback." }, { status: 401 });
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error: authError } = await auth.auth.getUser(token);
  if (authError || !data.user) return Response.json({ ok: false, error: "Sign in to send feedback." }, { status: 401 });
  const input = await req.json().catch(() => null) as Record<string, unknown> | null;
  const captchaToken = typeof input?.captchaToken === "string" ? input.captchaToken : "";
  const captchaVerified = await verifyTurnstileToken({
    token: captchaToken,
    secret: process.env.TURNSTILE_SECRET_KEY,
    expectedAction: "app-feedback",
    expectedHostname: new URL(req.url).hostname,
  });
  if (!serviceRole) return Response.json({ ok: false, error: "Feedback is temporarily unavailable. Please try again." }, { status: 503 });
  const server = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const service = createFeedbackService({
    deliver,
    reserve: async (fingerprint: string, verifiedCaptcha: boolean) => {
      const { data: reservation, error } = await server.rpc("reserve_app_feedback_intake_server", {
        p_user_id: data.user.id,
        p_fingerprint: fingerprint,
        p_captcha_verified: verifiedCaptcha,
      });
      if (error) throw error;
      return { accepted: reservation?.accepted === true, reason: reservation?.reason, reservationId: reservation?.reservation_id };
    },
    finalize: async (reservationId: string, delivered: boolean) => {
      if (!reservationId) throw new Error("Missing reservation");
      const { data: finalized, error } = await server.rpc("finalize_app_feedback_intake_server", {
        p_user_id: data.user.id,
        p_reservation_id: reservationId,
        p_delivered: delivered,
      });
      if (error || finalized !== true) throw error || new Error("Reservation finalization failed");
    },
  });
  const result = await service.submit({ actorId: data.user.id, input, captchaVerified });
  return Response.json(result, { status: result.status });
}
