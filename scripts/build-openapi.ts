import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { services, resolveServiceOperation } from "../shared/services.js";
import {
  requestSchema,
  querySchemas,
  responseSchemas,
  uuid,
  text,
} from "../shared/openapi-schemas.js";
function example(v: any): any {
  if (typeof v === "string") {
    if (v.includes("UUID")) return "11111111-1111-4111-8111-111111111111";
    if (v.includes("PUBLIC_KEY")) return "11111111111111111111111111111111";
    if (v === "SHA256_HEX") return "a".repeat(64);
    if (v.includes("BASE64")) return "YQ==";
  }
  if (Array.isArray(v)) return v.map(example);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, example(x)]),
    );
  return v;
}
export function buildOpenApi(): any {
  const doc: any = {
    openapi: "3.1.0",
    info: {
      title: "Ript builder API",
      version: "0.1.0",
      description:
        "Supported SDK contract. Treasury and latest Gacha receipts are additive local implementations; deployment is unverified. Existing owner treasury GET can provision; use direct treasury reads for inspection. Live selects an API environment, not a chain.",
    },
    servers: [{ url: "https://your-api.example.com" }],
    paths: {},
    components: {
      securitySchemes: Object.fromEntries(
        [
          "gacha-key",
          "inventory-key",
          "collector-session",
          "partner-session",
        ].map((k) => [
          k,
          {
            type: "http",
            scheme: "bearer",
            description:
              k +
              "; distinct server-held credential. Existing keys do not imply fine-grained read-only scopes.",
          },
        ]),
      ),
      schemas: responseSchemas,
    },
  };
  for (const service of services.filter((s) => !s.paused))
    for (const def of service.operations)
      for (const env of ["sandbox", "live"] as const) {
        if (
          (service.id === "testing" && env === "live") ||
          (service.id === "fulfilment" &&
            def.id === "prepare" &&
            env === "sandbox")
        )
          continue;
        const sample = example(def.example ?? {});
        const route = resolveServiceOperation(
          service.id,
          def.id,
          sample.params ?? {},
          sample.body === null ? undefined : sample.body,
          env,
        );
        let path = def.pathTemplate
          .split("?")[0]
          .replace(/:([a-zA-Z]+)/g, "{$1}");
        if (route.path.startsWith("/sandbox/") && !path.startsWith("/sandbox/"))
          path = "/sandbox" + path;
        const method = route.method.toLowerCase(),
          existing = doc.paths[path]?.[method];
        if (existing) {
          if (!existing["x-environments"].includes(env))
            existing["x-environments"].push(env);
          if (!existing["x-sdk-operations"].includes(service.id + "." + def.id))
            existing["x-sdk-operations"].push(service.id + "." + def.id);
          continue;
        }
        const parsed = new URL(route.path, "https://fixture.invalid");
        const parameters: any[] = [];
        for (const match of path.matchAll(/\{(\w+)\}/g)) {
          const name = match[1];
          parameters.push({
            name,
            in: "path",
            required: true,
            schema:
              name === "side"
                ? { type: "string", enum: ["front", "back"] }
                : service.id === "gacha" && name === "id"
                  ? { type: "string", pattern: "^[0-9a-f]{64}$" }
                  : service.id === "testing"
                    ? { type: "string", pattern: "^[0-9a-fA-F-]{36}$" }
                    : uuid,
          });
        }
        for (const [name, schema] of Object.entries(
          querySchemas(service.id, def.id),
        ))
          parameters.push({
            name,
            in: "query",
            required: ["environment", "wallet", "vendor"].includes(name),
            schema,
            ...(parsed.searchParams.has(name)
              ? { example: parsed.searchParams.get(name) }
              : {}),
          });
        if (route.idempotencyKey)
          parameters.push({
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: text(128),
            description:
              "Persist the same key and request body through uncertain outcomes.",
          });
        const schema = requestSchema(service.id, def.id);
        const operation: any = {
          operationId:
            service.id +
            "_" +
            def.id +
            (path.startsWith("/sandbox/") ? "_sandbox" : ""),
          tags: [service.id],
          summary: def.description ?? service.id + " " + def.id,
          description:
            service.id === "partner" && def.id === "treasury"
              ? "Legacy owner portal GET may provision treasury and update lifecycle. For side-effect-free inspection use /v1/gacha/treasury."
              : "Runtime validation and owner/service authorization apply; fixture examples are not real resources.",
          security: ["public", "none"].includes(route.auth)
            ? []
            : [{ [route.auth]: [] }],
          parameters,
          "x-sdk-operations": [service.id + "." + def.id],
          "x-environments": [env],
          "x-effect": route.effect,
          "x-template-example": def.example,
          responses: {
            "200": {
              description: "Successful API response",
              content: {
                "application/json": {
                  schema:
                    service.id === "treasury"
                      ? {
                          $ref:
                            "#/components/schemas/" +
                            (def.id === "get"
                              ? "TreasurySnapshot"
                              : "TreasuryActivityPage"),
                        }
                      : {
                          description:
                            "Service-specific response; use the typed SDK result where available.",
                        },
                },
              },
            },
            ...Object.fromEntries(
              ["400", "401", "403", "409", "429", "502", "503"].map(
                (status) => [
                  status,
                  {
                    description:
                      "Validation, authorization, capability, rate limit or upstream error",
                    content: {
                      "application/json": {
                        schema: { $ref: "#/components/schemas/Error" },
                      },
                    },
                  },
                ],
              ),
            ),
          },
        };
        if (schema)
          operation.requestBody = {
            required: !["credentialsIssue", "buyback", "retry"].includes(
              def.id,
            ),
            content: {
              "application/json": { schema, example: sample.body ?? {} },
            },
          };
        if (service.id === "inventory" && def.id === "reportExport")
          operation.responses["200"].content["text/csv"] = {
            schema: { type: "string" },
            example: "id\nFIXTURE_ONLY\n",
          };
        doc.paths[path] ??= {};
        doc.paths[path][method] = operation;
      }
  return JSON.parse(JSON.stringify(doc));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  writeFileSync(
    "docs/openapi.json",
    JSON.stringify(buildOpenApi(), null, 2) + "\n",
  );
