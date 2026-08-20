import Link from "next/link";

const sectionClass = "space-y-2";
const bodyClass = "text-sm leading-6 text-gray-700";
const listClass = "list-disc space-y-1 pl-6 text-sm leading-6 text-gray-700";

export default function EulaTerms() {
  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="mx-auto max-w-3xl space-y-5 rounded-2xl border bg-white p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">Terms of Use</p>
          <h1 className="mt-1 text-2xl font-bold">QuestHat Terms of Use and EULA</h1>
          <p className="mt-2 text-sm text-gray-700">Effective August 20, 2026.</p>
        </div>

        <p className={bodyClass}>
          These Terms are an agreement between you and Anlvio LLC, the operator of QuestHat ("QuestHat," "we," or
          "us"). They govern questhat.com and the QuestHat iOS and Android apps. By creating an account, accepting
          these Terms, or using QuestHat, you agree to them and to our <Link href="/privacy" className="font-medium underline">Privacy Policy</Link>.
          If you do not agree, do not use QuestHat.
        </p>

        <div className={sectionClass}>
          <h2 className="font-semibold">Eligibility and accounts</h2>
          <ul className={listClass}>
            <li>You must be legally able to enter this agreement and meet the minimum age required where you live. QuestHat is not for children under 13.</li>
            <li>Provide accurate information, keep your credentials secure, and promptly report unauthorized access.</li>
            <li>You are responsible for activity performed through your account and may not sell, transfer, impersonate, or create deceptive accounts.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h2 className="font-semibold text-red-900">Zero tolerance for objectionable content and abusive users</h2>
          <p className="mt-2 text-sm leading-6 text-red-900">
            Threats, harassment, bullying, hate speech, discriminatory slurs, sexual exploitation, explicit sexual
            content, scams, impersonation, stalking, intimidation, encouragement of self-harm, illegal activity, and
            content that creates a credible risk of harm are prohibited. QuestHat may remove content or suspend or ban
            accounts for violations.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Real-world plans and safety</h2>
          <p className={bodyClass}>
            QuestHat helps people discover and coordinate plans; it does not organize, supervise, insure, endorse, or
            perform background checks on users or meetups. Use judgment, meet in public first, protect private details,
            arrange your own transportation, and tell someone you trust where you are going. QuestHat is not an
            emergency service. Contact local emergency services if anyone is in immediate danger.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Your content</h2>
          <p className={bodyClass}>
            You retain ownership of content you submit. You represent that you have the rights and permissions needed
            to use it and that it does not violate law or another person&apos;s rights. You grant QuestHat a worldwide,
            non-exclusive, royalty-free license to host, store, reproduce, adapt for technical formatting, display, and
            distribute your content only as needed to operate, secure, moderate, and improve QuestHat and to perform
            actions you request. This license ends when the content is deleted, except for limited backup, legal,
            safety, or technical retention described in the Privacy Policy.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Connected accounts and social publishing</h2>
          <p className={bodyClass}>
            QuestHat may let you sign in with or optionally connect Apple, Facebook, Google, Instagram, or X. The
            external platform is independent from QuestHat, and its own terms, privacy policy, permissions, limits, and
            content rules also apply.
          </p>
          <ul className={listClass}>
            <li>Social sign-in authenticates your QuestHat account; it does not authorize QuestHat to publish.</li>
            <li>If publishing is offered, QuestHat will show the content and destination before publishing. You must expressly request each post. Do not connect an account you are not authorized to manage.</li>
            <li>You remain responsible for the text, media, links, location data, hashtags, and audience you approve, and for removing content from the external platform when desired.</li>
            <li>You may not use QuestHat to send spam, conduct bulk or aggressive actions, post substantially duplicative content across accounts, manipulate engagement, evade platform limits, or mislead people about automated activity.</li>
            <li>We may refuse or stop an external action, disconnect an integration, or remove a feature to protect users, comply with platform rules, or respond to API availability or permission changes.</li>
          </ul>
          <p className={bodyClass}>
            You authorize QuestHat to transmit content and instructions to the destination you select solely to carry
            out your request. You can revoke a connection through the provider; see our <Link href="/delete-account" className="font-medium underline">deletion and disconnection instructions</Link>.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Prohibited conduct</h2>
          <ul className={listClass}>
            <li>Do not threaten, deceive, harass, discriminate against, exploit, or endanger another person.</li>
            <li>Do not post illegal, infringing, sexually exploitative, fraudulent, malicious, or privacy-invasive content.</li>
            <li>Do not scrape QuestHat or a connected platform, harvest credentials, bypass access controls or rate limits, distribute malware, reverse engineer except where law permits, or interfere with the service.</li>
            <li>Do not expose private meetup details to unauthorized people or use location or social-platform data for surveillance, background checks, sensitive-trait inference, or artificial-intelligence model training.</li>
            <li>Do not use unofficial browser automation to mimic user actions on Facebook, Instagram, X, or another connected service.</li>
          </ul>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Moderation, reporting, and blocking</h2>
          <p className={bodyClass}>
            QuestHat may use automated filters and human review. Use Report to flag content or behavior and Block to
            stop direct interaction. We aim to review objectionable-content and abusive-user reports within 24 hours
            and may remove content, restrict features, suspend or terminate accounts, preserve evidence, or notify
            authorities where appropriate. Filters may make mistakes and do not replace your own safety judgment.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">QuestHat property and limited license</h2>
          <p className={bodyClass}>
            QuestHat&apos;s software, branding, design, and non-user content are owned by Anlvio LLC or its licensors. We
            grant you a personal, limited, revocable, non-exclusive, non-transferable license to use the service for its
            intended purpose under these Terms. No other rights are granted.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Account suspension, termination, and deletion</h2>
          <p className={bodyClass}>
            You may stop using QuestHat or permanently delete your account from Settings → Account. We may remove
            content or restrict, suspend, or terminate access for violations, legal requirements, risk to users or the
            service, or discontinued features. Provisions that by their nature should survive—including ownership,
            disclaimers, limitations, and dispute terms—survive termination.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Third-party services and app stores</h2>
          <p className={bodyClass}>
            Third-party services may be unavailable, change their rules, or remove content or access. QuestHat is not
            responsible for third-party services. You must follow applicable third-party terms when using them.
          </p>
          <p className={bodyClass}>
            If you downloaded QuestHat from Apple, Apple&apos;s Standard Licensed Application End User License Agreement
            applies to the app license and these Terms supplement it. Apple is not responsible for maintenance,
            support, warranties, claims, or intellectual-property issues relating to QuestHat, and Apple and its
            subsidiaries are third-party beneficiaries of these Terms. If downloaded from Google Play, Google Play&apos;s
            terms apply in addition to these Terms. Anlvio LLC, not Apple or Google, is responsible for QuestHat and
            support for it.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Disclaimers</h2>
          <p className={bodyClass}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, QUESTHAT IS PROVIDED "AS IS" AND "AS AVAILABLE." ANLVIO LLC
            DISCLAIMS IMPLIED WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
            NON-INFRINGEMENT, AND WARRANTIES ARISING FROM COURSE OF DEALING. WE DO NOT GUARANTEE THAT USERS, CONTENT,
            MEETUPS, EXTERNAL POSTS, OR THE SERVICE WILL BE SAFE, ACCURATE, AVAILABLE, OR ERROR-FREE. Some jurisdictions
            do not permit certain disclaimers, so they may not apply to you.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Limitation of liability</h2>
          <p className={bodyClass}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, ANLVIO LLC AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND LICENSORS
            WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, LOST
            PROFITS OR DATA, OR HARM ARISING FROM USER CONDUCT, A MEETUP, OR A THIRD-PARTY PLATFORM. OUR TOTAL LIABILITY
            FOR CLAIMS RELATING TO QUESTHAT WILL NOT EXCEED THE GREATER OF $100 OR THE AMOUNT YOU PAID QUESTHAT IN THE
            12 MONTHS BEFORE THE CLAIM. These limits do not apply where prohibited by law.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Governing law and changes</h2>
          <p className={bodyClass}>
            These Terms are governed by Florida law, excluding conflict-of-law rules, except where consumer law in your
            location requires otherwise. We may update these Terms as the service or applicable rules change. We will
            post the effective date and give additional notice or request renewed acceptance when required. Continued
            use after an update takes effect means you accept the revised Terms where permitted by law.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Contact</h2>
          <p className={bodyClass}>
            QuestHat is operated by Anlvio LLC. Contact <a href="mailto:support@questhat.com" className="font-medium underline">support@questhat.com</a> for support,{" "}
            <a href="mailto:reports@questhat.com" className="font-medium underline">reports@questhat.com</a> for urgent moderation concerns, or use our <Link href="/support" className="font-medium underline">Support page</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
