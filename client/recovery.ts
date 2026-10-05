import { validateBody } from "../shared/contract.js";
import type { Environment, OperationId, Params } from "../shared/contract.js";
export type Scope = {
  environment: Environment;
  partnerId: string;
  wallet: string;
  chain: string;
};
export type Pending = Scope & {
  packId: string;
  quantity: number;
  clientNonce: string;
  orderId?: string;
  intentId?: string;
  signedTransaction?: string;
  sellback?: { intentId: string; transaction: string; skuIds: string[] };
};
export type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function sameScope(a: Scope, b: Scope) {
  return (
    a.environment === b.environment &&
    a.partnerId === b.partnerId &&
    a.wallet === b.wallet &&
    a.chain === b.chain
  );
}
export function storageKey(s: Scope) {
  return (
    "gacha-lab:" +
    JSON.stringify([s.environment, s.partnerId, s.wallet, s.chain])
  );
}
export type RecoveryLoad =
  | { kind: "absent" }
  | { kind: "ready"; pending: Pending }
  | { kind: "corrupt"; reason: string }
  | { kind: "unavailable"; reason: string };
export function validatePending(value: unknown, scope: Scope): Pending {
  const p = value as Pending;
  if (
    !p ||
    typeof p !== "object" ||
    !sameScope(scope, p) ||
    typeof p.chain !== "string" ||
    !p.chain ||
    p.chain.length > 128
  )
    throw new Error("pending_invalid");
  validateBody("create", {
    partner_id: p.partnerId,
    wallet: p.wallet,
    packId: p.packId,
    quantity: p.quantity,
    clientNonce: p.clientNonce,
  });
  if (p.orderId !== undefined && !/^[a-f0-9]{64}$/.test(p.orderId))
    throw new Error("pending_invalid");
  if (
    p.intentId !== undefined &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      p.intentId,
    )
  )
    throw new Error("pending_invalid");
  if (p.signedTransaction !== undefined) {
    if (!p.orderId || !p.intentId) throw new Error("pending_invalid");
    validateBody("submit", {
      wallet: p.wallet,
      intentId: p.intentId,
      transaction: p.signedTransaction,
    });
  }
  if (p.sellback) {
    if (!p.orderId) throw new Error("pending_invalid");
    validateBody("sellbackSubmit", {
      wallet: p.wallet,
      intentId: p.sellback.intentId,
      transaction: p.sellback.transaction,
    });
    validateBody("sellbackPrepare", {
      wallet: p.wallet,
      skuIds: p.sellback.skuIds,
    });
  }
  return p;
}
export function savePending(
  scope: Scope,
  pending: Pending,
  storage: StoragePort,
) {
  validatePending(pending, scope);
  storage.setItem(storageKey(scope), JSON.stringify({ version: 1, pending }));
}
export function loadRecovery(scope: Scope, storage: StoragePort): RecoveryLoad {
  let raw: string | null;
  try {
    raw = storage.getItem(storageKey(scope));
  } catch {
    return { kind: "unavailable", reason: "recovery_unavailable" };
  }
  if (raw === null) return { kind: "absent" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== undefined && parsed.version !== 1)
      throw new Error();
    const pending = validatePending(
      parsed?.version === 1 ? parsed.pending : parsed,
      scope,
    );
    if (parsed?.version === undefined) {
      try {
        savePending(scope, pending, storage);
      } catch {
        return {
          kind: "unavailable",
          reason: "recovery_migration_unavailable",
        };
      }
    }
    return { kind: "ready", pending };
  } catch {
    return { kind: "corrupt", reason: "recovery_corrupt" };
  }
}
export function loadPending(
  scope: Scope,
  storage: StoragePort,
): Pending | null {
  const value = loadRecovery(scope, storage);
  if (value.kind === "absent") return null;
  if (value.kind === "ready") return value.pending;
  throw new Error(value.reason);
}
export function removeResolvedConsent(
  scope: Scope,
  pending: Pending,
  order: any,
  storage: StoragePort,
) {
  if (!canReleasePending(pending, order))
    throw new Error("pending_not_resolved");
  storage.removeItem(storageKey(scope));
}
export function reconcileSellback(pending: Pending, order: any): Pending {
  if (
    pending.sellback &&
    pending.sellback.skuIds.length > 0 &&
    pending.sellback.skuIds.every((id) =>
      order.cards?.some((c: any) => c.skuId === id && c.disposition === "sold"),
    )
  ) {
    const { sellback: _, ...rest } = pending;
    return rest;
  }
  return pending;
}
export function mergeOrder(
  pending: Pending | null,
  order: any,
  scope: Scope,
): Pending {
  validateOrder(order, scope);
  if (
    pending &&
    (!sameScope(pending, scope) ||
      (pending.orderId && pending.orderId !== order.id) ||
      pending.packId !== order.packId ||
      pending.quantity !== order.quantity ||
      pending.clientNonce !== order.clientNonce)
  )
    throw new Error("pending_order_exists");
  return reconcileSellback(
    {
      ...pending,
      ...scope,
      orderId: order.id,
      packId: order.packId,
      quantity: order.quantity,
      clientNonce: order.clientNonce,
    },
    order,
  );
}
export function canReleasePending(pending: Pending | null, order: any) {
  return (
    !!order &&
    !!pending &&
    pending?.orderId === order.id &&
    !pending.sellback &&
    !order.cards?.some((c: any) => c.disposition === "buyback_pending") &&
    (order.state === "complete" ||
      (order.state === "expired" && order.safeToRetry) ||
      (order.state === "refunded" && !!order.refundSignature))
  );
}
/** Only authoritative terminal evidence can release a browser recovery blocker. */
export function canAutoReleasePending(pending: Pending | null, order: any) {
  if (!pending || !order || !canReleasePending(reconcileSellback(pending, order), order)) return false;
  return (order.state === "expired" && order.safeToRetry === true) ||
    (order.state === "complete" && order.cards?.length > 0 && order.cards.every((c: any) => ["sold", "kept"].includes(c.disposition)));
}
export async function recoverExpiredSellback(
  pending: Pending,
  error: unknown,
  read: () => Promise<any>,
): Promise<{ pending: Pending; order?: any }> {
  if (
    !(error instanceof Error) ||
    error.message !== "buyback_expired" ||
    !pending.sellback
  )
    return { pending };
  const order = await read();
  validateOrder(order, pending);
  if (
    order.id !== pending.orderId ||
    !pending.sellback.skuIds.length ||
    !pending.sellback.skuIds.every((id) =>
      order.cards?.some(
        (c: any) => c.skuId === id && c.disposition === "vaulted",
      ),
    )
  )
    throw new Error("sellback_expiry_not_reconciled");
  const { sellback: _, ...rest } = pending;
  return { pending: rest, order };
}
export function validateOrder(order: any, scope: Scope): any {
  if (
    !order ||
    !sameScope(order, scope) ||
    typeof order.id !== "string" ||
    !Number.isInteger(order.quantity) ||
    order.quantity < 1 ||
    order.quantity > 10
  )
    throw new Error("order_scope_or_shape_invalid");
  if (order.state === "complete") {
    if (
      !order.paymentSignature ||
      !Array.isArray(order.cards) ||
      order.cards.length !== order.quantity ||
      order.cards.some((c: any) => !c.skuId) ||
      new Set(order.cards.map((c: any) => c.skuId)).size !== order.quantity ||
      (order.paymentFirst && !order.fulfilmentSignature)
    )
      throw new Error("complete_order_evidence_missing");
  }
  return order;
}
type Ports = {
  storage: StoragePort;
  call: (
    op: OperationId,
    params: Params,
    body?: Record<string, unknown>,
  ) => Promise<any>;
};
export async function resumeOrder(pending: Pending, ports: Ports) {
  savePending(pending, pending, ports.storage);
  let order;
  if (pending.signedTransaction && pending.intentId && pending.orderId) {
    order = await ports.call(
      "submit",
      { id: pending.orderId },
      {
        wallet: pending.wallet,
        intentId: pending.intentId,
        transaction: pending.signedTransaction,
      },
    );
    if (!order.id)
      order = await ports.call("read", {
        id: pending.orderId,
        wallet: pending.wallet,
      });
  } else if (pending.orderId)
    order = await ports.call("read", {
      id: pending.orderId,
      wallet: pending.wallet,
    });
  else
    order = await ports.call(
      "create",
      {},
      {
        partner_id: pending.partnerId,
        wallet: pending.wallet,
        packId: pending.packId,
        quantity: pending.quantity,
        clientNonce: pending.clientNonce,
      },
    );
  validateOrder(order, pending);
  if (
    order.packId !== pending.packId ||
    order.quantity !== pending.quantity ||
    order.clientNonce !== pending.clientNonce
  )
    throw new Error("order_request_mismatch");
  pending.orderId = order.id;
  savePending(pending, pending, ports.storage);
  return order;
}
