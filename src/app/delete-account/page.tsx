import Link from "next/link";

export default function DeleteAccountPage() {
  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="max-w-3xl mx-auto rounded-2xl border bg-white p-6 space-y-4">
        <h1 className="text-2xl font-bold">QuestHat Data Deletion</h1>
        <p className="text-sm text-gray-700">
          If you want your QuestHat account and personal data deleted, use this page as the public deletion request
          path.
        </p>

        <h2 className="font-semibold">How to request deletion</h2>
        <ol className="list-decimal pl-6 text-sm text-gray-700 space-y-1">
          <li>Send a deletion request from the email address tied to your QuestHat account.</li>
          <li>Include the subject line <span className="font-medium">QuestHat data deletion request</span>.</li>
          <li>Include your account email and confirm that you want your account and associated profile data removed.</li>
        </ol>

        <h2 className="font-semibold">What we delete</h2>
        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
          <li>Your profile information stored in QuestHat.</li>
          <li>Any public profile photo and profile metadata tied to your account.</li>
          <li>Content you created in the app, where deletion is technically possible and permitted by law.</li>
        </ul>

        <h2 className="font-semibold">What may remain</h2>
        <p className="text-sm text-gray-700">
          We may retain certain records where required for safety, fraud prevention, legal obligations, or abuse
          prevention.
        </p>

        <h2 className="font-semibold">Where to send it</h2>
        <p className="text-sm text-gray-700">
          Send your request to the QuestHat support channel used for account help, and mention that you are requesting
          deletion under the app&apos;s data deletion process.
        </p>

        <p className="text-xs text-gray-500">
          You can also return to the <Link href="/" className="underline">QuestHat home page</Link> or review the <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
}
