/**
 * @typedef {"completed" | "initiated" | "cancelled" | "failed" | "unsupported"} ShareOutcome
 * @typedef {"native" | "clipboard" | "none"} ShareMethod
 * @typedef {{ outcome: ShareOutcome, method: ShareMethod, confirmation: "handoff" | "copy" | "none", shouldCount: boolean }} QuestShareResult
 * @typedef {{ share?: (payload: { title?: string, text?: string, url: string }) => Promise<unknown>, clipboard?: { writeText: (url: string) => Promise<void> }, userAgent?: string, userAgentData?: { platform?: string } }} ShareNavigator
 */

/** @param {ShareOutcome} outcome @param {ShareMethod} method @param {QuestShareResult["confirmation"]} confirmation @returns {QuestShareResult} */
function shareResult(outcome, method, confirmation = "none") {
  return { outcome, method, confirmation, shouldCount: outcome === "completed" };
}

/**
 * Native completion means handoff, never recipient delivery. Unknown platforms stay initiated.
 * @param {ShareNavigator | null} navigator
 * @param {{ title?: string, text?: string, url: string }} payload
 */
export async function shareQuestPayload(navigator, payload) {
  let nativeFailed = false;
  if (typeof navigator?.share === "function") {
    try {
      await navigator.share(payload);
      // Android resolves after data passes to a target; Windows resolves when the
      // popup opens. Other platforms have no uniform completion signal.
      const platform = navigator.userAgentData?.platform;
      const android = platform ? platform === "Android" : /\bAndroid\b/i.test(navigator.userAgent || "");
      return android ? shareResult("completed", "native", "handoff") : shareResult("initiated", "native");
    } catch (error) {
      if (error?.name === "AbortError") return shareResult("cancelled", "native");
      if (error?.name === "InvalidStateError") return shareResult("failed", "native");
      nativeFailed = true;
    }
  }
  if (typeof navigator?.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(payload.url);
      return shareResult("completed", "clipboard", "copy");
    } catch { return shareResult("failed", "clipboard"); }
  }
  return shareResult(nativeFailed ? "failed" : "unsupported", nativeFailed ? "native" : "none");
}

/**
 * Start sharing synchronously under user activation; count only after its completion signal.
 * @param {ShareNavigator | null} navigator
 * @param {{ title?: string, text?: string, url: string }} payload
 * @param {{ recordShare: (method: ShareMethod) => Promise<boolean>, onOutcome: (result: QuestShareResult) => void }} callbacks
 */
export async function shareQuestAndRecord(navigator, payload, { recordShare, onOutcome }) {
  const result = await shareQuestPayload(navigator, payload);
  try { onOutcome(result); } catch { /* Optional analytics must not change sharing. */ }
  if (!result.shouldCount) return { ...result, counted: false, countFailed: false };
  try {
    return { ...result, counted: await recordShare(result.method) === true, countFailed: false };
  } catch { return { ...result, counted: false, countFailed: true }; }
}
