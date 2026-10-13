const CATEGORIES = new Set(["suggestion", "bug", "usability", "other"]);

export function validateFeedback(input) {
  const category = typeof input?.category === "string" ? input.category : "";
  const message = typeof input?.message === "string" ? input.message.trim() : "";
  const replyContact = typeof input?.replyContact === "string" ? input.replyContact.trim() : "";
  if (!CATEGORIES.has(category)) throw new Error("Choose a feedback category.");
  if (message.length < 20 || message.length > 3000) throw new Error("Feedback must be between 20 and 3,000 characters.");
  if (/[\r\n]/.test(replyContact) || (replyContact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyContact))) throw new Error("Enter a valid reply email or leave it blank.");
  return { category, message, replyContact: replyContact || null, diagnostics: input?.diagnostics === true ? input.diagnosticsInfo || null : null };
}

export async function feedbackFingerprint(actorId, feedback) {
  const normalized = `${actorId}:${feedback.category}:${feedback.message.toLowerCase().replace(/\s+/g, " ")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createFeedbackService({ deliver, reserve, finalize }) {
  return {
    async submit({ actorId, input, captchaVerified = false }) {
      if (!actorId) return { ok: false, status: 401, error: "Sign in to send feedback." };
      let feedback;
      try { feedback = validateFeedback(input); } catch (error) { return { ok: false, status: 400, error: error instanceof Error ? error.message : "Invalid feedback." }; }
      if (typeof reserve !== "function" || typeof finalize !== "function") return { ok: false, status: 503, error: "Feedback is temporarily unavailable. Please try again." };
      let reservation;
      try { reservation = await reserve(await feedbackFingerprint(actorId, feedback), captchaVerified); }
      catch { return { ok: false, status: 503, error: "Feedback is temporarily unavailable. Please try again." }; }
      if (!reservation?.accepted) {
        if (reservation?.reason === "duplicate") return { ok: false, status: 409, error: "That feedback was already sent. Thanks for the report." };
        if (reservation?.reason === "captcha_required") return { ok: false, status: 429, error: "Verification is required before sending more feedback.", captchaRequired: true };
        if (reservation?.reason === "rate_limited") return { ok: false, status: 429, error: "Too much feedback was sent recently. Please try again later." };
        return { ok: false, status: 503, error: "Feedback is temporarily unavailable. Please try again." };
      }
      try { await deliver(feedback); }
      catch {
        try { await finalize(reservation.reservationId, false); } catch {}
        return { ok: false, status: 502, error: "Feedback was not sent. Please try again." };
      }
      try { await finalize(reservation.reservationId, true); }
      catch { return { ok: false, status: 503, error: "Feedback delivery could not be confirmed. Please contact support before retrying." }; }
      return { ok: true, status: 202 };
    },
  };
}
