import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const wallet = "11111111111111111111111111111111",
  partnerId = "11111111-1111-4111-8111-111111111111",
  chain = "genesis";
const scope = { environment: "sandbox", wallet, partnerId, chain };
const a = {
  ...scope,
  id: "a".repeat(64),
  state: "awaiting_payment",
  quantity: 1,
  packId: "pack",
  clientNonce: "abcdefghijklmnop",
  amount: "25000000",
  cards: [],
};
const stored = {
  ...scope,
  packId: "pack",
  quantity: 1,
  clientNonce: a.clientNonce,
  orderId: a.id,
  intentId: "11111111-1111-4111-8111-111111111111",
  signedTransaction: "b3JpZ2luYWwtYnl0ZXM=",
};
const key =
  "gacha-lab:" + JSON.stringify(["sandbox", partnerId, wallet, chain]);
async function settle() {
  for (let i = 0; i < 8; i++)
    await new Promise((resolve) => setImmediate(resolve));
}
async function fixture(pending?: any, complete = false) {
  const dom = new JSDOM('<div id="app"></div>', {
    url: "http://127.0.0.1:4315",
    runScripts: "outside-only",
  });
  const w = dom.window;
  const calls: any[] = [];
  let delay = "",
    release: () => void = () => {};
  if (pending) w.localStorage.setItem(key, JSON.stringify(pending));
  (w as any).AbortSignal = AbortSignal;
  Object.defineProperty(w.navigator, "locks", {
    value: { request: async (_name: any, _opts: any, fn: any) => fn() },
  });
  (w as any).fetch = async (path: string, init: any) => {
    const request = init?.body ? JSON.parse(init.body) : {};
    calls.push({ path, request });
    const operation = path.split("/").pop();
    const data =
      path === "/api/config"
        ? {
            environments: {
              sandbox: {
                configured: true,
                keyHint: "masked",
                rpcUrl: "https://api.devnet.solana.com",
              },
              live: {
                configured: false,
                keyHint: "not configured",
                rpcUrl: "https://api.devnet.solana.com",
              },
            },
          }
        : path.startsWith("/api/network/")
          ? { chain, token: wallet }
          : operation === "packs"
            ? {
                environment: request.environment,
                partnerId,
                chain,
                packs: [
                  {
                    id: "pack",
                    label: "Pack",
                    priceUsd: 25,
                    status: "available",
                    available: 10,
                    maxQuantity: 10,
                    balanceUsdc: 500,
                    requiredFloatUsdc: 500,
                  },
                ],
              }
            : operation === "create"
              ? { ...a, clientNonce: request.body.clientNonce }
              : operation === "read"
                ? {
                    ...a,
                    id: request.params.id,
                    ...(complete
                      ? {
                          state: "complete",
                          paymentSignature: "paid",
                          cards: [
                            {
                              skuId: "11111111-1111-4111-8111-111111111112",
                              disposition: "vaulted",
                            },
                          ],
                        }
                      : {}),
                  }
                : operation === "payment"
                  ? {
                      intentId: "11111111-1111-4111-8111-111111111113",
                      transaction: "YQ==",
                    }
                  : { accepted: true };
    return { ok: true, status: 200, json: async () => data };
  };
  (w as any).solana = {
    publicKey: { toBase58: () => wallet },
    connect: async () => {},
    signTransaction: async (tx: any) => tx,
  };
  const html = readFileSync("dist/index.html", "utf8");
  const asset = html.match(/src="([^"]+\.js)"/)![1];
  w.eval(readFileSync("dist" + asset, "utf8"));
  await settle();
  (w.document.querySelector("#connect") as any).click();
  await settle();
  const click = async (id: string) => {
    (w.document.querySelector("#" + id) as any).click();
    await settle();
  };
  const fill = (id: string, value: string) => {
    (w.document.querySelector("#" + id) as any).value = value;
  };
  const operation = (value: string) => {
    fill("operation", value);
    w.document
      .querySelector("#operation")!
      .dispatchEvent(new w.Event("change"));
  };
  const originalFetch = (w as any).fetch;
  (w as any).fetch = async (path: string, init: any) => {
    if (delay && path.endsWith("/" + delay)) {
      const response = await originalFetch(path, init);
      return await new Promise((resolve) => {
        release = () => resolve(response);
      });
    }
    return originalFetch(path, init);
  };
  return {
    dom,
    w,
    calls,
    click,
    fill,
    operation,
    delay: (op: string) => {
      delay = op;
    },
    release: () => release(),
    saved: () => {
      const v = JSON.parse(w.localStorage.getItem(key) ?? "null");
      return v?.pending ?? v;
    },
  };
}
test("UI manual reload preserves original signed bytes for same order", async () => {
  const f = await fixture(stored);
  try {
    f.fill("order-id", a.id);
    await f.click("load-order");
    assert.equal(f.saved().signedTransaction, "b3JpZ2luYWwtYnl0ZXM=");
    assert.equal(f.saved().intentId, "11111111-1111-4111-8111-111111111111");
  } finally {
    f.dom.window.close();
  }
});
test("UI explorer create persists returned ID in recovery", async () => {
  const f = await fixture();
  try {
    f.operation("create");
    f.fill(
      "body",
      JSON.stringify({
        partner_id: partnerId,
        wallet,
        packId: "pack",
        quantity: 1,
        clientNonce: a.clientNonce,
      }),
    );
    await f.click("execute");
    assert.equal(f.saved().orderId, a.id);
  } finally {
    f.dom.window.close();
  }
});
test("UI read cannot replace unresolved order with another order", async () => {
  const f = await fixture(stored);
  try {
    f.operation("read");
    f.fill("params", JSON.stringify({ id: "b".repeat(64), wallet }));
    await f.click("execute");
    assert.equal(f.saved().orderId, a.id);
    assert.ok(
      f.w.document
        .querySelector("#status")!
        .textContent!.includes("pending_order_exists"),
    );
    assert.ok(
      !f.w.document
        .querySelector(".order")
        ?.textContent?.includes("b".repeat(64)),
    );
  } finally {
    f.dom.window.close();
  }
});
test("UI cannot clear uncertain sellback consent to start another order", async () => {
  const p = {
    ...stored,
    sellback: {
      intentId: "11111111-1111-4111-8111-111111111111",
      transaction: "ZXhhY3Qtc2VsbA==",
      skuIds: ["11111111-1111-4111-8111-111111111112"],
    },
  };
  const f = await fixture(p, true);
  try {
    f.fill("order-id", a.id);
    await f.click("load-order");
    await f.click("new-order");
    assert.equal(f.saved().sellback.transaction, "ZXhhY3Qtc2VsbA==");
  } finally {
    f.dom.window.close();
  }
});
test("UI explorer cannot attach a different order payment quote", async () => {
  const f = await fixture(stored);
  try {
    f.fill("order-id", a.id);
    await f.click("load-order");
    f.operation("payment");
    f.fill("params", JSON.stringify({ id: "b".repeat(64) }));
    f.fill("body", JSON.stringify({ wallet }));
    await f.click("execute");
    assert.equal(
      f.calls.filter((c) => c.path === "/api/gacha/payment").length,
      0,
    );
  } finally {
    f.dom.window.close();
  }
});
test("UI stale response cannot overwrite active display after environment switch", async () => {
  const f = await fixture(stored);
  try {
    f.delay("read");
    f.operation("read");
    f.fill("params", JSON.stringify({ id: a.id, wallet }));
    await f.click("execute");
    f.fill("environment", "live");
    f.w.document
      .querySelector("#environment")!
      .dispatchEvent(new f.w.Event("change"));
    f.release();
    await settle();
    assert.ok(
      !f.w.document.querySelector("#response")!.textContent!.includes(a.id),
    );
  } finally {
    f.dom.window.close();
  }
});

test("UI presents seven isolated sections with network and API version labels", async () => {
  const f = await fixture();
  try {
    const tabs = [...f.w.document.querySelectorAll('[role="tab"]')];
    assert.deepEqual(
      tabs.map((t) => t.textContent?.trim().replace(/^0[1-7]/, "")),
      [
        "Overview",
        "Gacha",
        "Collection",
        "Wallet & Treasury",
        "API Explorer",
        "Runs & Recovery",
        "Integration Guide",
      ],
    );
    assert.equal(
      f.w.document.querySelectorAll('[role="tabpanel"]:not([hidden])').length,
      1,
    );
    assert.equal(
      f.w.document.querySelector('[role="tab"][aria-selected="true"]')?.id,
      "tab-overview",
    );
    assert.match(
      f.w.document.querySelector("#context")?.textContent ?? "",
      /SANDBOX.*API v1/,
    );
    await f.click("tab-wallet");
    assert.equal(
      f.w.document.querySelector("#panel-wallet")?.hasAttribute("hidden"),
      false,
    );
    assert.equal(
      f.w.document.querySelector("#test-refill")?.closest('[role="tabpanel"]')
        ?.id,
      "panel-wallet",
    );
    await f.click("tab-wallet");
    assert.equal(
      f.w.document.querySelector("#test-wallet")?.closest('[role="tabpanel"]')
        ?.id,
      "panel-wallet",
    );
  } finally {
    f.dom.window.close();
  }
});
test("tab navigation preserves drafts and quantity, supports keyboard navigation and makes no API calls", async () => {
  const f = await fixture(stored);
  try {
    f.fill("quantity", "3");
    f.fill("params", JSON.stringify({ id: a.id, wallet }));
    f.fill("body", '{"wallet":"draft"}');
    const before = f.calls.length;
    await f.click("tab-explorer");
    await f.click("tab-wallet");
    await f.click("tab-gacha");
    assert.equal(
      (f.w.document.querySelector("#quantity") as HTMLInputElement).value,
      "3",
    );
    assert.equal(
      (f.w.document.querySelector("#body") as HTMLTextAreaElement).value,
      '{"wallet":"draft"}',
    );
    assert.equal(f.calls.length, before);
    const current = f.w.document.querySelector("#tab-gacha")!;
    current.dispatchEvent(
      new f.w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    assert.equal(
      f.w.document.querySelector('[role="tab"][aria-selected="true"]')?.id,
      "tab-collection",
    );
    assert.equal(f.w.document.activeElement?.id, "tab-collection");
    assert.equal(f.saved().signedTransaction, "b3JpZ2luYWwtYnl0ZXM=");
  } finally {
    f.dom.window.close();
  }
});
test("completed card decisions and saved order recovery have their own sections", async () => {
  const f = await fixture(stored, true);
  try {
    await f.click("tab-runs");
    f.fill("order-id", a.id);
    await f.click("load-order");
    await f.click("tab-collection");
    assert.equal(
      f.w.document.querySelector("[data-keep]")?.closest('[role="tabpanel"]')
        ?.id,
      "panel-collection",
    );
    assert.equal(
      f.w.document.querySelector("#sellback")?.closest('[role="tabpanel"]')?.id,
      "panel-collection",
    );
    assert.equal(
      f.w.document.querySelector("#load-order")?.closest('[role="tabpanel"]')
        ?.id,
      "panel-runs",
    );
    assert.equal(
      f.w.document.querySelector("#panel-collection")?.hasAttribute("hidden"),
      false,
    );
  } finally {
    f.dom.window.close();
  }
});
test("Resume saved reconciles a saved signed payment and reveals cards without another payment quote", async () => {
  const f = await fixture(stored, true);
  try {
    f.w.document.querySelector<HTMLButtonElement>("[data-pack]")!.click();
    await settle();
    await f.click("resume");
    assert.equal(
      f.w.document.querySelector('[role="tab"][aria-selected="true"]')?.id,
      "tab-collection",
    );
    assert.ok(f.w.document.querySelector("[data-keep]"));
    assert.equal(f.calls.filter((c) => c.path.endsWith("/payment")).length, 0);
    assert.equal(f.calls.filter((c) => c.path.endsWith("/submit")).length, 0);
    assert.equal(f.saved().signedTransaction, "b3JpZ2luYWwtYnl0ZXM=");
  } finally {
    f.dom.window.close();
  }
});

test("environment switch refreshes new context and clears incompatible pack selection", async () => {
  const f = await fixture();
  try {
    f.w.document.querySelector<HTMLButtonElement>("[data-pack]")!.click();
    f.fill("environment", "live");
    f.w.document
      .querySelector("#environment")!
      .dispatchEvent(new f.w.Event("change"));
    await settle();
    assert.ok(f.calls.some((c) => c.path === "/api/network/live"));
    assert.equal(
      f.w.document.querySelector<HTMLButtonElement>("#open-pack")!.disabled,
      true,
    );
    assert.equal(
      f.w.document.querySelector('[data-pack][aria-pressed="true"]'),
      null,
    );
  } finally {
    f.dom.window.close();
  }
});
test("corrupt consent remains preserved and blocks a fresh opening", async () => {
  const f = await fixture({ version: 99 });
  try {
    assert.match(
      f.w.document.querySelector("#recovery-state")!.textContent!,
      /BLOCKED/,
    );
    f.w.document.querySelector<HTMLButtonElement>("[data-pack]")!.click();
    assert.equal(
      f.w.document.querySelector<HTMLButtonElement>("#open-pack")!.disabled,
      true,
    );
    assert.equal(f.calls.filter((c) => c.path.endsWith("/create")).length, 0);
    assert.equal(JSON.parse(f.w.localStorage.getItem(key)!).version, 99);
  } finally {
    f.dom.window.close();
  }
});

test("switching environment clears authenticated collector linkage", async () => {
  const f = await fixture();
  try {
    const original = (f.w as any).fetch;
    (f.w as any).fetch = async (path: string, init: any) =>
      path === "/api/services/collector/wallets"
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              wallets: [
                { pubkey: wallet, verifiedAt: new Date().toISOString() },
              ],
            }),
          }
        : original(path, init);
    await f.click("collector-check");
    assert.match(
      f.w.document.querySelector("#collector-link-status")!.textContent!,
      /Connected wallet verified/,
    );
    f.fill("environment", "live");
    f.w.document
      .querySelector("#environment")!
      .dispatchEvent(new f.w.Event("change"));
    await settle();
    assert.match(
      f.w.document.querySelector("#collector-link-status")!.textContent!,
      /Unverified/,
    );
  } finally {
    f.dom.window.close();
  }
});
test("Live Explorer cannot route testing requests through Sandbox credentials", async () => {
  const f = await fixture();
  try {
    f.fill("environment", "live");
    f.w.document
      .querySelector("#environment")!
      .dispatchEvent(new f.w.Event("change"));
    await settle();
    f.fill("service", "testing");
    f.w.document
      .querySelector("#service")!
      .dispatchEvent(new f.w.Event("change"));
    f.operation("wallet-funds");
    f.fill("body", JSON.stringify({ wallet, requestId: "deliberate-test-id" }));
    const before = f.calls.length;
    await f.click("execute");
    assert.equal(
      f.calls
        .slice(before)
        .filter((c) => c.path === "/api/testing/wallet-funds").length,
      0,
    );
  } finally {
    f.dom.window.close();
  }
});

const treasuryFixtureData={environment:'sandbox',partnerId,chain,mint:wallet,observedAt:'2026-10-05T00:00:00Z',commitment:'finalized',status:'observed',vault:wallet,tokenAccount:wallet,balanceUnits:'600000000',decimals:6,requiredFloatUnits:'500000000',shortfallUnits:'0',packHealth:[{packId:'pack',requiredFloatUnits:'500000000',shortfallUnits:'0',enabled:true,ready:true}],reasons:[]};
test('built treasury dashboard shows exact observations/activity and clears funds on failure',async()=>{const f=await fixture();try{const original=(f.w as any).fetch;let failure=false;let pages=0;(f.w as any).fetch=async(path:string,init:any)=>{if(path==='/api/services/treasury/get')return new Response(JSON.stringify(failure?{error:'treasury_unavailable'}:treasuryFixtureData),{status:failure?503:200});if(path==='/api/services/treasury/activity')return new Response(JSON.stringify({environment:'sandbox',partnerId,chain,mint:wallet,tokenAccount:wallet,source:'finalized-chain-observations',items:[{signature:String(++pages+1).repeat(88),slot:pages,blockTime:null,status:pages===1?'observed':'unavailable',deltaUnits:pages===1?'25000000':null}],nextCursor:pages===1?'2'.repeat(88):null,historyComplete:false}));return original(path,init);};await f.click('treasury-read');assert.match(f.w.document.querySelector('#treasury-snapshot')!.textContent!,/600.000000/);await f.click('treasury-next');assert.equal(f.w.document.querySelectorAll('[data-treasury-event]').length,2);assert.match(f.w.document.querySelector('#treasury-activity')!.textContent!,/Unknown/);failure=true;await f.click('treasury-read');await new Promise(r=>setTimeout(r,400));assert.doesNotMatch(f.w.document.querySelector('#treasury-snapshot')!.textContent!,/600.000000/);}finally{f.dom.window.close();}});
test('environment change discards pending treasury response and never changes buyer balances',async()=>{const f=await fixture();try{const original=(f.w as any).fetch;let resolve:any;(f.w as any).fetch=async(path:string,init:any)=>path==='/api/services/treasury/get'?new Promise(r=>{resolve=r;}):original(path,init);await f.click('treasury-read');f.fill('environment','live');f.w.document.querySelector('#environment')!.dispatchEvent(new f.w.Event('change'));await settle();resolve(new Response(JSON.stringify(treasuryFixtureData)));await settle();assert.doesNotMatch(f.w.document.querySelector('#treasury-snapshot')!.textContent!,/600.000000/);assert.doesNotMatch(f.w.document.querySelector('#buyer-balances')!.textContent!,/600.000000/);}finally{f.dom.window.close();}});

test('unprovisioned and malformed treasury observations never display spendable funds or owner secrets',async()=>{
 const f=await fixture();try {const original=(f.w as any).fetch;let raw:any={...treasuryFixtureData,status:'not-provisioned',vault:null,tokenAccount:null,balanceUnits:null,requiredFloatUnits:null,shortfallUnits:null,packHealth:[]};
 (f.w as any).fetch=async(path:string,init:any)=>path==='/api/services/treasury/get'?new Response(JSON.stringify(raw)):original(path,init);
 await f.click('treasury-read');assert.match(f.w.document.querySelector('#treasury-snapshot')!.textContent!,/not-provisioned/);assert.match(f.w.document.querySelector('#treasury-snapshot')!.textContent!,/Unknown/);
 raw={...treasuryFixtureData,mint:'2'.repeat(32),ownerSession:'ript_gacha_sandbox_SECRET'};await f.click('treasury-read');assert.doesNotMatch(f.w.document.querySelector('#treasury-snapshot')!.textContent!,/600.000000|SECRET|Ready/);
 assert.equal(f.calls.filter(c=>/credentials|fund\/prepare/.test(c.path)).length,0);
 }finally{f.dom.window.close();}
});
