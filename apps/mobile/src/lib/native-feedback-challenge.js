const CHALLENGE_PATH = "/native-feedback-challenge";
const TURNSTILE_MESSAGE_TYPE = "questhat.turnstile";
const TURNSTILE_ACTION = "app-feedback";

function trustedSite(siteUrl) {
  try {
    const parsed = new URL(siteUrl);
    if (parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function nativeFeedbackChallengeUrl(siteUrl) {
  const site = trustedSite(siteUrl);
  return site ? new URL(CHALLENGE_PATH, site).toString() : null;
}

export function isAllowedNativeFeedbackNavigation(rawUrl, siteUrl) {
  if (rawUrl === "about:blank" || rawUrl === "about:srcdoc") return true;
  const site = trustedSite(siteUrl);
  if (!site) return false;
  try {
    const target = new URL(rawUrl);
    return target.protocol === "https:" && (target.origin === site.origin || target.hostname === "challenges.cloudflare.com");
  } catch {
    return false;
  }
}

export function parseNativeFeedbackChallengeMessage({ data, url }, siteUrl) {
  const site = trustedSite(siteUrl);
  if (!site) return null;
  try {
    const source = new URL(url);
    if (source.origin !== site.origin || source.pathname !== CHALLENGE_PATH) return null;
    const message = JSON.parse(data);
    if (message?.type !== TURNSTILE_MESSAGE_TYPE || message?.action !== TURNSTILE_ACTION) return null;
    if (typeof message.token !== "string" || message.token.length < 16 || message.token.length > 4096 || /\s/.test(message.token)) return null;
    return message.token;
  } catch {
    return null;
  }
}
