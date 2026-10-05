import { test } from "node:test";
import assert from "node:assert/strict";
const module = await import("./treasury-contract.js").catch(() => null);
test("treasury contract fixes environment routing and bounds activity", () => {
  assert.ok(module, "treasury contract missing");
  assert.equal(
    module.resolveTreasury("get", {}, undefined, "sandbox").path,
    "/sandbox/v1/gacha/treasury",
  );
  assert.equal(
    module.resolveTreasury("activity", { limit: "20" }, undefined, "live").path,
    "/v1/gacha/treasury/activity?limit=20",
  );
  for (const p of [
    { limit: "51" },
    { partnerId: "other" },
    { before: "bad" },
  ] as Record<string, string>[])
    assert.throws(() =>
      module.resolveTreasury("activity", p, undefined, "sandbox"),
    );
});
