const DEFAULT_TIMEOUT_MESSAGE = "Supabase request timed out";

function createTimeoutError(timeoutMs: number, retryable: boolean): Error {
  const error = new Error(`${DEFAULT_TIMEOUT_MESSAGE} after ${timeoutMs}ms`);
  error.name = retryable ? "TimeoutError" : "AbortError";
  return error;
}

/**
 * Adds a deadline to Supabase's fetch calls without disguising a timeout as a
 * caller-initiated AbortError. PostgREST intentionally does not retry
 * AbortError, but it can safely retry GET/HEAD requests after a TimeoutError.
 */
export function createFetchWithTimeout(
  timeoutMs: number,
  { retryTimedOutReads = true }: { retryTimedOutReads?: boolean } = {}
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const requestSignal = init?.signal;

    const abortFromRequest = () => {
      controller.abort(requestSignal?.reason);
    };

    if (requestSignal?.aborted) {
      abortFromRequest();
    } else {
      requestSignal?.addEventListener("abort", abortFromRequest, { once: true });
    }

    const timeoutId = setTimeout(() => {
      controller.abort(createTimeoutError(timeoutMs, retryTimedOutReads));
    }, timeoutMs);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
      requestSignal?.removeEventListener("abort", abortFromRequest);
    }
  };
}
