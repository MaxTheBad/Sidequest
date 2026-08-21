import Link from "next/link";

const sectionClass = "space-y-2";
const bodyClass = "text-sm leading-6 text-gray-700";
const listClass = "list-disc space-y-1 pl-6 text-sm leading-6 text-gray-700";

export default function PrivacyPage() {
  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="mx-auto max-w-3xl space-y-5 rounded-2xl border bg-white p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">Privacy notice</p>
          <h1 className="mt-1 text-2xl font-bold">QuestHat Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-700">Effective and last updated August 20, 2026.</p>
        </div>

        <p className={bodyClass}>
          QuestHat is operated by Anlvio LLC ("QuestHat," "we," "us," or "our"). This policy applies to
          questhat.com and the QuestHat apps for iOS and Android. It explains what information we collect, why we use
          it, when we share it, and the choices available to you.
        </p>

        <div className={sectionClass}>
          <h2 className="font-semibold">Information we collect</h2>
          <ul className={listClass}>
            <li><strong>Account and identity:</strong> email address, user ID, authentication method, login metadata, and account status.</li>
            <li><strong>Profile and social information:</strong> name, username, profile photo, bio, city or region, friend relationships, blocks, and the visibility choices you make.</li>
            <li><strong>Content and communications:</strong> quests, comments, direct messages, join requests, reports, photos, videos, audio, and other content you submit.</li>
            <li><strong>Meetup and location information:</strong> city or region, meeting links, exact meetup locations you submit, and event check-in status and time. When you grant location permission, precise device location is ordinarily processed and cached on your device to calculate distance and apply location-based safety controls rather than stored in your QuestHat profile. When you check in, your current coordinates are transmitted securely and used transiently to verify that you are within the permitted radius; we store the check-in status and time, not the coordinates submitted for that verification. Exact meetup locations are stored and limited according to the host&apos;s selected access controls.</li>
            <li><strong>Device and usage information:</strong> IP address, browser or user-agent, device and operating-system type, app version, timestamps, security events, local preferences, crash or diagnostic information, and interactions needed to operate and protect the service.</li>
            <li><strong>Notifications:</strong> push token, notification preferences, delivery information, and Live Activity token or state when you enable those features.</li>
            <li><strong>Support and safety:</strong> correspondence, reports, evidence you submit, moderation decisions, and records used to investigate abuse, fraud, or safety incidents.</li>
          </ul>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Social sign-in</h2>
          <p className={bodyClass}>
            If you choose Apple, Facebook, Google, or X to sign in, that provider sends us an account identifier and
            the profile information you authorize, which may include your name, profile photo, and email address. A
            provider may not supply an email address. We use this data to authenticate you and create or connect your
            QuestHat account. We do not receive your provider password. Consumer sign-in does not authorize QuestHat
            to publish on your behalf.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Optional social publishing</h2>
          <p className={bodyClass}>
            If we offer and you use an optional feature to connect a Facebook Page, Instagram professional account, or
            X account, we may receive the connected account or Page ID, display name, username, granted permissions,
            authorization tokens, token-expiration information, and publishing results such as a post or media ID,
            status, timestamp, and error message. We use this information only to show your available destinations,
            perform actions you expressly request, maintain or troubleshoot the connection, prevent abuse, and comply
            with the connected platform&apos;s rules.
          </p>
          <ul className={listClass}>
            <li>Connecting an account is not permission to publish.</li>
            <li>Before publishing, QuestHat must show what will be posted and where. Publishing requires a separate, informed action from you.</li>
            <li>We send the selected text and media to Meta or X only when you request that destination. We do not add hashtags, location data, or other content without showing it to you first.</li>
            <li>We do not use connected-platform data for surveillance, sensitive-trait inference, advertising profiles, or training artificial-intelligence models.</li>
            <li>Content published to an external platform is also governed by that platform&apos;s terms and privacy policy and may remain there until you delete it through that platform.</li>
          </ul>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">How we use information</h2>
          <ul className={listClass}>
            <li>Provide accounts, discovery, maps, meetup coordination, messaging, media, notifications, safety controls, and support.</li>
            <li>Personalize nearby results and settings based on choices you make.</li>
            <li>Authenticate requests, secure accounts, detect bots, spam, fraud, unsafe behavior, and policy violations.</li>
            <li>Moderate content, investigate reports, enforce our Terms, and protect users, QuestHat, and the public.</li>
            <li>Send transactional messages and, only when you opt in, marketing messages.</li>
            <li>Comply with law and the rules of app stores and connected platforms.</li>
          </ul>
          <p className={bodyClass}>
            Depending on where you live, we rely on performance of our contract, your consent, our legitimate interests
            in operating and protecting QuestHat, and compliance with legal obligations. You may withdraw consent for
            optional permissions or marketing at any time; withdrawal does not affect earlier lawful processing.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">When we share information</h2>
          <p className={bodyClass}>We do not sell personal information. We share it only in these circumstances:</p>
          <ul className={listClass}>
            <li><strong>Other users:</strong> according to the feature and privacy settings you select. Private messages and restricted meetup details are shown only to authorized participants. Approved quest participants may see that you checked in and when, but they do not receive the precise coordinates used to verify your arrival.</li>
            <li><strong>At your direction:</strong> with Meta or X when you expressly choose to publish or perform another disclosed action.</li>
            <li><strong>Service providers:</strong> with vendors that provide authentication, database hosting and storage, email, notifications, maps and geocoding, media delivery, bot protection, security, and app distribution. They may use data only to provide services to us and must protect it consistently with this policy and applicable platform rules.</li>
            <li><strong>Legal and safety:</strong> when reasonably necessary to comply with law, protect rights or safety, investigate abuse, or enforce our agreements.</li>
            <li><strong>Business changes:</strong> as part of a merger, financing, acquisition, or sale, subject to appropriate confidentiality and notice where required.</li>
          </ul>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Permissions and local data</h2>
          <p className={bodyClass}>
            Camera, microphone, photo-library, location, and notification access are requested only when relevant to a
            feature. You can deny or revoke them in iOS, Android, or browser settings, although the related feature may
            stop working. Some preferences and a recent location used for distance estimates may be stored locally on
            your device. Enabling notifications does not itself share your precise location. A feature that shares live
            or precise location with another user would require a separate, clear choice before that sharing begins.
            Cloudflare Turnstile processes technical and interaction signals on protected forms to detect
            automated abuse.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Retention, disconnection, and deletion</h2>
          <p className={bodyClass}>
            We keep account information and user content while your account is active and as needed to provide the
            service. We retain limited security, fraud-prevention, moderation, transaction, and legal records only as
            long as reasonably necessary for those purposes. Backup copies are isolated from ordinary use and removed
            through our normal backup cycle, unless preservation is legally required.
          </p>
          <ul className={listClass}>
            <li>You can disconnect a connected provider through that provider&apos;s settings. Disconnection stops future access but does not delete content already published there.</li>
            <li>When a social connection or QuestHat account is deleted, we delete or disable the associated authorization credentials and connected-account data unless retention is legally required.</li>
            <li>When X content is deleted, restricted, or changed, we will update or remove any copy we are required to maintain as soon as reasonably possible and within 24 hours after a valid request or notice when X&apos;s rules require it.</li>
            <li>You can permanently delete your QuestHat account in Settings → Account. You can also use our <Link href="/delete-account" className="font-medium underline">public account-deletion page</Link>.</li>
          </ul>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Your choices and rights</h2>
          <ul className={listClass}>
            <li>Review or update profile, privacy, notification, location, and marketing choices in Settings.</li>
            <li>Revoke device permission through your device settings and connected-platform permission through the provider.</li>
            <li>Request access, correction, deletion, restriction, objection, or a portable copy where applicable law provides those rights.</li>
            <li>Appeal to your local data-protection authority where applicable.</li>
          </ul>
          <p className={bodyClass}>We may verify your identity before fulfilling a request. We will not discriminate against you for exercising a privacy right.</p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Security and international processing</h2>
          <p className={bodyClass}>
            We use reasonable administrative, technical, and organizational safeguards, including access controls and
            encrypted network transport. No system is completely secure. QuestHat and its providers may process data
            in the United States and other countries, subject to applicable transfer protections.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Children</h2>
          <p className={bodyClass}>
            QuestHat is not directed to children under 13, and we do not knowingly collect personal information from
            them. If you believe a child has provided information, contact us so we can investigate and delete it.
            Additional minimum-age rules may apply where you live.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Third-party policies</h2>
          <p className={bodyClass}>
            Your use of a connected service is also governed by that service&apos;s policy: <a className="underline" href="https://x.com/en/privacy" target="_blank" rel="noreferrer">X</a>,{" "}
            <a className="underline" href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noreferrer">Facebook</a>,{" "}
            <a className="underline" href="https://privacycenter.instagram.com/policy/" target="_blank" rel="noreferrer">Instagram</a>,{" "}
            <a className="underline" href="https://www.apple.com/legal/privacy/" target="_blank" rel="noreferrer">Apple</a>, and{" "}
            <a className="underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google</a>.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Changes and contact</h2>
          <p className={bodyClass}>
            We may update this policy as QuestHat changes. We will update the date above and provide additional notice
            when required. For privacy questions or requests, contact Anlvio LLC at{" "}
            <a href="mailto:support@questhat.com" className="font-medium underline">support@questhat.com</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
