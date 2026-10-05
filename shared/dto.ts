import type { Scope } from "../client/recovery.js";
export type GachaCard = {
  skuId: string;
  disposition: "vaulted" | "kept" | "sold" | "buyback_pending";
  [key: string]: unknown;
};
export type GachaOrder = Scope & {
  id: string;
  packId: string;
  quantity: number;
  clientNonce: string;
  state: string;
  cards?: GachaCard[];
  paymentSignature?: string;
  fulfilmentSignature?: string;
  paymentFirst?: boolean;
  [key: string]: unknown;
};
export type GachaCatalog = {
  partnerId: string;
  chain: string;
  packs: Array<{
    id: string;
    status: string;
    maxQuantity: number;
    balanceUsdc: number;
    requiredFloatUsdc: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};
export type GachaQuote = {
  intentId: string;
  transaction: string;
  [key: string]: unknown;
};
export function validateCatalog(value: any): GachaCatalog {
  if (
    !value ||
    typeof value.partnerId !== "string" ||
    typeof value.chain !== "string" ||
    !Array.isArray(value.packs) ||
    value.packs.some(
      (p: any) =>
        !p ||
        typeof p.id !== "string" ||
        typeof p.status !== "string" ||
        !Number.isInteger(p.maxQuantity) ||
        !Number.isFinite(p.balanceUsdc) ||
        !Number.isFinite(p.requiredFloatUsdc),
    )
  )
    throw new Error("catalog_shape_invalid");
  return value;
}
