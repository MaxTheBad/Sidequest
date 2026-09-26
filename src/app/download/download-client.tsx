"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

const APP_STORE_URL = "https://apps.apple.com/us/app/questhat/id6787166004";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.questhat.app";

const campaigns = [
  { src: "/download/find-people-nearby.png", alt: "Find your people nearby", tilt: "-rotate-3" },
  { src: "/download/make-plans.png", alt: "Make plans in under a minute", tilt: "rotate-2" },
  { src: "/download/explore-map.png", alt: "Explore what is happening nearby", tilt: "-rotate-1" },
  { src: "/download/chat-before-meeting.png", alt: "Chat before you meet", tilt: "rotate-3" },
  { src: "/download/live-activity-reminders.png", alt: "Never miss the plan", tilt: "-rotate-2" },
  { src: "/download/host-controls.png", alt: "You stay in control", tilt: "rotate-1" },
];

function AppleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-current"><path d="M16.78 12.54c-.02-2.18 1.78-3.25 1.86-3.3-1.02-1.49-2.6-1.7-3.16-1.72-1.35-.14-2.63.79-3.31.79-.68 0-1.73-.77-2.84-.75-1.46.02-2.8.85-3.55 2.15-1.52 2.64-.39 6.54 1.09 8.67.72 1.04 1.59 2.21 2.73 2.17 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.11.83-1.21 1.18-2.38 1.2-2.44-.03-.01-2.32-.89-2.37-3.44ZM14.63 6.11c.6-.73 1-1.75.89-2.76-.87.04-1.93.58-2.55 1.3-.56.65-1.05 1.69-.92 2.68.97.08 1.97-.49 2.58-1.22Z" /></svg>;
}

function PlayMark() {
  return <svg aria-hidden="true" viewBox="0 0 28 30" className="h-7 w-7"><path fill="#44D67B" d="m2.2 1.2 14.5 13.7L2.2 28.7c-.75-.52-1.2-1.34-1.2-2.36V3.57c0-1.02.45-1.84 1.2-2.37Z"/><path fill="#20B8E9" d="m2.2 1.2 15.53 14.7 3.7-3.48L6.38 3.58C4.84 2.17 3.36 1.55 2.2 1.2Z"/><path fill="#FFE15A" d="m2.2 28.7 15.53-14.7 3.7 3.48L6.38 26.32c-1.54 1.41-3.02 2.03-4.18 2.38Z"/><path fill="#F15C4E" d="m21.43 12.42 3.96 2.17c1.55.85 1.55 1.96 0 2.81l-3.96 2.17-3.7-3.48 3.7-3.67Z"/></svg>;
}

function StoreButton({ kind, href }: { kind: "apple" | "google"; href: string }) {
  const apple = kind === "apple";
  return (
    <a href={href} target="_blank" rel="noreferrer" className="download-store-button">
      {apple ? <AppleMark /> : <PlayMark />}
      <span className="text-left leading-none">
        <span className="block text-[10px] font-medium opacity-80">{apple ? "Download on the" : "GET IT ON"}</span>
        <span className="mt-1 block text-[20px] font-semibold tracking-[-.04em]">{apple ? "App Store" : "Google Play"}</span>
      </span>
    </a>
  );
}

export default function DownloadClient() {
  useEffect(() => {
    document.body.classList.add("questhat-download-mode");
    return () => document.body.classList.remove("questhat-download-mode");
  }, []);

  return (
    <main className="download-page min-h-screen overflow-hidden bg-[#06121a] text-white">
      <section className="relative isolate overflow-hidden px-5 pb-14 pt-7 sm:px-8 sm:pb-24 lg:px-12">
        <div className="download-orb left-[-10%] top-[-10%] h-[22rem] w-[22rem] bg-[#1a8eaa] opacity-25" />
        <div className="download-orb right-[-8%] top-[22%] h-[28rem] w-[28rem] bg-[#53d4e5] opacity-15" />
        <div className="relative mx-auto max-w-6xl">
          <header className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 text-lg font-black tracking-tight" aria-label="QuestHat home">
              <Image src="/questhat-logo-tight.png" alt="" width={42} height={42} className="h-9 w-9 object-contain" priority />
              <span>QuestHat</span>
            </Link>
            <a href="#get-the-app" className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20">Get the app</a>
          </header>

          <div className="grid items-center gap-12 pt-16 lg:grid-cols-[1fr_.88fr] lg:pt-24">
            <div className="max-w-xl">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold tracking-[.14em] text-cyan-100"><span className="h-2 w-2 rounded-full bg-[#8ce8f3] shadow-[0_0_14px_#8ce8f3]" /> REAL PLANS. REAL PEOPLE.</p>
              <h1 className="max-w-2xl text-5xl font-black leading-[.94] tracking-[-.065em] sm:text-6xl lg:text-7xl">Find people who are actually down to go.</h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">QuestHat helps you find nearby plans, start your own, and turn “we should hang out” into something real.</p>
              <div id="get-the-app" className="mt-8 flex flex-col gap-3 sm:flex-row">
                <StoreButton kind="apple" href={APP_STORE_URL} />
                <StoreButton kind="google" href={GOOGLE_PLAY_URL} />
              </div>
              <p className="mt-4 text-sm text-slate-400">Free to download. Make a plan in under a minute.</p>
            </div>

            <div className="relative mx-auto w-full max-w-[390px]">
              <div className="absolute inset-x-8 bottom-0 top-8 rounded-[3rem] bg-cyan-300/20 blur-3xl" />
              <div className="relative overflow-hidden rounded-[2.2rem] border border-white/15 bg-slate-950/40 p-2 shadow-[0_28px_90px_rgba(0,0,0,.45)]">
                <Image src="/download/find-people-nearby.png" alt="QuestHat helps you find your people nearby" width={1320} height={2868} className="h-auto w-full rounded-[1.75rem]" priority />
              </div>
              <div className="absolute -left-10 bottom-8 rounded-2xl border border-white/15 bg-[#0b2330]/90 px-4 py-3 shadow-xl backdrop-blur sm:-left-20"><p className="text-xs font-bold uppercase tracking-[.16em] text-cyan-200">Less group-chat limbo</p><p className="mt-1 text-sm font-bold">More real plans.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#edf8fa] px-5 py-16 text-[#0a1a24] sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-xs font-extrabold tracking-[.18em] text-[#17647a]">HOW QUESTHAT WORKS</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-center text-4xl font-black leading-tight tracking-[-.045em] sm:text-5xl">A plan is closer than you think.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[['01', 'Find a plan', 'See what people are doing around you, right now.'], ['02', 'Join the conversation', 'Ask a question, get the details, and see who is going.'], ['03', 'Show up', 'Meet people over something you already want to do.']].map(([number, title, text]) => <article key={number} className="rounded-[1.8rem] border border-[#d4e8ec] bg-white p-7 shadow-[0_14px_32px_rgba(10,48,63,.07)]"><span className="text-sm font-black text-[#19849b]">{number}</span><h3 className="mt-8 text-2xl font-black tracking-[-.04em]">{title}</h3><p className="mt-3 leading-relaxed text-slate-600">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section className="bg-[#06121a] px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-extrabold tracking-[.18em] text-cyan-200">BUILT FOR THE WHOLE PLAN</p><h2 className="mt-3 text-4xl font-black tracking-[-.05em] sm:text-5xl">From “maybe” to meetup.</h2></div><p className="max-w-sm text-slate-300">Explore, host, chat, coordinate, and keep the details in one place.</p></div>
          <div className="download-gallery mt-12 flex gap-4 overflow-x-auto pb-7 pt-4 sm:gap-6">
            {campaigns.slice(1).map((campaign) => <figure key={campaign.src} className={`w-[200px] shrink-0 overflow-hidden rounded-[1.7rem] border border-white/10 bg-slate-900 shadow-2xl transition duration-300 hover:-translate-y-3 hover:rotate-0 sm:w-[225px] ${campaign.tilt}`}><Image src={campaign.src} alt={campaign.alt} width={1320} height={2868} className="h-auto w-full" /></figure>)}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#0d5b6f] px-5 py-20 text-center sm:px-8 sm:py-28">
        <div className="download-orb left-[15%] top-[-30%] h-[24rem] w-[24rem] bg-cyan-200 opacity-20" />
        <div className="relative mx-auto max-w-2xl"><p className="text-xs font-extrabold tracking-[.2em] text-cyan-100">YOUR NEXT PLAN IS OUT THERE</p><h2 className="mt-4 text-5xl font-black leading-[.95] tracking-[-.06em] sm:text-6xl">Go do something.</h2><p className="mx-auto mt-5 max-w-xl text-lg text-cyan-50/85">Download QuestHat and find people who want to make real plans too.</p><div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><StoreButton kind="apple" href={APP_STORE_URL} /><StoreButton kind="google" href={GOOGLE_PLAY_URL} /></div></div>
      </section>
    </main>
  );
}
