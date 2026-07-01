export type SecurityEventType =
  | "signup_password_submitted"
  | "oauth_started"
  | "login_password_success"
  | "turnstile_verified"
  | "media_uploaded"
  | "quest_created"
  | "quest_updated"
  | "report_submitted"
  | "message_sent";

export type MediaAuditInput = {
  user_id: string;
  quest_id?: string | null;
  bucket_id: string;
  object_path: string;
  public_url?: string | null;
  media_type: "image" | "video" | "other";
  mime_type?: string | null;
  size_bytes?: number | null;
  source_context:
    | "profile_photo"
    | "profile_photo_original"
    | "quest_media"
    | "quest_media_thumbnail"
    | "quest_video"
    | "onboarding_photo";
  metadata?: Record<string, unknown>;
};

export type SecurityAuditInput = {
  event_type: SecurityEventType;
  user_id?: string | null;
  turnstile_success?: boolean | null;
  metadata?: Record<string, unknown>;
  media?: MediaAuditInput;
};

export async function recordSecurityAudit(input: SecurityAuditInput, accessToken?: string | null) {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    await fetch("/api/security/audit", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
  } catch {
    // Audit logging must not block user-facing flows.
  }
}
