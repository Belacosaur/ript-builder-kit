import type { ServiceCall } from "./inventory.js";
export function createFulfilmentClient(call: ServiceCall) {
  return {
    prepare: (
      claim: { id: string; environment: string; isSynthetic?: boolean },
      body: { shipping: Record<string, unknown>; receiptSig?: string },
    ) => {
      if (claim.environment === "sandbox" || claim.isSynthetic !== false)
        return Promise.reject(new Error("synthetic_fulfilment_unavailable"));
      return call("prepare", { id: claim.id }, body);
    },
    read: (operationId: string) => call("read", { id: operationId }),
  };
}
