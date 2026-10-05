import { test } from "node:test";
import assert from "node:assert/strict";
import { smokeChecks } from "./smoke.js";
test("missing keys report blocked and cannot claim authenticated verification", async () => {
  const result = await smokeChecks({ sandbox: "", live: "" }, async (path) => {
    assert.ok(path.startsWith("/api/network/") || path === "/api/health");
    return {
      status: 200,
      data: path === "/api/health" ? { ok: true } : { chain: "c", token: "m" },
    };
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.results
      .filter((r) => r.operation === "packs")
      .every((r) => r.outcome === "blocked"),
    true,
  );
});
test("real authenticated catalog and isolation evidence are recorded separately", async () => {
  const result = await smokeChecks(
    { sandbox: "s", live: "l" },
    async (path, body) => {
      if (path === "/api/health") return { status: 200, data: { ok: true } };
      if (path.startsWith("/api/network/"))
        return { status: 200, data: { chain: "c", token: "m" } };
      const env = (body as any).environment;
      return {
        status: 200,
        data: {
          environment: env,
          partnerId: env + "-p",
          chain: "c",
          packs: [{ status: "paused", balanceUsdc: 0, requiredFloatUsdc: 500 }],
        },
      };
    },
  );
  assert.equal(result.ok, true);
  assert.equal(
    result.results
      .filter((r) => r.operation === "packs")
      .every((r) => r.outcome === "verified"),
    true,
  );
  assert.equal(
    result.results
      .filter((r) => r.operation === "financial-readiness")
      .every((r) => r.outcome === "blocked"),
    true,
  );
});

test("smoke explicitly reports reachability, not full readiness or acceptance", async () => {
  const result = await smokeChecks({ sandbox: "", live: "" }, async () => ({
    status: 200,
    data: { ok: true, chain: "c" },
  }));
  assert.equal(result.gate, "reachability");
  assert.equal(result.acceptanceVerified, false);
});
