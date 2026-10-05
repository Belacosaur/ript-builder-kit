import { test } from "node:test";
import assert from "node:assert/strict";
import { services, resolveServiceOperation } from "./services.js";
import { sanitize } from "./sanitize.js";
test("registry includes every offered service and refuses paused/unknown operations", () => {
  assert.equal(services.length, 10);
  assert.throws(
    () =>
      resolveServiceOperation(
        "aggregator",
        "anything",
        {},
        undefined,
        "sandbox",
      ),
    /service_paused/,
  );
  assert.throws(() =>
    resolveServiceOperation(
      "inventory",
      "https://evil.example",
      {},
      undefined,
      "sandbox",
    ),
  );
});
test("diagnostic sanitizer removes all key namespaces, private URLs and signed bytes", () => {
  const result = JSON.stringify(
    sanitize({
      key: "rk_test_123",
      note: "Bearer private ript_gacha_live_123 rk_live_456",
      imageUrl: "https://store.example/private/card?X-Amz-Signature=abc",
      transaction: "bytes",
      sessionToken: "owner",
      signature: "consent",
    }),
  );
  for (const secret of [
    "rk_test_123",
    "rk_live_456",
    "ript_gacha_live_123",
    "bytes",
    "owner",
    "X-Amz-Signature",
    "consent",
  ])
    assert.ok(!result.includes(secret));
});
test("published registry includes all Gacha and testing operations", () => {
  assert.equal(services.find((s) => s.id === "gacha")!.operations.length, 10);
  assert.equal(services.find((s) => s.id === "testing")!.operations.length, 4);
});
