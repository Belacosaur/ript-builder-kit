import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canDraw,
  canDecide,
  canSignQuote,
  traceValue,
  ScopeGate,
} from "./model.js";
test("draw is blocked by stock, treasury and absent wallet", () => {
  const pack = {
    status: "available",
    maxQuantity: 3,
    balanceUsdc: 500,
    requiredFloatUsdc: 500,
  };
  assert.equal(canDraw(pack, 1, true), true);
  for (const [p, q, w] of [
    [{ ...pack, status: "paused" }, 1, true],
    [{ ...pack, balanceUsdc: 0 }, 1, true],
    [pack, 4, true],
    [pack, 1, false],
  ] as const)
    assert.equal(canDraw(p, q, w), false);
});
test("card decisions blocked during pending sellback and partner kept cards are settled", () => {
  assert.equal(
    canDecide(
      {
        state: "complete",
        cards: [{ disposition: "vaulted" }, { disposition: "buyback_pending" }],
      },
      "vaulted",
    ),
    false,
  );
  assert.equal(
    canDecide({ state: "complete", cards: [{ disposition: "kept" }] }, "kept"),
    false,
  );
});
test("trace masks nested keys and signed bytes", () => {
  assert.equal(
    JSON.stringify(
      traceValue({
        transaction: "bytes",
        nested: { password: "pass", key: "ript_gacha_live_secret" },
      }),
    ).includes("secret"),
    false,
  );
  assert.equal(traceValue({ transaction: "bytes" }).transaction, "[redacted]");
});
test("late completion cannot commit after environment switch", () => {
  const gate = new ScopeGate();
  const ticket = gate.capture();
  gate.invalidate();
  assert.equal(gate.current(ticket), false);
  assert.equal(gate.current(gate.capture()), true);
});
test("paid order still allows a new sellback signature but never a second payment", () => {
  assert.equal(canSignQuote("sellback", { signedTransaction: "paid" }), true);
  assert.equal(canSignQuote("payment", { signedTransaction: "paid" }), false);
  assert.equal(
    canSignQuote("sellback", { sellback: { transaction: "saved" } }),
    false,
  );
});
test("actual vaulted cards can be kept or sold", () => {
  assert.equal(
    canDecide(
      { state: "complete", cards: [{ disposition: "vaulted" }] },
      "vaulted",
    ),
    true,
  );
});
