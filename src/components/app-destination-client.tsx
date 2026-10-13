"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";

const APP_STORE_URL = "https://apps.apple.com/us/app/questhat/id6787166004";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.questhat.app";

export default function AppDestinationClient() {
  useEffect(() => {
    document.body.classList.add("questhat-download-mode");
    return () => document.body.classList.remove("questhat-download-mode");
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) return window.location.replace(GOOGLE_PLAY_URL);
    if (/iPhone|iPad|iPod/i.test(ua)) return window.location.replace(APP_STORE_URL);
  }, []);

  return (
    <main className="app-destination-page">
      <section aria-labelledby="app-destination-title">
        <Image src="/questhat-logo-tight.png" alt="" width={62} height={62} />
        <p>QUESTHAT FOR MOBILE</p>
        <h1 id="app-destination-title">Get the QuestHat app</h1>
        <span>Choose your platform to continue.</span>
        <div>
          <a href={APP_STORE_URL}>Download on the App Store</a>
          <a href={GOOGLE_PLAY_URL}>Get it on Google Play</a>
        </div>
        <Link href="/">Continue on web</Link>
      </section>
    </main>
  );
}
