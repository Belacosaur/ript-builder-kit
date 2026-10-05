import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyAcceptance, verifyTokenMovements } from "./evidence.js";
const scope = {
  environment: "sandbox" as const,
  partnerId: "partner",
  wallet: "buyer",
  chain: "chain",
};
const requirements = {
  scope,
  clientVersion: "build",
  mint: "mint",
  quantity: 2,
  operations: ["payment", "reveal", "sellback"],
};
const run: any = {
  version: 1,
  id: "run",
  scope,
  clientVersion: "build",
  mint: "mint",
  steps: [],
};
test("missing real evidence never passes, including sold labels and submitted signatures", () => {
  const r = verifyAcceptance(
    {
      ...run,
      steps: [
        {
          id: "x",
          source: "api",
          observedAt: new Date().toISOString(),
          scope,
          clientVersion: "build",
          mint: "mint",
          operation: "payment",
          status: "verified",
          details: { signature: "submitted", sold: true },
        },
      ],
    },
    requirements,
  );
  assert.equal(r.ok, false);
  assert.ok(r.failures.length >= 3);
});
test("fixture, mismatched build/scope/mint and duplicate reveal cannot certify current run", () => {
  for (const patch of [
    { source: "fixture" },
    { clientVersion: "old" },
    { mint: "other" },
    { scope: { ...scope, wallet: "other" } },
  ]) {
    const evidence = {
      id: "e",
      observedAt: new Date().toISOString(),
      source: "chain",
      clientVersion: "build",
      mint: "mint",
      scope,
      operation: "reveal",
      status: "verified",
      details: { orderId: "order", cards: [{ skuId: "a" }, { skuId: "a" }] },
      ...patch,
    };
    assert.equal(
      verifyAcceptance({ ...run, steps: [evidence] }, requirements).ok,
      false,
    );
  }
});
test("accounting compares exact transaction deltas, including Ript fee and mint", () => {
  const b = (accountIndex: number, amount: string) => ({
    accountIndex,
    mint: "mint",
    uiTokenAmount: { amount, decimals: 6 },
  });
  const meta = {
    err: null,
    preTokenBalances: [b(0, "100"), b(1, "0"), b(2, "0")],
    postTokenBalances: [b(0, "70"), b(1, "25"), b(2, "5")],
  };
  assert.equal(
    verifyTokenMovements({
      accountKeys: ["vault", "buyer", "fee"],
      meta,
      mint: "mint",
      accounts: { vault: "vault", buyer: "buyer", fee: "fee" },
      buyerUnits: "25",
      feeUnits: "5",
    }),
    true,
  );
  assert.equal(
    verifyTokenMovements({
      accountKeys: ["vault", "buyer", "fee"],
      meta,
      mint: "other",
      accounts: { vault: "vault", buyer: "buyer", fee: "fee" },
      buyerUnits: "25",
      feeUnits: "5",
    }),
    false,
  );
});
