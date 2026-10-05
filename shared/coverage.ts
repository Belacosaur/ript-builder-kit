import type { ServiceDefinition, ServiceId } from "./services.js";
export type CoverageRecord = {
  service: ServiceId;
  configured: boolean;
  enabled: boolean;
  ready: boolean;
  verified: boolean;
  blockedReasons: string[];
  evidenceIds: string[];
};
export function assessCoverage(
  definitions: ServiceDefinition[],
  config: Partial<Record<ServiceId, { configured: boolean; enabled: boolean }>>,
  readiness: Partial<
    Record<ServiceId, { ready: boolean; blockedReasons: string[] }>
  >,
  runs: {
    service: ServiceId;
    source: "fixture" | "api" | "chain";
    ok: boolean;
    id: string;
  }[],
): CoverageRecord[] {
  return definitions.map((d) => {
    const c = config[d.id],
      r = readiness[d.id];
    const evidence = runs.filter(
      (e) => e.service === d.id && e.source === "chain" && e.ok,
    );
    const configured = !!c?.configured,
      enabled = !d.paused && !!c?.enabled,
      ready = configured && enabled && !!r?.ready;
    const verified = ready && evidence.length > 0;
    return {
      service: d.id,
      configured,
      enabled,
      ready,
      verified,
      evidenceIds: verified ? evidence.map((e) => e.id) : [],
      blockedReasons: d.paused
        ? ["paused-by-request"]
        : [
            ...(!configured ? ["missing-" + d.auth] : []),
            ...(!enabled ? ["capability-disabled"] : []),
            ...(r?.blockedReasons ?? ["readiness-not-observed"]),
            ...(!verified ? ["real-acceptance-missing"] : []),
          ],
    };
  });
}
export function configuredCoverage(
  config: any,
  environment: "sandbox" | "live",
): Partial<Record<ServiceId, { configured: boolean; enabled: boolean }>> {
  const g = !!config?.environments?.[environment]?.configured,
    i = config?.services?.inventory?.[environment],
    c = !!config?.services?.collector?.configured,
    p = !!config?.services?.partner?.configured;
  return {
    gacha: { configured: g, enabled: g },
    treasury: { configured: g, enabled: g },
    management: { configured: p, enabled: p },
    testing: { configured: g, enabled: g && environment === "sandbox" },
    inventory: { configured: !!i?.configured, enabled: !!i?.configured },
    collector: { configured: c, enabled: c },
    partner: { configured: p, enabled: true },
    supplier: { configured: p, enabled: p },
    fulfilment: {
      configured: !!i?.configured,
      enabled: environment === "live" && !!i?.mutations,
    },
    aggregator: { configured: false, enabled: false },
  };
}
