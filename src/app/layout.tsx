import type { Metadata } from "next";
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased pt-12 pb-28 lg:pb-0`}
      >
        <GlobalTopBar />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
