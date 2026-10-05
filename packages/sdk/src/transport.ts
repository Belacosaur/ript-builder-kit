import type { ValidatedRequest } from "../../../shared/services.js";
import { sanitize } from "../../../shared/sanitize.js";
import type { RequestOptions } from "./types.js";
export class RiptError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public retryable = false,
    public uncertain = false,
    public retryAfterMs?: number,
  ) {
    super(code);
    this.name = "RiptError";
  }
}
export function createTransport(fetcher: typeof fetch, timeoutMs = 15000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180000)
    throw new Error("invalid_timeout");
  return async function send(
    url: string,
    init: RequestInit,
    route: Pick<ValidatedRequest, "effect">,
    options: RequestOptions = {},
    mode: "json" | "raw" | "export" = "json",
  ): Promise<any> {
    const mutation = route.effect === "mutation",
      limit = mutation ? 0 : (options.retries ?? 2);
    if (!Number.isInteger(limit) || limit < 0 || limit > 5)
      throw Error("invalid_retries");
    const controller = new AbortController();
    let timeout = false;
    const timer = setTimeout(() => {
      timeout = true;
      controller.abort();
    }, timeoutMs);
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const interrupted = () =>
      new RiptError(
        timeout ? "request_timeout" : "request_aborted",
        0,
        false,
        mutation,
      );
    const bounded = <T>(promise: Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        const stop = () => reject(interrupted());
        if (controller.signal.aborted) return stop();
        controller.signal.addEventListener("abort", stop, { once: true });
        promise
          .then(resolve, reject)
          .finally(() => controller.signal.removeEventListener("abort", stop));
      });
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          if (controller.signal.aborted) throw interrupted();
          const response = await bounded(
            fetcher(url, {
              ...init,
              signal: controller.signal,
              redirect: "error",
            }),
          );
          const text = await bounded(response.text());
          if (text.length > 2000000)
            throw new RiptError("response_too_large", 502, false, mutation);
          if (mode === "raw")
            return new Response(
              [204, 205, 304].includes(response.status) ? null : text,
              {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              },
            );
          if (mode === "export" && response.ok)
            return {
              contentType: response.headers.get("content-type"),
              content: text,
              source: "api",
            };
          let data: any;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            throw new RiptError(
              "invalid_response",
              response.status,
              false,
              mutation && (response.ok || response.status >= 500),
            );
          }
          if (response.ok) return data;
          const clean = sanitize(data?.error),
            code =
              typeof clean === "string" && /^[a-z0-9_]{1,100}$/.test(clean)
                ? clean
                : "http_error";
          const header = response.headers.get("retry-after");
          const retryAfter =
            header === null
              ? undefined
              : /^\d+(?:\.\d+)?$/.test(header)
                ? Number(header) * 1000
                : Math.max(0, Date.parse(header) - Date.now());
          throw new RiptError(
            code,
            response.status,
            response.status === 429 || response.status >= 500,
            mutation && (data?.uncertain === true || response.status >= 500),
            Number.isFinite(retryAfter) ? retryAfter : undefined,
          );
        } catch (error) {
          if (controller.signal.aborted) throw interrupted();
          const e =
            error instanceof RiptError
              ? error
              : new RiptError("transport_unavailable", 0, true, mutation);
          if (!e.retryable || attempt >= limit) throw e;
          let pause: ReturnType<typeof setTimeout> | undefined;
          try {
            await bounded(
              new Promise((r) => {
                pause = setTimeout(r, e.retryAfterMs ?? 100 * 2 ** attempt);
              }),
            );
          } finally {
            if (pause) clearTimeout(pause);
          }
        }
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  };
}
