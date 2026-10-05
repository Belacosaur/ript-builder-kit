import Ajv2020 from "ajv/dist/2020.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOpenApi } from "./build-openapi.js";
import { services, resolveServiceOperation } from "../shared/services.js";
const uuid = "11111111-1111-4111-8111-111111111111";
function fixture(v: any): any {
  if (typeof v === "string") {
    if (v.includes("UUID")) return uuid;
    if (v.includes("PUBLIC_KEY")) return "11111111111111111111111111111111";
    if (v === "SHA256_HEX") return "a".repeat(64);
    if (v.includes("BASE64")) return "YQ==";
  }
  if (Array.isArray(v)) return v.map(fixture);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, fixture(x)]),
    );
  return v;
}
test("OpenAPI covers every validated public route, auth and environment without proxy paths", () => {
  const doc = buildOpenApi();
  assert.equal(doc.openapi, "3.1.0");
  assert.ok(doc.paths["/sandbox/v1/gacha/treasury"]);
  const ids = new Set<string>();
  for (const [path, methods] of Object.entries(doc.paths) as any) {
    assert.ok(!path.startsWith("/api/"));
    for (const op of Object.values(methods) as any) {
      assert.ok(!ids.has(op.operationId));
      ids.add(op.operationId);
      assert.ok(op.responses["200"]);
      for (const p of op.parameters ?? [])
        if (p.in === "path") {
          assert.equal(p.required, true);
          assert.ok(path.includes("{" + p.name + "}"));
        }
      for (const security of op.security ?? [])
        for (const key of Object.keys(security))
          assert.ok(doc.components.securitySchemes[key]);
    }
  }
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
        const example = fixture(def.example ?? {});
        const route = resolveServiceOperation(
          service.id,
          def.id,
          example.params ?? {},
          example.body === null ? undefined : example.body,
          env,
        );
        const template = def.pathTemplate
          .split("?")[0]
          .replace(/:([a-zA-Z]+)/g, "{$1}");
        const prefix =
          route.path.startsWith("/sandbox/") &&
          !template.startsWith("/sandbox/")
            ? "/sandbox"
            : "";
        const op = doc.paths[prefix + template]?.[route.method.toLowerCase()];
        assert.ok(op, service.id + "." + def.id + " " + env);
        assert.ok(op["x-sdk-operations"].includes(service.id + "." + def.id));
        assert.ok(op["x-environments"].includes(env));
        const parsed = new URL(route.path, "https://fixture.invalid");
        for (const key of parsed.searchParams.keys())
          assert.ok(
            op.parameters.some((p: any) => p.in === "query" && p.name === key),
            key,
          );
        if (route.body)
          assert.ok(op.requestBody?.content["application/json"].schema);
      }
});
test("treasury OpenAPI uses nullable string base units and bounded finalized observations", () => {
  const doc = buildOpenApi();
  const schema = doc.components.schemas.TreasurySnapshot;
  assert.deepEqual(schema.properties.balanceUnits.type, ["string", "null"]);
  assert.equal(schema.properties.decimals.const, 6);
  assert.equal(
    doc.components.schemas.TreasuryActivityPage.properties.historyComplete
      .const,
    false,
  );
  assert.equal(
    doc.paths["/v1/gacha/treasury/activity"].get.parameters.find(
      (x: any) => x.name === "limit",
    ).schema.maximum,
    50,
  );
  assert.ok(doc.components.schemas.Error);
});
test("AI builder entry points state package and deployment limits", () => {
  for (const file of [
    "llms.txt",
    "docs/builders/quickstart.md",
    "docs/builders/authentication.md",
    "docs/builders/treasury.md",
    "docs/builders/recovery.md",
    "docs/builders/ai-instructions.md",
    "docs/builders/capabilities.md",
  ])
    assert.ok(readFileSync(file, "utf8").length > 120);
  const guide = readFileSync("docs/builders/quickstart.md", "utf8");
  assert.match(guide, /ript-sdk-0.1.0.tgz/);
  assert.match(guide, /not.*publish/i);
});

test("all published request examples validate as JSON Schema and resolve local references", () => {
  const doc = buildOpenApi();
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  for (const schema of Object.values(doc.components.schemas) as any[])
    assert.ok(ajv.validateSchema(schema));
  let requests = 0;
  function refs(v: any) {
    if (!v || typeof v !== "object") return;
    if (v.$ref) {
      assert.match(v.$ref, /^#\/components\/schemas\//);
      assert.ok(doc.components.schemas[v.$ref.split("/").pop()]);
    }
    for (const x of Object.values(v)) refs(x);
  }
  refs(doc);
  for (const methods of Object.values(doc.paths) as any[])
    for (const op of Object.values(methods) as any[]) {
      const body = op.requestBody?.content["application/json"];
      if (body) {
        requests++;
        assert.ok(
          ajv.validate(body.schema, body.example),
          op.operationId + " " + JSON.stringify(ajv.errors),
        );
        assert.equal(
          ajv.validate(body.schema, { ...body.example, unknownField: true }),
          false,
          op.operationId,
        );
      }
    }
  assert.ok(requests > 20);
  assert.deepEqual(JSON.parse(readFileSync("docs/openapi.json", "utf8")), doc);
});

test("OpenAPI treasury status invariants and upstream CSV export media are explicit", () => {
  const doc = buildOpenApi();
  assert.ok(doc.components.schemas.TreasurySnapshot.allOf?.length);
  assert.ok(
    doc.paths["/v1/inventory/reports/claims/export"].get.responses["200"]
      .content["text/csv"],
  );
});
