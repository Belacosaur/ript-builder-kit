import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateReadiness } from "./readiness.js";
test("empty packs, account mainnet balances and missing link never report ready", () => {
  const result = evaluateReadiness({
    configured: true,
    packs: [],
    wallet: "wallet",
    chain: "devnet",
    mint: "mint",
    balances: {
      source: "account-wallet",
      tokenUnits: "100000000",
      solLamports: "1000",
    },
    collectorLinked: undefined,
  } as any);
  assert.equal(result.ready, false);
  assert.ok(
    result.checks.some(
      (c) => c.id === "buyer-funds" && c.status !== "verified",
    ),
  );
  assert.ok(
    result.checks.some(
      (c) => c.id === "collector-link" && c.status === "unverified",
    ),
  );
});
