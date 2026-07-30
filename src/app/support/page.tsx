import Link from "next/link";

const SUPPORT_EMAILS = ["support@questhat.com", "cs@questhat.com"];

export default function SupportPage() {
  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="mx-auto max-w-3xl space-y-5 rounded-2xl border bg-white p-6">
        <h1 className="text-2xl font-bold">QuestHat Support</h1>
        <p className="text-sm text-gray-700">
          Need help with your QuestHat account, a quest, or something on the site? Reach out by email and we’ll get back to you as soon as we can.
        </p>

        <div className="space-y-2">
          <h2 className="font-semibold">Email support</h2>
          <ul className="list-disc space-y-1 pl-6 text-sm text-gray-700">
            {SUPPORT_EMAILS.map((email) => (
              <li key={email}>
                <a href={`mailto:${email}`} className="font-medium underline underline-offset-4">
                  {email}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="font-semibold">What to include</h2>
          <ul className="list-disc space-y-1 pl-6 text-sm text-gray-700">
            <li>Your account email or username.</li>
            <li>A short description of the issue.</li>
            <li>Screenshots if something looks broken.</li>
          </ul>
        </div>

        <p className="text-sm text-gray-700">
          For privacy requests or account deletion, see the{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/delete-account" className="underline underline-offset-4">
            data deletion page
          </Link>
          .
        </p>

        <p className="text-xs text-gray-500">Last updated: July 2026</p>
      </section>
    </main>
  );
}
