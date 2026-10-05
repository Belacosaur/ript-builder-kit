import { test } from "node:test";
import assert from "node:assert/strict";
import { bindQuote, validateBoundQuote } from "./quotes.js";
const scope = {
  environment: "sandbox" as const,
  partnerId: "p",
  wallet: "w",
  chain: "c",
};
test("sellback quote owns the requested SKU set independent of UI selection", () => {
  const quote = bindQuote(
    { intentId: "i", transaction: "tx", skuIds: ["b", "a"] },
    scope,
    "id",
    "sellback",
    ["a", "b"],
  );
  assert.deepEqual(quote.skuIds, ["a", "b"]);
  validateBoundQuote(quote, scope, "id");
  assert.throws(() => validateBoundQuote(quote, scope, "other"));
  assert.throws(() =>
    bindQuote(
      { intentId: "i", transaction: "tx" },
      scope,
      "id",
      "sellback",
      [],
    ),
  );
});
