import type { BuyerBalances } from "../client/balances.js";
export type ReadinessCheck = {
  id: string;
  status: "verified" | "blocked" | "unverified";
  source: "api" | "chain" | "local";
  reason: string;
};
export type ReadinessInput = {
  configured: boolean;
  packs: any[];
  wallet: string;
  chain: string;
  mint: string;
  balances?: BuyerBalances | null;
  requiredTokenUnits?: string;
  collectorLinked?: boolean;
  locksAvailable?: boolean;
  recoveryBlocked?: boolean;
};
export function evaluateReadiness(input: ReadinessInput): {
  ready: boolean;
  checks: ReadinessCheck[];
} {
  const checks: ReadinessCheck[] = [];
  const add = (
    id: string,
    status: ReadinessCheck["status"],
    source: ReadinessCheck["source"],
    reason: string,
  ) => checks.push({ id, status, source, reason });
  add(
    "credentials",
    input.configured ? "verified" : "blocked",
    "local",
    input.configured
      ? "Matching credential configured"
      : "Supply matching service credential",
  );
  add(
    "playable-packs",
    input.packs.some(
      (p) =>
        p.status === "available" &&
        p.maxQuantity > 0 &&
        p.balanceUsdc >= p.requiredFloatUsdc,
    )
      ? "verified"
      : "blocked",
    "api",
    "Catalog stock and required partner float",
  );
  add(
    "buyer-wallet",
    input.wallet ? "verified" : "blocked",
    "local",
    "Injected buyer wallet",
  );
  const b = input.balances,
    valid =
      b?.source === "chain" &&
      b.chain === input.chain &&
      b.mint === input.mint &&
      b.wallet === input.wallet;
  add(
    "buyer-funds",
    !valid
      ? "unverified"
      : BigInt(b!.tokenUnits) >= BigInt(input.requiredTokenUnits ?? "1") &&
          BigInt(b!.solLamports) > 0n
        ? "verified"
        : "blocked",
    "chain",
    valid
      ? "Observed finalized balances; exact wallet fee is quote-dependent"
      : "Read actual configured chain and mint balances",
  );
  add(
    "collector-link",
    input.collectorLinked === true
      ? "verified"
      : input.collectorLinked === false
        ? "blocked"
        : "unverified",
    "api",
    "Verify connected wallet under explicit collector session before Keep",
  );
  add(
    "financial-lock",
    input.locksAvailable ? "verified" : "blocked",
    "local",
    "Browser Web Locks required for financial actions",
  );
  add(
    "recovery",
    input.recoveryBlocked ? "blocked" : "verified",
    "local",
    "Corrupt/inaccessible saved consent blocks mutations",
  );
  return { ready: checks.every((c) => c.status === "verified"), checks };
}
