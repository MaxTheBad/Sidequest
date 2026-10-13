/** Cancelling a native share must not trigger the clipboard fallback. */
export async function shareQuestPayload(navigator, payload) {
  if (navigator?.share) {
    try {
      await navigator.share(payload);
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // Retain the existing fallback when native sharing fails or is unsupported.
    }
  }
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload.url);
    return "copied";
  }
  return "unsupported";
}
