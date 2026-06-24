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

function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrapBase64(value: string) {
  return base64Utf8(value).replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function parseMailbox(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

async function sendSmtpEmail({
  host,
  port,
  user,
  password,
  from,
  to,
  subject,
  text,
  html,
}: {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const socketModule = "cloudflare:sockets";
  const { connect } = await import(/* webpackIgnore: true */ socketModule);
  const socket = connect(
    { hostname: host, port },
    { secureTransport: port === 465 ? "on" : "starttls" },
  );
  await socket.opened;

  let activeSocket = socket;
  let reader = activeSocket.readable.getReader();
  let writer = activeSocket.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffered = "";

  async function readResponse() {
    const lines: string[] = [];

    while (true) {
      const newlineIndex = buffered.indexOf("\n");
      if (newlineIndex >= 0) {
        const line = buffered.slice(0, newlineIndex + 1).replace(/\r?\n$/, "");
        buffered = buffered.slice(newlineIndex + 1);
        lines.push(line);

        if (/^\d{3} /.test(line)) {
          const code = Number(line.slice(0, 3));
          if (code >= 400) throw new Error(`SMTP error: ${lines.join(" | ")}`);
          return { code, message: lines.join("\n") };
        }
        continue;
      }

      const { value, done } = await reader.read();
      if (done) throw new Error("SMTP connection closed unexpectedly.");
      buffered += decoder.decode(value, { stream: true });
    }
  }

  async function command(value: string, expectedCode: number) {
    await writer.write(encoder.encode(`${value}\r\n`));
    const response = await readResponse();
    if (response.code !== expectedCode) {
      throw new Error(`Unexpected SMTP response ${response.code}: ${response.message}`);
    }
  }

  try {
    const greeting = await readResponse();
    if (greeting.code !== 220) throw new Error(`Unexpected SMTP greeting: ${greeting.message}`);

    await command("EHLO questhat.com", 250);

    if (port !== 465) {
      reader.releaseLock();
      writer.releaseLock();
      activeSocket = activeSocket.startTls();
      await activeSocket.opened;
      reader = activeSocket.readable.getReader();
      writer = activeSocket.writable.getWriter();
      buffered = "";
      await command("EHLO questhat.com", 250);
    }

    await command("AUTH LOGIN", 334);
    await command(btoa(user), 334);
    await command(btoa(password), 235);
    await command(`MAIL FROM:<${parseMailbox(from)}>`, 250);
    await command(`RCPT TO:<${to}>`, 250);
    await command("DATA", 354);

    const boundary = `questhat-${crypto.randomUUID()}`;
    const message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${base64Utf8(subject)}?=`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(text),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(html),
      `--${boundary}--`,
      "",
    ]
      .join("\r\n")
      .replace(/^\./gm, "..");

    await writer.write(encoder.encode(`${message}\r\n.\r\n`));
    const accepted = await readResponse();
    if (accepted.code !== 250) {
      throw new Error(`SMTP rejected the message: ${accepted.message}`);
    }
    await command("QUIT", 221);
  } finally {
    reader.releaseLock();
    writer.releaseLock();
    await activeSocket.close().catch(() => undefined);
  }
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || "465");
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpFrom = process.env.SMTP_FROM || "QuestHat <no-reply@questhat.com>";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://questhat.com").replace(/\/$/, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, error: "Missing Supabase admin credentials." }, { status: 500 });
  }
  if (!smtpHost || !smtpUser || !smtpPassword || !Number.isInteger(smtpPort)) {
    return Response.json({ ok: false, error: "Missing or invalid SMTP configuration." }, { status: 500 });
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

  await sendSmtpEmail({
    host: smtpHost,
    port: smtpPort,
    user: smtpUser,
    password: smtpPassword,
    from: smtpFrom,
    to: user.email ?? "",
    subject: "Welcome to QuestHat",
    text,
    html,
  });

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updateError) {
    return Response.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return Response.json({ ok: true, sent: true });
}
