"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

type ReportRow = {
  id: string;
  created_at: string;
  context_type: string;
  reason_code: string;
  details: string | null;
  status: string;
  severity: string;
  reporter_id: string;
  reported_user_id: string | null;
  quest_id: string | null;
};

export default function ModerationPage() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [status, setStatus] = useState("Loading reports...");

  useEffect(() => {
    if (!supabase) return;
    const run = async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id,created_at,context_type,reason_code,details,status,severity,reporter_id,reported_user_id,quest_id")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        if (error.message.toLowerCase().includes("relation") || error.message.toLowerCase().includes("does not exist")) {
          setStatus("Reports DB not set up yet. Run sql/reports-v1.sql");
          return;
        }
        setStatus(error.message);
        return;
      }

      setRows((data as ReportRow[]) || []);
      setStatus("");
    };
    void run();
  }, [supabase]);

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
      <section className="max-w-6xl mx-auto rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Moderation queue</h1>
          <Link href="/" className="border rounded px-3 py-2 text-sm">Back</Link>
        </div>

        {!!status && <p className="text-sm rounded border bg-amber-50 px-3 py-2">{status}</p>}

        {!status && (
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Context</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2 pr-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">{r.context_type}</td>
                    <td className="py-2 pr-3">{r.reason_code}</td>
                    <td className="py-2 pr-3">{r.status}</td>
                    <td className="py-2 pr-3">{r.severity}</td>
                    <td className="py-2 pr-3">{r.reported_user_id || "—"}</td>
                    <td className="py-2 pr-3">{r.details || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
