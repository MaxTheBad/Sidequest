import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import BottomNav from "@/components/bottom-nav";
import GlobalTopBar from "@/components/global-top-bar";
import UsernameGate from "@/components/username-gate";
import EulaGate from "@/components/eula-gate";
import RecoveryEmailPrompt from "@/components/recovery-email-prompt";
import QuestHatPostHogProvider from "@/components/posthog-provider";
import { APP_NAME } from "@/lib/app-brand";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://questhat.com";
const defaultShareImage = "/images/questhat-social-preview-v1.jpg";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${APP_NAME} | Find local people to do real plans with`,
  description: "QuestHat helps people create local activities with a real time and place, then connect with people who want to join.",
  applicationName: APP_NAME,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: APP_NAME,
    title: `${APP_NAME} | Find local people to do real plans with`,
    description: "Don’t wait to be invited. Host a local activity with QuestHat.",
    images: [
      {
        url: defaultShareImage,
        width: 1200,
        height: 630,
        alt: "QuestHat — Don’t wait to be invited. Host it.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} | Find local people to do real plans with`,
    description: "Don’t wait to be invited. Host a local activity with QuestHat.",
    images: [{ url: defaultShareImage, alt: "QuestHat — Don’t wait to be invited. Host it." }],
  },
  manifest: "/site.webmanifest",
  icons: {
    icon: [{ url: "/icon.png?v=4", type: "image/png", sizes: "512x512" }],
    shortcut: "/icon.png?v=4",
    apple: "/apple-icon.png?v=4",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (() => {
              try {
                const saved = localStorage.getItem('sidequest_theme_pref');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const resolved = saved === 'light' || saved === 'dark'
                  ? saved
                  : saved === 'auto'
                    ? (prefersDark ? 'dark' : 'light')
                    : (prefersDark ? 'dark' : 'light');
                document.documentElement.dataset.theme = resolved;
              } catch {
                document.documentElement.dataset.theme = 'light';
              }
            })();
          `}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased pt-[60px] pb-28 md:pl-[84px] md:pt-0 md:pb-0 xl:pl-[248px]`}
      >
        <QuestHatPostHogProvider>
          <GlobalTopBar />
          <EulaGate />
          <UsernameGate />
          <RecoveryEmailPrompt />
          {children}
          <footer className="app-footer mt-16 border-t border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-xs text-slate-500">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <Link href="/" className="flex items-center gap-2 font-medium text-slate-700">
                <Image
                  src="/questhat-logo.png"
                  alt="QuestHat"
                  width={26}
                  height={14}
                  className="h-4 w-auto"
                  priority
                />
                <span>QuestHat</span>
              </Link>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link href="/south-florida/broward-county" className="hover:text-slate-800 underline-offset-4 hover:underline">
                  South Florida guides
                </Link>
                <Link href="/terms" className="hover:text-slate-800 underline-offset-4 hover:underline">
                  Terms
                </Link>
                <Link href="/tos" className="hover:text-slate-800 underline-offset-4 hover:underline">
                  TOS
                </Link>
                <Link href="/privacy" className="hover:text-slate-800 underline-offset-4 hover:underline">
                  Privacy
                </Link>
                <Link href="/support" className="hover:text-slate-800 underline-offset-4 hover:underline">
                  Support
                </Link>
                <Link href="/child-safety" className="hover:text-slate-800 underline-offset-4 hover:underline">
                  Child safety
                </Link>
                <Link href="/delete-account" className="hover:text-slate-800 underline-offset-4 hover:underline">
                  Delete data
                </Link>
              </div>
              <div className="flex items-center gap-3" aria-label="QuestHat social profiles">
                <a href="https://www.tiktok.com/@questhatapp" target="_blank" rel="noreferrer" className="hover:text-slate-800 underline-offset-4 hover:underline">TikTok</a>
                <a href="https://www.instagram.com/questhatapp" target="_blank" rel="noreferrer" className="hover:text-slate-800 underline-offset-4 hover:underline">Instagram</a>
                <a href="https://www.facebook.com/1263520396843577" target="_blank" rel="noreferrer" className="hover:text-slate-800 underline-offset-4 hover:underline">Facebook</a>
                <a href="https://x.com/questhatapp" target="_blank" rel="noreferrer" className="hover:text-slate-800 underline-offset-4 hover:underline">X</a>
              </div>
            </div>
          </div>
          </footer>
          <BottomNav />
        </QuestHatPostHogProvider>
      </body>
    </html>
  );
}
