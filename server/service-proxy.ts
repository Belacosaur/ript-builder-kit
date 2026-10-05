import { serverSdk } from "./sdk.js";
import { privateAssetUrl } from "../shared/private-assets.js";
import type { FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import { resolveServiceOperation, publicServices } from "../shared/services.js";
import { sanitize } from "../shared/sanitize.js";
export function registerServiceProxy(
  app: FastifyInstance,
  config: Config,
  upstreamFetch: typeof fetch,
) {
  app.get("/api/services", async () => ({ services: publicServices() }));
  app.post("/api/services/:service/:operation", async (req, reply) => {
    let route;
    let env: "sandbox" | "live";
    try {
      const input = req.body as any;
      if (
        !input ||
        !["sandbox", "live"].includes(input.environment) ||
        !input.params ||
        typeof input.params !== "object" ||
        Array.isArray(input.params) ||
        Object.values(input.params).some((v) => typeof v !== "string") ||
        Object.keys(input).some(
          (k) => !["environment", "params", "body"].includes(k),
        )
      )
        throw new Error();
      env = input.environment;
      route = resolveServiceOperation(
        (req.params as any).service,
        (req.params as any).operation,
        input.params,
        input.body,
        env,
      );
    } catch (e) {
      return reply.code(400).send({
        error:
          e instanceof Error &&
          [
            "service_paused",
            "unsupported_operation",
            "unknown_service",
          ].includes(e.message)
            ? e.message
            : "invalid_request",
      });
    }
    if (
      (req.params as any).service === "management" &&
      route.effect === "mutation"
    )
      return reply.code(403).send({ error: "server_only_operation" });
    if (
      (req.params as any).service === "fulfilment" &&
      route.effect === "mutation" &&
      !config.services?.approvedFulfilmentClaims?.includes(
        (req.body as any).params.id,
      )
    )
      return reply
        .code(403)
        .send({ error: "approved_physical_fixture_required" });
    let key = "";
    if (route.auth === "inventory-key") {
      key = config.services?.inventory[env].key ?? "";
      if (
        route.effect === "mutation" &&
        !config.services?.inventory[env].mutations
      )
        return reply.code(403).send({ error: "service_mutations_disabled" });
    } else if (route.auth === "collector-session")
      key = config.services?.collectorSession ?? "";
    else if (route.auth === "partner-session")
      key = config.services?.partnerSession ?? "";
    else if (route.auth === "gacha-key") {
      if ((req.params as any).service !== "treasury")
        return reply.code(400).send({ error: "use_gacha_proxy" });
      key = config.environments[env].key;
    }
    if (!key && !["public", "none"].includes(route.auth))
      return reply.code(409).send({
        error: "service_credential_not_configured",
        service: (req.params as any).service,
        environment: env,
      });
    try {
      const response = await serverSdk(config, env, upstreamFetch).executeRaw(
        route,
      );
      const raw = await response.text();
      if (raw.length > 2_000_000) throw new Error();
      if ((req.params as any).operation === "reportExport" && response.ok) {
        return {
          contentType: response.headers.get("content-type"),
          content: sanitize(raw),
          source: "api",
        };
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return reply.code(502).send({ error: "invalid_upstream_response" });
      }
      if (response.headers.get("retry-after"))
        reply.header("retry-after", response.headers.get("retry-after")!);
      const clean = sanitize(data);
      // Finalized transaction references are public evidence, not authentication signatures.
      if ((req.params as any).service === "treasury" && (req.params as any).operation === "activity" && response.ok && Array.isArray(data.items))
        data.items.forEach((item:any, i:number) => {
          if (/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(item.signature ?? "") && clean.items?.[i]) clean.items[i].signature = item.signature;
        });
      if (
        (req.params as any).service === "collector" &&
        response.ok &&
        ["photo", "photoPresign"].includes((req.params as any).operation)
      ) {
        for (const key of ["url", "uploadUrl"])
          if (data[key]) clean[key] = privateAssetUrl(data[key]);
        if (data.headers) clean.headers = data.headers;
      }
      return reply
        .header("Cache-Control", "no-store")
        .code(response.status)
        .send(clean);
    } catch {
      return reply.code(502).send({
        error: "upstream_unavailable",
        uncertain: route.effect === "mutation",
      });
    }
  });
}
