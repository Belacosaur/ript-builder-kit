import { sameScope, type Scope } from "../client/recovery.js";
import { appendEvidence } from "../client/evidence.js";
import type { AcceptanceRun, Evidence } from "../shared/evidence.js";
export type RehearsalRun = AcceptanceRun & { packId: string; quantity: number };
export function startAcceptance(
  scope: Scope,
  packId: string,
  quantity: number,
  build: { clientVersion: string; mint: string },
  existing?: RehearsalRun,
): RehearsalRun {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10 || !packId)
    throw new Error("invalid_acceptance_request");
  if (existing) {
    if (
      !sameScope(existing.scope, scope) ||
      existing.packId !== packId ||
      existing.quantity !== quantity ||
      existing.clientVersion !== build.clientVersion ||
      existing.mint !== build.mint
    )
      throw new Error("acceptance_run_binding");
    return existing;
  }
  return {
    version: 1,
    id: crypto.randomUUID(),
    scope: { ...scope },
    ...build,
    packId,
    quantity,
    steps: [],
  };
}
export function attachObservedEvidence(
  run: RehearsalRun,
  evidence: Evidence,
): RehearsalRun {
  return { ...run, ...appendEvidence(run, evidence) };
}
