import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyRecordedRun } from "./verify-acceptance.js";
test("offline recorded evidence cannot claim independent chain acceptance", () => {
  const run: any = {
    version: 1,
    id: "r",
    scope: { environment: "sandbox", wallet: "w", chain: "c", partnerId: "p" },
    clientVersion: "v",
    mint: "m",
    steps: [],
  };
  const result = verifyRecordedRun(run, {
    scope: run.scope,
    clientVersion: "v",
    mint: "m",
    quantity: 1,
    operations: ["payment", "fulfilment", "proof", "sellback"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.independentChainAttestation, false);
});
