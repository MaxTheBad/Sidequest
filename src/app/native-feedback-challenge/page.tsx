import type { Metadata } from "next";
import NativeFeedbackChallenge from "@/components/native-feedback-challenge";

export const metadata: Metadata = {
  title: "Verify feedback | QuestHat",
  robots: { index: false, follow: false },
};

export default function NativeFeedbackChallengePage() {
  return <NativeFeedbackChallenge />;
}
