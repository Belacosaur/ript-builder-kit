import { test } from "node:test";
import assert from "node:assert/strict";
import { assessCoverage } from "./coverage.js";
import { services } from "./services.js";
test("configuration, readiness and acceptance remain independent; paused is excluded", () => {
  const rows = assessCoverage(
    services,
    { gacha: { configured: true, enabled: true } },
    {},
    [],
  );
  const g = rows.find((r) => r.service === "gacha")!;
  assert.equal(g.configured, true);
  assert.equal(g.ready, false);
  assert.equal(g.verified, false);
  assert.ok(g.blockedReasons.includes("readiness-not-observed"));
  const a = rows.find((r) => r.service === "aggregator")!;
  assert.equal(a.enabled, false);
  assert.equal(a.verified, false);
  assert.deepEqual(a.blockedReasons, ["paused-by-request"]);
});
test("ready without real run remains unverified and fixtures cannot certify services", () => {
  const rows = assessCoverage(
    services,
    { inventory: { configured: true, enabled: true } },
    { inventory: { ready: true, blockedReasons: [] } },
    [{ service: "inventory", source: "fixture", ok: true, id: "fake" }],
  );
  assert.equal(rows.find((r) => r.service === "inventory")!.verified, false);
});
