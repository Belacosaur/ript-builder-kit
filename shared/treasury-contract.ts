import type { Environment } from "./contract.js";
import type { OperationDefinition, ValidatedRequest } from "./services.js";
import { check, query, queryInt } from "./validation.js";
export type TreasurySnapshot = {
  environment: Environment;
  partnerId: string;
  chain: string;
  mint: string;
  observedAt: string;
  commitment: "finalized";
  status: "observed" | "not-provisioned" | "unavailable";
  vault: string | null;
  tokenAccount: string | null;
  balanceUnits: string | null;
  decimals: 6;
  requiredFloatUnits: string | null;
  shortfallUnits: string | null;
  packHealth: {
    packId: string;
    requiredFloatUnits: string;
    shortfallUnits: string;
    enabled: boolean;
    ready: boolean;
  }[];
  reasons: string[];
};
export type TreasuryActivity = {
  signature: string;
  slot: number;
  blockTime: number | null;
  status: "observed" | "unavailable" | "failed";
  deltaUnits: string | null;
  reason?: string;
};
export type TreasuryActivityPage = {
  environment: Environment;
  partnerId: string;
  chain: string;
  mint: string;
  tokenAccount: string | null;
  source: "finalized-chain-observations";
  items: TreasuryActivity[];
  nextCursor: string | null;
  historyComplete: false;
};
export function resolveTreasury(
  op: string,
  params: Record<string, string>,
  body: unknown,
  environment: Environment,
): ValidatedRequest {
  check(["get", "activity"].includes(op), "unsupported_operation");
  check(body === undefined);
  const suffix =
    op === "activity"
      ? "/activity" +
        query(params, {
          limit: queryInt(1, 50),
          before: (v) => check(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(v)),
        })
      : "";
  if (op === "get") check(Object.keys(params).length === 0);
  return {
    method: "GET",
    path:
      (environment === "sandbox" ? "/sandbox" : "") +
      "/v1/gacha/treasury" +
      suffix,
    effect: "read",
    auth: "gacha-key",
  };
}
export const treasuryOperations: OperationDefinition[] = [
  "get",
  "activity",
].map((id) => ({
  id,
  method: "GET",
  pathTemplate: "/v1/gacha/treasury" + (id === "activity" ? "/activity" : ""),
  effect: "read",
  description: "Credential-bound treasury read; see docs/builders/deployment.md for deployment verification",
  example: {
    params: id === "activity" ? { limit: "20" } : {},
    body: undefined,
  },
  validate: (p, b, e) => resolveTreasury(id, p, b, e),
}));
