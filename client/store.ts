import type { TreasurySnapshot, TreasuryActivityPage } from "../shared/treasury-contract.js";
import type { Environment } from "../shared/contract.js";
import type { RecoveryLoad } from "./recovery.js";
import type { OrderHistory } from "./history.js";

export type ViewId =
  | "overview"
  | "gacha"
  | "collection"
  | "wallet"
  | "explorer"
  | "runs"
  | "guide";

export type AppState = {
  treasurySnapshot: TreasurySnapshot | null;
  treasuryActivity: TreasuryActivityPage | null;
  treasuryStatus: string;
  environment: Environment;
  catalog: any;
  network: any;
  config: any;
  wallet: string;
  order: any;
  recovery: RecoveryLoad;
  selectedPack: string;
  quantity: number;
  view: ViewId;
  busy: boolean;
  progress: string;
  error: string;
  history: OrderHistory[];
  diagnostics: any[];
  response: unknown;
  testing: any;
  balances: any;
  balanceObservation: "unverified" | "loading" | "observed" | "unavailable";
  partnerSession?: any;
  partnerAcceptedOrigin?: string;
  collectorLinked?: boolean;
  collectorCollection?: any;
  collectorCapabilities?: any;
  coverage: any[];
  readiness: any[];
  evidenceRuns: any[];
  evidenceError: string;
};

export function initialState(): AppState {
  return {
    treasurySnapshot: null, treasuryActivity: null, treasuryStatus: "Unverified",
    environment: "sandbox",
    catalog: null,
    network: null,
    config: null,
    wallet: "",
    order: null,
    recovery: { kind: "absent" },
    selectedPack: "",
    quantity: 1,
    view: "overview",
    busy: false,
    progress: "Loading your integration workspace…",
    error: "",
    history: [],
    diagnostics: [],
    response: null,
    testing: null,
    balances: null,
    balanceObservation: "unverified",
    coverage: [],
    readiness: [],
    evidenceRuns: [],
    evidenceError: "",
  };
}

export function createStore(initial: AppState) {
  let state = Object.freeze({ ...initial });
  const listeners = new Set<(state: AppState) => void>();
  return {
    get: () => state,
    update(change: (state: AppState) => AppState) {
      state = Object.freeze({ ...change(state) });
      for (const listener of listeners) listener(state);
    },
    subscribe(listener: (state: AppState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type Store = ReturnType<typeof createStore>;
