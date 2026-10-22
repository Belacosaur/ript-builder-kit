import { sameScope, type Scope } from "./recovery.js";

export type SellbackReceipt = { orderId: string; signature: string; creditedUnits: string; decimals: number; skuIds: string[] };
export function sellbackReceipt(raw: any, scope: Scope, order: any, mint: string, expectedSkuIds?: string[]): SellbackReceipt {
  if (!sameScope(raw ?? {}, scope) || raw.orderId !== order.id || raw.mint !== mint)
    throw new Error("receipt_scope_mismatch");
  const sale = raw.sellback, accounting = sale?.accounting;
  if (sale?.status !== "finalized" || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(sale.sellbackSignature ?? "") ||
      accounting?.source !== "finalized-transaction" || accounting.mint !== mint ||
      !Array.isArray(sale.skuIds) || !sale.skuIds.length ||
      new Set(sale.skuIds).size !== sale.skuIds.length ||
      sale.skuIds.some((id: string) => !order.cards?.some((c: any) => c.skuId === id && c.disposition === "sold")))
    throw new Error("sellback_receipt_pending");
  if (expectedSkuIds && JSON.stringify([...expectedSkuIds].sort()) !== JSON.stringify([...sale.skuIds].sort()))
    throw new Error("receipt_selection_mismatch");
  let decimals: number | undefined;
  const sum = (rows: any) => {
    if (!Array.isArray(rows)) throw new Error("receipt_accounting_unavailable");
    const owned = rows.filter((r: any) => r.owner === scope.wallet && r.mint === mint);
    if (!owned.length) throw new Error("receipt_accounting_unavailable");
    const indices = new Set<number>();
    return owned.reduce((n: bigint, row: any) => {
      const amount = row.uiTokenAmount;
      if (!Number.isInteger(row.accountIndex) || indices.has(row.accountIndex) ||
          !/^\d+$/.test(amount?.amount ?? "") || !Number.isInteger(amount.decimals) ||
          amount.decimals < 0 || amount.decimals > 18 ||
          (decimals !== undefined && decimals !== amount.decimals))
        throw new Error("receipt_accounting_invalid");
      indices.add(row.accountIndex); decimals = amount.decimals;
      return n + BigInt(amount.amount);
    }, 0n);
  };
  const before = sum(accounting.preTokenBalances), after = sum(accounting.postTokenBalances);
  if (after <= before) throw new Error("receipt_credit_unconfirmed");
  return { orderId: order.id, signature: sale.sellbackSignature, creditedUnits: (after - before).toString(), decimals: decimals!, skuIds: [...sale.skuIds] };
}
