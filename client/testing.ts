import { onTrace } from "./api.js";
import { traceValue } from "./model.js";
import { requestJson } from "./transport.js";
import { sameScope, type Scope } from "./recovery.js";
export type TestingCall = (
  operation: string,
  payload: {
    environment: "sandbox";
    params: Record<string, string>;
    body?: Record<string, unknown>;
  },
) => Promise<any>;
export function testingNonceKey(action: string, scope: Scope) {
  return `gacha-testing:${scope.environment}:${scope.partnerId}:${scope.chain}:${scope.wallet}:${action}`;
}
export async function requestTestingFunds(
  action: "wallet-funds" | "treasury-refill",
  scope: Scope,
  current: () => Scope,
  call: TestingCall,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage,
) {
  if (scope.environment !== "sandbox") throw new Error("sandbox_only");
  if (
    !scope.partnerId ||
    !scope.chain ||
    (action === "wallet-funds" && !scope.wallet)
  )
    throw new Error("sandbox_scope_incomplete");
  if (!sameScope(scope, current())) throw new Error("scope_changed");
  const key = testingNonceKey(action, scope);
  let nonce = storage.getItem(key);
  if (!nonce) {
    nonce = crypto.randomUUID();
    storage.setItem(key, nonce);
  }
  const result = await call(action, {
    environment: "sandbox",
    params: {},
    body: {
      requestId: nonce,
      ...(action === "wallet-funds" ? { wallet: scope.wallet } : {}),
    },
  });
  if (!sameScope(scope, current())) throw new Error("scope_changed");
  return result;
}
export async function readTestingStatus(
  scope: Scope,
  current: () => Scope,
  call: TestingCall,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage,
) {
  if (scope.environment !== "sandbox") throw new Error("sandbox_only");
  const result = await call("status", { environment: "sandbox", params: {} });
  if (!sameScope(scope, current())) throw new Error("scope_changed");
  if (result.network?.genesis !== scope.chain)
    throw new Error("sandbox_network_mismatch");
  for (const action of ["wallet-funds", "treasury-refill"]) {
    const key = testingNonceKey(action, scope),
      nonce = storage.getItem(key);
    if (
      nonce &&
      result.operations?.some(
        (r: any) =>
          r.requestId === nonce &&
          r.status === "reconciled" &&
          Array.isArray(r.legs) &&
          r.legs.length > 0 &&
          r.legs.every((leg: any) => leg.status === "reconciled"),
      )
    )
      storage.removeItem(key);
  }
  return result;
}
export async function callTesting(
  operation: string,
  payload: Parameters<TestingCall>[1],
  scope: Scope = {
    environment: "sandbox",
    partnerId: "",
    wallet: String(payload.body?.wallet ?? ""),
    chain: "",
  },
) {
  const start = performance.now();
  let status = 0,
    response: any;
  try {
    response = await requestJson("/api/testing/" + operation, payload, {
      scope,
      mutation: ["wallet-funds", "treasury-refill"].includes(operation),
      status: (value) => {
        status = value;
      },
    });
    return response;
  } finally {
    onTrace({
      operation: "testing/" + operation,
      environment: scope.environment,
      scope: { ...scope },
      status,
      latencyMs: Math.round(performance.now() - start),
      request: traceValue(payload),
      response: traceValue(response ?? { error: "transport_uncertain" }),
      at: new Date().toISOString(),
    });
  }
}

export function resetFailedTestingRequest(
  action: "wallet-funds" | "treasury-refill",
  scope: Scope,
  current: () => Scope,
  operations: any[],
  storage: Pick<Storage, "getItem" | "removeItem"> = localStorage,
) {
  if (scope.environment !== "sandbox" || !sameScope(scope, current()))
    throw new Error("scope_changed");
  const key = testingNonceKey(action, scope),
    nonce = storage.getItem(key),
    operation = operations.find((o) => o.requestId === nonce);
  if (
    !operation ||
    operation.status !== "failed" ||
    !operation.legs?.length ||
    !operation.legs.every((leg: any) =>
      ["failed", "reconciled"].includes(leg.status),
    )
  )
    throw new Error("funding_still_pending");
  storage.removeItem(key);
}
