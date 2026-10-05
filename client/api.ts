import { requestJson } from "./transport.js";
import type { OperationId, Params } from "../shared/contract.js";
import type { Scope } from "./recovery.js";
import { traceValue } from "./model.js";
export type Trace = {
  operation: string;
  environment: string;
  scope: Scope;
  status: number;
  latencyMs: number;
  request: unknown;
  response: unknown;
  at: string;
};
export let onTrace: (trace: Trace) => void = () => {};
export function setTraceHandler(handler: typeof onTrace) {
  onTrace = handler;
}
export async function callGacha<T = any>(
  operation: OperationId,
  scope: Scope,
  params: Params,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const start = performance.now();
  const request = { environment: scope.environment, params, body };
  let status = 0;
  let response: any;
  try {
    response = await requestJson("/api/gacha/" + operation, request, {
      scope,
      signal,
      mutation: !["packs", "read", "proof", "receipts"].includes(operation),
      status: (s) => {
        status = s;
      },
    });
    return response;
  } finally {
    onTrace({
      operation,
      environment: scope.environment,
      scope: { ...scope },
      status,
      latencyMs: Math.round(performance.now() - start),
      request: traceValue(request),
      response: traceValue(response ?? { error: "transport_uncertain" }),
      at: new Date().toISOString(),
    });
  }
}
