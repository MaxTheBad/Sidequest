export default function PrivacyPage() {
  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="max-w-3xl mx-auto rounded-2xl border bg-white p-6 space-y-4">
        <h1 className="text-2xl font-bold">QuestHat Privacy Policy</h1>
        <p className="text-sm text-gray-700">
          QuestHat collects and stores the information needed to run the app, including account details, profile
          information, content you create, and basic usage data.
        </p>

        <h2 className="font-semibold">What We Collect</h2>
        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
          <li>Account information such as email address and login metadata.</li>
          <li>Profile details you choose to share, such as name, photo, bio, and location.</li>
          <li>Content you create, including quests, messages, and reports.</li>
          <li>Device and usage information needed for security, analytics, and app reliability.</li>
        </ul>

        <h2 className="font-semibold">How We Use Data</h2>
        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
          <li>To create and manage your account.</li>
          <li>To match users, show content, and support core app features.</li>
          <li>To detect abuse, improve safety, and maintain service quality.</li>
          <li>To send important account and product emails.</li>
        </ul>

        <h2 className="font-semibold">Sharing</h2>
        <p className="text-sm text-gray-700">
          We do not sell your personal information. We may share data with service providers that help operate the
          app, and we may disclose information if required by law or to protect users and the service.
        </p>

        <h2 className="font-semibold">Your Choices</h2>
        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
          <li>You can update profile details in Settings.</li>
          <li>You can change marketing preferences in account settings.</li>
          <li>You can request account removal if you no longer want to use the app.</li>
        </ul>

        <h2 className="font-semibold">Security and Retention</h2>
        <p className="text-sm text-gray-700">
          We use reasonable safeguards to protect the information we store. We keep data only as long as needed to
          provide the service, meet legal obligations, resolve disputes, and enforce our policies.
        </p>

        <h2 className="font-semibold">Contact</h2>
        <p className="text-sm text-gray-700">
          If you have questions about privacy or data handling, contact the QuestHat team through the app or the
          support channel you use for account help. You can also use the public data deletion instructions page linked
          in the footer.
        </p>

        <p className="text-xs text-gray-500">Last updated: June 2026</p>
      </section>
    </main>
  );
}
