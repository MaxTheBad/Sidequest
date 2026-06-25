"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ListingClient from "../listing/[id]/listing-client";
import EditListingClient from "../listing/[id]/edit/edit-listing-client";
import ProfileClient from "../profile/[id]/profile-client";
import FriendsClient from "../profile/[id]/friends/friends-client";
import ReportClient from "../report/[kind]/[id]/report-client";

export default function DynamicRouteClient() {
  const pathname = usePathname();

  if (/^\/listing\/[^/]+\/edit\/?$/.test(pathname)) return <EditListingClient />;
  if (/^\/listing\/[^/]+\/?$/.test(pathname)) return <ListingClient />;
  if (/^\/profile\/[^/]+\/friends\/?$/.test(pathname)) return <FriendsClient />;
  if (/^\/profile\/[^/]+\/?$/.test(pathname)) return <ProfileClient />;
  if (/^\/report\/[^/]+\/[^/]+\/?$/.test(pathname)) return <ReportClient />;

  const deletionMatch = pathname.match(/^\/delete-account\/([^/]+)\/?$/);
  if (deletionMatch) {
    return (
      <main className="page-shell page-legal min-h-screen bg-transparent p-4">
        <section className="max-w-3xl mx-auto rounded-2xl border bg-white p-6 space-y-4">
          <h1 className="text-2xl font-bold">QuestHat Data Deletion</h1>
          <p className="text-sm text-gray-700">Your deletion request was received. Confirmation code:</p>
          <p className="rounded-xl bg-gray-50 border px-3 py-2 text-sm font-mono break-all">
            {decodeURIComponent(deletionMatch[1])}
          </p>
          <p className="text-sm text-gray-700">
            If you requested deletion through Facebook, this page serves as the status URL returned by the callback.
          </p>
          <p className="text-xs text-gray-500">
            Return to the <Link href="/" className="underline">QuestHat home page</Link> or review the{" "}
            <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6">
      <p>Page not found.</p>
    </main>
  );
}
