import { serverSdk } from "./sdk.js";
import { resolveTestingOperation } from "../shared/testing.js";
import Fastify from "fastify";
import { resolveOperation, validateBody } from "../shared/contract.js";
import { publicConfig, validateConfig, type Config } from "./config.js";
export { sanitize as redact } from "../shared/sanitize.js";
import { sanitize as redact } from "../shared/sanitize.js";
import { registerServiceProxy } from "./service-proxy.js";
export function createApp(config: Config, upstreamFetch: typeof fetch = fetch) {
  validateConfig(config);
  const app = Fastify({ logger: false, bodyLimit: 8192 });
  app.addHook("onRequest", async (req, reply) => {
    const host = req.headers.host ?? "";
    if (
      !new RegExp("^(127\\.0\\.0\\.1|localhost)(:" + config.port + ")?$").test(
        host,
      ) &&
      host !== "localhost:80"
    )
      return reply.code(403).send({ error: "invalid_host" });
    const origin = req.headers.origin;
    if (origin && origin !== "http://" + host)
      return reply.code(403).send({ error: "same_origin_required" });
    const pageNavigation = req.method === "GET" && req.url === "/" &&
      req.headers["sec-fetch-mode"] === "navigate" && req.headers["sec-fetch-dest"] === "document";
    if (req.headers["sec-fetch-site"] === "cross-site" && !pageNavigation)
      return reply.code(403).send({ error: "same_origin_required" });
  });
  app.get("/api/config", async () => publicConfig(config));
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/network/:environment", async (req, reply) => {
    const env = (req.params as any).environment;
    if (!["sandbox", "live"].includes(env))
      return reply.code(400).send({ error: "invalid_environment" });
    try {
      const response = await serverSdk(config, env, upstreamFetch).executeRaw({
        method: "GET",
        path: (env === "sandbox" ? "/sandbox" : "") + "/opening/packs",
        effect: "read",
        auth: "public",
      });
      if (!response.ok)
        return reply
          .code(response.status)
          .send({ error: "network_metadata_unavailable" });
      const data = await response.json();
      if (typeof data.chain !== "string" || typeof data.token !== "string")
        throw new Error();
      return { chain: data.chain, token: data.token };
    } catch {
      return reply.code(502).send({ error: "network_metadata_unavailable" });
    }
  });
  app.post("/api/testing/:operation", async (req, reply) => {
    let route: ReturnType<typeof resolveTestingOperation>;
    try {
      const data = req.body as any;
      if (
        !data ||
        data.environment !== "sandbox" ||
        !data.params ||
        Object.keys(data).some(
          (k) => !["environment", "params", "body"].includes(k),
        )
      )
        throw new Error();
      route = resolveTestingOperation(
        (req.params as any).operation,
        data.params,
        data.body,
      );
    } catch {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const key = config.environments.sandbox.key;
    if (!key)
      return reply.code(409).send({ error: "credential_not_configured" });
    try {
      const response = await serverSdk(
        config,
        "sandbox",
        upstreamFetch,
      ).executeRaw({
        ...route,
        auth: "gacha-key",
        effect: route.method === "POST" ? "mutation" : "read",
      });
      const data = await response.json();
      if (response.headers.get("retry-after"))
        reply.header("retry-after", response.headers.get("retry-after")!);
      return reply.code(response.status).send(redact(data));
    } catch {
      return reply
        .code(502)
        .send({ error: "sandbox_testing_upstream_unavailable" });
    }
  });
  app.post("/api/gacha/:operation", async (req, reply) => {
    let env: "sandbox" | "live",
      route: { method: "GET" | "POST"; path: string },
      body: Record<string, unknown> | undefined;
    try {
      const data = req.body as any;
      if (
        !data ||
        !["sandbox", "live"].includes(data.environment) ||
        !data.params ||
        typeof data.params !== "object" ||
        Array.isArray(data.params) ||
        Object.keys(data).some(
          (k) => !["environment", "params", "body"].includes(k),
        )
      )
        throw new Error();
      env = data.environment;
      const operation = (req.params as any).operation;
      route = resolveOperation(operation, data.params);
      body = validateBody(operation, data.body);
    } catch {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const key = config.environments[env].key;
    if (!key)
      return reply.code(409).send({ error: "credential_not_configured" });
    try {
      const response = await serverSdk(config, env, upstreamFetch).executeRaw({
        ...route,
        path: (env === "sandbox" ? "/sandbox" : "") + route.path,
        body,
        auth: "gacha-key",
        effect: route.method === "POST" ? "mutation" : "read",
      });
      const raw = await response.text();
      if (raw.length > 2_000_000) throw new Error();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return reply.code(502).send({ error: "invalid_upstream_response" });
      } // Quotes must reach the wallet; redaction applies to logs/exports and other fields.
      const clean = redact(parsed);
      if (
        body !== undefined &&
        route.path.endsWith("/payment") &&
        parsed.transaction
      )
        clean.transaction = parsed.transaction;
      if (route.path.endsWith("/sellback/prepare") && parsed.transaction)
        clean.transaction = parsed.transaction;
      if (response.headers.get("retry-after"))
        reply.header("retry-after", response.headers.get("retry-after")!);
      return reply.code(response.status).send(clean);
    } catch {
      return reply.code(502).send({
        error: "upstream_unavailable",
        uncertain: route.method === "POST",
      });
    }
  });
  registerServiceProxy(app, config, upstreamFetch);
  return app;
}
