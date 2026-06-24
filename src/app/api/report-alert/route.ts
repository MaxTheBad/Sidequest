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
  const { connect } = await import("cloudflare:sockets");
  const socket = connect({ hostname: host, port }, { secureTransport: port === 465 ? "on" : "starttls" });
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
    const boundary = `questhat-${crypto.randomUUID()}`;
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
    ].join("\r\n").replace(/^\./gm, "..");

    await writer.write(encoder.encode(`${message}\r\n.\r\n`));
    const accepted = await readResponse();
    if (accepted.code !== 250) throw new Error(`SMTP rejected the message: ${accepted.message}`);
    await command("QUIT", 221);
  } finally {
    reader.releaseLock();
    writer.releaseLock();
    await activeSocket.close().catch(() => undefined);
  }
}

function prettyLabel(input: string | null | undefined) {
  return (input || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || "465");
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpFrom = process.env.SMTP_FROM || "QuestHat Moderation <alerts@questhat.com>";
  const recipients = (process.env.MODERATION_ALERT_RECIPIENTS || "reports@questhat.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!supabaseUrl || !serviceRoleKey) return Response.json({ ok: false, error: "Missing Supabase admin credentials." }, { status: 500 });
  if (!smtpHost || !smtpUser || !smtpPassword || !Number.isInteger(smtpPort)) {
    return Response.json({ ok: false, error: "Missing or invalid SMTP configuration." }, { status: 500 });
  }

  const body = await req.json().catch(() => null) as { report_id?: string } | null;
  if (!body?.report_id) return Response.json({ ok: false, error: "Missing report_id." }, { status: 400 });

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: report, error } = await supabase
    .from("reports")
    .select("id,created_at,status,severity,context_type,reason_code,details,auto_flags,reporter_id,reported_user_id,quest_id,message_id,reporter:profiles!reports_reporter_id_fkey(id,display_name),reported_user:profiles!reports_reported_user_id_fkey(id,display_name),quest:quests(id,title,city),message:messages(id,body,created_at)")
    .eq("id", body.report_id)
    .maybeSingle();

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!report) return Response.json({ ok: false, error: "Report not found." }, { status: 404 });

  const flags = (report.auto_flags || {}) as Record<string, string>;
  const targetKey = flags.report_target_key || report.id;

  const { count, error: countError } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .contains("auto_flags", { report_target_key: targetKey });

  if (countError) return Response.json({ ok: false, error: countError.message }, { status: 500 });

  const reportCount = Math.max(1, count || 1);
  const reportedProfile = Array.isArray(report.reported_user) ? report.reported_user[0] : report.reported_user;
  const reporter = Array.isArray(report.reporter) ? report.reporter[0] : report.reporter;
  const quest = Array.isArray(report.quest) ? report.quest[0] : report.quest;
  const message = Array.isArray(report.message) ? report.message[0] : report.message;

  const subjectBase = reportCount > 1 ? `${reportCount} reports` : "Report";
  const subject = `[QuestHat moderation] ${subjectBase} · ${prettyLabel(report.severity)} ${prettyLabel(report.context_type)}`;
  const reporterName = flags.reporter_name || reporter?.display_name || report.reporter_id;
  const targetLabel = flags.report_target_label || reportedProfile?.display_name || quest?.title || report.quest_id || "—";
  const listingLabel = flags.listing_title || quest?.title || report.quest_id || "—";
  const bodyText = [
    `A moderation alert was submitted in QuestHat.`,
    "",
    `Report reference: ${report.id}`,
    `Count for this target: ${reportCount}`,
    `Target key: ${targetKey}`,
    `Context: ${prettyLabel(report.context_type)}`,
    `Reason: ${prettyLabel(report.reason_code)}`,
    `Reporter: ${reporterName}`,
    `Target: ${targetLabel}`,
    `Listing: ${listingLabel}`,
    `Host: ${flags.host_name || reportedProfile?.display_name || report.reported_user_id || "—"}`,
    `Message: ${message?.body ? message.body.slice(0, 300) : "—"}`,
    `Details: ${report.details || "—"}`,
  ].join("\n");

  const bodyHtml = `<p>A moderation alert was submitted in QuestHat.</p><ul><li>Report reference: ${escapeHtml(report.id)}</li><li>Count for this target: ${reportCount}</li><li>Target key: ${escapeHtml(targetKey)}</li><li>Context: ${escapeHtml(prettyLabel(report.context_type))}</li><li>Reason: ${escapeHtml(prettyLabel(report.reason_code))}</li><li>Reporter: ${escapeHtml(String(reporterName))}</li><li>Target: ${escapeHtml(String(targetLabel))}</li><li>Listing: ${escapeHtml(String(listingLabel))}</li><li>Host: ${escapeHtml(String(flags.host_name || reportedProfile?.display_name || report.reported_user_id || "—"))}</li><li>Message: ${escapeHtml(message?.body ? message.body.slice(0, 300) : "—")}</li><li>Details: ${escapeHtml(report.details || "—")}</li></ul>`;

  for (const recipient of recipients) {
    await sendSmtpEmail({
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      password: smtpPassword,
      from: smtpFrom,
      to: recipient,
      subject,
      text: bodyText,
      html: bodyHtml,
    });
  }

  return Response.json({ ok: true, report_id: report.id, report_count: reportCount, recipients: recipients.length });
}
