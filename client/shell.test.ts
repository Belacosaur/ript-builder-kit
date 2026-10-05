import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountShell } from "./shell.js";
import { createStore, initialState } from "./store.js";

test("seven accessible persistent views retain focus and draft during progress", () => {
  const dom = new JSDOM('<div id="app"></div>');
  const root = dom.window.document.querySelector<HTMLElement>("#app")!;
  const s = createStore(initialState());
  mountShell(root, s, {} as any);
  assert.equal(root.querySelectorAll("nav [data-view]").length, 7);
  const quantity = root.querySelector<HTMLInputElement>("#quantity")!;
  quantity.value = "2";
  quantity.focus();
  s.update((v) => ({ ...v, progress: "Preparing…" }));
  assert.equal(root.querySelector("#quantity"), quantity);
  assert.equal(quantity.value, "2");
  assert.equal(dom.window.document.activeElement, quantity);
  assert.ok(root.querySelector("#menu-toggle"));
});

test("paused selection explains refusal and resume ignores pack selection", () => {
  const dom = new JSDOM('<div id="app"></div>');
  const root = dom.window.document.querySelector<HTMLElement>("#app")!;
  const initial = initialState();
  initial.selectedPack = "paused";
  initial.catalog = {
    packs: [
      {
        id: "paused",
        label: "Paused",
        status: "paused",
        maxQuantity: 0,
        balanceUsdc: 0,
        requiredFloatUsdc: 500,
        priceUsd: 25,
      },
    ],
  };
  initial.wallet = "wallet";
  initial.recovery = { kind: "ready", pending: {} as any };
  const s = createStore(initial);
  mountShell(root, s, {} as any);
  assert.equal(
    root.querySelector<HTMLButtonElement>("#open-pack")!.disabled,
    true,
  );
  assert.match(
    root.querySelector("#purchase-reason")!.textContent!,
    /paused|available/i,
  );
  assert.equal(
    root.querySelector<HTMLButtonElement>("#resume")!.disabled,
    false,
  );
});
