import type { Metadata } from "next";
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
import GlobalFooter from "@/components/global-footer";
import { APP_NAME } from "@/lib/app-brand";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://questhat.com";
const defaultShareImage = "/images/questhat-social-default.jpg?v=20261002";

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
          <GlobalFooter />
          <BottomNav />
        </QuestHatPostHogProvider>
      </body>
    </html>
  );
}
