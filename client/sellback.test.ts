import { test } from "node:test";
import assert from "node:assert/strict";
import { waitForSellback } from "./sellback.js";
test("sellback waits for every selected card to settle", async () => {
  let reads = 0;
  await waitForSellback(["a", "b"], {
    read: async () => ({
      cards: [
        { skuId: "a", disposition: "sold" },
        { skuId: "b", disposition: ++reads === 1 ? "buyback_pending" : "sold" },
      ],
    }),
    accept: () => {},
    check: () => {},
    progress: () => {},
    wait: async () => {},
  });
  assert.equal(reads, 2);
});
test("sellback deadline does not treat pending cards as sold", async () => {
  let clock = 0;
  await assert.rejects(
    waitForSellback(["a"], {
      read: async () => ({
        cards: [{ skuId: "a", disposition: "buyback_pending" }],
      }),
      accept: () => {},
      check: () => {},
      progress: () => {},
      wait: async () => {
        clock += 1000;
      },
      now: () => clock,
      timeoutMs: 1000,
    }),
    /still processing/,
  );
});
test("scope change after read prevents stale sellback acceptance", async () => {
  let changed = false,
    accepted = false;
  await assert.rejects(
    waitForSellback(["a"], {
      read: async () => {
        changed = true;
        return { cards: [{ skuId: "a", disposition: "sold" }] };
      },
      accept: () => {
        accepted = true;
      },
      check: () => {
        if (changed) throw Error("scope_changed");
      },
      progress: () => {},
      wait: async () => {},
    }),
    /scope_changed/,
  );
  assert.equal(accepted, false);
});

test("transient sellback read failure reconciles the same selection", async () => {
  let time = 0,
    calls = 0;
  const result = await waitForSellback(["a"], {
    read: async () => {
      if (++calls === 1) throw new TypeError("fetch");
      return { cards: [{ skuId: "a", disposition: "sold" }] };
    },
    accept() {},
    check() {},
    progress() {},
    wait: async () => {
      time += 1;
    },
    now: () => time,
    timeoutMs: 10,
  });
  assert.equal(result.cards[0].disposition, "sold");
  assert.equal(calls, 2);
});
