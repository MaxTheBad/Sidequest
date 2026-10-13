// Authentication providers can require an anti-bot challenge independently of
// the app's current client configuration. Do not treat that response as a
// generic login failure or attempt to work around it locally.
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
