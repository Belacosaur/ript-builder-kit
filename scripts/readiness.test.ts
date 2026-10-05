import { test } from "node:test";
import assert from "node:assert/strict";
import { runReadiness } from "./readiness.js";
test("reachable catalogs with zero available packs or missing buyer funds/link are not ready", async () => {
  const result = await runReadiness(
    {
      configured: true,
      packs: [
        {
          status: "paused",
          maxQuantity: 0,
          balanceUsdc: 0,
          requiredFloatUsdc: 500,
        },
      ],
      wallet: "buyer",
      chain: "chain",
      mint: "mint",
      locksAvailable: true,
    },
    {
      balances: async () => {
        throw new Error("RPC unavailable");
      },
      collectorLinked: async () => undefined,
    },
  );
  assert.equal(result.ok, false);
  assert.equal(
    result.checks.find((c) => c.id === "buyer-funds")!.status,
    "unverified",
  );
  assert.equal(
    result.checks.find((c) => c.id === "playable-packs")!.status,
    "blocked",
  );
});
