function safeDiagnosticUrl(value) {
  if (typeof value !== "string") return undefined;
  const noQuery = value.split(/[?#]/)[0];
  return noQuery.replace(/\/(listing|profile|inbox)\/[^/\s]+(?:\/[^\s]*)?/g, "/$1/[id]");
}

export function scrubNativeDiagnosticBreadcrumb(breadcrumb) {
  if (["console", "fetch", "xhr"].includes(breadcrumb.category)) return null;
  return { ...breadcrumb, data: undefined, message: undefined };
}

/** Preserve readable code frames, not user/content payloads or exception text. */
export function scrubNativeDiagnosticEvent(event) {
  return {
    ...event,
    user: undefined,
    message: undefined,
    transaction: safeDiagnosticUrl(event.transaction),
    request: event.request ? { method: event.request.method, url: safeDiagnosticUrl(event.request.url) } : undefined,
    breadcrumbs: event.breadcrumbs?.map(scrubNativeDiagnosticBreadcrumb).filter(Boolean),
    exception: event.exception ? { ...event.exception, values: event.exception.values?.map(value => ({
      ...value, value: undefined,
      stacktrace: value.stacktrace ? { ...value.stacktrace, frames: value.stacktrace.frames?.map(frame => ({ ...frame, vars: undefined })) } : undefined,
    })) } : undefined,
    contexts: event.contexts?.trace ? { ...event.contexts, trace: { ...event.contexts.trace, data: undefined, description: undefined } } : event.contexts,
    spans: event.spans?.map(span => ({ ...span, data: undefined, description: undefined })),
    extra: undefined,
  };
}
