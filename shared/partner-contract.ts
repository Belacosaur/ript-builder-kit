import type { Environment } from "./contract.js";
import type { ValidatedRequest, OperationDefinition } from "./services.js";
import { check, text, query, queryText } from "./validation.js";
const routes: Record<string, [string, "public" | "partner-session"]> = {
  session: ["/opening/partner-session", "public"],
  profile: ["/program/me", "partner-session"],
  treasury: ["/program/me/treasury", "partner-session"],
  preview: ["/program/me/preview", "partner-session"],
};
export function resolvePartner(
  op: string,
  params: Record<string, string>,
  body: unknown,
  environment: Environment,
): ValidatedRequest {
  check(routes[op], "unsupported_operation");
  check(body === undefined);
  const [base, auth] = routes[op];
  const p = { ...params };
  if (p.environment !== undefined)
    check(p.environment === environment, "partner_environment_mismatch");
  p.environment = environment;
  const rules: Record<string, (v: string) => void> = {
    environment: (v) => check(v === environment),
  };
  if (op === "session" || op === "preview") {
    text(p.vendor, 64, op === "preview" ? 2 : 1);
    rules.vendor = queryText(64);
    if (op === "session") {
      if (!p.door) p.door = "packs";
      rules.door = (v) => check(["packs", "iframe"].includes(v));
      rules.parentOrigin = (v) => {
        text(v, 500);
        const url = new URL(v);
        check(
          ["https:", "http:"].includes(url.protocol) &&
            url.origin === v &&
            !url.username &&
            !url.password &&
            (url.protocol === "https:" ||
              ["localhost", "127.0.0.1"].includes(url.hostname)),
        );
      };
      if (p.door === "iframe")
        check(!!p.parentOrigin, "iframe_parent_origin_required");
    }
  }
  const path =
    (op === "session" && environment === "sandbox" ? "/sandbox" : "") +
    base +
    query(p, rules);
  return { method: "GET", path, effect: "read", auth };
}
export const partnerOperations: OperationDefinition[] = Object.entries(
  routes,
).map(([id, [pathTemplate]]) => ({
  id,
  method: "GET",
  pathTemplate,
  effect: "read",
  example: {
    params:
      id === "session"
        ? { vendor: "YOUR_VENDOR", door: "packs" }
        : id === "preview"
          ? { vendor: "YOUR_VENDOR" }
          : {},
    body: undefined,
  },
  validate: (p, b, e) => resolvePartner(id, p, b, e),
}));
