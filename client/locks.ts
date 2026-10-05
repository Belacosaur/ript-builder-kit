import type { Scope } from "./recovery.js";
export function lockName(s: Scope) {
  return (
    "ript-financial:" +
    JSON.stringify([s.environment, s.partnerId, s.chain, s.wallet])
  );
}
export async function withFinancialLock<T>(
  scope: Scope,
  signal: AbortSignal,
  work: () => Promise<T>,
  locks: LockManager | undefined = globalThis.navigator?.locks,
): Promise<T> {
  signal.throwIfAborted();
  if (!locks) throw new Error("financial_lock_unavailable");
  return locks.request(
    lockName(scope),
    { mode: "exclusive", signal },
    async () => {
      signal.throwIfAborted();
      return work();
    },
  );
}
