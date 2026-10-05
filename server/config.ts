import { readFileSync, existsSync } from "node:fs";
import type { Environment } from "../shared/contract.js";
export type Config = {
  services?: {
    inventory: Record<Environment, { key: string; mutations: boolean }>;
    collectorSession: string;
    partnerSession: string;
    approvedFulfilmentClaims?: string[];
  };
  baseUrl: string;
  port: number;
  environments: Record<Environment, { key: string; rpcUrl: string }>;
};
export function validateConfig(c: Config): Config {
  const url = new URL(c.baseUrl);
  if (
    url.origin !== "https://ript-backend-production.up.railway.app" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("upstream_not_allowed");
  for (const env of ["sandbox", "live"] as const) {
    const value = c.environments[env];
    if (value.key && !value.key.startsWith("ript_gacha_" + env + "_"))
      throw new Error("credential_environment_mismatch");
    const rpc = new URL(value.rpcUrl);
    if (rpc.protocol !== "https:") throw new Error("rpc_requires_https");
  }
  if (c.services) {
    for (const env of ["sandbox", "live"] as const) {
      const key = c.services.inventory[env].key;
      if (key && !key.startsWith(env === "sandbox" ? "rk_test_" : "rk_live_"))
        throw new Error("inventory_credential_environment_mismatch");
    }
    for (const token of [
      c.services.collectorSession,
      c.services.partnerSession,
    ])
      if (/[\r\n]/.test(token) || token.length > 4096)
        throw new Error("session_token_invalid");
  }
  if (!Number.isInteger(c.port) || c.port < 1024 || c.port > 65535)
    throw new Error("invalid_port");
  return c;
}
export function loadConfig(): Config {
  const file = ".private/credentials.json";
  const keys = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return validateConfig({
    baseUrl:
      process.env.RIPT_API_URL ??
      "https://ript-backend-production.up.railway.app",
    port: Number(process.env.PORT ?? 4315),
    services: {
      inventory: {
        sandbox: {
          key: process.env.INVENTORY_SANDBOX_KEY ?? "",
          mutations: process.env.INVENTORY_SANDBOX_MUTATIONS === "true",
        },
        live: {
          key: process.env.INVENTORY_LIVE_KEY ?? "",
          mutations: process.env.INVENTORY_LIVE_MUTATIONS === "true",
        },
      },
      collectorSession: process.env.COLLECTOR_SESSION_TOKEN ?? "",
      partnerSession: process.env.PARTNER_SESSION_TOKEN ?? "",
      approvedFulfilmentClaims: (
        process.env.FULFILMENT_APPROVED_CLAIM_IDS ?? ""
      )
        .split(",")
        .filter(Boolean),
    },
    environments: {
      sandbox: {
        key: process.env.GACHA_SANDBOX_KEY ?? keys.sandbox?.key ?? "",
        rpcUrl: process.env.SANDBOX_RPC_URL ?? "https://api.devnet.solana.com",
      },
      live: {
        key: process.env.GACHA_LIVE_KEY ?? keys.live?.key ?? "",
        rpcUrl: process.env.LIVE_RPC_URL ?? "https://api.devnet.solana.com",
      },
    },
  });
}
export function publicConfig(c: Config) {
  return {
    baseUrl: c.baseUrl,
    services: {
      inventory: {
        sandbox: {
          configured: !!c.services?.inventory.sandbox.key,
          mutations: !!c.services?.inventory.sandbox.mutations,
        },
        live: {
          configured: !!c.services?.inventory.live.key,
          mutations: !!c.services?.inventory.live.mutations,
        },
      },
      collector: { configured: !!c.services?.collectorSession },
      partner: { configured: !!c.services?.partnerSession },
    },
    environments: Object.fromEntries(
      Object.entries(c.environments).map(([env, v]) => [
        env,
        {
          configured: !!v.key,
          keyHint: v.key ? "ript_gacha_" + env + "_…" : "Not configured",
          rpcUrl: v.rpcUrl,
        },
      ]),
    ),
  };
}
