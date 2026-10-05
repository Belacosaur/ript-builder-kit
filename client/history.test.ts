import { test } from "node:test";
import assert from "node:assert/strict";
import { recordOrder, listOrders } from "./history.js";
test("history is scope isolated and excludes signed bytes", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
  const scope = {
    environment: "sandbox" as const,
    partnerId: "p",
    wallet: "w",
    chain: "c",
  };
  recordOrder(
    scope,
    { id: "a", signedTransaction: "secret", state: "complete" },
    storage,
  );
  recordOrder(scope, { id: "b", state: "complete" }, storage);
  assert.equal(listOrders(scope, storage).length, 2);
  assert.equal(
    listOrders({ ...scope, environment: "live" }, storage).length,
    0,
  );
  assert.ok(!JSON.stringify([...values.values()]).includes("secret"));
});
