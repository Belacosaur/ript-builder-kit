import type { Environment } from "./contract.js";
import { validWallet } from "./contract.js";
import type { OperationDefinition, ValidatedRequest } from "./services.js";
import { check, object, text, uuid } from "./validation.js";
const routes: Record<string, [ValidatedRequest["method"], string]> = {
  credentialsList: ["GET", "/program/me/credentials"],
  credentialsIssue: ["POST", "/program/me/credentials"],
  credentialsRevoke: ["DELETE", "/program/me/credentials/:id"],
  packsConfigure: ["PUT", "/program/me/packs"],
  fundPrepare: ["POST", "/program/me/treasury/fund/prepare"],
};
export function resolveManagement(
  op: string,
  params: Record<string, string>,
  body: unknown,
  environment: Environment,
): ValidatedRequest {
  check(routes[op], "unsupported_operation");
  let [method, path] = routes[op];
  const p = { ...params };
  if (op === "credentialsRevoke") {
    check(uuid.test(p.id ?? ""));
    path = path.replace(":id", p.id);
    delete p.id;
  }
  check(Object.keys(p).length === 0);
  let clean: Record<string, unknown> | undefined;
  if (op === "credentialsList" || op === "credentialsRevoke")
    check(body === undefined);
  else if (op === "credentialsIssue") {
    const b = object(body ?? {}, ["label"]);
    clean = { label: text(b.label ?? "Direct integration", 120) };
  } else if (op === "packsConfigure") {
    const b = object(body, ["packIds", "pricesCents"]);
    check(
      Array.isArray(b.packIds) &&
        b.packIds.length <= 100 &&
        b.packIds.every(
          (v: unknown) =>
            typeof v === "string" &&
            /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v),
        ),
    );
    if (b.pricesCents !== undefined) {
      check(
        b.pricesCents &&
          typeof b.pricesCents === "object" &&
          !Array.isArray(b.pricesCents),
      );
      for (const [key, v] of Object.entries(b.pricesCents)) {
        check(
          /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key) &&
            Number.isSafeInteger(v) &&
            Number(v) > 0,
        );
      }
    }
    clean = b;
  } else {
    const b = object(body, ["wallet", "amountUsdc"]);
    check(validWallet(b.wallet));
    check(
      typeof b.amountUsdc === "number" &&
        Number.isFinite(b.amountUsdc) &&
        b.amountUsdc > 0 &&
        b.amountUsdc <= 1000000,
    );
    clean = b;
  }
  return {
    method,
    path: path + "?environment=" + environment,
    body: clean,
    effect: method === "GET" ? "read" : "mutation",
    auth: "partner-session",
  };
}
export const managementOperations: OperationDefinition[] = Object.entries(
  routes,
).map(([id, [method, pathTemplate]]) => ({
  id,
  method,
  pathTemplate,
  effect: method === "GET" ? "read" : "mutation",
  description:
    method === "GET"
      ? "Owner-session credential metadata"
      : "Server SDK only; explicit owner action",
  example: {
    params:
      id === "credentialsRevoke"
        ? { id: "11111111-1111-4111-8111-111111111111" }
        : {},
    body:
      id === "credentialsIssue"
        ? { label: "Dashboard" }
        : id === "packsConfigure"
          ? { packIds: ["YOUR_PACK_ID"] }
          : id === "fundPrepare"
            ? { wallet: "11111111111111111111111111111111", amountUsdc: 25 }
            : undefined,
  },
  validate: (p, b, e) => resolveManagement(id, p, b, e),
}));
