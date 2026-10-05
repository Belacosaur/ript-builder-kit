import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSupplier } from "../../shared/supplier-contract.js";
test("supplier portal isolates session and rejects unknown ownership fields", () => {
  assert.equal(
    resolveSupplier("skus", { paged: "1" }, undefined, "sandbox").auth,
    "partner-session",
  );
  assert.throws(() =>
    resolveSupplier("skus", { owner: "other" }, undefined, "sandbox"),
  );
  assert.throws(() =>
    resolveSupplier(
      "lookup",
      {},
      { query: "card", ownerUserId: "other" },
      "sandbox",
    ),
  );
});
