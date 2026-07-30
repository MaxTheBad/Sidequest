export default function EulaTerms() {
  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="mx-auto max-w-3xl space-y-5 rounded-2xl border bg-white p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">End User License Agreement</p>
          <h1 className="mt-1 text-2xl font-bold">QuestHat EULA and Terms of Use</h1>
          <p className="mt-2 text-sm text-gray-700">Effective July 30, 2026. EULA version 2026-07-30.</p>
        </div>

        <p className="text-sm leading-6 text-gray-700">
          You must accept this EULA before using QuestHat. By accepting it, you agree to follow these rules whenever
          you create a listing, profile, comment, message, image, video, or other content, or interact with another user.
        </p>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h2 className="font-semibold text-red-900">Zero tolerance for objectionable content and abusive users</h2>
          <p className="mt-2 text-sm leading-6 text-red-900">
            QuestHat has no tolerance for objectionable content or abusive users. Prohibited conduct includes threats,
            harassment, bullying, hate speech, discriminatory slurs, sexual exploitation, explicit sexual content,
            scams, impersonation, encouragement of self-harm, illegal activity, stalking, intimidation, or content that
            creates a credible risk of harm.
          </p>
        </div>

        <div>
          <h2 className="font-semibold">Content filtering</h2>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            QuestHat uses automated filters to reject known categories of objectionable text in profiles, listings,
            comments, and messages. Filters supplement human moderation and may not identify every violation. Users
            must still report content that should be reviewed.
          </p>
        </div>

        <div>
          <h2 className="font-semibold">Reporting objectionable content</h2>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            Use the Report action available from listing and profile menus to flag objectionable content or behavior.
            Reports are sent to the QuestHat moderation queue and include the relevant account or listing context.
          </p>
        </div>

        <div>
          <h2 className="font-semibold">Blocking abusive users</h2>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            Use the Block action on a user profile or member entry. Blocking immediately removes that user&apos;s listings,
            messages, and comments from your experience, prevents further direct interaction, and automatically sends
            a moderation alert to QuestHat for review. You can manage blocked users in Settings.
          </p>
        </div>

        <div>
          <h2 className="font-semibold">24-hour moderation response</h2>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            QuestHat will review objectionable-content and abusive-user reports within 24 hours. When a violation is
            confirmed, QuestHat will remove the offending content and eject, suspend, or permanently ban the user who
            provided it. Immediate action may be taken sooner where there is a safety risk.
          </p>
        </div>

        <div>
          <h2 className="font-semibold">Your responsibilities</h2>
          <ul className="mt-1 list-disc space-y-1 pl-6 text-sm leading-6 text-gray-700">
            <li>Do not create or distribute prohibited content.</li>
            <li>Do not abuse, threaten, deceive, or harass another person.</li>
            <li>Use accurate account information and protect your login credentials.</li>
            <li>Use caution for in-person plans and meet in public places first.</li>
            <li>Report safety concerns promptly and contact emergency services for immediate danger.</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold">Enforcement and termination</h2>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            QuestHat may remove content, restrict features, suspend accounts, or permanently terminate users who
            violate this EULA. Serious or repeated violations may be reported to relevant authorities where required.
          </p>
        </div>

        <div>
          <h2 className="font-semibold">Privacy and account controls</h2>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            QuestHat stores account, content, safety, and moderation data needed to operate and protect the service.
            Profile controls, temporary deactivation, permanent deletion, blocked users, and notification preferences
            are available in Settings. See the Privacy Policy for additional details.
          </p>
        </div>

        <p className="text-sm text-gray-700">
          Questions or urgent moderation concerns can be sent to reports@questhat.com or support@questhat.com.
        </p>
      </section>
    </main>
  );
}
