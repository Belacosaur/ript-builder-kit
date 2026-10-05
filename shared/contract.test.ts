import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOperation, validateBody } from "./contract.js";
const wallet = "11111111111111111111111111111111";
test("routes exact scoped read and refuses path injection", () => {
  assert.deepEqual(resolveOperation("read", { id: "a".repeat(64), wallet }), {
    method: "GET",
    path: "/v1/gacha/orders/" + "a".repeat(64) + "?wallet=" + wallet,
  });
  for (const operation of [
    "https://evil.test",
    "../packs",
    "%2e%2e",
    "unknown",
  ])
    assert.throws(() => resolveOperation(operation, {}));
  assert.throws(() =>
    resolveOperation("keep", { id: "a".repeat(64), skuId: "../x" }),
  );
  assert.equal(resolveOperation("packs", {}).path, "/v1/gacha/packs");
});
test("rejects malformed draw and signed payloads before upstream", () => {
  const valid = {
    partner_id: "11111111-1111-4111-8111-111111111111",
    wallet,
    packId: "pack-one",
    quantity: 1,
    clientNonce: "abcdefghijklmnop",
  };
  assert.deepEqual(validateBody("create", valid), valid);
  for (const patch of [
    { quantity: 0 },
    { quantity: 11 },
    { clientNonce: "short" },
    { wallet: "invalid" },
    { packId: "../x" },
    { unexpected: true },
  ])
    assert.throws(() => validateBody("create", { ...valid, ...patch }));
  assert.throws(() =>
    validateBody("submit", {
      wallet,
      intentId: valid.partner_id,
      transaction: "x".repeat(2001),
    }),
  );
});

test("public address validator retains web3 canonical 32-byte behavior without wallet runtime dependency", async () => {
  const { Keypair, PublicKey } = await import("@solana/web3.js");
  const { validWallet } = await import("./contract.js");
  for (let n = 0; n < 100; n++)
    assert.equal(validWallet(Keypair.generate().publicKey.toBase58()), true);
  for (const value of [
    "1".repeat(31),
    "1".repeat(33),
    "0".repeat(32),
    "2".repeat(45),
    "",
    "not-a-key",
    null,
  ]) {
    let expected = false;
    try {
      expected =
        typeof value === "string" && new PublicKey(value).toBase58() === value;
    } catch {}
    assert.equal(validWallet(value), expected);
  }
});
