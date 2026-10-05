import type { ServiceId } from "../../../shared/services.js";
import type {
  CatalogQuery,
  DrawRequest,
  PackRequest,
  PackPreviewRequest,
  ReportKind,
  ReportQuery,
} from "../../../shared/inventory-contract.js";
import type {
  TreasurySnapshot,
  TreasuryActivityPage,
  RequestOptions,
  CreateOrder,
  GachaOrder,
  Catalog,
  ReportExport,
} from "./types.js";
export type Invoke = <T = unknown>(
  service: ServiceId | "treasury" | "management",
  op: string,
  params?: Record<string, string>,
  body?: unknown,
  options?: RequestOptions,
) => Promise<T>;
const params = (q: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(q)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
export function createClient(invoke: Invoke) {
  const request =
    (service: ServiceId | "treasury" | "management") =>
    <T = unknown>(
      op: string,
      p: Record<string, string> = {},
      body?: unknown,
      o?: RequestOptions,
    ) =>
      invoke<T>(service, op, p, body, o);
  return {
    request: invoke,
    gacha: {
      request: request("gacha"),
      packs: (o?: RequestOptions) =>
        invoke<Catalog>("gacha", "packs", {}, undefined, o),
      orders: {
        create: (body: CreateOrder, o?: RequestOptions) =>
          invoke<GachaOrder>("gacha", "create", {}, body, o),
        get: (id: string, wallet: string, o?: RequestOptions) =>
          invoke<GachaOrder>("gacha", "read", { id, wallet }, undefined, o),
        payment: (id: string, wallet: string, o?: RequestOptions) =>
          invoke<{ intentId: string; transaction: string }>(
            "gacha",
            "payment",
            { id },
            { wallet },
            o,
          ),
        submit: (
          id: string,
          body: { wallet: string; intentId: string; transaction: string },
          o?: RequestOptions,
        ) => invoke<GachaOrder>("gacha", "submit", { id }, body, o),
        proof: (id: string, wallet: string, o?: RequestOptions) =>
          invoke("gacha", "proof", { id, wallet }, undefined, o),
        receipts: (id: string, wallet: string, o?: RequestOptions) =>
          invoke("gacha", "receipts", { id, wallet }, undefined, o),
        keep: (id: string, skuId: string, wallet: string, o?: RequestOptions) =>
          invoke("gacha", "keep", { id, skuId }, { wallet }, o),
        prepareSellback: (
          id: string,
          body: { wallet: string; skuIds: string[] },
          o?: RequestOptions,
        ) => invoke("gacha", "sellbackPrepare", { id }, body, o),
        submitSellback: (
          id: string,
          body: { wallet: string; intentId: string; transaction: string },
          o?: RequestOptions,
        ) => invoke("gacha", "sellbackSubmit", { id }, body, o),
      },
    },
    management: {
      credentials: {
        list: (o?: RequestOptions) =>
          invoke<{ keys: Record<string, unknown>[] }>(
            "management",
            "credentialsList",
            {},
            undefined,
            o,
          ),
        issue: (label: string, o?: RequestOptions) =>
          invoke<{ id: string; token: string; prefix: string }>(
            "management",
            "credentialsIssue",
            {},
            { label },
            o,
          ),
        revoke: (id: string, o?: RequestOptions) =>
          invoke<{ revoked: boolean }>(
            "management",
            "credentialsRevoke",
            { id },
            undefined,
            o,
          ),
      },
      packs: {
        configure: (
          body: { packIds: string[]; pricesCents?: Record<string, number> },
          o?: RequestOptions,
        ) => invoke("management", "packsConfigure", {}, body, o),
      },
    },
    treasury: {
      prepareFunding: (
        body: { wallet: string; amountUsdc: number },
        o?: RequestOptions,
      ) =>
        invoke<{ transaction: string; lastValidBlockHeight: number }>(
          "management",
          "fundPrepare",
          {},
          body,
          o,
        ),
      get: (o?: RequestOptions) =>
        invoke<TreasurySnapshot>("treasury", "get", {}, undefined, o),
      activity: {
        list: (
          q: { limit?: number; before?: string } = {},
          o?: RequestOptions,
        ) =>
          invoke<TreasuryActivityPage>(
            "treasury",
            "activity",
            params(q),
            undefined,
            o,
          ),
      },
    },
    inventory: {
      request: request("inventory"),
      catalog: (q: CatalogQuery = {}, o?: RequestOptions) =>
        invoke("inventory", "catalog", params(q), undefined, o),
      ledger: (o?: RequestOptions) =>
        invoke("inventory", "ledger", {}, undefined, o),
      claims: (o?: RequestOptions) =>
        invoke("inventory", "claims", {}, undefined, o),
      operation: (id: string, o?: RequestOptions) =>
        invoke("inventory", "operation", { id }, undefined, o),
      draw: (body: DrawRequest, idempotencyKey: string, o?: RequestOptions) =>
        invoke("inventory", "draw", { idempotencyKey }, body, o),
      pack: (body: PackRequest, idempotencyKey: string, o?: RequestOptions) =>
        invoke("inventory", "pack", { idempotencyKey }, body, o),
      preview: (body: PackPreviewRequest, o?: RequestOptions) =>
        invoke("inventory", "preview", {}, body, o),
      buyback: (
        id: string,
        body: { receiptSig?: string } = {},
        o?: RequestOptions,
      ) => invoke("inventory", "buyback", { id }, body, o),
      reports: {
        list: <K extends ReportKind>(
          kind: K,
          q: ReportQuery = {},
          o?: RequestOptions,
        ) =>
          invoke<K extends "reportExport" ? ReportExport : unknown>(
            "inventory",
            kind,
            params(q),
            undefined,
            o,
          ),
      },
    },
    testing: {
      request: request("testing"),
      status: (o?: RequestOptions) =>
        invoke("testing", "status", {}, undefined, o),
      operation: (id: string, o?: RequestOptions) =>
        invoke("testing", "operation", { id }, undefined, o),
      requestWalletFunds: (
        wallet: string,
        requestId: string,
        o?: RequestOptions,
      ) => invoke("testing", "wallet-funds", {}, { wallet, requestId }, o),
      requestTreasuryRefill: (requestId: string, o?: RequestOptions) =>
        invoke("testing", "treasury-refill", {}, { requestId }, o),
    },
    collector: {
      request: request("collector"),
      wallets: (o?: RequestOptions) =>
        invoke("collector", "wallets", {}, undefined, o),
    },
    partner: {
      request: request("partner"),
      profile: (o?: RequestOptions) =>
        invoke("partner", "profile", {}, undefined, o),
    },
    supplier: { request: request("supplier") },
    fulfilment: { request: request("fulfilment") },
  };
}
