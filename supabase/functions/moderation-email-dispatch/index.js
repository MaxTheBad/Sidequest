import { createClient } from "npm:@supabase/supabase-js@2";

function unwrapSingle(value) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] || null) : value;
}

function prettyLabel(input) {
  return (input || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

function shortText(text, max = 120) {
  const raw = (text || "").trim();
  if (!raw) return "—";
  return raw.length > max ? `${raw.slice(0, max).trimEnd()}…` : raw;
}

function parseRecipients(input) {
  return (input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHeaderValue(value) {
  return String(value || "").replace(/\r|\n/g, " ").trim();
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrapBase64(value) {
  return base64Utf8(value).replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function parseMailbox(value) {
  const match = String(value || "").match(/<([^>]+)>/);
  return (match?.[1] || value || "").trim();
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
}: {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const { connect } = await import("cloudflare:sockets");
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
    const lines = [];

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

  async function command(value, expectedCode) {
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

    const message = [
      `From: ${escapeHeaderValue(from)}`,
      `To: ${escapeHeaderValue(to)}`,
      `Subject: =?UTF-8?B?${base64Utf8(subject)}?=`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(text),
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

async function buildReportSummary(supabase, reportId) {
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id,created_at,status,severity,context_type,reason_code,details,auto_flags,reporter_id,reported_user_id,quest_id,message_id,reporter:profiles!reports_reporter_id_fkey(id,display_name),reported_user:profiles!reports_reported_user_id_fkey(id,display_name),quest:quests(id,title,city),message:messages(id,body,created_at)",
    )
    .eq("id", reportId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data;
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const recipientList = parseRecipients(Deno.env.get("MODERATION_ALERT_RECIPIENTS"));
  const recipients = recipientList.length ? recipientList : ["reports@questhat.com"];
  const smtpHost = Deno.env.get("SMTP_HOST");
  const smtpPort = Number(Deno.env.get("SMTP_PORT") || "465");
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPassword = Deno.env.get("SMTP_PASSWORD");
  const smtpFrom = Deno.env.get("SMTP_FROM") || "QuestHat Moderation <alerts@questhat.com>";
  const siteUrl = (Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "").replace(/\/$/, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  if (req.method === "GET") {
    const { count, error } = await supabase
      .from("moderation_email_queue")
      .select("id", { count: "exact", head: true })
      .is("sent_at", null);

    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      queued: count ?? 0,
      recipients: recipients.length,
      emailConfigured: Boolean(smtpHost && smtpUser && smtpPassword && Number.isInteger(smtpPort)),
    });
  }

  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405 });
  }

  if (!smtpHost || !smtpUser || !smtpPassword || !Number.isInteger(smtpPort)) {
    return Response.json(
      {
        ok: false,
        error: "Missing or invalid SMTP configuration.",
        recipients: recipients.length,
      },
      { status: 500 },
    );
  }

  const { data: queueRows, error: queueError } = await supabase
    .from("moderation_email_queue")
    .select("id,created_at,report_id,queue_reason,attempts,sent_at,last_error,provider_message_id")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(10);

  if (queueError) {
    return Response.json({ ok: false, error: queueError.message }, { status: 500 });
  }

  const processed = [];

  for (const queueRow of queueRows || []) {
    try {
      const report = await buildReportSummary(supabase, queueRow.report_id);
      if (!report) {
        await supabase
          .from("moderation_email_queue")
          .update({
            attempts: queueRow.attempts + 1,
            last_error: "Report not found.",
          })
          .eq("id", queueRow.id);
        processed.push({ queueId: queueRow.id, reportId: queueRow.report_id, status: "missing_report" });
        continue;
      }

      const reportedProfile = unwrapSingle(report.reported_user);
      const reporter = unwrapSingle(report.reporter);
      const quest = unwrapSingle(report.quest);
      const message = unwrapSingle(report.message);
      const reportMeta = report.auto_flags || {};
      const listingTitle = reportMeta.listing_title || quest?.title || report.quest_id || "—";
      const hostName = reportMeta.host_name || reportedProfile?.display_name || report.reported_user_id || "—";
      const reporterName = reportMeta.reporter_name || reporter?.display_name || report.reporter_id;
      const referenceId = String(reportMeta.reference_id || report.id);
      const reportedUserLabel = reportedProfile?.display_name || report.reported_user_id || "—";
      const subject = `[Sidequest moderation] ${prettyLabel(queueRow.queue_reason)} · ${prettyLabel(report.severity)} report`;
      const bodyLines = [
        `A moderation alert was queued in Sidequest.`,
        ``,
        `Reference: ${referenceId}`,
        `Report ID: ${report.id}`,
        `Queue reason: ${prettyLabel(queueRow.queue_reason)}`,
        `Status: ${prettyLabel(report.status)}`,
        `Severity: ${prettyLabel(report.severity)}`,
        `Context: ${prettyLabel(report.context_type)}`,
        `Reason: ${prettyLabel(report.reason_code)}`,
        `Reporter: ${reporterName}`,
        `Reported user: ${reportedUserLabel}`,
        `Host: ${hostName}`,
        `Listing: ${listingTitle}`,
        `Quest: ${quest?.title || report.quest_id || "—"}`,
        `Message: ${message ? shortText(message.body, 300) : "—"}`,
        `Details: ${report.details || "—"}`,
        ``,
        siteUrl ? `Open moderation queue: ${siteUrl}/moderation` : "Open moderation queue in the app.",
      ];

      for (const recipient of recipients) {
        await sendSmtpEmail({
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          password: smtpPassword,
          from: smtpFrom,
          to: recipient,
          subject,
          text: bodyLines.join("\n"),
        });
      }

      const providerMessageId = null;

      await supabase
        .from("moderation_email_queue")
        .update({
          sent_at: new Date().toISOString(),
          attempts: queueRow.attempts + 1,
          last_error: null,
          provider_message_id: providerMessageId,
        })
        .eq("id", queueRow.id);

      processed.push({ queueId: queueRow.id, reportId: queueRow.report_id, status: "sent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await supabase
        .from("moderation_email_queue")
        .update({
          attempts: queueRow.attempts + 1,
          last_error: message,
        })
        .eq("id", queueRow.id);
      processed.push({ queueId: queueRow.id, reportId: queueRow.report_id, status: "error", detail: message });
    }
  }

  return Response.json({
    ok: true,
    processed: processed.length,
    results: processed,
  });
});
