import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestHash, verifyProofBindings } from "./proof.js";
const m: any = {
  version: 1,
  chain: "chain",
  program: "program",
  orderId: "order",
  wallet: "buyer",
  clientNonce: "nonce",
  packId: "pack",
  packVersion: "1",
  quantity: 1,
  token: "mint",
  recipient: "recipient",
  amount: "25000000",
  expiresAt: 1800000000,
  vrfAuthority: "a".repeat(64),
  weights: [75, 20, 4, 1],
  candidates: [
    {
      skuId: "sku",
      sourceRef: "source",
      band: 0,
      title: "Card",
      imageUrl: "https://example.com/a",
      insuredCents: 1000,
      buybackCents: 850,
    },
  ],
};
test("manifest commitment binds complete public order but retrieved proof is not cryptographic acceptance", () => {
  const order: any = {
    id: "order",
    wallet: "buyer",
    chain: "chain",
    packId: "pack",
    quantity: 1,
    clientNonce: "nonce",
    amount: "25000000",
    mint: "mint",
  };
  const r = verifyProofBindings(
    { manifest: m, manifestHash: manifestHash(m), proof: "public-proof" },
    order,
  );
  assert.equal(r.bindingsVerified, true);
  assert.equal(r.cryptographyVerified, false);
  assert.equal(
    verifyProofBindings(
      { manifest: m, manifestHash: manifestHash(m), proof: "proof" },
      { ...order, wallet: "other" },
    ).bindingsVerified,
    false,
  );
});

test("canonical vectors match independently executed backend manifest.ts", () => {
  assert.equal(
    manifestHash(m),
    "dc5d76a1749e6ce9970bcd939f956e24018e26adc7160882d604311d2d8fb22c",
  );
  const partner = {
    ...m,
    version: 2,
    partner: {
      partnerId: "a0000000-0000-4000-8000-000000000001",
      environment: "sandbox",
      door: "direct",
      treasuryId: 2,
      treasuryVault: "11111111111111111111111111111111",
      gate: "11111111111111111111111111111111",
      highestWinCents: 1000,
    },
  };
  assert.equal(
    manifestHash(partner),
    "71c1537b6609b6487db1ca860f8c69b446d4ca3d4d035bf90d037720040229b7",
  );
});
