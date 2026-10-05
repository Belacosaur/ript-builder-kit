import { test } from "node:test";
import assert from "node:assert/strict";
const module = await import("./index.js").catch(() => null);
const server =
  module?.createRiptServerClient ??
  (() => {
    throw Error("sdk_not_implemented");
  });
const browser =
  module?.createRiptBrowserClient ??
  (() => {
    throw Error("sdk_not_implemented");
  });
test("server SDK sends scoped treasury and inventory credentials to exact public routes", async () => {
  const calls: any[] = [];
  const sdk = server({
    baseUrl: "https://api.example.com",
    environment: "sandbox",
    credentials: {
      gachaKey: "ript_gacha_sandbox_demo",
      inventoryKey: "rk_test_demo",
    },
    fetch: async (url: any, init: any) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ status: "observed" }));
    },
  });
  await sdk.treasury.get();
  await sdk.inventory.ledger();
  assert.equal(
    calls[0].url,
    "https://api.example.com/sandbox/v1/gacha/treasury",
  );
  assert.equal(
    calls[0].init.headers.authorization,
    "Bearer ript_gacha_sandbox_demo",
  );
  assert.equal(calls[1].init.headers.authorization, "Bearer rk_test_demo");
  assert.equal(calls[1].url, "https://api.example.com/v1/inventory/ledger");
  assert.equal(calls[0].init.redirect, "error");
});
test("SDK refuses credential substitution, wrong environment and insecure destinations", async () => {
  let calls = 0;
  const opts: any = {
    baseUrl: "https://api.example.com",
    environment: "sandbox",
    credentials: { gachaKey: "ript_gacha_sandbox_demo" },
    fetch: async () => {
      calls++;
      return new Response("{}");
    },
  };
  await assert.rejects(
    server(opts).inventory.ledger(),
    /credential_not_configured/,
  );
  assert.equal(calls, 0);
  assert.throws(
    () => server({ ...opts, baseUrl: "http://api.example.com" }),
    /https/,
  );
  assert.throws(
    () =>
      server({ ...opts, credentials: { gachaKey: "ript_gacha_live_demo" } }),
    /credential_environment_mismatch/,
  );
  assert.throws(
    () =>
      browser({ environment: "sandbox", credentials: opts.credentials } as any),
    /browser_credentials_forbidden/,
  );
  assert.throws(
    () =>
      browser({
        environment: "sandbox",
        proxyUrl: "https://other.example.com",
      }),
    /same_origin_proxy_required/,
  );
});
test("browser client uses same-origin proxy and carries no credentials", async () => {
  const calls: any[] = [];
  const sdk = browser({
    environment: "sandbox",
    fetch: async (url: any, init: any) => {
      calls.push({ url, init });
      return new Response("{}");
    },
  });
  await sdk.treasury.activity.list({ limit: 20 });
  assert.equal(calls[0].url, "/api/services/treasury/activity");
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    environment: "sandbox",
    params: { limit: "20" },
  });
});
test("reads retry transient failures but financial mutations never automatically retry", async () => {
  let count = 0;
  const sdk = server({
    baseUrl: "https://api.example.com",
    environment: "sandbox",
    credentials: { gachaKey: "ript_gacha_sandbox_demo" },
    fetch: async () => {
      count++;
      return new Response(count === 1 ? "{}" : '{"ok":true}', {
        status: count === 1 ? 503 : 200,
      });
    },
  });
  await sdk.treasury.get();
  assert.equal(count, 2);
  count = 0;
  await assert.rejects(
    sdk.gacha.orders.create({
      partner_id: "11111111-1111-4111-8111-111111111111",
      wallet: "11111111111111111111111111111111",
      packId: "pack",
      quantity: 1,
      clientNonce: "abcdefghijklmnop",
    }),
  );
  assert.equal(count, 1);
});
test("request deadlines abort hanging calls and errors redact credentials", async () => {
  const sdk = server({
    baseUrl: "https://api.example.com",
    environment: "sandbox",
    timeoutMs: 20,
    credentials: { gachaKey: "ript_gacha_sandbox_SECRET" },
    fetch: async () => new Promise(() => {}),
  });
  await assert.rejects(sdk.treasury.get(), /request_timeout/);
  const bad = server({
    baseUrl: "https://api.example.com",
    environment: "sandbox",
    credentials: { gachaKey: "ript_gacha_sandbox_SECRET" },
    fetch: async () =>
      new Response('{"error":"ript_gacha_sandbox_SECRET"}', { status: 401 }),
  });
  try {
    await bad.treasury.get();
    assert.fail();
  } catch (e) {
    assert.ok(!String(e).includes("SECRET"));
    assert.equal((e as any).status, 401);
  }
});

test("management requires owner session, sends exact bodies and keeps issued keys server-only", async () => {
  const calls: any[] = [];
  const sdk = server({
    baseUrl: "https://api.example.com",
    environment: "sandbox",
    credentials: { partnerSession: "owner-session" },
    fetch: async (url: any, init: any) => {
      calls.push({ url, init });
      return new Response('{"token":"issued-private-key"}');
    },
  });
  const issued: any = await sdk.management.credentials.issue("Dashboard");
  assert.equal(issued.token, "issued-private-key");
  assert.equal(
    calls[0].url,
    "https://api.example.com/program/me/credentials?environment=sandbox",
  );
  assert.equal(calls[0].init.headers.authorization, "Bearer owner-session");
  assert.deepEqual(JSON.parse(calls[0].init.body), { label: "Dashboard" });
  await assert.rejects(
    server({
      baseUrl: "https://api.example.com",
      environment: "sandbox",
      credentials: { gachaKey: "ript_gacha_sandbox_demo" },
    }).management.credentials.list(),
    /credential_not_configured/,
  );
  await assert.rejects(
    browser({ environment: "sandbox" }).management.credentials.issue(
      "Dashboard",
    ),
    /server_only_operation/,
  );
});

test("known API keys cannot masquerade as owner or collector sessions", () => {
  for (const kind of ["partnerSession", "collectorSession"])
    assert.throws(
      () =>
        server({
          baseUrl: "https://api.example.com",
          environment: "sandbox",
          credentials: { [kind]: "ript_gacha_sandbox_demo" },
        }),
      /credential_kind_mismatch/,
    );
});

test("server and browser entry points export the documented error and type surface", async () => {
  for (const name of ["./server.js", "./browser.js"]) {
    const entry: any = await import(name);
    assert.equal(entry.RiptError, module?.RiptError, name);
  }
});

test("mutation parse failures and explicit upstream flags preserve uncertainty without retry", async () => {
  for (const [status, payload] of [
    [200, "not json"],
    [409, JSON.stringify({ error: "pending", uncertain: true })],
  ] as const) {
    let calls = 0;
    const sdk = server({
      baseUrl: "https://api.example.com",
      environment: "sandbox",
      credentials: { gachaKey: "ript_gacha_sandbox_fixture" },
      fetch: async () => {
        calls++;
        return new Response(payload, { status });
      },
    });
    await assert.rejects(
      sdk.gacha.orders.create({
        partner_id: "11111111-1111-4111-8111-111111111111",
        wallet: "11111111111111111111111111111111",
        packId: "pack",
        quantity: 1,
        clientNonce: "abcdefghijklmnop",
      }),
      (e: any) => e.uncertain === true,
    );
    assert.equal(calls, 1);
  }
});
test("raw proxy requests bound and cancel stalled response bodies", async () => {
  const sdk = server({
    baseUrl: "https://api.example.com",
    environment: "sandbox",
    timeoutMs: 20,
    credentials: { gachaKey: "ript_gacha_sandbox_fixture" },
    fetch: async () => new Response(new ReadableStream({ start() {} })),
  });
  const outcome = await Promise.race([
    sdk
      .executeRaw({
        method: "GET",
        path: "/v1/gacha/packs",
        effect: "read",
        auth: "gacha-key",
      })
      .then((r) => r.text())
      .then(
        () => "completed",
        (e: any) => e.message,
      ),
    new Promise((r) => setTimeout(() => r("deadline_missing"), 80)),
  ]);
  assert.equal(outcome, "request_timeout");
});
test("Inventory export server/browser results share one envelope for JSON and CSV", async () => {
  for (const format of ["json", "csv"]) {
    const content = format === "json" ? '[{"id":"fixture"}]' : "id\nfixture\n";
    const contentType = format === "json" ? "application/json" : "text/csv";
    const envelope = { contentType, content, source: "api" };
    const sdk = server({
      baseUrl: "https://api.example.com",
      environment: "sandbox",
      credentials: { inventoryKey: "rk_test_fixture" },
      fetch: async () =>
        new Response(content, { headers: { "content-type": contentType } }),
    });
    assert.deepEqual(
      await sdk.inventory.reports.list("reportExport", { format }),
      envelope,
    );
    const web = browser({
      environment: "sandbox",
      fetch: async () => new Response(JSON.stringify(envelope)),
    });
    assert.deepEqual(
      await web.inventory.reports.list("reportExport", { format }),
      envelope,
    );
  }
});
