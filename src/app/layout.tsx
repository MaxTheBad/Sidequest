import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import BottomNav from "@/components/bottom-nav";
import GlobalTopBar from "@/components/global-top-bar";
import { APP_NAME } from "@/lib/app-brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Find people to start or restart hobbies together.",
  icons: {
    icon: [
      { url: "/favicon-v3.ico" },
      { url: "/favicon-v3.png" },
    ],
    shortcut: "/favicon-v3.ico",
    apple: "/apple-icon.png",
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
        <GlobalTopBar />
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
                <Link href="/terms" className="hover:text-slate-800 underline-offset-4 hover:underline">
                  Terms
                </Link>
                <Link href="/tos" className="hover:text-slate-800 underline-offset-4 hover:underline">
                  TOS
                </Link>
                <Link href="/privacy" className="hover:text-slate-800 underline-offset-4 hover:underline">
                  Privacy
                </Link>
              </div>
            </div>
          </div>
        </footer>
        <BottomNav />
      </body>
    </html>
  );
}
