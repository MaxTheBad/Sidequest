export function parseAuthCallback(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return { kind: "ignored" }; }
  if (parsed.protocol !== "questhat:" || parsed.hostname !== "auth" || parsed.pathname !== "/callback") return { kind: "ignored" };
  const params = new URLSearchParams(`${parsed.search.replace(/^\?/, "")}&${parsed.hash.replace(/^#/, "")}`);
  const error = params.get("error_description") || params.get("error");
  if (error) return { kind: "error", error };
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && type) return { kind: "token_hash", tokenHash, type };
  const code = params.get("code");
  if (code) return { kind: "code", code };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) return { kind: "session", accessToken, refreshToken };
  return { kind: "callback" };
}

export function resolveEmailChangeState({ requestedEmail, serverEmail, serverNewEmail }) {
  const requested = requestedEmail?.trim().toLowerCase() || "";
  const current = serverEmail?.trim().toLowerCase() || "";
  const pending = serverNewEmail?.trim().toLowerCase() || "";
  if (!requested) return pending
    ? { status: "pending", email: current }
    : { status: "none", email: current };
  if (current === requested) return { status: "complete", email: current };
  if (pending === requested || current !== requested) return { status: "pending", email: current };
  return { status: "unknown", email: current };
}

export function emailChangePendingMessage() {
  return "Email change is still pending. If Secure email change is enabled, confirm the links sent to both your current and new inboxes.";
}
