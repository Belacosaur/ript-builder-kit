import type { ServiceCall } from "./inventory.js";
export function createSupplierClient(call: ServiceCall) {
  return {
    profile: () => call("profile", {}),
    skus: (cursor?: string) =>
      call("skus", { paged: "1", ...(cursor ? { cursor } : {}) }),
    lookup: (body: Record<string, unknown>) => call("lookup", {}, body),
  };
}
