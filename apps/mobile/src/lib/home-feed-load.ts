export type HomeFeedLoadStatus = "loading" | "ready" | "error";

export const HOME_FEED_REQUEST_TIMEOUT_MS = 15_000;

export type HomeFeedLoadState<T> = {
  data: readonly T[];
  requestId: number;
  status: HomeFeedLoadStatus;
};

export function beginHomeFeedLoad<T>(state: HomeFeedLoadState<T>): HomeFeedLoadState<T> {
  return { ...state, requestId: state.requestId + 1, status: "loading" };
}

export function resolveHomeFeedLoad<T>(state: HomeFeedLoadState<T>, requestId: number, data: readonly T[]): HomeFeedLoadState<T> {
  return requestId === state.requestId ? { data, requestId, status: "ready" } : state;
}

export function rejectHomeFeedLoad<T>(state: HomeFeedLoadState<T>, requestId: number): HomeFeedLoadState<T> {
  return requestId === state.requestId ? { ...state, status: "error" } : state;
}

export function createHomeFeedRequestGate() {
  let latestRequestId = 0;
  return {
    begin() {
      latestRequestId += 1;
      return latestRequestId;
    },
    isCurrent(requestId: number) {
      return requestId === latestRequestId;
    },
  };
}

export async function withHomeFeedTimeout<T>(request: PromiseLike<T>, timeoutMs = HOME_FEED_REQUEST_TIMEOUT_MS): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid Home feed timeout.");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Home feed request timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
