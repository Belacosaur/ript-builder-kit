import type { Scope } from "./recovery.js";
import { ApiError, httpError, normalizeError } from "../shared/errors.js";
export async function requestJson<T>(
  path: string,
  payload: unknown,
  context: {
    scope: Scope;
    signal?: AbortSignal;
    mutation: boolean;
    status?: (status: number) => void;
  },
): Promise<T> {
  if (
    !/^\/api\/(gacha|testing|services)\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?$/.test(
      path,
    )
  )
    throw new ApiError("invalid_client_route");
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: context.signal
        ? AbortSignal.any([context.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
    context.status?.(response.status);
    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        "invalid_upstream_response",
        response.status,
        response.status === 429 || response.status >= 500 || response.ok,
        context.mutation && (response.status >= 500 || response.ok),
      );
    }
    if (!response.ok)
      throw httpError(
        data?.error,
        response.status,
        context.mutation,
        response.headers.get("retry-after"),
      );
    return data as T;
  } catch (e) {
    throw normalizeError(e, context.mutation);
  }
}
