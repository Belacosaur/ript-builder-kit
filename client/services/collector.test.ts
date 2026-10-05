import { test } from "node:test";
import assert from "node:assert/strict";
import { createCollectorClient, walletIsLinked } from "./collector.js";
const wallet = "11111111111111111111111111111111";
test("wallet linkage checks exact connected pubkey and verified timestamp", () => {
  assert.equal(
    walletIsLinked(
      { wallets: [{ pubkey: "other", verifiedAt: new Date().toISOString() }] },
      wallet,
    ),
    false,
  );
  assert.equal(
    walletIsLinked({ wallets: [{ pubkey: wallet, verifiedAt: null }] }, wallet),
    false,
  );
  assert.equal(
    walletIsLinked(
      { wallets: [{ pubkey: wallet, verifiedAt: new Date().toISOString() }] },
      wallet,
    ),
    true,
  );
});
test("wallet change after signMessage refuses verification", async () => {
  let current = wallet;
  const calls: string[] = [];
  const client = createCollectorClient(async (op) => {
    calls.push(op);
    return {
      message:
        "Sign this message to link wallet: pp:11111111-1111-4111-8111-111111111111:" +
        wallet +
        ":" +
        "a".repeat(32),
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    };
  });
  await assert.rejects(
    client.linkWallet(
      wallet,
      () => current,
      async () => {
        current = "other";
        return new Uint8Array(64);
      },
    ),
    /scope_changed/,
  );
  assert.deepEqual(calls, ["challenge"]);
});
test("expired private photo cache renews through supported endpoint", async () => {
  let time = 0,
    calls = 0;
  const client = createCollectorClient(
    async () => {
      calls++;
      return {
        url: "https://account.r2.cloudflarestorage.com/private/card?X-Amz-Signature=private",
        expiresIn: 1,
      };
    },
    () => time,
  );
  await client.photo("id", "front");
  await client.photo("id", "front");
  assert.equal(calls, 1);
  time = 2000;
  await client.photo("id", "front");
  assert.equal(calls, 2);
});
test("private upload honours returned browser-safe headers and validates content length", async () => {
  const old = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal((init?.headers as any)["Content-Length"], undefined);
      assert.equal(init?.credentials, "omit");
      return new Response("{}");
    };
    const client = createCollectorClient(async (op) => {
      calls.push(op);
      return op === "photoPresign"
        ? {
            uploadUrl:
              "https://account.r2.cloudflarestorage.com/private/card?X-Amz-Signature=abc",
            headers: {
              "Content-Type": "image/jpeg",
              "Content-Length": "4",
              "Cache-Control": "private, no-store",
            },
          }
        : { revision: 1 };
    });
    await client.uploadPhoto(
      "id",
      "front",
      1,
      new File([new Uint8Array([255, 216, 255, 217])], "test.jpg", {
        type: "image/jpeg",
      }),
      () => {},
    );
    assert.deepEqual(calls, ["photoPresign", "photoComplete"]);
  } finally {
    globalThis.fetch = old;
  }
});

test("identification polling keeps original revision and reports actual job progress", async () => {
  let time = 0,
    n = 0;
  const states: string[] = [];
  const c = createCollectorClient(
    async () => ({
      id: "card",
      revision: 1,
      jobStatus: ++n === 1 ? "queued" : "complete",
      identityStatus: n === 1 ? "pending" : "identified",
    }),
    () => time,
  );
  const result = await c.followCapture("card", 1, {
    deadline: 10000,
    check: () => {},
    sleep: async () => {
      time += 1000;
    },
    observe: (r) => states.push(r.jobStatus),
  });
  assert.equal(result.identityStatus, "identified");
  assert.deepEqual(states, ["queued", "complete"]);
  const stale = createCollectorClient(
    async () => ({ revision: 2 }),
    () => 0,
  );
  await assert.rejects(
    stale.followCapture("card", 1, {
      deadline: 100,
      check: () => {},
      sleep: async () => {},
      observe: () => {},
    }),
    /stale_revision_result/,
  );
});
