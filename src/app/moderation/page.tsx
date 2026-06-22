"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isPrivilegedRole, normalizeProfileRole } from "@/lib/admin.js";
import { getSupabaseClient } from "@/lib/supabase";

type ProfileSummary = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type QuestSummary = {
  id: string;
  title: string | null;
  city: string | null;
};

type MessageSummary = {
  id: string;
  body: string;
  created_at: string;
};

type ReportActionRow = {
  id: string;
  created_at: string;
  action_type: "warn" | "mute" | "suspend" | "ban" | "dismiss" | "request_more_info";
  note: string | null;
  actor_id: string;
  actor?: ProfileSummary[] | ProfileSummary | null;
};

type ReportRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  status_changed_at: string | null;
  context_type: "listing_content" | "chat_behavior" | "profile_account" | "in_person";
  reason_code: string;
  details: string | null;
  status: "open" | "triaged" | "reviewing" | "resolved" | "dismissed" | "escalated";
  severity: "low" | "normal" | "high" | "critical";
  reporter_id: string;
  reported_user_id: string | null;
  quest_id: string | null;
  message_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  admin_assignee_id: string | null;
  reporter?: ProfileSummary[] | ProfileSummary | null;
  reported_user?: ProfileSummary[] | ProfileSummary | null;
  quest?: QuestSummary[] | QuestSummary | null;
  message?: MessageSummary[] | MessageSummary | null;
  reviewed_by_profile?: ProfileSummary[] | ProfileSummary | null;
  assignee?: ProfileSummary[] | ProfileSummary | null;
};

type ReportStatus = ReportRow["status"];
type ReportActionType = ReportActionRow["action_type"];

const STATUS_OPTIONS: ReportStatus[] = ["open", "triaged", "reviewing", "resolved", "dismissed", "escalated"];
const SEVERITY_OPTIONS: ReportRow["severity"][] = ["low", "normal", "high", "critical"];
const ACTION_OPTIONS: ReportActionType[] = ["request_more_info", "warn", "mute", "suspend", "ban", "dismiss"];

const PRESET_ACTIONS: Array<{
  label: string;
  status: ReportStatus;
  actionType: ReportActionType;
  noteHint: string;
}> = [
  { label: "Mark triaged", status: "triaged", actionType: "request_more_info", noteHint: "Initial triage complete." },
  { label: "Start review", status: "reviewing", actionType: "request_more_info", noteHint: "Needs deeper review." },
  { label: "Resolve", status: "resolved", actionType: "warn", noteHint: "Resolved by moderation." },
  { label: "Dismiss", status: "dismissed", actionType: "dismiss", noteHint: "Report dismissed." },
  { label: "Escalate", status: "escalated", actionType: "suspend", noteHint: "Escalated to senior review." },
];

function unwrapSingle<T>(value: T[] | T | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] || null) : value;
}

function prettyLabel(input: string) {
  return input
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

function shortText(text: string | null | undefined, max = 120) {
  const raw = (text || "").trim();
  if (!raw) return "—";
  return raw.length > max ? `${raw.slice(0, max).trimEnd()}…` : raw;
}

function chipClass(kind: "status" | "severity", value: string) {
  if (kind === "status") {
    switch (value) {
      case "resolved":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "dismissed":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "escalated":
        return "bg-red-100 text-red-800 border-red-200";
      case "reviewing":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "triaged":
        return "bg-amber-100 text-amber-800 border-amber-200";
      default:
        return "bg-white text-slate-700 border-slate-200";
    }
  }

  switch (value) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200";
    case "high":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "normal":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "low":
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export default function ModerationPage() {
  const supabase = getSupabaseClient();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<string>("user");
  const [pageStatus, setPageStatus] = useState("Loading moderation reports...");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedActions, setSelectedActions] = useState<ReportActionRow[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<ReportStatus>("triaged");
  const [selectedActionType, setSelectedActionType] = useState<ReportActionType>("request_more_info");
  const [selectedNote, setSelectedNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailQueuePending, setEmailQueuePending] = useState<number | null>(null);
  const [emailQueueInfo, setEmailQueueInfo] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | ReportStatus>("all");
  const [filterSeverity, setFilterSeverity] = useState<"all" | ReportRow["severity"]>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!supabase) return;

    const init = async () => {
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user?.id ?? null;
      setViewerId(uid);

      if (!uid) {
        setViewerRole("user");
        setPageStatus("Log in with an admin or moderator account to review reports.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      if (profileError) {
        if (profileError.message.toLowerCase().includes("role") || profileError.message.toLowerCase().includes("column")) {
          setPageStatus("Moderation role DB not set up yet. Run sql/moderation-v1.sql");
          return;
        }
        setPageStatus(profileError.message);
        return;
      }

      const role = normalizeProfileRole((profile as { role?: string | null } | null)?.role);
      setViewerRole(role);

      if (!isPrivilegedRole(role)) {
        setPageStatus("You do not have moderation access.");
        return;
      }

      await loadReports();
    };

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!selectedReportId || !reports.length) {
      setSelectedActions([]);
      return;
    }

    const report = reports.find((row) => row.id === selectedReportId);
    if (!report) {
      setSelectedActions([]);
      return;
    }

    setSelectedStatus(report.status);
    setSelectedActionType(report.severity === "critical" ? "ban" : report.severity === "high" ? "suspend" : "request_more_info");
    setSelectedNote(report.resolution_note || report.details || "");

    if (!supabase) return;
    const loadActions = async () => {
      const { data, error } = await supabase
        .from("report_actions")
        .select("id,created_at,action_type,note,actor_id,actor:profiles!report_actions_actor_id_fkey(id,display_name,avatar_url)")
        .eq("report_id", selectedReportId)
        .order("created_at", { ascending: false });

      if (error) {
        if (error.message.toLowerCase().includes("relation") || error.message.toLowerCase().includes("does not exist")) {
          setPageStatus("Report actions DB not set up yet. Run sql/reports-v1.sql and sql/moderation-v1.sql");
          setSelectedActions([]);
          return;
        }
        setPageStatus(error.message);
        setSelectedActions([]);
        return;
      }

      setSelectedActions((data as ReportActionRow[]) || []);
    };

    void loadActions();
  }, [reports, selectedReportId, supabase]);

  async function loadReports() {
    if (!supabase) return;

    setPageStatus("Loading moderation reports...");

    const [{ data, error }, queueResult] = await Promise.all([
      supabase
        .from("reports")
        .select(
          "id,created_at,updated_at,status_changed_at,context_type,reason_code,details,status,severity,reporter_id,reported_user_id,quest_id,message_id,reviewed_by,reviewed_at,resolution_note,admin_assignee_id,reporter:profiles!reports_reporter_id_fkey(id,display_name,avatar_url),reported_user:profiles!reports_reported_user_id_fkey(id,display_name,avatar_url),quest:quests(id,title,city),message:messages(id,body,created_at),reviewed_by_profile:profiles!reports_reviewed_by_fkey(id,display_name,avatar_url),assignee:profiles!reports_admin_assignee_id_fkey(id,display_name,avatar_url)",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("moderation_email_queue").select("id", { count: "exact", head: true }).is("sent_at", null),
    ]);

    if (queueResult.error) {
      if (queueResult.error.message.toLowerCase().includes("relation") || queueResult.error.message.toLowerCase().includes("does not exist")) {
        setEmailQueuePending(null);
        setEmailQueueInfo("Email queue not set up yet. Run sql/moderation-v1.sql");
      } else {
        setEmailQueuePending(null);
        setEmailQueueInfo(queueResult.error.message);
      }
    } else {
      setEmailQueuePending(queueResult.count ?? 0);
      setEmailQueueInfo("");
    }

    if (error) {
      const lower = error.message.toLowerCase();
      if (lower.includes("relation") || lower.includes("does not exist")) {
        setPageStatus("Reports DB not set up yet. Run sql/reports-v1.sql and sql/moderation-v1.sql");
        return;
      }
      if (lower.includes("permission")) {
        setPageStatus("You do not have moderation access.");
        return;
      }
      setPageStatus(error.message);
      return;
    }

    const rows = (data as ReportRow[]) || [];

    setReports(rows);
    setSelectedReportId((current) => {
      if (current && rows.some((row) => row.id === current)) return current;
      return rows[0]?.id || null;
    });
    setPageStatus("");
  }

  const filteredReports = useMemo(() => {
    return reports.filter((row) => {
      if (filterStatus !== "all" && row.status !== filterStatus) return false;
      if (filterSeverity !== "all" && row.severity !== filterSeverity) return false;
      if (!search.trim()) return true;
      const haystack = [
        row.reason_code,
        row.details || "",
        row.context_type,
        unwrapSingle(row.reporter)?.display_name || "",
        unwrapSingle(row.reported_user)?.display_name || "",
        unwrapSingle(row.quest)?.title || "",
        unwrapSingle(row.message)?.body || "",
      ].join(" ").toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [filterSeverity, filterStatus, reports, search]);

  useEffect(() => {
    if (!filteredReports.length) {
      if (selectedReportId) setSelectedReportId(null);
      return;
    }
    if (!selectedReportId || !filteredReports.some((row) => row.id === selectedReportId)) {
      setSelectedReportId(filteredReports[0].id);
    }
  }, [filteredReports, selectedReportId]);

  const selectedReport = useMemo(() => filteredReports.find((row) => row.id === selectedReportId) || null, [filteredReports, selectedReportId]);
  const openCount = useMemo(() => reports.filter((row) => ["open", "triaged", "reviewing", "escalated"].includes(row.status)).length, [reports]);
  const criticalCount = useMemo(() => reports.filter((row) => row.severity === "critical").length, [reports]);
  const unresolvedCount = useMemo(() => reports.filter((row) => row.status !== "resolved" && row.status !== "dismissed").length, [reports]);

  async function saveModerationAction(
    reportId: string,
    nextStatus: ReportStatus = selectedStatus,
    nextActionType: ReportActionType = selectedActionType,
    nextNote: string = selectedNote,
  ) {
    if (!supabase || !viewerId || !isPrivilegedRole(viewerRole)) return;

    const note = nextNote.trim() || null;
    setSaving(true);

    const { error: actionError } = await supabase.from("report_actions").insert({
      report_id: reportId,
      actor_id: viewerId,
      action_type: nextActionType,
      note,
    });

    if (actionError) {
      setSaving(false);
      if (actionError.message.toLowerCase().includes("relation") || actionError.message.toLowerCase().includes("does not exist")) {
        setPageStatus("Report actions DB not set up yet. Run sql/reports-v1.sql and sql/moderation-v1.sql");
        return;
      }
      setPageStatus(actionError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("reports")
      .update({
        status: nextStatus,
        reviewed_by: viewerId,
        reviewed_at: new Date().toISOString(),
        resolution_note: note,
        admin_assignee_id: viewerId,
      })
      .eq("id", reportId);

    setSaving(false);
    if (updateError) {
      if (updateError.message.toLowerCase().includes("relation") || updateError.message.toLowerCase().includes("does not exist")) {
        setPageStatus("Reports DB not set up yet. Run sql/reports-v1.sql and sql/moderation-v1.sql");
        return;
      }
      setPageStatus(updateError.message);
      return;
    }

    setPageStatus("Moderation action saved.");
    await loadReports();
    setSelectedReportId(reportId);
  }

  async function applyPresetAction(reportId: string, status: ReportStatus, actionType: ReportActionType, noteHint: string) {
    setSelectedStatus(status);
    setSelectedActionType(actionType);
    setSelectedNote(noteHint);
    await saveModerationAction(reportId, status, actionType, noteHint);
  }

  function reportTargetSummary(report: ReportRow) {
    const reportedProfile = unwrapSingle(report.reported_user);
    const quest = unwrapSingle(report.quest);
    const message = unwrapSingle(report.message);
    const parts = [
      reportedProfile ? `Profile: ${reportedProfile.display_name || report.reported_user_id || "Unknown"}` : null,
      quest ? `Quest: ${quest.title || report.quest_id || "Unknown"}` : null,
      message ? `Message: ${shortText(message.body, 70)}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "No linked target";
  }

  const selectedReportReporter = unwrapSingle(selectedReport?.reporter);
  const selectedReportedProfile = unwrapSingle(selectedReport?.reported_user);
  const selectedQuest = unwrapSingle(selectedReport?.quest);
  const selectedMessage = unwrapSingle(selectedReport?.message);
  const selectedReviewer = unwrapSingle(selectedReport?.reviewed_by_profile);
  const selectedAssignee = unwrapSingle(selectedReport?.assignee);

  return (
    <main className="page-shell page-moderation min-h-screen bg-transparent p-4">
      <section className="max-w-7xl mx-auto rounded-2xl border bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Moderation queue</h1>
            <p className="text-sm text-gray-600">Review reports, escalate critical issues, and queue email alerts for the backend worker.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full border bg-gray-50 text-gray-700">
              Role: {prettyLabel(viewerRole)}
            </span>
            <Link href="/" className="border rounded px-3 py-2 text-sm">Back</Link>
          </div>
        </div>

        {!!pageStatus && <p className="text-sm rounded border bg-amber-50 px-3 py-2">{pageStatus}</p>}

        {isPrivilegedRole(viewerRole) && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs text-gray-500">Open / active</p>
                <p className="text-2xl font-bold">{openCount}</p>
              </div>
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs text-gray-500">Unresolved</p>
                <p className="text-2xl font-bold">{unresolvedCount}</p>
              </div>
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs text-gray-500">Critical</p>
                <p className="text-2xl font-bold">{criticalCount}</p>
              </div>
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs text-gray-500">Email alerts queued</p>
                <p className="text-2xl font-bold">{emailQueuePending ?? "—"}</p>
              </div>
            </div>

            {emailQueueInfo && <p className="text-xs text-amber-700">{emailQueueInfo}</p>}

            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-gray-50 p-3">
              <input
                className="border rounded px-3 py-2 text-sm min-w-[220px] flex-1"
                placeholder="Search reports, users, quests, or details"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="border rounded px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "all" | ReportStatus)}>
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>{prettyLabel(option)}</option>
                ))}
              </select>
              <select className="border rounded px-3 py-2 text-sm" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value as "all" | ReportRow["severity"])}>
                <option value="all">All severities</option>
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{prettyLabel(option)}</option>
                ))}
              </select>
              <button type="button" className="border rounded px-3 py-2 text-sm bg-white" onClick={() => void loadReports()}>
                Refresh
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
              <div className="overflow-hidden rounded-2xl border">
                <div className="overflow-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-50">
                      <tr className="text-left border-b">
                        <th className="py-2 px-3">When</th>
                        <th className="py-2 px-3">Target</th>
                        <th className="py-2 px-3">Reason</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Severity</th>
                        <th className="py-2 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.length ? (
                        filteredReports.map((report) => {
                          const isSelected = report.id === selectedReportId;
                          return (
                            <tr
                              key={report.id}
                              className={`border-b align-top cursor-pointer transition ${isSelected ? "bg-blue-50" : "hover:bg-slate-50"}`}
                              onClick={() => setSelectedReportId(report.id)}
                            >
                              <td className="py-3 px-3 whitespace-nowrap text-xs text-gray-500">
                                <div>{new Date(report.created_at).toLocaleString()}</div>
                                <div className="mt-1">{report.updated_at ? `Updated ${new Date(report.updated_at).toLocaleString()}` : ""}</div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-medium">{reportTargetSummary(report)}</div>
                                <div className="text-xs text-gray-500 mt-1">{prettyLabel(report.context_type)}</div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-medium">{prettyLabel(report.reason_code)}</div>
                                <div className="text-xs text-gray-500 mt-1">{shortText(report.details, 100)}</div>
                              </td>
                              <td className="py-3 px-3">
                                <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${chipClass("status", report.status)}`}>{prettyLabel(report.status)}</span>
                              </td>
                              <td className="py-3 px-3">
                                <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${chipClass("severity", report.severity)}`}>{prettyLabel(report.severity)}</span>
                              </td>
                              <td className="py-3 px-3">
                                <button type="button" className="border rounded px-3 py-1 text-xs bg-white" onClick={(e) => { e.stopPropagation(); setSelectedReportId(report.id); }}>
                                  Review
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-8 px-3 text-center text-sm text-gray-500">
                            No reports match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="rounded-2xl border bg-gray-50 p-4 space-y-4">
                {!selectedReport ? (
                  <p className="text-sm text-gray-500">Select a report to review details, change status, and add an admin action note.</p>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Selected report</p>
                      <h2 className="text-lg font-semibold">{prettyLabel(selectedReport.reason_code)}</h2>
                      <p className="text-xs text-gray-500">{new Date(selectedReport.created_at).toLocaleString()}</p>
                    </div>

                    <div className="grid gap-2 rounded-xl border bg-white p-3 text-sm">
                      <div><span className="text-gray-500">Context:</span> {prettyLabel(selectedReport.context_type)}</div>
                      <div><span className="text-gray-500">Status:</span> {prettyLabel(selectedReport.status)}</div>
                      <div><span className="text-gray-500">Severity:</span> {prettyLabel(selectedReport.severity)}</div>
                      <div><span className="text-gray-500">Reporter:</span> {selectedReportReporter?.display_name || selectedReport.reporter_id}</div>
                      <div><span className="text-gray-500">Reported user:</span> {selectedReportedProfile?.display_name || selectedReport.reported_user_id || "—"}</div>
                      <div><span className="text-gray-500">Quest:</span> {selectedQuest?.title || selectedReport.quest_id || "—"}</div>
                      <div><span className="text-gray-500">Message:</span> {selectedMessage ? shortText(selectedMessage.body, 140) : "—"}</div>
                      <div><span className="text-gray-500">Reviewed by:</span> {selectedReviewer?.display_name || selectedReport.reviewed_by || "—"}</div>
                      <div><span className="text-gray-500">Assignee:</span> {selectedAssignee?.display_name || selectedReport.admin_assignee_id || "—"}</div>
                      <div><span className="text-gray-500">Reviewed at:</span> {selectedReport.reviewed_at ? new Date(selectedReport.reviewed_at).toLocaleString() : "—"}</div>
                      <div><span className="text-gray-500">Status changed:</span> {selectedReport.status_changed_at ? new Date(selectedReport.status_changed_at).toLocaleString() : "—"}</div>
                    </div>

                    <div className="rounded-xl border bg-white p-3 space-y-2">
                      <p className="text-sm font-medium">Report details</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedReport.details || "—"}</p>
                      <p className="text-sm text-gray-500">Resolution note: {selectedReport.resolution_note || "—"}</p>
                    </div>

                    <div className="rounded-xl border bg-white p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Moderation action</p>
                        {saving && <span className="text-xs text-gray-500">Saving…</span>}
                      </div>

                      <div className="grid gap-2">
                        <label className="text-xs font-medium text-gray-600">Status</label>
                        <select className="border rounded px-3 py-2 text-sm" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as ReportStatus)}>
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>{prettyLabel(option)}</option>
                          ))}
                        </select>

                        <label className="text-xs font-medium text-gray-600">Action type</label>
                        <select className="border rounded px-3 py-2 text-sm" value={selectedActionType} onChange={(e) => setSelectedActionType(e.target.value as ReportActionType)}>
                          {ACTION_OPTIONS.map((option) => (
                            <option key={option} value={option}>{prettyLabel(option)}</option>
                          ))}
                        </select>

                        <label className="text-xs font-medium text-gray-600">Moderator note</label>
                        <textarea
                          className="border rounded px-3 py-2 text-sm min-h-24"
                          value={selectedNote}
                          onChange={(e) => setSelectedNote(e.target.value)}
                          placeholder="Why did you choose this action?"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {PRESET_ACTIONS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            className="border rounded px-3 py-2 text-xs bg-slate-50"
                            onClick={() => void applyPresetAction(selectedReport.id, preset.status, preset.actionType, preset.noteHint)}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="border rounded px-3 py-2 text-sm bg-white"
                          onClick={() => {
                            setSelectedStatus(selectedReport.status);
                            setSelectedActionType(selectedReport.severity === "critical" ? "ban" : selectedReport.severity === "high" ? "suspend" : "request_more_info");
                            setSelectedNote(selectedReport.resolution_note || selectedReport.details || "");
                          }}
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50"
                          disabled={saving}
                          onClick={() => void saveModerationAction(selectedReport.id)}
                        >
                          {saving ? "Saving..." : "Save action"}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-white p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Action history</p>
                        <span className="text-xs text-gray-500">{selectedActions.length} records</span>
                      </div>
                      {selectedActions.length ? (
                        <div className="space-y-2">
                          {selectedActions.map((action) => {
                            const actor = unwrapSingle(action.actor);
                            return (
                              <div key={action.id} className="rounded-lg border bg-slate-50 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium">{prettyLabel(action.action_type)}</p>
                                  <p className="text-[11px] text-gray-500">{new Date(action.created_at).toLocaleString()}</p>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">By {actor?.display_name || action.actor_id}</p>
                                <p className="text-sm text-gray-700 mt-1">{action.note || "—"}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No moderation actions recorded yet.</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedReport.quest_id && <Link href={`/listing/${selectedReport.quest_id}`} className="border rounded px-3 py-2 text-sm bg-white">Open listing</Link>}
                      {selectedReport.reported_user_id && <Link href={`/profile/${selectedReport.reported_user_id}`} className="border rounded px-3 py-2 text-sm bg-white">Open profile</Link>}
                      {selectedReport.reporter_id && <Link href={`/profile/${selectedReport.reporter_id}`} className="border rounded px-3 py-2 text-sm bg-white">Open reporter</Link>}
                    </div>
                  </>
                )}
              </aside>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
