import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, initialState } from "./store.js";
test("store updates immutable snapshots and cleans subscriptions", () => {
  const s = createStore(initialState());
  const first = s.get();
  let calls = 0;
  const remove = s.subscribe(() => calls++);
  s.update((v) => ({ ...v, quantity: 2 }));
  assert.equal(first.quantity, 1);
  assert.equal(s.get().quantity, 2);
  assert.equal(calls, 1);
  remove();
  s.update((v) => ({ ...v, quantity: 3 }));
  assert.equal(calls, 1);
});
