import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadPending,
  loadRecovery,
  storageKey,
  savePending,
  resumeOrder,
  validateOrder,
  reconcileSellback,
  mergeOrder,
  recoverExpiredSellback,
} from "./recovery.js";
const scope = {
  environment: "sandbox" as const,
  partnerId: "11111111-1111-4111-8111-111111111111",
  wallet: "11111111111111111111111111111111",
  chain: "c",
};
function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}
test("create uncertainty keeps the original nonce and scopes recovery", async () => {
  const s = storage();
  const pending = {
    ...scope,
    packId: "pack",
    quantity: 1,
    clientNonce: "same-original-nonce",
  };
  let nonce = "";
  await assert.rejects(() =>
    resumeOrder(pending, {
      storage: s,
      call: async (_op, _params, body) => {
        assert.equal(loadPending(scope, s)?.clientNonce, "same-original-nonce");
        nonce = body!.clientNonce as string;
        throw new Error("transport");
      },
    }),
  );
  assert.equal(nonce, "same-original-nonce");
  assert.equal(loadPending({ ...scope, environment: "live" }, s), null);
  assert.equal(loadPending({ ...scope, wallet: "other" }, s), null);
});
test("empty sellback selection never clears signed consent", () => {
  const p = {
    ...scope,
    packId: "pack",
    quantity: 1,
    clientNonce: "abcdefghijklmnop",
    sellback: {
      intentId: "11111111-1111-4111-8111-111111111111",
      transaction: "signed",
      skuIds: [],
    },
  };
  assert.ok(reconcileSellback(p, { cards: [] }).sellback);
});
test("returned create identity must match original request and stores ID", () => {
  const p = {
    ...scope,
    packId: "pack",
    quantity: 1,
    clientNonce: "abcdefghijklmnop",
  };
  const order = {
    ...scope,
    id: "a".repeat(64),
    packId: "pack",
    quantity: 1,
    clientNonce: "abcdefghijklmnop",
    state: "preparing_draw",
  };
  assert.equal(mergeOrder(p, order, scope).orderId, "a".repeat(64));
  assert.throws(() => mergeOrder(p, { ...order, clientNonce: "other" }, scope));
});
test("only authoritative expiry plus restored order clears consent", async () => {
  const p = {
    ...scope,
    orderId: "a".repeat(64),
    packId: "pack",
    quantity: 1,
    clientNonce: "abcdefghijklmnop",
    sellback: {
      intentId: "11111111-1111-4111-8111-111111111111",
      transaction: "signed",
      skuIds: ["11111111-1111-4111-8111-111111111111"],
    },
  };
  const read = async () => ({
    ...scope,
    id: "a".repeat(64),
    quantity: 1,
    state: "complete",
    paymentSignature: "paid",
    cards: [
      { skuId: "11111111-1111-4111-8111-111111111111", disposition: "vaulted" },
    ],
  });
  assert.ok(
    (await recoverExpiredSellback(p, new Error("transport"), read)).pending
      .sellback,
  );
  assert.equal(
    (await recoverExpiredSellback(p, new Error("buyback_expired"), read))
      .pending.sellback,
    undefined,
  );
});
test("signed payment retry replays exact bytes and intent", async () => {
  const s = storage();
  const p = {
    ...scope,
    packId: "pack",
    quantity: 1,
    clientNonce: "abcdefghijklmnop",
    orderId: "a".repeat(64),
    intentId: "11111111-1111-4111-8111-111111111111",
    signedTransaction: "original",
  };
  savePending(scope, p, s);
  let body: any;
  await resumeOrder(p, {
    storage: s,
    call: async (op, _params, b) => {
      assert.equal(op, "submit");
      body = b;
      return {
        id: "a".repeat(64),
        ...scope,
        state: "awaiting_payment",
        quantity: 1,
        cards: [],
        clientNonce: "abcdefghijklmnop",
        packId: "pack",
      };
    },
  });
  assert.equal(body.transaction, "original");
  assert.equal(body.intentId, "11111111-1111-4111-8111-111111111111");
  assert.equal(loadPending(scope, s)?.signedTransaction, "original");
});
test("reveal rejects mismatched scope and missing complete evidence", () => {
  const order = {
    ...scope,
    id: "a".repeat(64),
    state: "complete",
    quantity: 2,
    paymentSignature: "paid",
    cards: [{ skuId: "11111111-1111-4111-8111-111111111111" }, { skuId: "b" }],
  };
  assert.equal(validateOrder(order, scope), order);
  for (const patch of [
    { wallet: "other" },
    { chain: "other" },
    { partnerId: "other" },
    { paymentSignature: null },
    {
      cards: [
        { skuId: "11111111-1111-4111-8111-111111111111" },
        { skuId: "11111111-1111-4111-8111-111111111111" },
      ],
    },
    { cards: [] },
    { paymentFirst: true },
  ])
    assert.throws(() => validateOrder({ ...order, ...patch }, scope));
  assert.equal(
    validateOrder(
      { ...order, paymentFirst: true, fulfilmentSignature: "fulfilled" },
      scope,
    ).state,
    "complete",
  );
});
test("submit acceptance is reconciled by reading order", async () => {
  const s = storage();
  const p = {
    ...scope,
    packId: "pack",
    quantity: 1,
    clientNonce: "abcdefghijklmnop",
    orderId: "a".repeat(64),
    intentId: "11111111-1111-4111-8111-111111111111",
    signedTransaction: "original",
  };
  const calls: string[] = [];
  const result = await resumeOrder(p, {
    storage: s,
    call: async (op) => {
      calls.push(op);
      return op === "submit"
        ? { accepted: true }
        : {
            ...scope,
            id: "a".repeat(64),
            packId: "pack",
            quantity: 1,
            clientNonce: "abcdefghijklmnop",
            state: "awaiting_payment",
          };
    },
  });
  assert.deepEqual(calls, ["submit", "read"]);
  assert.equal(result.state, "awaiting_payment");
});
test("only a complete sold batch releases saved sellback", () => {
  const p = {
    ...scope,
    packId: "pack",
    quantity: 2,
    clientNonce: "abcdefghijklmnop",
    sellback: {
      intentId: "11111111-1111-4111-8111-111111111111",
      transaction: "signed",
      skuIds: ["11111111-1111-4111-8111-111111111111", "b"],
    },
  };
  assert.ok(
    reconcileSellback(p, {
      cards: [
        { skuId: "11111111-1111-4111-8111-111111111111", disposition: "sold" },
        { skuId: "b", disposition: "buyback_pending" },
      ],
    }).sellback,
  );
  assert.equal(
    reconcileSellback(p, {
      cards: [
        { skuId: "11111111-1111-4111-8111-111111111111", disposition: "sold" },
        { skuId: "b", disposition: "sold" },
      ],
    }).sellback,
    undefined,
  );
});

test("corrupt and unavailable recovery cannot masquerade as absent", () => {
  const s = storage();
  s.setItem(
    "gacha-lab:" +
      JSON.stringify([
        scope.environment,
        scope.partnerId,
        scope.wallet,
        scope.chain,
      ]),
    "{bad",
  );
  assert.throws(() => loadPending(scope, s), /recovery_corrupt/);
  assert.throws(
    () =>
      loadPending(scope, {
        ...s,
        getItem() {
          throw new Error("denied");
        },
      }),
    /recovery_unavailable/,
  );
});

test("legacy record migrates exact consent; unsupported version and storage quota block", () => {
  const s = storage(),
    p = {
      ...scope,
      packId: "pack",
      quantity: 1,
      clientNonce: "abcdefghijklmnop",
      orderId: "a".repeat(64),
      intentId: "11111111-1111-4111-8111-111111111111",
      signedTransaction: "c2lnbmVk",
    };
  s.setItem(storageKey(scope), JSON.stringify(p));
  assert.deepEqual(loadRecovery(scope, s), { kind: "ready", pending: p });
  assert.equal(JSON.parse(s.getItem(storageKey(scope))!).version, 1);
  s.setItem(storageKey(scope), '{"version":2}');
  assert.equal(loadRecovery(scope, s).kind, "corrupt");
  assert.equal(s.getItem(storageKey(scope)), '{"version":2}');
  assert.throws(
    () =>
      savePending(scope, p, {
        ...s,
        setItem() {
          throw new Error("quota");
        },
      }),
    /quota/,
  );
});
