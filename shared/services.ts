import { treasuryOperations } from "./treasury-contract.js";
import { managementOperations } from "./management-contract.js";
import { resolveOperation, validateBody } from "./contract.js";
import { resolveTestingOperation } from "./testing.js";
import { partnerOperations } from "./partner-contract.js";
import {
  supplierOperations,
  fulfilmentOperations,
} from "./supplier-contract.js";
import { collectorOperations } from "./collector-contract.js";
import { inventoryOperations } from "./inventory-contract.js";
import type { Environment } from "./contract.js";
import { operationDefinitions } from "./operations.js";
export type ServiceId =
  | "gacha"
  | "testing"
  | "inventory"
  | "collector"
  | "partner"
  | "supplier"
  | "fulfilment"
  | "aggregator"
  | "treasury"
  | "management";
export type AuthKind =
  | "gacha-key"
  | "inventory-key"
  | "collector-session"
  | "partner-session"
  | "public"
  | "none";
export type ValidatedRequest = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  effect: "read" | "mutation";
  auth: AuthKind;
  idempotencyKey?: string;
};
export type OperationDefinition = {
  id: string;
  method: ValidatedRequest["method"];
  pathTemplate: string;
  effect: "read" | "mutation";
  example?: unknown;
  description?: string;
  validate: (
    params: Record<string, string>,
    body: unknown,
    environment: Environment,
  ) => ValidatedRequest;
};
export type ServiceDefinition = {
  id: ServiceId;
  contractVersion: string;
  auth: AuthKind;
  operations: OperationDefinition[];
  requiredChecks: string[];
  paused?: boolean;
};
export const services: ServiceDefinition[] = [
  { id: "gacha", auth: "gacha-key" },
  { id: "testing", auth: "gacha-key" },
  { id: "inventory", auth: "inventory-key" },
  { id: "collector", auth: "collector-session" },
  { id: "partner", auth: "partner-session" },
  { id: "supplier", auth: "partner-session" },
  { id: "fulfilment", auth: "inventory-key" },
  { id: "aggregator", auth: "none" },
  { id: "treasury", auth: "gacha-key" },
  { id: "management", auth: "partner-session" },
].map((s) => ({
  ...s,
  id: s.id as ServiceId,
  auth: s.auth as AuthKind,
  contractVersion: s.id + "-v1",
  operations: [],
  requiredChecks: ["credential", "supported-fixture", "real-acceptance"],
  paused: s.id === "aggregator",
}));
for (const service of ["gacha", "testing"] as const) {
  services.find((s) => s.id === service)!.operations = operationDefinitions
    .filter((o) => o.service === service)
    .map((o) => ({
      ...o,
      validate: (params, body, environment) => {
        if (service === "testing") {
          if (environment !== "sandbox")
            throw new Error("testing_sandbox_only");
          const request = resolveTestingOperation(o.id, params, body);
          return { ...request, effect: o.effect, auth: "gacha-key" };
        }
        const route = resolveOperation(o.id, params);
        return {
          ...route,
          path: (environment === "sandbox" ? "/sandbox" : "") + route.path,
          body: validateBody(o.id, body),
          effect: o.effect,
          auth: "gacha-key",
        };
      },
    }));
}
services.find((s) => s.id === "inventory")!.operations = inventoryOperations;
services.find((s) => s.id === "collector")!.operations = collectorOperations;
services.find((s) => s.id === "partner")!.operations = partnerOperations;
services.find((s) => s.id === "supplier")!.operations = supplierOperations;
services.find((s) => s.id === "fulfilment")!.operations = fulfilmentOperations;
services.find((s) => s.id === "treasury")!.operations = treasuryOperations;
services.find((s) => s.id === "management")!.operations = managementOperations;
export function resolveServiceOperation(
  service: string,
  operation: string,
  params: Record<string, string>,
  body: unknown,
  environment: Environment,
): ValidatedRequest {
  const definition = services.find((s) => s.id === service);
  if (!definition) throw new Error("unknown_service");
  if (definition.paused) throw new Error("service_paused");
  const op = definition.operations.find((o) => o.id === operation);
  if (!op) throw new Error("unsupported_operation");
  return op.validate(params, body, environment);
}
export function publicServices() {
  return services.map((s) => ({
    id: s.id,
    auth: s.auth,
    contractVersion: s.contractVersion,
    paused: !!s.paused,
    requiredChecks: s.requiredChecks,
    operations: s.operations.map(({ validate, ...op }) => op),
  }));
}
