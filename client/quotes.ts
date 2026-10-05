import { sameScope, type Scope } from "./recovery.js";
export type BoundQuote = {
  scope: Scope;
  orderId: string;
  kind: "payment" | "sellback";
  skuIds: string[];
  intentId: string;
  transaction: string;
};
export function bindQuote(
  raw: any,
  scope: Scope,
  orderId: string,
  kind: BoundQuote["kind"],
  skuIds: string[] = [],
): BoundQuote {
  if (!raw?.intentId || !raw.transaction || !orderId)
    throw new Error("quote_invalid");
  if (
    kind === "sellback" &&
    (!skuIds.length ||
      new Set(skuIds).size !== skuIds.length ||
      (raw.skuIds &&
        JSON.stringify([...raw.skuIds].sort()) !==
          JSON.stringify([...skuIds].sort())))
  )
    throw new Error("quote_selection_mismatch");
  return {
    scope: { ...scope },
    orderId,
    kind,
    skuIds: [...skuIds],
    intentId: raw.intentId,
    transaction: raw.transaction,
  };
}
export function validateBoundQuote(
  q: BoundQuote,
  scope: Scope,
  orderId: string,
) {
  if (!sameScope(q.scope, scope) || q.orderId !== orderId)
    throw new Error("quote_order_or_scope_mismatch");
}
