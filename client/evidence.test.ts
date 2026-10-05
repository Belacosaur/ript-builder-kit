import { test } from "node:test";
import assert from "node:assert/strict";
import { appendEvidence, exportRun } from "./evidence.js";
test("append-only ledger redacts private payloads and refuses duplicate evidence IDs", () => {
  const run: any = {
    version: 1,
    id: "r",
    clientVersion: "v",
    scope: { environment: "sandbox", chain: "c", wallet: "w", partnerId: "p" },
    mint: "m",
    steps: [],
  };
  const step: any = {
    id: "one",
    source: "api",
    clientVersion: "v",
    scope: run.scope,
    mint: "m",
    observedAt: new Date().toISOString(),
    operation: "read",
    status: "unverified",
    details: {
      authorization: "Bearer SECRET",
      transaction: "signed",
      url: "https://x.r2.cloudflarestorage.com/a?X-Amz-Signature=secret",
    },
  };
  const next = appendEvidence(run, step);
  assert.equal(run.steps.length, 0);
  assert.equal(next.steps.length, 1);
  assert.throws(() => appendEvidence(next, step), /duplicate_evidence/);
  assert.ok(!exportRun(next).includes("SECRET"));
  assert.ok(!exportRun(next).includes("X-Amz-Signature"));
});

test("public finalized payment and fulfilment references survive append/export/import without leaking authentication", async () => {
  const { verifyAcceptance } = await import("../shared/evidence.js");
  const scope: any = {
    environment: "sandbox",
    chain: "c",
    wallet: "w",
    partnerId: "p",
  };
  let run: any = {
    version: 1,
    id: "r",
    clientVersion: "v",
    scope,
    mint: "m",
    steps: [],
  };
  for (const operation of ["payment", "fulfilment"]) {
    run = appendEvidence(run, {
      id: operation,
      source: "chain",
      operation,
      status: "verified",
      scope,
      mint: "m",
      clientVersion: "v",
      observedAt: new Date().toISOString(),
      details: {
        orderId: "order",
        signature: "2".repeat(88),
        commitment: "finalized",
        slot: 1,
        meta: { err: null },
        amountUnits: "25",
        transaction: "SECRET_BYTES",
        auth: { signature: "3".repeat(88) },
        authorization: "Bearer SECRET",
      },
    });
  }
  const encoded = exportRun(run),
    decoded = JSON.parse(encoded);
  assert.equal(
    verifyAcceptance(decoded, {
      scope,
      clientVersion: "v",
      mint: "m",
      quantity: 1,
      operations: ["payment", "fulfilment"],
    }).ok,
    true,
  );
  assert.equal(decoded.steps[0].details.signature, "2".repeat(88));
  assert.equal(decoded.steps[0].details.auth.signature, "[redacted]");
  assert.ok(!encoded.includes("SECRET"));
  const api: any = {
    ...decoded.steps[0],
    id: "api",
    source: "api",
    operation: "wallet-link",
  };
  assert.equal(
    appendEvidence({ ...run, steps: [] }, api).steps[0].details.signature,
    "[redacted]",
  );
});

test("workspace export includes scoped finalized treasury references but redacts auth signatures", async () => {
  const module: any = await import("./evidence.js");
  const scope: any = {
    environment: "sandbox",
    partnerId: "11111111-1111-4111-8111-111111111111",
    chain: "genesis",
    wallet: "11111111111111111111111111111111",
  };
  const mint = scope.wallet;
  const run: any = {
    version: 1,
    id: "incomplete",
    clientVersion: "v",
    scope,
    mint,
    steps: [],
  };
  const snapshot = {
    ...scope,
    mint,
    status: "observed",
    commitment: "finalized",
    observedAt: "2026-10-05T00:00:00Z",
    vault: mint,
    tokenAccount: mint,
    balanceUnits: "25",
    decimals: 6,
    requiredFloatUnits: "0",
    shortfallUnits: "0",
    packHealth: [],
    reasons: [],
  };
  const activity = {
    ...scope,
    mint,
    tokenAccount: mint,
    source: "finalized-chain-observations",
    items: [
      {
        signature: "2".repeat(88),
        slot: 1,
        blockTime: null,
        status: "observed",
        deltaUnits: "25",
        auth: { signature: "SECRET" },
      },
    ],
    nextCursor: null,
    historyComplete: false,
  };
  const exported = module.exportWorkspace
    ? JSON.parse(
        module.exportWorkspace(run, {
          scope,
          treasurySnapshot: snapshot,
          treasuryActivity: activity,
          traces: [],
        }),
      )
    : JSON.parse(exportRun(run));
  assert.equal(exported.treasury?.activity.items[0].signature, "2".repeat(88));
  assert.equal(
    exported.treasury?.activity.items[0].auth.signature,
    "[redacted]",
  );
  assert.ok(!JSON.stringify(exported).includes("SECRET"));
});
