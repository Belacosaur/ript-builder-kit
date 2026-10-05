import { ApiError, normalizeError } from "../shared/errors.js";
export type RetryOptions = {
  deadline: number;
  signal: AbortSignal;
  check: () => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
};
export async function retry<T>(
  work: () => Promise<T>,
  o: RetryOptions,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    o.signal.throwIfAborted();
    o.check();
    if (o.now() >= o.deadline)
      throw new ApiError("retry_deadline", 0, false, true);
    try {
      const value = await work();
      o.signal.throwIfAborted();
      o.check();
      return value;
    } catch (error) {
      o.signal.throwIfAborted();
      o.check();
      const e = normalizeError(error, true);
      if (!e.retryable) throw error;
      const remaining = o.deadline - o.now();
      const delay = Math.max(
        e.retryAfterMs ?? 0,
        Math.min(5000, 500 * 2 ** Math.min(attempt++, 10)) *
          (0.8 + 0.4 * o.random()),
      );
      if (remaining <= delay)
        throw new ApiError("retry_deadline", e.status, false, e.uncertain);
      await o.sleep(delay);
    }
  }
}
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
