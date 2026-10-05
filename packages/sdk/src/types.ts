import type { Environment } from "../../../shared/contract.js";
export type {
  TreasurySnapshot,
  TreasuryActivity,
  TreasuryActivityPage,
} from "../../../shared/treasury-contract.js";
export type { Environment };
export type RequestOptions = { signal?: AbortSignal; retries?: number };
export type Credentials = {
  gachaKey?: string;
  inventoryKey?: string;
  collectorSession?: string;
  partnerSession?: string;
};
export type CreateOrder = {
  partner_id: string;
  wallet: string;
  packId: string;
  quantity: number;
  clientNonce: string;
};
export type GachaOrder = {
  id: string;
  wallet: string;
  partnerId: string;
  environment: Environment;
  chain: string;
  packId: string;
  quantity: number;
  clientNonce: string;
  state: string;
  cards?: Record<string, unknown>[];
  paymentSignature?: string;
  fulfilmentSignature?: string;
};
export type Catalog = {
  environment: Environment;
  partnerId: string;
  chain: string;
  packs: {
    id: string;
    label?: string;
    imageUrl?: string;
    priceUsd: number;
    status: string;
    available: number;
    maxQuantity: number;
    balanceUsdc: number;
    requiredFloatUsdc: number;
  }[];
};

export type ReportExport = {
  contentType: string | null;
  content: string;
  source: "api";
};
