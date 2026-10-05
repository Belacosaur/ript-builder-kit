import {
  validateTreasurySnapshot,
  validateTreasuryActivity,
} from "../shared/treasury-dto.js";
import { sanitize } from "../shared/sanitize.js";
import { sameScope } from "./recovery.js";
import type { AcceptanceRun, Evidence } from "../shared/evidence.js";
/** Only the schema's finalized chain reference is public. Nested/auth signatures stay private. */
function sanitizeEvidence(step: Evidence): Evidence {
  const clean = sanitize(step);
  const signature = step.details?.signature;
  if (
    step.source === "chain" &&
    ["payment", "fulfilment"].includes(step.operation) &&
    step.details?.commitment === "finalized" &&
    typeof signature === "string" &&
    /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)
  )
    clean.details.signature = signature;
  return clean;
}
export function appendEvidence(
  run: AcceptanceRun,
  step: Evidence,
): AcceptanceRun {
  if (run.steps.length >= 200) throw new Error("evidence_limit_reached");
  if (run.steps.some((e) => e.id === step.id))
    throw new Error("duplicate_evidence");
  if (
    !sameScope(run.scope, step.scope) ||
    run.clientVersion !== step.clientVersion ||
    run.mint !== step.mint
  )
    throw new Error("evidence_scope_mismatch");
  const clean = sanitizeEvidence(step);
  if (JSON.stringify(clean).length > 128000)
    throw new Error("evidence_payload_too_large");
  return { ...run, steps: [...run.steps, clean] };
}
export function exportRun(run: AcceptanceRun) {
  return JSON.stringify(
    { ...sanitize(run), steps: run.steps.map(sanitizeEvidence) },
    null,
    2,
  );
}

export function recordTrace(
  storage: Storage,
  trace: any,
  clientVersion: string,
  mint: string,
): AcceptanceRun | null {
  const orderId = trace.response?.id ?? trace.request?.params?.id;
  if (!/^[a-f0-9]{64}$/.test(orderId ?? "") || !trace.scope?.wallet || !mint)
    return null;
  const key =
    "ript-evidence:" +
    JSON.stringify([
      clientVersion,
      trace.scope.environment,
      trace.scope.partnerId,
      trace.scope.wallet,
      trace.scope.chain,
      mint,
      orderId,
    ]);
  const old = storage.getItem(key);
  let run: AcceptanceRun = old
    ? JSON.parse(old)
    : {
        version: 1,
        id: orderId,
        scope: { ...trace.scope },
        clientVersion,
        mint,
        steps: [],
      };
  if (!Array.isArray(run.steps) || run.version !== 1)
    throw new Error("stored_evidence_corrupt");
  run = appendEvidence(run, {
    id: crypto.randomUUID(),
    source: "api",
    observedAt: trace.at,
    clientVersion,
    scope: trace.scope,
    mint,
    operation: trace.operation,
    status: "unverified",
    details: { orderId, httpStatus: trace.status, response: trace.response },
  });
  storage.setItem(key, exportRun(run));
  return run;
}

/** Export inspection observations separately from financial acceptance, with schema-bound public refs. */
export function exportWorkspace(
  run: AcceptanceRun,
  metadata: {
    scope: AcceptanceRun["scope"];
    treasurySnapshot: unknown;
    treasuryActivity: unknown;
    traces: unknown[];
  },
) {
  const clean: any = {
    ...JSON.parse(exportRun(run)),
    exportedAt: new Date().toISOString(),
    scope: sanitize(metadata.scope),
    traces: sanitize(metadata.traces),
  };
  if (metadata.treasurySnapshot) {
    try {
      const snapshot = validateTreasurySnapshot(
        metadata.treasurySnapshot,
        metadata.scope,
      );
      if (snapshot.mint !== run.mint) throw Error("treasury_mint_mismatch");
      clean.treasury = {
        snapshot: sanitize(snapshot),
        activity: null,
        acceptance: "unverified",
      };
      if (metadata.treasuryActivity) {
        const page = validateTreasuryActivity(
          metadata.treasuryActivity,
          metadata.scope,
          snapshot,
        );
        clean.treasury.activity = sanitize(page);
        page.items.forEach((item, i) => {
          clean.treasury.activity.items[i].signature = item.signature;
        });
      }
    } catch {
      clean.treasury = { status: "unavailable", acceptance: "unverified" };
    }
  }
  return JSON.stringify(clean, null, 2);
}
