import { storageKey, type Scope, type StoragePort } from "./recovery.js";
export type OrderHistory = {
  id: string;
  state: string;
  packId: string;
  quantity: number;
  observedAt: string;
  paymentSignature?: string;
  fulfilmentSignature?: string;
};
export function listOrders(
  scope: Scope,
  storage: StoragePort = localStorage,
): OrderHistory[] {
  const raw = storage.getItem(storageKey(scope) + ":history");
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("history_corrupt");
  return data.slice(-100);
}
export function recordOrder(
  scope: Scope,
  order: any,
  storage: StoragePort = localStorage,
) {
  const records = listOrders(scope, storage).filter((o) => o.id !== order.id);
  const record: OrderHistory = {
    id: order.id,
    state: order.state,
    packId: order.packId,
    quantity: order.quantity,
    observedAt: new Date().toISOString(),
    paymentSignature: order.paymentSignature,
    fulfilmentSignature: order.fulfilmentSignature,
  };
  storage.setItem(
    storageKey(scope) + ":history",
    JSON.stringify([...records, record].slice(-100)),
  );
}
