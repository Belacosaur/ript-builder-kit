import { test } from "node:test";
import assert from "node:assert/strict";
import { executeOperation } from "./explorer.js";
import { Keypair, Transaction, SystemProgram } from "@solana/web3.js";
const scope = {
  environment: "sandbox" as const,
  partnerId: "p",
  chain: "c",
  wallet: "w",
};
test("explorer create retains nonce before an uncertain response", async () => {
  let saved: any;
  await assert.rejects(() =>
    executeOperation(
      "create",
      scope,
      {},
      {
        partner_id: "p",
        wallet: "w",
        packId: "pack",
        quantity: 1,
        clientNonce: "original",
      },
      {
        pending: null,
        save: (p) => {
          saved = p;
        },
        call: async () => {
          assert.equal(saved.clientNonce, "original");
          throw new Error("uncertain");
        },
      },
    ),
  );
  assert.equal(saved.packId, "pack");
});
test("explorer cannot replace a pending draw or signed payment", async () => {
  let calls = 0;
  const pending = {
    ...scope,
    packId: "pack",
    quantity: 1,
    clientNonce: "original",
    orderId: "id",
    intentId: "intent",
    signedTransaction: "first",
  };
  const ports = {
    pending,
    save: () => {},
    call: async () => {
      calls++;
    },
  };
  await assert.rejects(() =>
    executeOperation(
      "create",
      scope,
      {},
      {
        partner_id: "p",
        wallet: "w",
        packId: "pack",
        quantity: 1,
        clientNonce: "second",
      },
      ports,
    ),
  );
  await assert.rejects(() =>
    executeOperation(
      "submit",
      scope,
      { id: "id" },
      { wallet: "w", intentId: "intent", transaction: "second" },
      ports,
    ),
  );
  assert.equal(calls, 0);
});
test("explorer persists exact signed bytes before submit", async () => {
  let saved: any;
  const key = Keypair.generate();
  const ownerScope = { ...scope, wallet: key.publicKey.toBase58() };
  const tx = new Transaction({
    feePayer: key.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  }).add(
    SystemProgram.transfer({
      fromPubkey: key.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    }),
  );
  const unsigned = tx
    .serialize({ requireAllSignatures: false })
    .toString("base64");
  tx.sign(key);
  const signed = tx.serialize().toString("base64");
  const pending = {
    ...ownerScope,
    packId: "pack",
    quantity: 1,
    clientNonce: "original",
    orderId: "id",
  };
  await executeOperation(
    "submit",
    ownerScope,
    { id: "id" },
    { wallet: ownerScope.wallet, intentId: "intent", transaction: signed },
    {
      pending,
      quote: {
        scope: ownerScope,
        orderId: "id",
        kind: "payment",
        skuIds: [],
        intentId: "intent",
        transaction: unsigned,
      },
      save: (p) => {
        saved = p;
      },
      call: async () => {
        assert.equal(saved.signedTransaction, signed);
        return { accepted: true };
      },
    },
  );
  assert.equal(saved.intentId, "intent");
});
test("invalid manually supplied consent never poisons recovery", async () => {
  let saves = 0;
  let calls = 0;
  const pending = {
    ...scope,
    packId: "pack",
    quantity: 1,
    clientNonce: "original",
    orderId: "id",
  };
  await assert.rejects(() =>
    executeOperation(
      "submit",
      scope,
      { id: "id" },
      { wallet: "w", intentId: "intent", transaction: "YQ==" },
      {
        pending,
        quote: {
          scope,
          orderId: "id",
          kind: "payment",
          skuIds: [],
          intentId: "intent",
          transaction: "YQ==",
        },
        save: () => {
          saves++;
        },
        call: async () => {
          calls++;
          return {};
        },
      },
    ),
  );
  assert.equal(saves, 0);
  assert.equal(calls, 0);
  assert.equal("signedTransaction" in pending, false);
});
