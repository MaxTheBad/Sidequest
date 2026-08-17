import Link from "next/link";

export default function DeleteAccountPage() {
  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="max-w-3xl mx-auto rounded-2xl border bg-white p-6 space-y-4">
        <h1 className="text-2xl font-bold">QuestHat Data Deletion</h1>
        <p className="text-sm text-gray-700">
          You can permanently delete your QuestHat account and associated personal data directly from the app or website.
        </p>

        <h2 className="font-semibold">Delete from QuestHat</h2>
        <ol className="list-decimal pl-6 text-sm text-gray-700 space-y-1">
          <li>Sign in to QuestHat on the website or in the mobile app.</li>
          <li>Open <span className="font-medium">Settings → Account</span>.</li>
          <li>Select <span className="font-medium">Delete permanently</span>, type DELETE, and confirm.</li>
        </ol>

        <Link href="/settings" className="inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Open account settings</Link>

        <h2 className="font-semibold">Delete through Facebook</h2>
        <p className="text-sm text-gray-700">
          You can also remove QuestHat from Facebook&apos;s Apps and Websites settings and request deletion there. Facebook sends QuestHat a signed deletion request. We delete the matching QuestHat account and provide Facebook with a confirmation code and status link.
        </p>

        <h2 className="font-semibold">What we delete</h2>
        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
          <li>Your profile information stored in QuestHat.</li>
          <li>Any public profile photo and profile metadata tied to your account.</li>
          <li>Quests, messages, comments, memberships, saved items, notifications, and uploaded media tied to your account.</li>
          <li>Your QuestHat authentication account and connected Facebook identity.</li>
        </ul>

        <h2 className="font-semibold">What may remain</h2>
        <p className="text-sm text-gray-700">
          We may retain certain records where required for safety, fraud prevention, legal obligations, or abuse
          prevention.
        </p>

        <h2 className="font-semibold">If you cannot sign in</h2>
        <p className="text-sm text-gray-700">
          Email <a href="mailto:support@questhat.com?subject=QuestHat%20data%20deletion%20request" className="font-medium underline">support@questhat.com</a>. Include your username, account email or connected phone/provider details, and state that you want the account permanently deleted. We may ask for verification before deleting data to prevent unauthorized requests.
        </p>

        <h2 className="font-semibold">Timing</h2>
        <p className="text-sm text-gray-700">
          Direct in-app requests are initiated immediately. Support-assisted requests are completed after identity verification. Residual backups and records retained for legal, fraud-prevention, or safety purposes are removed or anonymized according to our retention obligations.
        </p>

        <p className="text-xs text-gray-500">
          You can also return to the <Link href="/" className="underline">QuestHat home page</Link> or review the <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
}
