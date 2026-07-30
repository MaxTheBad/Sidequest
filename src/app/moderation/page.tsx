"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isPrivilegedRole, normalizeProfileRole } from "@/lib/admin.js";
import { getSupabaseClient } from "@/lib/supabase";

type ProfileSummary = {
  id: string;
  display_name: string | null;
  username: string | null;
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
  response_due_at: string | null;
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

type ReportAutoFlags = {
  reporter_name?: string | null;
  listing_title?: string | null;
  host_name?: string | null;
  host_username?: string | null;
  reported_user_name?: string | null;
  reported_user_username?: string | null;
  report_target_key?: string | null;
  report_target_label?: string | null;
  report_target_type?: string | null;
  report_target_id?: string | null;
  report_target_role?: string | null;
};

type ModerationTargetSummary = {
  key: string;
  label: string;
  type: string;
  totalReports: number;
  openReports: number;
  criticalReports: number;
  uniqueReporters: number;
  lastReportedAt: string;
  primaryReason: string;
  primaryContext: string;
  severityScore: number;
};

type StaffMemberRow = {
  user_id: string;
  role: "moderator" | "senior_moderator" | "admin" | "super_admin";
  active: boolean;
  appointed_at: string;
  updated_at: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
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

function responseDeadline(report: ReportRow) {
  if (!report.response_due_at) return { label: "No deadline", overdue: false };
  if (report.status === "resolved" || report.status === "dismissed") {
    return { label: `Closed · due ${new Date(report.response_due_at).toLocaleString()}`, overdue: false };
  }
  const due = new Date(report.response_due_at);
  return {
    label: `${due.getTime() < Date.now() ? "OVERDUE" : "Due"} ${due.toLocaleString()}`,
    overdue: due.getTime() < Date.now(),
  };
}

function shortText(text: string | null | undefined, max = 120) {
  const raw = (text || "").trim();
  if (!raw) return "—";
  return raw.length > max ? `${raw.slice(0, max).trimEnd()}…` : raw;
}

function profileLabel(profile: ProfileSummary | null, fallback: string) {
  if (!profile) return fallback;
  const name = profile.display_name || fallback;
  return profile.username ? `${name} (@${profile.username})` : name;
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

function computeSeverityScore(report: ReportRow) {
  const severityWeight = { low: 1, normal: 2, high: 4, critical: 8 }[report.severity] ?? 1;
  const statusBoost = ["open", "triaged", "reviewing", "escalated"].includes(report.status) ? 1.15 : 1;
  return severityWeight * statusBoost;
}

function deriveTargetSummary(report: ReportRow) {
  const flags = ((report as ReportRow & { auto_flags?: ReportAutoFlags }).auto_flags || {}) as ReportAutoFlags;
  const targetType = (flags.report_target_type || "").trim() || (report.reported_user_id ? "user" : report.quest_id ? "listing" : report.message_id ? "message" : "unknown");
  const targetKey =
    (flags.report_target_key || "").trim() ||
    (targetType === "user" && report.reported_user_id ? `user:${report.reported_user_id}` : targetType === "listing" && report.quest_id ? `listing:${report.quest_id}` : `report:${report.id}`);
  const targetLabel =
    (flags.report_target_label || "").trim() ||
    (targetType === "user"
      ? flags.reported_user_username
        ? `${flags.reported_user_name || "User"} (@${flags.reported_user_username})`
        : flags.reported_user_name || report.reported_user_id || "Unknown user"
      : targetType === "listing"
        ? flags.listing_title || report.quest_id || "Unknown listing"
        : targetType === "message"
          ? report.message_id || "Unknown message"
          : "Unknown target");
  return { targetType, targetKey, targetLabel };
}

export default function ModerationPage() {
  const supabase = getSupabaseClient();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<string>("user");
  const [mfaVerified, setMfaVerified] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaQrCode, setMfaQrCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [staffMembers, setStaffMembers] = useState<StaffMemberRow[]>([]);
  const [staffIdentifier, setStaffIdentifier] = useState("");
  const [staffRole, setStaffRole] = useState<StaffMemberRow["role"]>("moderator");
  const [staffSaving, setStaffSaving] = useState(false);
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

  async function initializeAccess() {
      if (!supabase) return;
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user?.id ?? null;
      setViewerId(uid);

      if (!uid) {
        setViewerRole("user");
        setPageStatus("Log in with an admin or moderator account to review reports.");
        return;
      }

      const { data: accessData, error: accessError } = await supabase.rpc("get_my_staff_access");

      if (accessError) {
        if (accessError.message.toLowerCase().includes("function") || accessError.message.toLowerCase().includes("does not exist")) {
          setPageStatus("Protected staff access is not deployed yet.");
          return;
        }
        setPageStatus(accessError.message);
        return;
      }

      const access = (Array.isArray(accessData) ? accessData[0] : accessData) as { staff_role?: string; is_active?: boolean; mfa_verified?: boolean } | null;
      const role = normalizeProfileRole(access?.is_active ? access.staff_role : "user");
      setViewerRole(role);
      setMfaVerified(Boolean(access?.mfa_verified));

      if (!isPrivilegedRole(role)) {
        setPageStatus("You do not have moderation access.");
        return;
      }
      if (!access?.mfa_verified) {
        setPageStatus("Multi-factor authentication is required before moderation data can be opened.");
        return;
      }

      await loadReports();
      if (role === "admin" || role === "super_admin") await loadStaffMembers();
  }

  useEffect(() => {
    if (!supabase) return;

    void initializeAccess();
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
    setSelectedActionType(report.severity === "critical" && viewerRole !== "moderator" ? "ban" : report.severity === "high" ? "suspend" : "request_more_info");
    setSelectedNote(report.resolution_note || report.details || "");

    if (!supabase) return;
    const loadActions = async () => {
      const { data, error } = await supabase
        .from("report_actions")
        .select("id,created_at,action_type,note,actor_id,actor:profiles!report_actions_actor_id_fkey(id,display_name,username,avatar_url)")
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
  }, [reports, selectedReportId, supabase, viewerRole]);

  async function beginMfa() {
    if (!supabase || mfaBusy) return;
    setMfaBusy(true);
    setPageStatus("");
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      setPageStatus(factorsError.message);
      setMfaBusy(false);
      return;
    }
    const verified = factors.totp.find((factor) => factor.status === "verified");
    if (verified) {
      setMfaFactorId(verified.id);
      setMfaQrCode("");
      setPageStatus("Enter the current code from your authenticator app.");
      setMfaBusy(false);
      return;
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "QuestHat Moderation" });
    if (error) {
      setPageStatus(error.message);
      setMfaBusy(false);
      return;
    }
    setMfaFactorId(data.id);
    setMfaQrCode(data.totp.qr_code);
    setPageStatus("Scan the QR code, then enter the six-digit authenticator code.");
    setMfaBusy(false);
  }

  async function verifyMfa() {
    if (!supabase || !mfaFactorId || mfaCode.trim().length !== 6 || mfaBusy) return;
    setMfaBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode.trim() });
    if (error) {
      setPageStatus(error.message);
      setMfaBusy(false);
      return;
    }
    await supabase.auth.refreshSession();
    setMfaCode("");
    setMfaQrCode("");
    setMfaFactorId("");
    setMfaBusy(false);
    await initializeAccess();
  }

  async function loadStaffMembers() {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("list_staff_members");
    if (error) {
      setPageStatus(error.message);
      return;
    }
    setStaffMembers((data as StaffMemberRow[]) || []);
  }

  async function saveStaffMember(identifier: string, role: StaffMemberRow["role"], active: boolean) {
    if (!supabase || staffSaving) return;
    setStaffSaving(true);
    setPageStatus("");
    const { error } = await supabase.rpc("set_staff_member", {
      p_identifier: identifier.trim(),
      p_role: role,
      p_active: active,
    });
    setStaffSaving(false);
    if (error) {
      setPageStatus(error.message);
      return;
    }
    setStaffIdentifier("");
    setPageStatus(active ? "Staff access saved." : "Staff access revoked immediately.");
    await loadStaffMembers();
  }

  async function loadReports() {
    if (!supabase) return;

    setPageStatus("Loading moderation reports...");

    const [{ data, error }, queueResult] = await Promise.all([
      supabase
        .from("reports")
        .select(
          "id,created_at,updated_at,status_changed_at,response_due_at,context_type,reason_code,details,status,severity,reporter_id,reported_user_id,quest_id,message_id,auto_flags,reviewed_by,reviewed_at,resolution_note,admin_assignee_id,reporter:profiles!reports_reporter_id_fkey(id,display_name,username,avatar_url),reported_user:profiles!reports_reported_user_id_fkey(id,display_name,username,avatar_url),quest:quests(id,title,city),message:messages(id,body,created_at),reviewed_by_profile:profiles!reports_reviewed_by_fkey(id,display_name,username,avatar_url),assignee:profiles!reports_admin_assignee_id_fkey(id,display_name,username,avatar_url)",
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
        unwrapSingle(row.reporter)?.username || "",
        unwrapSingle(row.reported_user)?.display_name || "",
        unwrapSingle(row.reported_user)?.username || "",
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
  const targetSummaries = useMemo(() => {
    const byKey = new Map<string, ModerationTargetSummary & { reporters: Set<string> }>();
    for (const report of reports) {
      const { targetType, targetKey, targetLabel } = deriveTargetSummary(report);
      const current =
        byKey.get(targetKey) ||
        ({
          key: targetKey,
          label: targetLabel,
          type: targetType,
          totalReports: 0,
          openReports: 0,
          criticalReports: 0,
          uniqueReporters: 0,
          lastReportedAt: report.created_at,
          primaryReason: report.reason_code,
          primaryContext: report.context_type,
          severityScore: 0,
          reporters: new Set<string>(),
        } as ModerationTargetSummary & { reporters: Set<string> });

      current.totalReports += 1;
      if (["open", "triaged", "reviewing", "escalated"].includes(report.status)) current.openReports += 1;
      if (report.severity === "critical") current.criticalReports += 1;
      current.reporters.add(report.reporter_id);
      current.uniqueReporters = current.reporters.size;
      if (new Date(report.created_at).getTime() > new Date(current.lastReportedAt).getTime()) {
        current.lastReportedAt = report.created_at;
        current.primaryReason = report.reason_code;
        current.primaryContext = report.context_type;
      }
      current.severityScore += computeSeverityScore(report);
      byKey.set(targetKey, current);
    }

    return Array.from(byKey.values())
      .map(({ reporters: _reporters, ...rest }) => rest)
      .sort((a, b) => b.severityScore - a.severityScore || b.totalReports - a.totalReports || b.uniqueReporters - a.uniqueReporters)
      .slice(0, 12);
  }, [reports]);

  async function saveModerationAction(
    reportId: string,
    nextStatus: ReportStatus = selectedStatus,
    nextActionType: ReportActionType = selectedActionType,
    nextNote: string = selectedNote,
  ) {
    if (!supabase || !viewerId || !isPrivilegedRole(viewerRole)) return;

    const note = nextNote.trim() || null;
    setSaving(true);

    const { error: actionError } = await supabase.rpc("apply_moderation_enforcement", {
      p_report_id: reportId,
      p_status: nextStatus,
      p_action_type: nextActionType,
      p_note: note,
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

    setSaving(false);
    setPageStatus(nextActionType === "ban" || nextActionType === "suspend" ? "Content removed and account ejected." : "Moderation action saved.");
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
    const { targetType, targetLabel } = deriveTargetSummary(report);
    const reportedProfile = unwrapSingle(report.reported_user);
    const quest = unwrapSingle(report.quest);
    const message = unwrapSingle(report.message);
    if (targetType === "listing" && quest) return `Listing: ${quest.title || targetLabel}`;
    if (targetType === "user" && reportedProfile) return `Person: ${profileLabel(reportedProfile, targetLabel)}`;
    if (targetType === "message" && message) return `Message: ${shortText(message.body, 70)}`;
    return targetLabel || "No linked target";
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

        {isPrivilegedRole(viewerRole) && !mfaVerified && (
          <div className="mx-auto w-full max-w-lg space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-800">Protected staff access</p>
              <h2 className="mt-1 text-xl font-bold">Authenticator verification required</h2>
              <p className="mt-2 text-sm leading-6 text-gray-700">Reports and moderation actions remain locked until this session reaches MFA assurance level 2.</p>
            </div>
            {!mfaFactorId ? (
              <button type="button" className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={mfaBusy} onClick={() => void beginMfa()}>
                {mfaBusy ? "Checking..." : "Set up or verify authenticator"}
              </button>
            ) : (
              <div className="space-y-3">
                {mfaQrCode ? (
                  <div className="rounded-xl border bg-white p-4 text-center">
                    {/* Supabase returns a local data URL; no remote image is loaded. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mfaQrCode} alt="QuestHat moderation authenticator QR code" className="mx-auto h-48 w-48" />
                  </div>
                ) : null}
                <input
                  className="w-full rounded-xl border bg-white px-4 py-3 text-center text-lg tracking-[0.3em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <button type="button" className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={mfaBusy || mfaCode.length !== 6} onClick={() => void verifyMfa()}>
                  {mfaBusy ? "Verifying..." : "Verify and unlock dashboard"}
                </button>
              </div>
            )}
          </div>
        )}

        {isPrivilegedRole(viewerRole) && mfaVerified && (
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

            {(viewerRole === "admin" || viewerRole === "super_admin") && (
              <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Admin only</p>
                  <h2 className="text-base font-semibold">Moderation team</h2>
                  <p className="text-sm text-gray-600">Assign by exact username or user ID. Access changes take effect immediately and are audited.</p>
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_190px_auto]">
                  <input
                    className="rounded-xl border bg-white px-3 py-2 text-sm"
                    placeholder="Username or user ID"
                    value={staffIdentifier}
                    onChange={(event) => setStaffIdentifier(event.target.value)}
                  />
                  <select className="rounded-xl border bg-white px-3 py-2 text-sm" value={staffRole} onChange={(event) => setStaffRole(event.target.value as StaffMemberRow["role"])}>
                    <option value="moderator">Moderator</option>
                    <option value="senior_moderator">Senior moderator</option>
                    <option value="admin">Admin</option>
                    {viewerRole === "super_admin" ? <option value="super_admin">Super admin</option> : null}
                  </select>
                  <button type="button" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={staffSaving || !staffIdentifier.trim()} onClick={() => void saveStaffMember(staffIdentifier, staffRole, true)}>
                    {staffSaving ? "Saving..." : "Assign access"}
                  </button>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {staffMembers.map((member) => (
                    <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{member.display_name || member.username || member.user_id}</p>
                        <p className="text-xs text-gray-500">{member.username ? `@${member.username} · ` : ""}{prettyLabel(member.role)} · {member.active ? "Active" : "Revoked"}</p>
                      </div>
                      <button
                        type="button"
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${member.active ? "border-red-200 text-red-700" : "border-emerald-200 text-emerald-700"}`}
                        disabled={staffSaving || (member.user_id === viewerId && member.role === "super_admin")}
                        onClick={() => void saveStaffMember(member.user_id, member.role, !member.active)}
                      >
                        {member.active ? "Revoke" : "Reactivate"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Worst actors</h2>
                  <p className="text-sm text-gray-600">Ranked by severity-weighted reports. This is the list you review first.</p>
                </div>
                <span className="text-xs text-gray-500">{targetSummaries.length} targets shown</span>
              </div>
              {targetSummaries.length ? (
                <div className="grid gap-2 xl:grid-cols-2">
                  {targetSummaries.map((target, index) => (
                    <button
                      key={target.key}
                      type="button"
                      className={`text-left rounded-xl border px-3 py-3 transition ${index === 0 ? "bg-red-50 border-red-200" : "bg-slate-50 hover:bg-slate-100"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold truncate">{target.label}</p>
                            <span className="rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">{prettyLabel(target.type)}</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500 break-all">{target.key}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">Risk score</p>
                          <p className="text-lg font-bold">{Math.round(target.severityScore)}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div><span className="font-medium text-gray-500">Reports:</span> {target.totalReports}</div>
                        <div><span className="font-medium text-gray-500">Unique reporters:</span> {target.uniqueReporters}</div>
                        <div><span className="font-medium text-gray-500">Open:</span> {target.openReports}</div>
                        <div><span className="font-medium text-gray-500">Critical:</span> {target.criticalReports}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-500">
                        <span className="rounded-full bg-white border px-2 py-1">Last: {new Date(target.lastReportedAt).toLocaleDateString()}</span>
                        <span className="rounded-full bg-white border px-2 py-1">Context: {prettyLabel(target.primaryContext)}</span>
                        <span className="rounded-full bg-white border px-2 py-1">Reason: {prettyLabel(target.primaryReason)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No report aggregates yet.</p>
              )}
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
                                <div className={`mt-1 font-semibold ${responseDeadline(report).overdue ? "text-red-700" : "text-amber-700"}`}>{responseDeadline(report).label}</div>
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
                      <div><span className="text-gray-500">Reporter:</span> {profileLabel(selectedReportReporter, selectedReport.reporter_id)}</div>
                      <div><span className="text-gray-500">Reported user:</span> {profileLabel(selectedReportedProfile, selectedReport.reported_user_id || "—")}</div>
                      <div><span className="text-gray-500">Quest:</span> {selectedQuest?.title || selectedReport.quest_id || "—"}</div>
                      <div><span className="text-gray-500">Message:</span> {selectedMessage ? shortText(selectedMessage.body, 140) : "—"}</div>
                      <div><span className="text-gray-500">Reviewed by:</span> {selectedReviewer?.display_name || selectedReport.reviewed_by || "—"}</div>
                      <div><span className="text-gray-500">Assignee:</span> {selectedAssignee?.display_name || selectedReport.admin_assignee_id || "—"}</div>
                      <div><span className="text-gray-500">Reviewed at:</span> {selectedReport.reviewed_at ? new Date(selectedReport.reviewed_at).toLocaleString() : "—"}</div>
                      <div><span className="text-gray-500">Status changed:</span> {selectedReport.status_changed_at ? new Date(selectedReport.status_changed_at).toLocaleString() : "—"}</div>
                      <div className={responseDeadline(selectedReport).overdue ? "font-semibold text-red-700" : "font-medium text-amber-700"}><span>24-hour response:</span> {responseDeadline(selectedReport).label}</div>
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
                          {ACTION_OPTIONS.filter((option) => option !== "ban" || viewerRole !== "moderator").map((option) => (
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
                            setSelectedActionType(selectedReport.severity === "critical" && viewerRole !== "moderator" ? "ban" : selectedReport.severity === "high" ? "suspend" : "request_more_info");
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
