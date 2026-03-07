export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
      <section className="max-w-3xl mx-auto rounded-2xl border bg-white p-6 space-y-4">
        <h1 className="text-2xl font-bold">Side Quest Terms</h1>
        <p className="text-sm text-gray-700">
          By creating an account, you agree to use Side Quest responsibly, respect other users, and avoid harmful,
          illegal, or abusive behavior.
        </p>
        <h2 className="font-semibold">Community & Safety</h2>
        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
          <li>No harassment, hate, scams, impersonation, or illegal activity.</li>
          <li>Use caution when meeting people in person; choose public places first.</li>
          <li>Report unsafe behavior through in-app tools when available.</li>
        </ul>
        <h2 className="font-semibold">Account</h2>
        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
          <li>You are responsible for your account and login credentials.</li>
          <li>Provide accurate information during sign-up.</li>
          <li>We may suspend accounts that violate these terms.</li>
        </ul>
        <h2 className="font-semibold">Privacy</h2>
        <p className="text-sm text-gray-700">
          We store account/profile data needed to run the app. Optional marketing consent can be changed later in
          account settings.
        </p>
        <p className="text-xs text-gray-500">Last updated: March 2026</p>
      </section>
    </main>
  );
}
