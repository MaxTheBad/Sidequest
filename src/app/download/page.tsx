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
    images: [{ url: "/download/find-people-nearby.png", width: 1320, height: 2868, alt: "QuestHat app" }],
  },
};

export default function DownloadPage() {
  return <DownloadClient />;
}
