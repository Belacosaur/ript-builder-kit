import { test } from "node:test";
import assert from "node:assert/strict";
import { withFinancialLock, lockName } from "./locks.js";
const scope = {
  environment: "sandbox" as const,
  partnerId: "p",
  wallet: "w",
  chain: "c",
};
test("missing Web Locks disables financial mutation", async () => {
  let called = false;
  await assert.rejects(
    withFinancialLock(
      scope,
      new AbortController().signal,
      async () => {
        called = true;
      },
      undefined,
    ),
    /financial_lock_unavailable/,
  );
  assert.equal(called, false);
  assert.notEqual(lockName(scope), lockName({ ...scope, wallet: "other" }));
});
test("same-scope action requests exclusive browser lock and respects abort", async () => {
  const ac = new AbortController();
  let requested = "";
  const locks = {
    request: async (name: string, opts: any, fn: any) => {
      requested = name;
      assert.equal(opts.mode, "exclusive");
      assert.equal(opts.signal, ac.signal);
      return fn();
    },
  };
  assert.equal(
    await withFinancialLock(scope, ac.signal, async () => 5, locks as any),
    5,
  );
  assert.equal(requested, lockName(scope));
  ac.abort();
  await assert.rejects(
    withFinancialLock(scope, ac.signal, async () => 6, locks as any),
  );
});
