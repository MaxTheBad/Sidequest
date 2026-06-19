import type { Metadata } from "next";
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased pt-12 pb-40 lg:pb-0`}
      >
        <GlobalTopBar />
        {children}
        <footer className="mt-16 border-t border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-xs text-slate-500">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="font-medium text-slate-700">QuestHat</p>
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
