"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TurnstileInvisible } from "@/components/turnstile-invisible";
import { formatReportReference } from "@/lib/reporting";
import { getSupabaseClient } from "@/lib/supabase";

type ReportKind = "listing" | "profile";
type ProfileLite = { id: string; display_name: string | null; username: string | null };
type QuestLite = { id: string; title: string | null; creator_id: string | null; profiles?: ProfileLite[] | ProfileLite | null };
type ReportInsertPayload = {
  reporter_id: string;
  reported_user_id: string | null;
  quest_id: string | null;
  context_type: string;
  reason_code: string;
  details: string | null;
  auto_flags: Record<string, string | null>;
};

const REPORT_REASONS: Record<ReportKind, Array<{ value: string; label: string }>> = {
  listing: [
    { value: "spam_scam", label: "Spam / scam" },
    { value: "misleading", label: "Misleading info" },
    { value: "unsafe", label: "Unsafe content" },
    { value: "other", label: "Other" },
  ],
  profile: [
    { value: "inappropriate_profile", label: "Inappropriate profile" },
    { value: "fake_identity", label: "Fake identity" },
    { value: "impersonation", label: "Impersonation" },
    { value: "other", label: "Other" },
  ],
};

function unwrapSingle<T>(value: T[] | T | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function ReportPage() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeMatch = pathname.match(/^\/report\/([^/]+)\/([^/]+)\/?$/);
  const kind = routeMatch?.[1] as ReportKind | undefined;
  const id = routeMatch?.[2];
  const reportedUserId = searchParams.get("reported_user_id");

  const [title, setTitle] = useState("");
  const [hostName, setHostName] = useState("—");
  const [hostUsername, setHostUsername] = useState<string | null>(null);
  const [reporterName, setReporterName] = useState("you");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [reference, setReference] = useState("");
  const [reportTurnstileToken, setReportTurnstileToken] = useState("");

  const reportKind = useMemo(() => (kind === "profile" ? "profile" : "listing"), [kind]);

  useEffect(() => {
    if (!supabase || !id) return;
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const me = sessionData.session?.user;
      setReporterName((me?.email || me?.user_metadata?.name || me?.user_metadata?.full_name || "you").toString());

      if (reportKind === "listing") {
        const { data, error } = await supabase
          .from("quests")
          .select("id,title,creator_id,profiles:profiles!quests_creator_id_fkey(id,display_name,username)")
          .eq("id", id)
          .maybeSingle();
        if (error) {
          setStatus(error.message);
          setLoading(false);
          return;
        }
        const quest = data as QuestLite | null;
        if (!quest) {
          setStatus("Listing not found.");
          setLoading(false);
          return;
        }
        setTitle(quest.title || "Listing");
        const host = unwrapSingle(quest.profiles);
        setHostName(host?.display_name || quest.creator_id || "—");
        setHostUsername(host?.username || null);
      } else {
        const { data, error } = await supabase
          .from("profiles")
          .select("id,display_name,username")
          .eq("id", id)
          .maybeSingle();
        if (error) {
          setStatus(error.message);
          setLoading(false);
          return;
        }
        if (!data) {
          setStatus("Profile not found.");
          setLoading(false);
          return;
        }
        setTitle(data.display_name || "Profile");
        setHostName(data.display_name || id);
        setHostUsername(data.username || null);
      }
      setReason(REPORT_REASONS[reportKind][0].value);
      setLoading(false);
    };
    void load();
  }, [id, reportKind, supabase]);

  async function submitReport() {
    if (!supabase || !id) return;
    if (!reportTurnstileToken.trim()) return setStatus("Complete the verification check before submitting.");
    const { data: sessionData } = await supabase.auth.getSession();
    const reporterId = sessionData.session?.user?.id || null;
    if (!reporterId) {
      setStatus("Log in to submit reports.");
      return;
    }
    if (!details.trim() && reportKind === "listing" && reason === "unsafe") {
      setStatus("Add details for unsafe reports.");
      return;
    }

    const verify = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: reportTurnstileToken, action: `report-${reportKind}` }),
    });
    if (!verify.ok) return setStatus("Verification failed. Please try again.");

    setSubmitting(true);
    const payload: ReportInsertPayload =
      reportKind === "listing"
        ? {
            reporter_id: reporterId,
            reported_user_id: reportedUserId || null,
            quest_id: id,
            context_type: "listing_content",
            reason_code: reason,
            details: details.trim() || null,
            auto_flags: {
              reporter_name: reporterName,
              listing_title: title || null,
              host_name: hostName,
              host_username: hostUsername,
              report_target_type: "listing",
              report_target_id: id,
              report_target_key: `listing:${id}`,
              report_target_label: title || null,
            },
          }
        : {
            reporter_id: reporterId,
            reported_user_id: id,
            quest_id: null,
            context_type: "profile_account",
            reason_code: reason,
            details: details.trim() || null,
            auto_flags: {
              reporter_name: reporterName,
              reported_user_name: title || null,
              reported_user_username: hostUsername,
              report_target_type: "user",
              report_target_id: id,
              report_target_role: "profile",
            },
          };

    const { data, error } = await supabase.from("reports").insert(payload).select("id").single();
    setSubmitting(false);
    if (error) {
      setStatus("We couldn't submit that report right now. Please try again in a moment.");
      return;
    }

    setReference(formatReportReference(data?.id || null));
    setStatus("Report submitted.");
    setReportTurnstileToken("");
  }

  if (loading) {
    return <main className="mx-auto max-w-2xl px-4 py-8">Loading report form...</main>;
  }

  const isSuccess = status.toLowerCase().includes("submitted");
  const isError = status.toLowerCase().includes("couldn't") || status.toLowerCase().includes("log in") || status.toLowerCase().includes("add details");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {status ? (
        <div
          className={`fixed left-1/2 top-4 z-[220] w-[min(92vw,32rem)] -translate-x-1/2 rounded-2xl px-4 py-3 text-sm shadow-2xl backdrop-blur-sm ${
            isSuccess ? "border border-emerald-300 bg-emerald-50 text-emerald-950" : isError ? "border border-amber-300 bg-amber-50 text-amber-950" : "border border-slate-300 bg-white text-slate-900"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div>{status}</div>
              {reference ? <div className="mt-1 font-semibold">Reference {reference}.</div> : null}
            </div>
            <button type="button" className="shrink-0 text-xs font-medium underline" onClick={() => setStatus("")}>
              dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div className="rounded-3xl border bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Report</p>
            <h1 className="text-2xl font-black">{reportKind === "listing" ? "Report listing" : "Report profile"}</h1>
            <p className="mt-2 text-sm text-slate-600">
              About: <b>{title}</b>{reportKind === "profile" && hostUsername ? ` (@${hostUsername})` : ""}
            </p>
            {reportKind === "listing" ? <p className="mt-1 text-sm text-slate-600">Host: <b>{hostName}</b>{hostUsername ? ` (@${hostUsername})` : ""}</p> : null}
          </div>
          <Link href={reportKind === "listing" ? `/listing/${id}` : `/profile/${id}`} className="rounded-full border px-3 py-2 text-sm">
            Back
          </Link>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">What are you reporting?</span>
            <select className="rounded-xl border px-3 py-3" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REPORT_REASONS[reportKind].map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Details {reportKind === "listing" ? "(optional)" : "(optional)"}</span>
            <textarea
              className="min-h-28 rounded-xl border px-3 py-3"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add anything that helps us review this report."
            />
          </label>

          <TurnstileInvisible onToken={setReportTurnstileToken} />

          <div className="flex justify-end gap-3">
            <button type="button" className="rounded-xl border px-4 py-3" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="button" className="rounded-xl bg-black px-4 py-3 font-medium text-white disabled:opacity-50" disabled={submitting} onClick={() => void submitReport()}>
              {submitting ? "Submitting..." : "Submit report"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
