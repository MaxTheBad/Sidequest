import {
  deriveDeviceLabel,
  getRequestMetadata,
  getServiceSupabase,
  hashIp,
  isPlainObject,
  MEDIA_SOURCE_CONTEXTS,
  sanitizeMetadata,
  SECURITY_EVENT_TYPES,
} from "@/lib/security-audit-server";

export const runtime = "edge";

type AuditBody = {
  event_type?: unknown;
  user_id?: unknown;
  turnstile_success?: unknown;
  metadata?: unknown;
  media?: unknown;
};

function cleanString(value: unknown, maxLength = 512) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function cleanNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export async function POST(req: Request) {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return Response.json({ ok: false, error: "Missing Supabase admin credentials." }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as AuditBody | null;
  const eventType = cleanString(body?.event_type, 80);
  if (!eventType || !SECURITY_EVENT_TYPES.has(eventType)) {
    return Response.json({ ok: false, error: "Unknown audit event type." }, { status: 400 });
  }

  let authenticatedUserId: string | null = null;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    authenticatedUserId = data.user?.id || null;
  }

  const requestedUserId = cleanString(body?.user_id, 64);
  const userId = authenticatedUserId || requestedUserId;
  const requestMetadata = getRequestMetadata(req);
  const ipHash = await hashIp(requestMetadata.raw_ip);
  const auditRow = {
    user_id: userId,
    event_type: eventType,
    raw_ip: requestMetadata.raw_ip,
    ip_hash: ipHash,
    user_agent: requestMetadata.user_agent,
    device_label: deriveDeviceLabel(requestMetadata.user_agent),
    cf_ray: requestMetadata.cf_ray,
    cf_ipcountry: requestMetadata.cf_ipcountry,
    turnstile_success: typeof body?.turnstile_success === "boolean" ? body.turnstile_success : null,
    metadata: sanitizeMetadata(body?.metadata),
  };

  const { error: auditError } = await supabase.from("security_events").insert(auditRow);
  if (auditError) {
    return Response.json({ ok: false, error: auditError.message }, { status: 500 });
  }

  if (isPlainObject(body?.media)) {
    const media = body.media;
    const sourceContext = cleanString(media.source_context, 80);
    const mediaType = cleanString(media.media_type, 32);
    const mediaUserId = authenticatedUserId || cleanString(media.user_id, 64) || userId;
    if (
      mediaUserId &&
      sourceContext &&
      MEDIA_SOURCE_CONTEXTS.has(sourceContext) &&
      (mediaType === "image" || mediaType === "video" || mediaType === "other")
    ) {
      const mediaRow = {
        user_id: mediaUserId,
        quest_id: cleanString(media.quest_id, 64),
        bucket_id: cleanString(media.bucket_id, 120),
        object_path: cleanString(media.object_path, 1024),
        public_url: cleanString(media.public_url, 2048),
        media_type: mediaType,
        mime_type: cleanString(media.mime_type, 200),
        size_bytes: cleanNumber(media.size_bytes),
        source_context: sourceContext,
        raw_ip: requestMetadata.raw_ip,
        ip_hash: ipHash,
        user_agent: requestMetadata.user_agent,
        cf_ray: requestMetadata.cf_ray,
        cf_ipcountry: requestMetadata.cf_ipcountry,
        metadata: sanitizeMetadata(media.metadata),
      };
      if (mediaRow.bucket_id && mediaRow.object_path) {
        const { error: mediaError } = await supabase
          .from("media_assets")
          .upsert(mediaRow, { onConflict: "bucket_id,object_path" });
        if (mediaError) {
          return Response.json({ ok: false, error: mediaError.message }, { status: 500 });
        }
      }
    }
  }

  return Response.json({ ok: true });
}
