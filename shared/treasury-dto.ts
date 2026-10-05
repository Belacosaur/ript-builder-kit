import type {
  TreasurySnapshot,
  TreasuryActivityPage,
} from "./treasury-contract.js";
type Scope = { environment: string; partnerId: string; chain: string };
const units = (v: unknown) => typeof v === "string" && /^\d+$/.test(v);
const address = (v: unknown) =>
  typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
function check(v: unknown): asserts v {
  if (!v) throw new Error("invalid_treasury_observation");
}
function binding(v: any, s: Scope) {
  check(
    v &&
      v.environment === s.environment &&
      v.partnerId === s.partnerId &&
      v.chain === s.chain &&
      address(v.mint),
  );
}
export function validateTreasurySnapshot(v: any, s: Scope): TreasurySnapshot {
  binding(v, s);
  check(
    v.commitment === "finalized" &&
      v.decimals === 6 &&
      Number.isFinite(Date.parse(v.observedAt)) &&
      ["observed", "unavailable", "not-provisioned"].includes(v.status),
  );
  check(
    (v.vault === null || address(v.vault)) &&
      (v.tokenAccount === null || address(v.tokenAccount)) &&
      Array.isArray(v.packHealth) &&
      Array.isArray(v.reasons) &&
      v.reasons.every((x: unknown) => typeof x === "string"),
  );
  check(
    v.status === "observed"
      ? units(v.balanceUnits) &&
          units(v.requiredFloatUnits) &&
          units(v.shortfallUnits) &&
          address(v.vault) &&
          address(v.tokenAccount)
      : v.balanceUnits === null &&
          v.requiredFloatUnits === null &&
          v.shortfallUnits === null &&
          v.packHealth.length === 0,
  );
  check(
    v.packHealth.every(
      (p: any) =>
        typeof p.packId === "string" &&
        units(p.requiredFloatUnits) &&
        units(p.shortfallUnits) &&
        typeof p.enabled === "boolean" &&
        typeof p.ready === "boolean",
    ),
  );
  return v;
}
export function validateTreasuryActivity(
  v: any,
  s: Scope,
  snapshot: TreasurySnapshot,
): TreasuryActivityPage {
  binding(v, s);
  check(
    v.mint === snapshot.mint &&
      v.tokenAccount === snapshot.tokenAccount &&
      v.source === "finalized-chain-observations" &&
      v.historyComplete === false &&
      Array.isArray(v.items) &&
      v.items.length <= 50,
  );
  const signature = (x: unknown) =>
    typeof x === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(x);
  check(v.nextCursor === null || signature(v.nextCursor));
  check(
    v.items.every(
      (x: any) =>
        signature(x.signature) &&
        Number.isSafeInteger(x.slot) &&
        x.slot >= 0 &&
        (x.blockTime === null || Number.isSafeInteger(x.blockTime)) &&
        ["observed", "unavailable", "failed"].includes(x.status) &&
        (x.status === "observed"
          ? typeof x.deltaUnits === "string" && /^-?\d+$/.test(x.deltaUnits)
          : x.deltaUnits === null),
    ),
  );
  return v;
}
export function formatTreasuryUnits(v: string | null) {
  if (v === null) return "Unknown";
  const negative = v.startsWith("-");
  const digits = (negative ? v.slice(1) : v).padStart(7, "0");
  return (negative ? "-" : "") + digits.slice(0, -6) + "." + digits.slice(-6);
}
