export async function verifyTurnstileToken({ token, secret, expectedAction, expectedHostname, fetchImpl = fetch }) {
  if (!token || !secret || typeof fetchImpl !== "function") return false;
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  try {
    const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    if (!response?.ok) return false;
    const verification = await response.json();
    if (verification?.success !== true) return false;
    if (expectedAction && verification.action !== expectedAction) return false;
    if (expectedHostname && verification.hostname !== expectedHostname) return false;
    return true;
  } catch {
    return false;
  }
}
