import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../server/config.js";
type Result = {
  operation: string;
  environment: string;
  status: number;
  observedAt: string;
  outcome: "verified" | "blocked" | "untested";
  details?: unknown;
};
type Call = (
  path: string,
  body?: unknown,
) => Promise<{ status: number; data: any }>;
export async function smokeChecks(
  keys: { sandbox: string; live: string },
  call: Call,
) {
  const results: Result[] = [];
  let ok = true;
  const record = (
    operation: string,
    environment: string,
    status: number,
    outcome: Result["outcome"],
    details?: unknown,
  ) =>
    results.push({
      operation,
      environment,
      status,
      observedAt: new Date().toISOString(),
      outcome,
      details,
    });
  try {
    const health = await call("/api/health");
    const passed = health.status === 200 && health.data.ok === true;
    record("health", "local", health.status, passed ? "verified" : "blocked");
    if (!passed) ok = false;
  } catch {
    record("health", "local", 0, "blocked");
    ok = false;
  }
  for (const env of ["sandbox", "live"] as const) {
    let network: any;
    try {
      const n = await call("/api/network/" + env);
      network = n.data;
      record(
        "network-metadata",
        env,
        n.status,
        n.status === 200 ? "verified" : "blocked",
        n.data,
      );
      if (n.status !== 200) ok = false;
    } catch {
      record("network-metadata", env, 0, "blocked");
      ok = false;
    }
    if (!keys[env]) {
      record("packs", env, 0, "blocked", {
        reason: "credential_not_configured",
      });
      ok = false;
    } else
      try {
        const r = await call("/api/gacha/packs", {
          environment: env,
          params: {},
        });
        const valid =
          r.status === 200 &&
          r.data.environment === env &&
          !!r.data.partnerId &&
          r.data.chain === network?.chain;
        record(
          "packs",
          env,
          r.status,
          valid ? "verified" : "blocked",
          valid
            ? {
                partnerId: r.data.partnerId,
                packCount: r.data.packs?.length,
                chain: r.data.chain,
              }
            : { reason: r.data.error ?? "scope_mismatch" },
        );
        if (!valid) ok = false;
        const ready =
          valid &&
          r.data.packs?.some(
            (p: any) =>
              p.status === "available" &&
              p.maxQuantity >= 1 &&
              p.balanceUsdc >= p.requiredFloatUsdc,
          );
        record(
          "financial-readiness",
          env,
          r.status,
          ready ? "verified" : "blocked",
          {
            reason: ready
              ? "server_catalog_available"
              : "stock_treasury_or_approval_unavailable",
          },
        );
      } catch {
        record("packs", env, 0, "blocked", { reason: "transport_failed" });
        ok = false;
      }
    for (const operation of [
      "create",
      "read",
      "proof",
      "payment",
      "submit",
      "sellbackPrepare",
      "sellbackSubmit",
      "keep",
    ])
      record(operation, env, 0, "untested", {
        reason: "requires_real_order_and_explicit_wallet_actions",
      });
  }
  return { gate: "reachability", acceptanceVerified: false, ok, results };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const config = loadConfig();
  const base = "http://127.0.0.1:" + config.port;
  const result = await smokeChecks(
    {
      sandbox: config.environments.sandbox.key,
      live: config.environments.live.key,
    },
    async (path, body) => {
      const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
      return { status: r.status, data: await r.json() };
    },
  );
  mkdirSync("docs/releases", { recursive: true });
  writeFileSync(
    "docs/releases/reachability-latest.json",
    JSON.stringify({ type: "real-upstream-read-only", ...result }, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
