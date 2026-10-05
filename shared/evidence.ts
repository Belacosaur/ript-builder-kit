import { sameScope, type Scope } from "../client/recovery.js";
export type Evidence = {
  id: string;
  source: "fixture" | "api" | "chain";
  observedAt: string;
  clientVersion: string;
  scope: Scope;
  mint: string;
  operation: string;
  status: "verified" | "blocked" | "unverified";
  details: Record<string, any>;
};
export type AcceptanceRun = {
  version: 1;
  id: string;
  scope: Scope;
  clientVersion: string;
  mint: string;
  steps: Evidence[];
};
export type AcceptanceRequirements = {
  scope: Scope;
  clientVersion: string;
  mint: string;
  quantity: number;
  orderId?: string;
  operations: string[];
};
const integer = (v: unknown): v is string =>
  typeof v === "string" && /^(0|[1-9][0-9]*)$/.test(v);
export function verifyTokenMovements(input: {
  accountKeys: string[];
  meta: any;
  mint: string;
  accounts: { vault: string; buyer: string; fee: string };
  buyerUnits: string;
  feeUnits: string;
}) {
  try {
    if (
      input.meta?.err !== null ||
      !integer(input.buyerUnits) ||
      !integer(input.feeUnits) ||
      BigInt(input.buyerUnits) <= 0n ||
      new Set(Object.values(input.accounts)).size !== 3
    )
      return false;
    const delta = (address: string) => {
      const index = input.accountKeys.indexOf(address);
      if (index < 0 || input.accountKeys.lastIndexOf(address) !== index)
        throw new Error();
      const value = (balances: any[]) => {
        const rows = balances.filter(
          (b) => b.accountIndex === index && b.mint === input.mint,
        );
        if (
          rows.length !== 1 ||
          rows[0].uiTokenAmount.decimals !== 6 ||
          !integer(rows[0].uiTokenAmount.amount)
        )
          throw new Error();
        return BigInt(rows[0].uiTokenAmount.amount);
      };
      return (
        value(input.meta.postTokenBalances) - value(input.meta.preTokenBalances)
      );
    };
    const buyer = BigInt(input.buyerUnits),
      fee = BigInt(input.feeUnits);
    return (
      delta(input.accounts.buyer) === buyer &&
      delta(input.accounts.fee) === fee &&
      delta(input.accounts.vault) === -(buyer + fee)
    );
  } catch {
    return false;
  }
}
/** Structural evidence gate. An exported file is not an independent RPC attestation. */
export function verifyAcceptance(
  run: AcceptanceRun,
  requirements: AcceptanceRequirements,
) {
  const failures: string[] = [];
  try {
    if (
      run.version !== 1 ||
      !sameScope(run.scope, requirements.scope) ||
      run.clientVersion !== requirements.clientVersion ||
      run.mint !== requirements.mint ||
      !Array.isArray(run.steps) ||
      run.steps.length > 200
    )
      throw new Error();
    const ids = new Set<string>();
    for (const step of run.steps) {
      if (ids.has(step.id)) failures.push("duplicate-evidence");
      ids.add(step.id);
      if (
        step.source === "fixture" ||
        step.clientVersion !== requirements.clientVersion ||
        step.mint !== requirements.mint ||
        !sameScope(step.scope, requirements.scope) ||
        !Number.isFinite(Date.parse(step.observedAt))
      )
        failures.push("invalid-evidence-binding:" + step.id);
    }
    const accepted = run.steps.filter(
      (e) =>
        e.status === "verified" &&
        e.source !== "fixture" &&
        sameScope(e.scope, requirements.scope) &&
        e.clientVersion === requirements.clientVersion &&
        e.mint === requirements.mint,
    );
    const orderIds = new Set(
      accepted.map((e) => e.details.orderId).filter(Boolean),
    );
    if (
      orderIds.size !== 1 ||
      (requirements.orderId && !orderIds.has(requirements.orderId))
    )
      failures.push("order-binding-missing-or-mixed");
    for (const op of requirements.operations) {
      const steps = accepted.filter((e) => e.operation === op);
      let valid = false;
      for (const e of steps) {
        const d = e.details;
        if (op === "payment" || op === "fulfilment")
          valid ||=
            e.source === "chain" &&
            d.commitment === "finalized" &&
            d.meta?.err === null &&
            Number.isSafeInteger(d.slot) &&
            /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(d.signature ?? "") &&
            integer(d.amountUnits) &&
            BigInt(d.amountUnits) > 0n;
        else if (op === "reveal") {
          const cards = d.cards;
          valid ||=
            Array.isArray(cards) &&
            cards.length === requirements.quantity &&
            cards.every((c: any) => typeof c.skuId === "string" && c.skuId) &&
            new Set(cards.map((c: any) => c.skuId)).size === cards.length;
        } else if (op === "sellback")
          valid ||=
            e.source === "chain" &&
            d.commitment === "finalized" &&
            d.status === "finalized" &&
            verifyTokenMovements(d.accounting);
        else if (op === "proof")
          valid ||=
            d.bindingsVerified === true &&
            d.cryptographyVerified === true &&
            d.independentVerification === true;
        else if (op === "keep")
          valid ||=
            d.disposition === "kept" &&
            d.collectorWallet === requirements.scope.wallet;
        else valid ||= d.reconciled === true;
      }
      if (!valid) failures.push("missing-final-evidence:" + op);
    }
  } catch {
    failures.push("invalid-run");
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)] };
}
