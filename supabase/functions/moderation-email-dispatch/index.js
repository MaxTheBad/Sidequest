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

async function buildReportSummary(supabase, reportId) {
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id,created_at,status,severity,context_type,reason_code,details,reporter_id,reported_user_id,quest_id,message_id,reporter:profiles!reports_reporter_id_fkey(id,display_name),reported_user:profiles!reports_reported_user_id_fkey(id,display_name),quest:quests(id,title,city),message:messages(id,body,created_at)",
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
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const recipientList = parseRecipients(Deno.env.get("MODERATION_ALERT_RECIPIENTS"));
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
      recipients: recipientList.length,
      emailConfigured: !!resendApiKey,
    });
  }

  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405 });
  }

  if (!resendApiKey) {
    return Response.json(
      {
        ok: false,
        error: "Missing RESEND_API_KEY. Queue rows were not sent.",
        recipients: recipientList.length,
      },
      { status: 500 },
    );
  }

  if (!recipientList.length) {
    return Response.json(
      {
        ok: false,
        error: "Missing MODERATION_ALERT_RECIPIENTS.",
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
      const subject = `[Sidequest moderation] ${prettyLabel(queueRow.queue_reason)} · ${prettyLabel(report.severity)} report`;
      const bodyLines = [
        `A moderation alert was queued in Sidequest.`,
        ``,
        `Report ID: ${report.id}`,
        `Queue reason: ${prettyLabel(queueRow.queue_reason)}`,
        `Status: ${prettyLabel(report.status)}`,
        `Severity: ${prettyLabel(report.severity)}`,
        `Context: ${prettyLabel(report.context_type)}`,
        `Reason: ${prettyLabel(report.reason_code)}`,
        `Reporter: ${reporter?.display_name || report.reporter_id}`,
        `Reported user: ${reportedProfile?.display_name || report.reported_user_id || "—"}`,
        `Quest: ${quest?.title || report.quest_id || "—"}`,
        `Message: ${message ? shortText(message.body, 300) : "—"}`,
        `Details: ${report.details || "—"}`,
        ``,
        siteUrl ? `Open moderation queue: ${siteUrl}/moderation` : "Open moderation queue in the app.",
      ];

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("MODERATION_ALERT_FROM") || "QuestHat Moderation <alerts@questhat.local>",
          to: recipientList,
          subject,
          text: bodyLines.join("\n"),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Email provider error (${response.status})`);
      }

      const payload = await response.json().catch(() => ({}));
      const providerMessageId = typeof payload?.id === "string" ? payload.id : null;

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
