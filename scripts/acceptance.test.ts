import { test } from "node:test";
import assert from "node:assert/strict";
import { startAcceptance } from "./acceptance.js";
test("acceptance resume preserves run identity and rejects new pack or scope substitution", () => {
  const s = {
      environment: "sandbox" as const,
      partnerId: "p",
      wallet: "w",
      chain: "c",
    },
    build = { clientVersion: "v", mint: "m" };
  const first = startAcceptance(s, "pack", 2, build);
  assert.equal(startAcceptance(s, "pack", 2, build, first).id, first.id);
  assert.throws(
    () => startAcceptance(s, "other", 2, build, first),
    /acceptance_run_binding/,
  );
});
