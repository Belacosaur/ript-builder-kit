import { resolveServiceOperation } from "../../../shared/services.js";
import { resolveTreasury } from "../../../shared/treasury-contract.js";
import { createClient, type Invoke } from "./client.js";
import { createTransport } from "./transport.js";
import type { Environment } from "./types.js";
export type BrowserOptions = {
  environment: Environment;
  proxyUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};
export function createRiptBrowserClient(options: BrowserOptions) {
  if (
    Object.keys(options).some(
      (k) => !["environment", "proxyUrl", "fetch", "timeoutMs"].includes(k),
    )
  )
    throw Error("browser_credentials_forbidden");
  if (!["sandbox", "live"].includes(options.environment))
    throw Error("invalid_environment");
  const proxy = options.proxyUrl ?? "/api";
  if (!/^\/(?!\/)[A-Za-z0-9/_-]+$/.test(proxy))
    throw Error("same_origin_proxy_required");
  const send = createTransport(options.fetch ?? fetch, options.timeoutMs);
  const invoke: Invoke = async (service, op, p = {}, body, o) => {
    if (service === "management" && op !== "credentialsList")
      throw Error("server_only_operation");
    const route =
      service === "treasury"
        ? resolveTreasury(op, p, body, options.environment)
        : resolveServiceOperation(service, op, p, body, options.environment);
    const path =
      service === "gacha"
        ? "/gacha/" + op
        : service === "testing"
          ? "/testing/" + op
          : "/services/" + service + "/" + op;
    return send(
      proxy.replace(/\/$/, "") + path,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          environment: options.environment,
          params: p,
          ...(body === undefined ? {} : { body }),
        }),
      },
      route,
      o,
    );
  };
  return createClient(invoke);
}

export { RiptError } from "./transport.js";
export type * from "./types.js";
