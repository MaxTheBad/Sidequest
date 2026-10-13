"use client";

import { useState } from "react";
import { TurnstileInvisible } from "@/components/turnstile-invisible";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export default function NativeFeedbackChallenge() {
  const [status, setStatus] = useState("Complete the verification check to continue in QuestHat.");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Verify feedback</h1>
        <p className="mt-2 text-sm text-slate-600">This check limits automated feedback. Your feedback text is not loaded on this page.</p>
      </div>
      <TurnstileInvisible
        action="app-feedback"
        onToken={(token) => {
          const bridge = window.ReactNativeWebView;
          if (!bridge) {
            setStatus("Open this verification check from the QuestHat app.");
            return;
          }
          bridge.postMessage(JSON.stringify({ type: "questhat.turnstile", action: "app-feedback", token }));
          setStatus("Verification complete. Return to QuestHat to send your feedback.");
        }}
        onError={() => setStatus("Verification could not load. Check your connection and try again.")}
        onExpired={() => setStatus("Verification expired. Complete the check again.")}
      />
      <p role="status" className="text-sm text-slate-600">{status}</p>
    </main>
  );
}
