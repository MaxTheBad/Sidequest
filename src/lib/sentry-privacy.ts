import type { Breadcrumb, Event } from "@sentry/nextjs";

const PRIVATE_ROUTE_PREFIXES = ["/listing/", "/profile/", "/inbox/"];

function privacySafeUrl(rawUrl: string | undefined) {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl, "https://questhat.invalid");
    const privatePrefix = PRIVATE_ROUTE_PREFIXES.find((prefix) => parsed.pathname.startsWith(prefix));
    const pathname = privatePrefix ? `${privatePrefix}[id]` : parsed.pathname;
    return parsed.origin === "https://questhat.invalid" ? pathname : `${parsed.origin}${pathname}`;
  } catch {
    return undefined;
  }
}

function privacySafeTransactionName(name: string | undefined) {
  if (!name) return undefined;
  const method = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i.exec(name);
  return method ? `${method[1]} ${privacySafeUrl(method[2]) || "[route]"}` : privacySafeUrl(name);
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console" || breadcrumb.category === "fetch" || breadcrumb.category === "xhr") return null;
  return {
    ...breadcrumb,
    data: undefined,
    message: undefined,
  };
}

export function scrubSentryEvent<T extends Event>(event: T): T {
  return {
    ...event,
    transaction: privacySafeTransactionName(event.transaction),
    message: undefined,
    user: undefined,
    request: event.request
      ? {
          method: event.request.method,
          url: privacySafeUrl(event.request.url),
          cookies: undefined,
          data: undefined,
          headers: undefined,
          query_string: undefined,
        }
      : undefined,
    breadcrumbs: event.breadcrumbs?.map(scrubSentryBreadcrumb).filter((item): item is Breadcrumb => item !== null),
    exception: event.exception
      ? {
          ...event.exception,
          values: event.exception.values?.map((value) => ({ ...value, value: undefined })),
        }
      : undefined,
    extra: undefined,
    contexts: event.contexts?.trace ? { ...event.contexts, trace: { ...event.contexts.trace, data: undefined, description: undefined } } : event.contexts,
    spans: event.spans?.map((span) => ({ ...span, data: undefined, description: undefined })),
  };
}

export function sentryPrivacyOptions() {
  return {
    // Sentry 11's streaming default skips the transaction privacy callback.
    traceLifecycle: "static" as const,
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 3,
    },
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  };
}
