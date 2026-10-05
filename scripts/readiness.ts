import { evaluateReadiness, type ReadinessInput } from "../shared/readiness.js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadConfig, publicConfig } from "../server/config.js";
import { readBuyerBalances, type BuyerBalances } from "../client/balances.js";
import { walletIsLinked } from "../client/services/collector.js";
import { configuredCoverage } from "../shared/coverage.js";
import { services } from "../shared/services.js";
import { sanitize } from "../shared/sanitize.js";
export async function runReadiness(
  config: ReadinessInput,
  ports: {
    balances: () => Promise<BuyerBalances | null>;
    collectorLinked: () => Promise<boolean | undefined>;
  },
) {
  const [balance, link] = await Promise.allSettled([
    ports.balances(),
    ports.collectorLinked(),
  ]);
  const evaluated = evaluateReadiness({
    ...config,
    balances: balance.status === "fulfilled" ? balance.value : null,
    collectorLinked: link.status === "fulfilled" ? link.value : undefined,
  });
  return {
    ok: evaluated.ready,
    checks: evaluated.checks,
    gate: "readiness",
    acceptanceVerified: false,
  };
}
export async function main(args = process.argv.slice(2)) {
  const arg = (name: string) =>
    args
      .find((a) => a.startsWith("--" + name + "="))
      ?.split("=")
      .slice(1)
      .join("=");
  const environment = arg("environment"),
    service = arg("service"),
    wallet = arg("wallet") ?? "";
  if (
    !["sandbox", "live"].includes(environment ?? "") ||
    !services.some((s) => s.id === service)
  )
    throw new Error(
      "Use npm run check:readiness -- --service=gacha --environment=sandbox --wallet=<buyer-public-key>",
    );
  const env = environment as "sandbox" | "live",
    config = loadConfig(),
    base = "http://127.0.0.1:" + config.port;
  const get = async (path: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("readiness_api_" + response.status);
    return (await response.json()) as any;
  };
  if (service !== "gacha") {
    const coverage = configuredCoverage(publicConfig(config), env)[
      service as keyof ReturnType<typeof configuredCoverage>
    ];
    return {
      ok: false,
      gate: "readiness",
      acceptanceVerified: false,
      checks: [
        {
          id: "service-configuration",
          status: coverage?.configured ? "verified" : "blocked",
          source: "local",
          reason: coverage?.configured
            ? "Configured; requires authenticated fixture rehearsal"
            : "Supply explicit " + service + " credential",
        },
        {
          id: "service-fixture",
          status: "unverified",
          source: "api",
          reason:
            service === "aggregator"
              ? "Paused by request"
              : "Use Explorer supported read routes and explicit approved fixture; no service-specific real run has been observed",
        },
      ],
    };
  }
  const network = await get("/api/network/" + env);
  let catalog: any = { packs: [], partnerId: "" };
  try {
    catalog = await get("/api/gacha/packs", { environment: env, params: {} });
  } catch {}
  const scope = {
    environment: env,
    partnerId: catalog.partnerId,
    wallet,
    chain: network.chain,
  };
  return runReadiness(
    {
      configured: !!config.environments[env].key,
      packs: catalog.packs,
      wallet,
      chain: network.chain,
      mint: network.token,
      locksAvailable: false,
    },
    {
      balances: async () =>
        wallet
          ? readBuyerBalances(
              scope,
              config.environments[env].rpcUrl,
              network.token,
            )
          : null,
      collectorLinked: async () =>
        walletIsLinked(
          await get("/api/services/collector/wallets", {
            environment: env,
            params: {},
          }),
          wallet,
        ),
    },
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main()
    .then((result) => {
      console.log(JSON.stringify(sanitize(result), null, 2));
      if (!result.ok) process.exitCode = 1;
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : "readiness_failed");
      process.exitCode = 1;
    });
