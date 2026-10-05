import {
  resolveServiceOperation,
  type ValidatedRequest,
} from "../../../shared/services.js";
import { resolveTreasury } from "../../../shared/treasury-contract.js";
import { createClient, type Invoke } from "./client.js";
import { createTransport } from "./transport.js";
import type { Credentials, Environment, RequestOptions } from "./types.js";
export type ServerOptions = {
  baseUrl: string;
  environment: Environment;
  credentials?: Credentials;
  fetch?: typeof fetch;
  timeoutMs?: number;
};
export function createRiptServerClient(options: ServerOptions) {
  const base = new URL(options.baseUrl);
  if (base.protocol !== "https:") throw Error("upstream_requires_https");
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw Error("invalid_upstream_url");
  if (!["sandbox", "live"].includes(options.environment))
    throw Error("invalid_environment");
  const credentials = { ...options.credentials };
  if (
    (credentials.gachaKey &&
      !credentials.gachaKey.startsWith(
        "ript_gacha_" + options.environment + "_",
      )) ||
    (credentials.inventoryKey &&
      !credentials.inventoryKey.startsWith(
        options.environment === "sandbox" ? "rk_test_" : "rk_live_",
      ))
  )
    throw Error("credential_environment_mismatch");
  if (
    Object.values(credentials).some(
      (v) => v && (/[\r\n]/.test(v) || v.length > 4096),
    )
  )
    throw Error("invalid_credential");
  if (
    [credentials.partnerSession, credentials.collectorSession].some(
      (v) => v && /^(ript_gacha_|rk_(test|live)_)/.test(v),
    )
  )
    throw Error("credential_kind_mismatch");
  const send = createTransport(options.fetch ?? fetch, options.timeoutMs);
  const executeRaw = (route: ValidatedRequest, o?: RequestOptions) => {
    const key =
      route.auth === "gacha-key"
        ? credentials.gachaKey
        : route.auth === "inventory-key"
          ? credentials.inventoryKey
          : route.auth === "collector-session"
            ? credentials.collectorSession
            : route.auth === "partner-session"
              ? credentials.partnerSession
              : undefined;
    if (!key && !["public", "none"].includes(route.auth))
      throw Error("credential_not_configured");
    if (!route.path.startsWith("/") || route.path.startsWith("//"))
      throw Error("invalid_api_path");
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (key) headers.authorization = "Bearer " + key;
    if (route.idempotencyKey) headers["idempotency-key"] = route.idempotencyKey;
    return {
      url: base.origin + route.path,
      init: {
        method: route.method,
        headers,
        body: route.body === undefined ? undefined : JSON.stringify(route.body),
      },
      route,
    };
  };
  const invoke: Invoke = async (service, op, p = {}, body, o) => {
    const route =
      service === "treasury"
        ? resolveTreasury(op, p, body, options.environment)
        : resolveServiceOperation(service, op, p, body, options.environment);
    const request = executeRaw(route, o);
    return send(
      request.url,
      request.init,
      route,
      o,
      service === "inventory" && op === "reportExport" ? "export" : "json",
    );
  };
  return {
    ...createClient(invoke),
    executeRaw: async (route: ValidatedRequest, o?: RequestOptions) => {
      const request = executeRaw(route, o);
      return send(
        request.url,
        request.init,
        route,
        { ...o, retries: 0 },
        "raw",
      ) as Promise<Response>;
    },
  };
}

export { RiptError } from "./transport.js";
export type * from "./types.js";
