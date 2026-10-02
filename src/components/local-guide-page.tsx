import Image from "next/image";
import Link from "next/link";
import type { LocalGuide } from "@/content/local-guides";

const APP_STORE_URL = "https://apps.apple.com/us/app/questhat/id6787166004";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.questhat.app";

function guideHref(slug: string) {
  return `/south-florida/${slug}`;
}

export default function LocalGuidePage({ guide, related }: { guide: LocalGuide; related: LocalGuide[] }) {
  const noun = guide.kind === "city" ? guide.name : guide.county;

  return (
    <main className="local-guide-page mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-7 text-sm text-slate-500">
        <Link href="/" className="hover:text-[#0c5063] hover:underline">QuestHat</Link><span aria-hidden="true"> / </span>
        <span>South Florida</span><span aria-hidden="true"> / </span><span aria-current="page">{guide.name}</span>
      </nav>

      <section className="overflow-hidden rounded-[2rem] border border-[#b6dbe2] bg-[#061923] text-white shadow-[0_24px_70px_rgba(5,38,49,.16)]">
        <div className="grid gap-8 px-6 py-9 sm:px-10 sm:py-12 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
          <div>
            <p className="text-xs font-extrabold tracking-[.18em] text-cyan-200">QUESTHAT IN SOUTH FLORIDA</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.02] tracking-[-.045em] sm:text-5xl">{guide.h1}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-200">{guide.intro}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/create" className="rounded-full bg-[#73d7e8] px-5 py-3 text-sm font-extrabold text-[#06232d] transition hover:bg-[#a6edf5]">Host a {guide.name} activity</Link>
              <Link href="/app" className="rounded-full border border-white/30 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-white/10">Download QuestHat</Link>
            </div>
          </div>
          <div className="relative min-h-[205px] overflow-hidden rounded-[1.5rem] border border-cyan-100/25 bg-[#0b3948]">
            <Image src="/images/questhat-social-default.jpg" alt="QuestHat — Don’t wait to be invited. Host it." fill sizes="(min-width: 1024px) 40vw, 90vw" className="object-cover" />
          </div>
        </div>
      </section>

      <section className="mt-12">
        <p className="text-xs font-extrabold tracking-[.16em] text-[#17647a]">LOCAL IDEAS TO HOST</p>
        <h2 className="mt-2 text-3xl font-black tracking-[-.04em] text-slate-950">Three ways to make your first {guide.name} plan specific</h2>
        <p className="mt-3 max-w-3xl text-slate-600">These are ideas you can host, not current QuestHat listings. Check the official place information before you set your date and time.</p>
        <div className="mt-7 grid gap-5 md:grid-cols-3">
          {guide.ideas.map((idea, index) => (
            <article key={idea.title} className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-extrabold tracking-[.16em] text-[#17647a]">IDEA {index + 1} · HOST IT</p>
              <h3 className="mt-3 text-xl font-black tracking-[-.03em] text-slate-950">{idea.title}</h3>
              <p className="mt-3 font-bold text-[#0c5063]">{idea.place}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{idea.detail}</p>
              <a href={idea.sourceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex text-sm font-bold text-[#0c5063] underline underline-offset-4 hover:text-[#176f86]">Official source: {idea.sourceLabel}</a>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-[1.8rem] border border-[#c7e4e9] bg-[#edf8fa] p-7 sm:p-9">
        <p className="text-xs font-extrabold tracking-[.16em] text-[#17647a]">HOST YOUR FIRST PLAN</p>
        <h2 className="mt-2 text-3xl font-black tracking-[-.04em] text-[#071d26]">How to turn one {noun} idea into a QuestHat activity</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          <li className="rounded-2xl bg-white p-5"><span className="text-sm font-black text-[#17647a]">01</span><p className="mt-3 font-bold text-slate-950">Pick one idea and name it plainly.</p><p className="mt-1 text-sm text-slate-600">Example: “Saturday Riverwalk walk and coffee.”</p></li>
          <li className="rounded-2xl bg-white p-5"><span className="text-sm font-black text-[#17647a]">02</span><p className="mt-3 font-bold text-slate-950">Set a real date, time, and public meeting place.</p><p className="mt-1 text-sm text-slate-600">Specific details help people decide whether it fits.</p></li>
          <li className="rounded-2xl bg-white p-5"><span className="text-sm font-black text-[#17647a]">03</span><p className="mt-3 font-bold text-slate-950">Create it in QuestHat and choose who joins.</p><p className="mt-1 text-sm text-slate-600">You host the activity; you stay in control.</p></li>
        </ol>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/create" className="rounded-full bg-[#0c5063] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#073e4d]">Create a QuestHat activity</Link>
          <a href={APP_STORE_URL} target="_blank" rel="noreferrer" className="rounded-full border border-[#0c5063]/25 px-5 py-3 text-sm font-extrabold text-[#0c5063] hover:bg-white">Get it on the App Store</a>
          <a href={GOOGLE_PLAY_URL} target="_blank" rel="noreferrer" className="rounded-full border border-[#0c5063]/25 px-5 py-3 text-sm font-extrabold text-[#0c5063] hover:bg-white">Get it on Google Play</a>
        </div>
      </section>

      {related.length ? <section className="mt-12"><h2 className="text-2xl font-black tracking-[-.035em] text-slate-950">Keep exploring South Florida</h2><div className="mt-4 flex flex-wrap gap-3">{related.map((item) => <Link key={item.slug} href={guideHref(item.slug)} className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-[#0c5063] hover:border-[#0c5063]">{item.name} guide</Link>)}<Link href="/app" className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-[#0c5063] hover:border-[#0c5063]">Download QuestHat</Link></div></section> : null}
    </main>
  );
}
