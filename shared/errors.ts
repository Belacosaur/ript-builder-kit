export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public retryable = false,
    public uncertain = false,
    public retryAfterMs?: number,
  ) {
    super(code);
    this.name = "ApiError";
  }
}
const transient = new Set([
  "opening_preparing",
  "upstream_unavailable",
  "opening_unavailable",
  "transport_uncertain",
  "sandbox_testing_upstream_unavailable",
]);
export function normalizeError(error: unknown, mutation = false): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === "AbortError")
    return new ApiError("aborted");
  if (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === "TimeoutError")
  )
    return new ApiError("transport_uncertain", 0, true, mutation);
  const code =
    error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
      ? error.message
      : "operation_failed";
  return new ApiError(
    code,
    0,
    transient.has(code),
    mutation && transient.has(code),
  );
}
export function httpError(
  code: unknown,
  status: number,
  mutation: boolean,
  retryAfter: string | null,
): ApiError {
  const safe =
    typeof code === "string" && /^[a-z0-9_]{1,100}$/.test(code)
      ? code
      : "http_error";
  const delay =
    retryAfter === null
      ? undefined
      : /^\d+(?:\.\d+)?$/.test(retryAfter)
        ? Number(retryAfter) * 1000
        : Math.max(0, Date.parse(retryAfter) - Date.now());
  return new ApiError(
    safe,
    status,
    status === 429 || status >= 500 || (status === 409 && transient.has(safe)),
    mutation && (status >= 500 || safe === "transport_uncertain"),
    Number.isFinite(delay) ? delay : undefined,
  );
}
