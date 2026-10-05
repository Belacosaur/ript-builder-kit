import type { Environment } from "../../shared/contract.js";
import type { ServiceCall } from "./inventory.js";
export function createPartnerClient(call: ServiceCall) {
  return {
    async session(input: {
      vendor: string;
      door: "packs" | "iframe";
      parentOrigin?: string;
      environment: Environment;
    }) {
      const result = await call("session", input);
      if (
        result.slug !== input.vendor ||
        result.environment !== input.environment ||
        result.door !== input.door
      )
        throw new Error("partner_session_binding_invalid");
      return result;
    },
    treasury: (environment: Environment) => call("treasury", { environment }),
    async preview(vendor: string, environment: Environment) {
      const result = await call("preview", { vendor, environment });
      if (!result.readOnly) throw new Error("partner_preview_not_readonly");
      return result;
    },
  };
}

export function iframePreviewUrl(
  session: any,
  parentOrigin: string,
  acceptedOrigin?: string,
): string {
  if (
    session?.door !== "iframe" ||
    typeof session.slug !== "string" ||
    !["sandbox", "live"].includes(session.environment)
  )
    throw new Error("iframe_session_required");
  if (parentOrigin !== acceptedOrigin)
    throw new Error("iframe_origin_unverified");
  throw new Error("embedded_readonly_capability_unavailable");
}
