import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./proxy.js";
import { publicConfig, validateConfig, type Config } from "./config.js";
const config: Config = {
  baseUrl: "https://ript-backend-production.up.railway.app",
  port: 4315,
  environments: {
    sandbox: {
      key: "ript_gacha_sandbox_secret",
      rpcUrl: "https://api.devnet.solana.com",
    },
    live: { key: "", rpcUrl: "https://api.devnet.solana.com" },
  },
  services: {
    inventory: {
      sandbox: { key: "rk_test_test", mutations: false },
      live: { key: "rk_live_live", mutations: false },
    },
    collectorSession: "collector-private",
    partnerSession: "partner-private",
  },
};
test("service credentials never enter browser configuration and prefixes cannot cross", () => {
  assert.ok(
    !JSON.stringify(publicConfig(config)).includes("collector-private"),
  );
  assert.throws(
    () =>
      validateConfig({
        ...config,
        services: {
          ...config.services!,
          inventory: {
            sandbox: { key: "ript_gacha_sandbox_wrong", mutations: false },
            live: { key: "", mutations: false },
          },
        },
      }),
    /inventory_credential/,
  );
});
test("fixed service proxy refuses arbitrary capability and missing credentials", async () => {
  let calls = 0;
  const app = createApp({ ...config, services: undefined }, async () => {
    calls++;
    return new Response("{}");
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/services/inventory/catalog",
    headers: { host: "127.0.0.1:4315" },
    payload: { environment: "sandbox", params: {} },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(calls, 0);
  const bad = await app.inject({
    method: "POST",
    url: "/api/services/inventory/evil",
    headers: { host: "127.0.0.1:4315" },
    payload: { environment: "sandbox", params: {} },
  });
  assert.equal(bad.statusCode, 400);
  await app.close();
});
test("physical mutation needs both explicitly approved fixture and mutation permission", async () => {
  let calls = 0;
  const app = createApp(config, async () => {
    calls++;
    return new Response("{}");
  });
  const payload = {
    environment: "live",
    params: { id: "11111111-1111-4111-8111-111111111111" },
    body: {
      shipping: {
        name: "N",
        line1: "L",
        city: "C",
        postalCode: "P",
        country: "US",
      },
    },
  };
  const res = await app.inject({
    method: "POST",
    url: "/api/services/fulfilment/prepare",
    headers: { host: "127.0.0.1:4315" },
    payload,
  });
  assert.equal(res.statusCode, 403);
  assert.equal(calls, 0);
  await app.close();
});

test("new treasury proxy uses only scoped Gacha credential while browser management cannot issue keys", async () => {
  const calls: any[] = [];
  const app = createApp(config, async (url: any, init: any) => {
    calls.push({ url, init });
    return new Response('{"status":"unavailable","balanceUnits":null}');
  });
  const r = await app.inject({
    method: "POST",
    url: "/api/services/treasury/get",
    headers: { host: "127.0.0.1:4315" },
    payload: { environment: "sandbox", params: {} },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(
    calls[0].url,
    "https://ript-backend-production.up.railway.app/sandbox/v1/gacha/treasury",
  );
  assert.equal(
    calls[0].init.headers.authorization,
    "Bearer ript_gacha_sandbox_secret",
  );
  const denied = await app.inject({
    method: "POST",
    url: "/api/services/management/credentialsIssue",
    headers: { host: "127.0.0.1:4315" },
    payload: { environment: "sandbox", params: {}, body: { label: "x" } },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(calls.length, 1);
  await app.close();
});

test('treasury activity preserves public transaction references but redacts authentication signatures',async()=>{const app=createApp(config,async()=>new Response(JSON.stringify({items:[{signature:'2'.repeat(88),auth:{signature:'SECRET'}}]})));const r=await app.inject({method:'POST',url:'/api/services/treasury/activity',headers:{host:'127.0.0.1:4315'},payload:{environment:'sandbox',params:{}}});assert.equal(r.statusCode,200);assert.equal(r.json().items[0].signature,'2'.repeat(88));assert.equal(r.json().items[0].auth.signature,'[redacted]');await app.close();});
