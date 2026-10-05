import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readTestingStatus,
  testingNonceKey,
  requestTestingFunds,
} from "./testing.js";
test("testing fund retries retain nonce and refuse live or stale scopes", async () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const scope = {
    environment: "sandbox" as const,
    partnerId: "partner",
    wallet: "11111111111111111111111111111111",
    chain: "devnet",
  };
  const requests: any[] = [];
  const call = async (_action: string, payload: any) => {
    requests.push(payload);
    throw new Error("lost");
  };
  await assert.rejects(
    requestTestingFunds("wallet-funds", scope, () => scope, call, storage),
  );
  await assert.rejects(
    requestTestingFunds("wallet-funds", scope, () => scope, call, storage),
  );
  assert.equal(requests[0].body.requestId, requests[1].body.requestId);
  await assert.rejects(
    requestTestingFunds(
      "wallet-funds",
      { ...scope, environment: "live" },
      () => ({ ...scope, environment: "live" }),
      call,
      storage,
    ),
    /sandbox_only/,
  );
  assert.equal(requests.length, 2);
  await assert.rejects(
    requestTestingFunds(
      "wallet-funds",
      scope,
      () => ({ ...scope, partnerId: "other" }),
      async () => ({ id: "receipt" }),
      storage,
    ),
    /scope_changed/,
  );
});
test("failed funding requires all legs terminal before deliberate nonce reset", async () => {
  const { resetFailedTestingRequest, testingNonceKey } =
    await import("./testing.js");
  const scope = {
    environment: "sandbox" as const,
    partnerId: "p",
    wallet: "w",
    chain: "devnet",
  };
  const data = new Map([
    [testingNonceKey("wallet-funds", scope), "failed-request"],
  ]);
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
  const operation = {
    requestId: "failed-request",
    status: "failed",
    legs: [
      { kind: "wallet-usdc", status: "reconciled" },
      { kind: "wallet-sol", status: "submitted" },
    ],
  };
  assert.throws(
    () =>
      resetFailedTestingRequest(
        "wallet-funds",
        scope,
        () => scope,
        [operation],
        storage,
      ),
    /funding_still_pending/,
  );
  assert.equal(data.size, 1);
  operation.legs[1].status = "failed";
  resetFailedTestingRequest(
    "wallet-funds",
    scope,
    () => scope,
    [operation],
    storage,
  );
  assert.equal(data.size, 0);
  let nonce = "";
  await requestTestingFunds(
    "wallet-funds",
    scope,
    () => scope,
    async (_op, payload) => {
      nonce = String(payload.body?.requestId);
      return { status: "queued" };
    },
    storage,
  );
  assert.notEqual(nonce, "failed-request");
});

test("status cannot release funding nonce while a required leg is pending", async () => {
  const values = new Map<string, string>();
  const s = {
    environment: "sandbox" as const,
    partnerId: "p",
    wallet: "w",
    chain: "c",
  };
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
  storage.setItem(testingNonceKey("wallet-funds", s), "nonce");
  await readTestingStatus(
    s,
    () => s,
    async () => ({
      network: { genesis: "c" },
      operations: [
        {
          requestId: "nonce",
          status: "reconciled",
          legs: [{ status: "reconciled" }, { status: "pending" }],
        },
      ],
    }),
    storage,
  );
  assert.equal(storage.getItem(testingNonceKey("wallet-funds", s)), "nonce");
});
