import { webcrypto } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { transactionFixture } from "./test-support/transactions.js";
const partnerId = "11111111-1111-4111-8111-111111111111",
  intent = "22222222-2222-4222-8222-222222222222",
  chain = "genesis",
  id = "a".repeat(64);
async function settle() {
  for (let i = 0; i < 25; i++) await new Promise((r) => setTimeout(r, 5));
}
async function fixture(version: "legacy" | "v0", reject = false) {
  const f = transactionFixture(version);
  const dom = new JSDOM('<div id="app"></div>', {
      url: "http://127.0.0.1:4315",
      runScripts: "outside-only",
    }),
    w = dom.window;
  const originalTimer = w.setTimeout.bind(w);
  w.setTimeout = ((fn: any, ms: number, ...args: any[]) =>
    originalTimer(fn, ms <= 5000 ? 0 : ms, ...args)) as any;
  const calls: any[] = [],
    wallet = f.buyer.publicKey.toBase58();
  let order: any;
  let prompts = 0;
  let rpcUnavailable = false;
  Object.defineProperty(w, "crypto", { value: webcrypto });
  Object.defineProperty(w.navigator, "locks", {
    value: { request: async (_n: any, _o: any, fn: any) => fn() },
  });
  (w as any).AbortSignal = AbortSignal;
  (w as any).confirm = () => true;
  (w as any).solana = {
    publicKey: f.buyer.publicKey,
    connect: async () => {},
    signTransaction: async (tx: any) => {
      prompts++;
      if (reject) return tx;
      tx.sign([f.buyer]);
      return tx;
    },
  };
  (w as any).fetch = async (path: any, init: any) => {
    const request = JSON.parse(init?.body ?? "{}");
    calls.push({ path: String(path), request });
    if (!String(path).startsWith("/api/")) {
      if (rpcUnavailable)
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32005, message: "RPC unavailable" },
          }),
        );
      const account = {
        lamports: 1000000,
        owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        executable: false,
        rentEpoch: 0,
        data: {
          program: "spl-token",
          space: 165,
          parsed: {
            type: "mint",
            info: {
              decimals: 6,
              mintAuthority: null,
              supply: "1000000000",
              isInitialized: true,
              freezeAuthority: null,
            },
          },
        },
      };
      const result =
        request.method === "getGenesisHash"
          ? chain
          : request.method === "getBalance"
            ? { context: { slot: 1 }, value: 1000000 }
            : request.method === "getAccountInfo"
              ? { context: { slot: 1 }, value: account }
              : request.method === "getTokenAccountsByOwner"
                ? {
                    context: { slot: 1 },
                    value: [
                      {
                        pubkey: wallet,
                        account: {
                          ...account,
                          data: {
                            program: "spl-token",
                            space: 165,
                            parsed: {
                              type: "account",
                              info: {
                                mint: wallet,
                                tokenAmount: {
                                  amount: "1000000000",
                                  decimals: 6,
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  }
                : undefined;
      if (result === undefined) throw Error("unexpected RPC " + request.method);
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: request.id, result }),
      );
    }
    let result: any;
    const op = String(path).split("/").pop();
    if (path === "/api/config")
      result = {
        environments: {
          sandbox: {
            configured: true,
            rpcUrl: "https://api.devnet.solana.com",
          },
          live: { configured: false, rpcUrl: "https://api.devnet.solana.com" },
        },
      };
    else if (String(path).startsWith("/api/network/"))
      result = { chain, token: wallet };
    else if (op === "packs")
      result = {
        environment: request.environment,
        partnerId,
        chain,
        packs: [
          {
            id: "pack",
            label: "Test Pack",
            priceUsd: 25,
            status: "available",
            available: 20,
            maxQuantity: 10,
            balanceUsdc: 1000,
            requiredFloatUsdc: 500,
          },
        ],
      };
    else if (op === "wallets")
      result = {
        wallets: [{ pubkey: wallet, verifiedAt: new Date().toISOString() }],
      };
    else if (op === "status")
      result = { network: { genesis: chain }, operations: [] };
    else if (op === "create") {
      order = {
        environment: "sandbox",
        partnerId,
        chain,
        wallet,
        id,
        packId: "pack",
        quantity: request.body.quantity,
        clientNonce: request.body.clientNonce,
        state: "preparing_draw",
        cards: [],
      };
      result = order;
    } else if (op === "payment" || op === "sellbackPrepare")
      result = {
        intentId: intent,
        transaction: f.unsigned,
        skuIds: request.body.skuIds,
      };
    else if (op === "submit") {
      const stored = JSON.parse(
        w.localStorage.getItem(
          "gacha-lab:" + JSON.stringify(["sandbox", partnerId, wallet, chain]),
        )!,
      );
      assert.equal(stored.pending.signedTransaction, request.body.transaction);
      assert.equal(stored.pending.intentId, request.body.intentId);
      order = {
        ...order,
        state: "complete",
        paymentFirst: true,
        paymentSignature: "paid",
        fulfilmentSignature: "fulfilled",
        cards: Array.from({ length: order.quantity }, (_, n) => ({
          skuId: "33333333-3333-4333-8333-" + String(n + 1).padStart(12, "0"),
          title: "Card " + n,
          disposition: "vaulted",
          buybackCents: 2000,
          insuredCents: 2500,
        })),
      };
      result = order;
    } else if (op === "keep") {
      order = {
        ...order,
        cards: order.cards.map((c: any) =>
          c.skuId === request.params.skuId ? { ...c, disposition: "kept" } : c,
        ),
      };
      result = { status: "kept" };
    } else if (op === "sellbackSubmit") {
      const saved = JSON.parse(
        w.localStorage.getItem(
          "gacha-lab:" + JSON.stringify(["sandbox", partnerId, wallet, chain]),
        )!,
      ).pending;
      assert.equal(request.body.transaction, saved.sellback.transaction);
      order = {
        ...order,
        cards: order.cards.map((c: any) =>
          saved.sellback.skuIds.includes(c.skuId)
            ? { ...c, disposition: "sold" }
            : c,
        ),
      };
      result = { accepted: true };
    } else if (op === "read") {
      if (order.state === "preparing_draw")
        order = { ...order, state: "awaiting_payment" };
      result = order;
    } else throw Error("unexpected " + op);
    return new Response(JSON.stringify(result), { status: 200 });
  };
  const asset = readFileSync("dist/index.html", "utf8").match(
    /src="([^"]+\.js)"/,
  )![1];
  w.eval(readFileSync("dist" + asset, "utf8"));
  await settle();
  const click = async (selector: string) => {
    w.document.querySelector<HTMLElement>(selector)!.click();
    await settle();
  };
  await click("#tab-gacha");
  await click("[data-pack]");
  const q = w.document.querySelector<HTMLInputElement>("#quantity")!;
  q.value = "3";
  q.dispatchEvent(new w.Event("input"));
  return {
    failRpc: () => {
      rpcUnavailable = true;
    },
    dom,
    w,
    calls,
    click,
    prompts: () => prompts,
    order: () => order,
  };
}
for (const version of ["legacy", "v0"] as const)
  test(
    "fresh built UI signs " +
      version +
      " payment, reveals, keeps one, sells batch",
    async () => {
      const f = await fixture(version);
      try {
        await f.click("#open-pack");
        assert.equal(
          f.order().state,
          "complete",
          f.w.document.querySelector("#status")!.textContent!,
        );
        assert.equal(f.w.document.querySelectorAll("[data-keep]").length, 3);
        assert.equal(f.prompts(), 1);
        await f.click("[data-keep]");
        assert.equal(f.order().cards[0].disposition, "kept");
        for (const checkbox of [
          ...f.w.document.querySelectorAll<HTMLInputElement>(
            "[data-select]:not(:disabled)",
          ),
        ]) {
          checkbox.checked = true;
          checkbox.dispatchEvent(new f.w.Event("change", { bubbles: true }));
        }
        await f.click("#sellback");
        assert.deepEqual(
          f.order().cards.map((c: any) => c.disposition),
          ["kept", "sold", "sold"],
        );
        assert.equal(f.prompts(), 2);
        assert.equal(
          f.calls.filter((c) => c.path === "/api/gacha/create").length,
          1,
        );
      } finally {
        f.dom.window.close();
      }
    },
  );
test("built UI rejects unsigned wallet output and never submits or reveals", async () => {
  const f = await fixture("legacy", true);
  try {
    await f.click("#open-pack");
    assert.equal(
      f.calls.filter((c) => c.path === "/api/gacha/submit").length,
      0,
    );
    assert.equal(f.w.document.querySelectorAll("[data-keep]").length, 0);
    assert.match(
      f.w.document.querySelector("#status")!.textContent!,
      /signature_missing/,
    );
  } finally {
    f.dom.window.close();
  }
});

test("failed balance observation removes previously ready funds from built Overview", async () => {
  const f = await fixture("legacy");
  try {
    await f.click("#connect");
    await f.click("#collector-check");
    await f.click("#read-balances");
    assert.match(
      f.w.document.querySelector("#coverage")!.textContent!,
      /gachaConfiguredReady/,
    );
    f.failRpc();
    await f.click("#read-balances");
    assert.match(
      f.w.document.querySelector("#status")!.textContent!,
      /RPC unavailable/,
    );
    assert.doesNotMatch(
      f.w.document.querySelector("#coverage")!.textContent!,
      /gachaConfiguredReady/,
    );
    assert.doesNotMatch(
      f.w.document.querySelector("#buyer-balances")!.textContent!,
      /token base units/,
    );
  } finally {
    f.dom.window.close();
  }
});
