import Link from "next/link";
import { getServiceSupabase } from "@/lib/security-audit-server";

export const dynamic = "force-dynamic";

export default async function FacebookDeletionStatusPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const admin = getServiceSupabase();
  const { data } = admin
    ? await admin
      .from("facebook_data_deletion_requests")
      .select("status,requested_at,completed_at")
      .eq("confirmation_code", code)
      .maybeSingle()
    : { data: null };

  const completed = data?.status === "completed";
  const failed = data?.status === "failed";
  const processing = data?.status === "processing";
  const title = completed ? "Deletion completed" : failed ? "Deletion needs attention" : processing ? "Deletion request received" : "Deletion request not found";
  const body = completed
    ? "The QuestHat account and deletable personal data connected to that Facebook identity have been removed. If no matching QuestHat account existed, there was no stored account data to remove."
    : failed
      ? "We could not finish this request automatically. Contact QuestHat support with the confirmation code below so we can complete it."
      : processing
        ? "The deletion request is being processed. Return to this page later to check its status."
        : "This confirmation code is invalid, expired, or the deletion service is unavailable. Check the link Facebook provided or contact QuestHat support.";

  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="mx-auto max-w-2xl space-y-5 rounded-3xl border bg-white p-6 shadow-sm">
        <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${completed ? "bg-emerald-100 text-emerald-800" : failed || !processing ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
          {completed ? "Completed" : failed ? "Action required" : processing ? "Processing" : "Not found"}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-gray-700">{body}</p>
        </div>
        <div className="rounded-2xl border bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Confirmation code</p>
          <p className="mt-1 break-all font-mono text-sm text-gray-900">{code}</p>
        </div>
        <p className="text-sm text-gray-700">
          Need help? Email <a className="font-semibold underline" href={`mailto:support@questhat.com?subject=${encodeURIComponent(`Data deletion ${code}`)}`}>support@questhat.com</a> and include this confirmation code.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/privacy" className="rounded-full border px-4 py-2 font-medium">Privacy Policy</Link>
          <Link href="/" className="rounded-full border px-4 py-2 font-medium">Return to QuestHat</Link>
        </div>
      </section>
    </main>
  );
}
