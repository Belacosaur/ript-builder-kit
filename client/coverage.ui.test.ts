import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createStore, initialState } from "./store.js";
import { mount } from "./views/overview.js";
test("coverage observes real readiness prerequisites without certifying acceptance", () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.defineProperty(dom.window.navigator, "locks", {
    value: { request: () => {} },
  });
  const base = initialState();
  const store = createStore({
    ...base,
    config: { environments: { sandbox: { configured: true } } },
    catalog: {
      packs: [
        {
          id: "pack",
          priceUsd: 25,
          status: "available",
          maxQuantity: 10,
          balanceUsdc: 500,
          requiredFloatUsdc: 500,
        },
      ],
    },
    network: { chain: "c", token: "m" },
    wallet: "w",
    selectedPack: "pack",
    collectorLinked: true,
    balances: {
      source: "chain",
      chain: "c",
      mint: "m",
      wallet: "w",
      tokenUnits: "25000000",
      solLamports: "1000000",
      decimals: 6,
    },
  });
  const root = dom.window.document.querySelector<HTMLElement>("#root")!;
  mount(root, store, {} as any);
  const row = root.querySelector("#coverage tr")!.textContent!;
  assert.ok(!row.includes("Unchecked / blocked"));
  assert.ok(row.includes("Ready"));
  assert.ok(row.includes("Unverified"));
  dom.window.close();
});
