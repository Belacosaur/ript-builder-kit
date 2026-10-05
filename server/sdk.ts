import { createRiptServerClient } from "../packages/sdk/src/server.js";
import type { Config } from "./config.js";
export function serverSdk(
  config: Config,
  environment: "sandbox" | "live",
  fetcher: typeof fetch,
) {
  return createRiptServerClient({
    baseUrl: config.baseUrl,
    environment,
    fetch: fetcher,
    credentials: {
      gachaKey: config.environments[environment].key,
      inventoryKey: config.services?.inventory[environment].key,
      collectorSession: config.services?.collectorSession,
      partnerSession: config.services?.partnerSession,
    },
  });
}
