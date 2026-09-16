import Link from "next/link";

const sectionClass = "space-y-2";
const bodyClass = "text-sm leading-6 text-gray-700";
const listClass = "list-disc space-y-1 pl-6 text-sm leading-6 text-gray-700";

export default function ChildSafetyPage() {
  return (
    <main className="page-shell page-legal min-h-screen bg-transparent p-4">
      <section className="mx-auto max-w-3xl space-y-5 rounded-2xl border bg-white p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">Safety standards</p>
          <h1 className="mt-1 text-2xl font-bold">QuestHat Child Safety Standards</h1>
          <p className="mt-2 text-sm text-gray-700">Effective September 16, 2026.</p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h2 className="font-semibold text-red-900">Zero tolerance for child sexual abuse and exploitation</h2>
          <p className="mt-2 text-sm leading-6 text-red-900">
            QuestHat, operated by Anlvio LLC, has zero tolerance for child sexual abuse and exploitation (CSAE) and
            child sexual abuse material (CSAM).
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Prohibited content and conduct</h2>
          <p className={bodyClass}>Users may not use QuestHat to create, upload, share, request, promote, distribute, or facilitate:</p>
          <ul className={listClass}>
            <li>Child sexual abuse material, including real, altered, computer-generated, or illustrated material.</li>
            <li>Child grooming, sextortion, sexual solicitation involving a minor, or attempts to arrange sexual contact with a minor.</li>
            <li>Sexualization, trafficking, exploitation, or endangerment of children.</li>
            <li>Links, instructions, coded language, or other activity intended to obtain, conceal, or distribute CSAM.</li>
          </ul>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Enforcement and reporting to authorities</h2>
          <p className={bodyClass}>
            QuestHat investigates child-safety reports and removes prohibited content when we obtain actual knowledge
            of it. We may immediately restrict, suspend, or permanently ban responsible accounts, preserve relevant
            evidence, and report confirmed CSAM and related information to the National Center for Missing &amp;
            Exploited Children (NCMEC), law enforcement, or the appropriate regional authority as required by
            applicable law. QuestHat complies with applicable child-safety laws and cooperates with lawful investigations.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">How to report a concern</h2>
          <p className={bodyClass}>
            Use the in-app Report tools to report a listing, profile, message, or behavior. Select “Child safety or
            sexual exploitation” when available and include enough information for our safety team to locate the
            content or account. Urgent child-safety concerns may also be sent to{" "}
            <a href="mailto:reports@questhat.com?subject=Urgent%20QuestHat%20child-safety%20report" className="font-medium underline">
              reports@questhat.com
            </a>.
          </p>
          <p className={bodyClass}>
            If a child is in immediate danger, contact local emergency services or the appropriate law-enforcement agency.
          </p>
        </div>

        <div className={sectionClass}>
          <h2 className="font-semibold">Child-safety point of contact</h2>
          <p className={bodyClass}>
            QuestHat Safety Team<br />
            Anlvio LLC<br />
            <a href="mailto:reports@questhat.com" className="font-medium underline">reports@questhat.com</a>
          </p>
        </div>

        <p className={bodyClass}>
          These standards supplement the QuestHat <Link href="/terms" className="font-medium underline">Terms of Use</Link> and{" "}
          <Link href="/privacy" className="font-medium underline">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
}
