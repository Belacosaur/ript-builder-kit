import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, redact } from "./proxy.js";
import { publicConfig, validateConfig } from "./config.js";
const key = "ript_gacha_sandbox_secret-test-value";
const config = {
  baseUrl: "https://ript-backend-production.up.railway.app",
  port: 4315,
  environments: {
    sandbox: { key, rpcUrl: "https://api.devnet.solana.com" },
    live: { key: "", rpcUrl: "https://api.devnet.solana.com" },
  },
};
test("key stays private while upstream status survives", async () => {
  let authorization = "";
  let path = "";
  const app = createApp(config, async (url, init) => {
    path = String(url);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(
      JSON.stringify({ error: "partner_paused", leak: key }),
      { status: 409 },
    );
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/gacha/packs",
    payload: { environment: "sandbox", params: {} },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(authorization, "Bearer " + key);
  assert.equal(
    path,
    "https://ript-backend-production.up.railway.app/sandbox/v1/gacha/packs",
  );
  assert.ok(!res.body.includes(key));
  assert.ok(!JSON.stringify(publicConfig(config)).includes(key));
  await app.close();
});
test("cross-origin, unconfigured environment and arbitrary route cannot relay", async () => {
  let calls = 0;
  const app = createApp(config, async () => {
    calls++;
    return new Response("{}");
  });
  for (const [url, payload, headers] of [
    [
      "/api/gacha/packs",
      { environment: "sandbox", params: {} },
      { origin: "https://evil.test" },
    ],
    ["/api/gacha/packs", { environment: "live", params: {} }, {}],
    ["/api/gacha/unknown", { environment: "sandbox", params: {} }, {}],
  ] as const) {
    assert.ok(
      (await app.inject({ method: "POST", url, payload, headers }))
        .statusCode >= 400,
    );
  }
  assert.equal(calls, 0);
  await app.close();
});
test("wrong key environment and external upstream config fail closed", () => {
  assert.throws(() =>
    validateConfig({ ...config, baseUrl: "https://evil.test" }),
  );
  assert.throws(() =>
    validateConfig({
      ...config,
      environments: {
        ...config.environments,
        live: { key, rpcUrl: "https://api.devnet.solana.com" },
      },
    }),
  );
  assert.deepEqual(
    redact({
      authorization: "Bearer xyz",
      nested: { transaction: "abc", sessionToken: "xyz" },
    }),
    {
      authorization: "[redacted]",
      nested: { transaction: "[redacted]", sessionToken: "[redacted]" },
    },
  );
});
test("upstream transport failure is an error and never contains secrets", async () => {
  const app = createApp(config, async () => {
    throw new Error(key);
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/gacha/packs",
    payload: { environment: "sandbox", params: {} },
  });
  assert.equal(res.statusCode, 502);
  assert.ok(!res.body.includes(key));
  await app.close();
});
test("network metadata is a fixed public read with no key", async () => {
  let auth = "";
  const app = createApp(config, async (url, init) => {
    assert.equal(
      String(url),
      "https://ript-backend-production.up.railway.app/sandbox/opening/packs",
    );
    auth = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(
      JSON.stringify({ chain: "genesis", token: "mint", packs: [] }),
    );
  });
  const res = await app.inject({ method: "GET", url: "/api/network/sandbox" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { chain: "genesis", token: "mint" });
  assert.equal(auth, "");
  await app.close();
});
test('public signed-payment status survives credential redaction',()=>{assert.deepEqual(redact({hasSignedPayment:true,transaction:'secret-bytes',session:'secret'}),{hasSignedPayment:true,transaction:'[redacted]',session:'[redacted]'});});
