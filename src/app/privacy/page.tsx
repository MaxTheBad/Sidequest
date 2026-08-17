import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="max-w-3xl mx-auto rounded-2xl border bg-white p-6 space-y-4">
        <h1 className="text-2xl font-bold">QuestHat Privacy Policy</h1>
        <p className="text-sm text-gray-700">
          QuestHat collects and stores the information needed to run the app, including account details, profile
          information, content you create, device permissions you choose to grant, and basic usage data.
        </p>

        <h2 className="font-semibold">What We Collect</h2>
        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
          <li>Account information such as email address, authentication-provider identifier, and login metadata. A provider may not supply an email address.</li>
          <li>Profile details you choose to share, such as name, photo, bio, city, and location.</li>
          <li>Content you create, including quests, messages, reports, and private meetup details. Exact meetup locations are restricted to authorized participants and hosts.</li>
          <li>Photos, videos, and audio you select or record for profiles, quests, messages, or safety reports.</li>
          <li>Approximate or precise device location when you grant location permission, used for nearby results, distance, maps, and location-based safety controls.</li>
          <li>Device and notification identifiers, such as push tokens, notification preferences, app version, and operating system.</li>
          <li>Security and usage information such as IP address, browser/user-agent, device type, Cloudflare request metadata, timestamps, and bot-protection results.</li>
        </ul>

        <h2 className="font-semibold">How We Use Data</h2>
        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
          <li>To create and manage your account.</li>
          <li>To match users, show content, and support core app features.</li>
          <li>To provide maps, nearby quests, distance estimates, meetup coordination, media, and notifications that you request.</li>
          <li>To detect abuse, improve safety, and maintain service quality.</li>
          <li>To investigate spam, fake accounts, unsafe behavior, account abuse, and policy violations.</li>
          <li>To send important account and product emails.</li>
        </ul>

        <h2 className="font-semibold">Social Login Providers</h2>
        <p className="text-sm text-gray-700">
          If you use Facebook, Apple, or Google to sign in, QuestHat receives the provider identifier and profile information you authorize, such as your name, profile photo, or email address. We use this information only to authenticate you, create or connect your QuestHat account, and provide the service. QuestHat does not request access to your Facebook friends, posts, advertising account, or Page-management data for consumer sign-in.
        </p>

        <h2 className="font-semibold">Bot Protection</h2>
        <p className="text-sm text-gray-700">
          We use Cloudflare Turnstile to help protect signup, reporting, and other sensitive forms from automated abuse.
        </p>
        <p className="text-sm text-gray-700">
          Turnstile may process technical information about your browser and interaction with the protected form to
          determine whether the submission appears to be from a human or an automated source.
        </p>

        <h2 className="font-semibold">Sharing</h2>
        <p className="text-sm text-gray-700">
          We do not sell your personal information. We share data only as needed with service providers that help
          operate authentication, hosting and storage, notifications, maps and geocoding, email, media delivery, and
          abuse prevention. These providers include Supabase, Firebase/Google, Apple, Meta, Cloudflare, and mapping
          providers. We may also disclose information if required by law or to protect users and the service.
        </p>

        <h2 className="font-semibold">Your Choices</h2>
        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
          <li>You can update profile details in Settings.</li>
          <li>You can deny or later change camera, microphone, photo, location, and notification permissions in your device settings. Some related features will then be unavailable.</li>
          <li>You can change marketing preferences in account settings.</li>
          <li>You can permanently delete your account inside Settings → Account on the website or mobile app.</li>
          <li>You can request deletion through Facebook&apos;s Apps and Websites controls or follow our <Link href="/delete-account" className="underline">public deletion instructions</Link>.</li>
        </ul>

        <h2 className="font-semibold">Security and Retention</h2>
        <p className="text-sm text-gray-700">
          We use reasonable safeguards to protect the information we store. We keep data only as long as needed to
          provide the service, meet legal obligations, resolve disputes, and enforce our policies.
        </p>
        <p className="text-sm text-gray-700">
          Raw IP addresses and similar security logs are used for abuse prevention and investigation. Access is limited
          to operational and moderation needs, and these records should not be used for advertising targeting.
        </p>

        <h2 className="font-semibold">Contact</h2>
        <p className="text-sm text-gray-700">
          If you have questions about privacy or data handling, email <a href="mailto:support@questhat.com" className="underline">support@questhat.com</a>. You can also use the public data deletion instructions page linked in the footer.
        </p>

        <p className="text-xs text-gray-500">Last updated: August 16, 2026</p>
      </section>
    </main>
  );
}
