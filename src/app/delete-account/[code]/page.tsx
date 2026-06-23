import Link from "next/link";

export default async function DeleteAccountStatusPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="max-w-3xl mx-auto rounded-2xl border bg-white p-6 space-y-4">
        <h1 className="text-2xl font-bold">QuestHat Data Deletion</h1>
        <p className="text-sm text-gray-700">
          Your deletion request was received. Confirmation code:
        </p>
        <p className="rounded-xl bg-gray-50 border px-3 py-2 text-sm font-mono break-all">{code}</p>
        <p className="text-sm text-gray-700">
          If you requested deletion through Facebook, this page serves as the status URL returned by the callback.
        </p>
        <p className="text-xs text-gray-500">
          Return to the <Link href="/" className="underline">QuestHat home page</Link> or review the <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
}
