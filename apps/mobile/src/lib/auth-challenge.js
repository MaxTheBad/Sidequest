// Keep native sign-in fail-closed if Supabase/Auth begins requiring a challenge.
// Native token submission is intentionally not enabled until the corresponding
// Auth CAPTCHA configuration and supported token flow are approved.
export function authChallengeMessage(error) {
  const message = typeof error === "string"
    ? error
    : error && typeof error.message === "string"
      ? error.message
      : "";

  if (!/(captcha|turnstile|hcaptcha|verification challenge|challenge required)/i.test(message)) {
    return null;
  }

  return "A verification challenge is required before continuing. Complete the challenge in a supported client and try again.";
}
