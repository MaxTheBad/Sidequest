import type { Metadata } from "next";
import DownloadClient from "./download-client";

export const metadata: Metadata = {
  title: "Download QuestHat | Make plans with real people",
  description: "Download QuestHat on iPhone or Android. Find nearby plans, host your own, and meet people in real life.",
  alternates: { canonical: "/download" },
  openGraph: {
    title: "Download QuestHat",
    description: "Make plans with real people, nearby.",
    url: "/download",
    images: [{ url: "/images/questhat-social-default.jpg", width: 1200, height: 630, alt: "QuestHat — Don’t wait to be invited. Host it." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Download QuestHat | Make plans with real people",
    description: "Download QuestHat and turn an idea into a local activity with a real time and place.",
    images: [{ url: "/images/questhat-social-default.jpg", alt: "QuestHat — Don’t wait to be invited. Host it." }],
  },
};

export default function DownloadPage() {
  return <DownloadClient />;
}
