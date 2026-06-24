import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildWelcomeEmailHtml(name: string, siteUrl: string) {
  const safeName = escapeHtml(name || "there");
  const logoUrl = `${siteUrl}/questhat-logo.png`;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#111318;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 20px 32px;text-align:center;">
                <img src="${logoUrl}" alt="QuestHat" width="44" height="44" style="display:block;margin:0 auto 18px auto;border-radius:12px;" />
                <div style="font-size:14px;letter-spacing:.22em;text-transform:uppercase;color:#7d8596;font-weight:700;margin-bottom:18px;">QuestHat</div>
                <div style="font-size:28px;line-height:1.15;color:#ffffff;font-weight:800;margin:0 0 12px 0;">Welcome, ${safeName}</div>
                <div style="font-size:16px;line-height:1.6;color:#c8ceda;margin:0 auto 28px auto;max-width:440px;">
                  Your account is ready. Start exploring local plans, meetups, and quests on QuestHat.
                </div>
                <a href="${siteUrl}" style="display:inline-block;background:#6daec2;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 26px;border-radius:999px;">
                  Open QuestHat
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px 32px;text-align:center;">
                <div style="height:1px;background:#242936;margin:0 0 18px 0;"></div>
                <div style="font-size:12px;line-height:1.5;color:#7d8596;">
                  We’re glad you’re here. See you out there.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildWelcomeEmailText(name: string, siteUrl: string) {
  return [
    `Welcome to QuestHat, ${name || "there"}!`,
    "",
    "Your account is ready. Start exploring local plans, meetups, and quests on QuestHat.",
    "",
    siteUrl,
    "",
    "We’re glad you’re here.",
  ].join("\n");
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const smtpFrom = process.env.SMTP_FROM || "QuestHat <no-reply@questhat.com>";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://questhat.com").replace(/\/$/, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, error: "Missing Supabase admin credentials." }, { status: 500 });
  }
  if (!resendApiKey) {
    return Response.json({ ok: false, error: "Missing RESEND_API_KEY." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return Response.json({ ok: false, error: "Missing bearer token." }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) {
    return Response.json({ ok: false, error: "Invalid session." }, { status: 401 });
  }

  const provider = (user.app_metadata?.provider as string | undefined) || "";
  const emailConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at || provider !== "email");
  if (!emailConfirmed) {
    return Response.json({ ok: true, skipped: true, reason: "email_not_confirmed" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name,welcome_email_sent_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return Response.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  if (profile?.welcome_email_sent_at) {
    return Response.json({ ok: true, skipped: true, reason: "already_sent" });
  }

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "there";
  const html = buildWelcomeEmailHtml(displayName, siteUrl);
  const text = buildWelcomeEmailText(displayName, siteUrl);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: smtpFrom,
      to: user.email ?? "",
      subject: "Welcome to QuestHat",
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return Response.json({ ok: false, error: errorText || `Email provider error (${response.status})` }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updateError) {
    return Response.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return Response.json({ ok: true, sent: true });
}
