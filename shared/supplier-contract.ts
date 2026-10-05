import type { Environment } from "./contract.js";
import type { ValidatedRequest, OperationDefinition } from "./services.js";
import { check, object, text, query, queryUuid, uuid } from "./validation.js";
export function resolveSupplier(
  op: string,
  params: Record<string, string>,
  body: unknown,
  _env: Environment,
): ValidatedRequest {
  const p = { ...params };
  let path: string, clean: Record<string, unknown> | undefined;
  if (op === "profile" || op === "skus") {
    check(body === undefined);
    path = op === "profile" ? "/partners/me" : "/partners/me/skus";
    if (op === "skus")
      path += query(p, { paged: (v) => check(v === "1"), cursor: queryUuid });
    else check(!Object.keys(p).length);
  } else if (op === "lookup") {
    check(!Object.keys(p).length);
    const b = object(body, [
      "certNumber",
      "grader",
      "imageUrl",
      "query",
      "productId",
      "rarityBand",
      "hostStudio",
    ]);
    for (const [k, max] of [
      ["certNumber", 64],
      ["grader", 16],
      ["query", 300],
      ["productId", 64],
    ] as const)
      if (b[k] !== undefined) text(b[k], max);
    if (b.imageUrl !== undefined) {
      text(b.imageUrl, 2000);
      check(new URL(b.imageUrl).protocol === "https:");
    }
    if (b.rarityBand !== undefined)
      check(["common", "uncommon", "rare", "epic"].includes(b.rarityBand));
    if (b.hostStudio !== undefined) check(typeof b.hostStudio === "boolean");
    clean = b;
    path = "/partners/me/skus/lookup";
  } else throw new Error("unsupported_operation");
  return {
    method: op === "lookup" ? "POST" : "GET",
    path,
    body: clean,
    effect: "read",
    auth: "partner-session",
  };
}
export function resolveFulfilment(
  op: string,
  params: Record<string, string>,
  body: unknown,
  environment: Environment,
): ValidatedRequest {
  check(["prepare", "read"].includes(op), "unsupported_operation");
  check(uuid.test(params.id ?? ""));
  check(Object.keys(params).length === 1);
  if (op === "read") {
    check(body === undefined);
    return {
      method: "GET",
      path: "/v1/inventory/operations/" + params.id,
      effect: "read",
      auth: "inventory-key",
    };
  }
  check(environment !== "sandbox", "synthetic_fulfilment_unavailable");
  const b = object(body, ["receiptSig", "shipping"]);
  if (b.receiptSig !== undefined) text(b.receiptSig, 128, 16);
  const a = object(b.shipping, [
    "name",
    "line1",
    "line2",
    "city",
    "region",
    "postalCode",
    "country",
    "phone",
    "email",
  ]);
  for (const [k, max] of [
    ["name", 200],
    ["line1", 200],
    ["city", 100],
    ["postalCode", 32],
    ["country", 2],
  ] as const)
    text(a[k], max);
  check(/^[A-Z]{2}$/.test(a.country));
  for (const [k, max] of [
    ["line2", 200],
    ["region", 100],
    ["phone", 40],
    ["email", 320],
  ] as const)
    if (a[k] !== undefined)
      text(a[k], max, k === "line2" || k === "region" ? 0 : 1);
  return {
    method: "POST",
    path: "/v1/inventory/claims/" + params.id + "/fulfill",
    body: b,
    effect: "mutation",
    auth: "inventory-key",
  };
}
export const supplierOperations: OperationDefinition[] = [
  ["profile", "GET", "/partners/me"],
  ["skus", "GET", "/partners/me/skus"],
  ["lookup", "POST", "/partners/me/skus/lookup"],
].map(([id, method, pathTemplate]) => ({
  id,
  method: method as "GET" | "POST",
  pathTemplate,
  effect: "read",
  example: {
    params: id === "skus" ? { paged: "1" } : {},
    body: id === "lookup" ? { query: "TEST_CARD" } : undefined,
  },
  validate: (p, b, e) => resolveSupplier(id, p, b, e),
}));
export const fulfilmentOperations: OperationDefinition[] = [
  {
    id: "prepare",
    method: "POST",
    pathTemplate: "/v1/inventory/claims/:id/fulfill",
    effect: "mutation",
    description:
      "Requires approved non-synthetic claim; sandbox physical shipment refused",
    example: {
      params: { id: "APPROVED_CLAIM_UUID" },
      body: {
        shipping: {
          name: "TEST_RECIPIENT",
          line1: "TEST_ADDRESS",
          city: "CITY",
          postalCode: "POSTAL_CODE",
          country: "US",
        },
      },
    },
    validate: (p, b, e) => resolveFulfilment("prepare", p, b, e),
  },
  {
    id: "read",
    method: "GET",
    pathTemplate: "/v1/inventory/operations/:id",
    effect: "read",
    example: { params: { id: "OPERATION_UUID" } },
    validate: (p, b, e) => resolveFulfilment("read", p, b, e),
  },
];
