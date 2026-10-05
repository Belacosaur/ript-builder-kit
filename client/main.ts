import { createRiptBrowserClient } from "../packages/sdk/src/browser.js";
import {
  validateTreasurySnapshot,
  validateTreasuryActivity,
} from "../shared/treasury-dto.js";
import { CLIENT_BUILD } from "./build.js";
import { resolveTestingOperation } from "../shared/testing.js";
import { recordTrace, exportWorkspace } from "./evidence.js";
import { createCollectorClient, walletIsLinked } from "./services/collector.js";
import { callService } from "./services/api.js";
import { resolveServiceOperation } from "../shared/services.js";
import { readBuyerBalances, assertPurchaseFunds } from "./balances.js";
import { evaluateReadiness } from "../shared/readiness.js";
import { retry, sleep } from "./retry.js";
import "./styles.css";
import { Connection } from "@solana/web3.js";
import { createStore, initialState } from "./store.js";
import { mountShell } from "./shell.js";
import { callGacha, setTraceHandler } from "./api.js";
import { canDraw, traceValue } from "./model.js";
import {
  loadRecovery,
  loadPending,
  savePending,
  mergeOrder,
  sameScope,
  type Scope,
} from "./recovery.js";
import { listOrders, recordOrder } from "./history.js";
import { withFinancialLock } from "./locks.js";
import { createGachaController } from "./controllers/gacha.js";
import { signQuote, type Wallet } from "./wallet.js";
import { bindQuote, type BoundQuote } from "./quotes.js";
import { executeOperation } from "./explorer.js";
import {
  validateBody,
  resolveOperation,
  type OperationId,
} from "../shared/contract.js";
import {
  callTesting,
  readTestingStatus,
  requestTestingFunds,
} from "./testing.js";
import type { Actions } from "./views/common.js";
import { validateCatalog } from "../shared/dto.js";
const store = createStore(initialState());
let treasuryAbort: AbortController | undefined;
let wallet: Wallet | undefined,
  revision = 0,
  refreshing: AbortController | undefined,
  quote: BoundQuote | null = null;
const scope = (): Scope => {
  const s = store.get();
  return {
    environment: s.environment,
    partnerId: s.catalog?.partnerId ?? "",
    wallet: wallet?.publicKey?.toBase58() ?? "",
    chain: s.catalog?.chain ?? s.network?.chain ?? "",
  };
};
function recovery() {
  const s = scope();
  const r =
    s.wallet && s.partnerId && s.chain
      ? loadRecovery(s, localStorage)
      : { kind: "absent" as const };
  let history: any[] = [];
  try {
    if (s.wallet && s.partnerId) history = listOrders(s, localStorage);
  } catch {}
  store.update((v) => ({ ...v, recovery: r, history }));
}
const controller = createGachaController({
  scope,
  storage: localStorage,
  call: (op, params, body, signal) =>
    callGacha(op, scope(), params, body, signal),
  signQuote: async (transaction, start) => {
    if (!wallet) throw new Error("wallet_not_connected");
    return signQuote(
      transaction,
      start,
      scope,
      wallet,
      new Connection(store.get().config.environments[start.environment].rpcUrl),
    );
  },
  accept: (order) => {
    store.update((s) => ({ ...s, order }));
    recovery();
  },
  progress: (progress) => store.update((s) => ({ ...s, progress })),
  canOpen: (id, quantity) => {
    const s = store.get();
    return (
      !!s.network &&
      s.network.chain === s.catalog?.chain &&
      canDraw(
        s.catalog?.packs?.find((p: any) => p.id === id),
        quantity,
        true,
      )
    );
  },
});
async function action(work: () => Promise<unknown>) {
  if (store.get().busy) return;
  const ticket = revision;
  store.update((s) => ({ ...s, busy: true, error: "", progress: "Working…" }));
  try {
    await work();
    if (ticket === revision)
      store.update((s) => ({
        ...s,
        progress: "Operation completed. Inspect the current evidence.",
      }));
  } catch (e) {
    if (ticket === revision)
      store.update((s) => ({
        ...s,
        error: e instanceof Error ? e.message : "operation_failed",
      }));
  } finally {
    if (ticket === revision) {
      recovery();
      store.update((s) => ({ ...s, busy: false }));
    }
  }
}
async function observeBuyerBalances(
  start: Scope,
  rpcUrl: string,
  mint: string,
) {
  store.update((s) => ({
    ...s,
    treasurySnapshot: null,
    treasuryActivity: null,
    treasuryStatus: "Unverified",
    balances: null,
    balanceObservation: "loading",
    readiness: [],
  }));
  try {
    const balances = await readBuyerBalances(start, rpcUrl, mint);
    if (!sameScope(start, scope())) throw new Error("scope_changed");
    store.update((s) => ({ ...s, balances, balanceObservation: "observed" }));
    return balances;
  } catch (error) {
    if (sameScope(start, scope()))
      store.update((s) => ({
        ...s,
        treasurySnapshot: null,
        treasuryActivity: null,
        treasuryStatus: "Unverified",
        balances: null,
        balanceObservation: "unavailable",
        readiness: [],
      }));
    throw error;
  }
}
async function reconcileSavedRecovery() {
  const r = store.get().recovery, start = scope();
  if (r.kind !== "ready" || !r.pending.orderId) return;
  try {
    await controller.reconcileSaved();
  } catch (e) {
    if (sameScope(start, scope())) store.update(s => ({...s, error: e instanceof Error ? e.message : "saved_order_reconciliation_failed"}));
  }
  recovery();
}
async function connect() {
  const provider = (window as any).phantom?.solana ?? (window as any).solana;
  if (!provider?.connect || !provider.signTransaction)
    throw new Error(
      "Open this page in a browser with an injected Solana wallet enabled.",
    );
  const ticket = revision;
  await provider.connect();
  if (ticket !== revision) throw new Error("scope_changed");
  wallet = provider;
  store.update((s) => ({ ...s, wallet: provider.publicKey?.toBase58() ?? "" }));
  provider.on?.("accountChanged", () => invalidateWallet(false));
  provider.on?.("disconnect", () => invalidateWallet(true));
  recovery();
  await reconcileSavedRecovery();
}
function invalidateWallet(disconnect: boolean) {
  revision++;
  treasuryAbort?.abort();
  controller.cancelActive();
  quote = null;
  if (disconnect) wallet = undefined;
  store.update((s) => ({
    ...s,
    wallet: wallet?.publicKey?.toBase58() ?? "",
    order: null,
    treasurySnapshot: null,
    treasuryActivity: null,
    treasuryStatus: "Unverified",
    balances: null,
    balanceObservation: "unverified",
    readiness: [],
    collectorLinked: undefined,
    collectorCollection: undefined,
    collectorCapabilities: undefined,
    partnerSession: undefined,
    partnerAcceptedOrigin: undefined,
    evidenceRuns: [],
    response: null,
    busy: false,
    error: "",
    progress: "Wallet context changed. Saved orders remain scoped.",
  }));
  recovery();
}
async function refresh() {
  treasuryAbort?.abort();
  store.update((s) => ({
    ...s,
    treasurySnapshot: null,
    treasuryActivity: null,
    treasuryStatus: "Unverified",
  }));
  refreshing?.abort();
  const ac = new AbortController();
  refreshing = ac;
  const env = store.get().environment,
    ticket = revision;
  const check = () => {
    ac.signal.throwIfAborted();
    if (ticket !== revision || env !== store.get().environment)
      throw new Error("scope_changed");
  };
  store.update((s) => ({
    ...s,
    progress: "Loading " + env + " services…",
    error: "",
  }));
  try {
    const cfg = await fetch("/api/config", { signal: ac.signal }).then((r) => {
      if (!r.ok) throw new Error("config_unavailable");
      return r.json();
    });
    check();
    const response = await fetch("/api/network/" + env, { signal: ac.signal });
    const net = await response.json();
    check();
    if (!response.ok) throw new Error("network_metadata_unavailable");
    store.update((s) => ({ ...s, config: cfg, network: net }));
    if (cfg.environments[env].configured) {
      const raw = await callGacha("packs", scope(), {}, undefined, ac.signal);
      check();
      const catalog = validateCatalog(raw);
      if (raw.environment !== env || catalog.chain !== net.chain)
        throw new Error("catalog_scope_invalid");
      store.update((s) => ({ ...s, catalog }));
      recovery();
      await reconcileSavedRecovery();
      check();
      if (env === "sandbox") {
        try {
          const testing = await readTestingStatus(scope(), scope, callTesting);
          check();
          store.update((s) => ({ ...s, testing: traceValue(testing) }));
        } catch (e) {
          check();
          store.update((s) => ({
            ...s,
            testing: {
              error: e instanceof Error ? e.message : "testing_unavailable",
            },
          }));
        }
      }
    }
    check();
    store.update((s) => ({
      ...s,
      progress: "Context loaded. Check readiness before purchasing.",
    }));
  } catch (e) {
    if (!ac.signal.aborted && ticket === revision)
      store.update((s) => ({
        ...s,
        error: e instanceof Error ? e.message : "refresh_failed",
      }));
  }
}
setTraceHandler((t) => {
  const safe = traceValue(t);
  try {
    const run = recordTrace(
      localStorage,
      safe,
      CLIENT_BUILD,
      store.get().network?.token ?? "",
    );
    if (run && sameScope(t.scope, scope()))
      store.update((s) => ({
        ...s,
        evidenceRuns: [...s.evidenceRuns.filter((r) => r.id !== run.id), run],
      }));
  } catch {
    store.update((s) => ({
      ...s,
      evidenceError:
        "Evidence storage unavailable or full; existing records preserved.",
    }));
  }

  store.update((s) => ({
    ...s,
    diagnostics: [...s.diagnostics, safe].slice(-100),
    response: sameScope(t.scope, scope()) ? safe.response : s.response,
  }));
});
const collector = createCollectorClient((op, params, body) => {
  const route = resolveServiceOperation(
    "collector",
    op,
    params,
    body,
    scope().environment,
  );
  return callService(
    "collector",
    op,
    scope(),
    params,
    body,
    route.effect === "mutation",
  );
});
async function checkCollector() {
  const start = scope();
  const data = await collector.wallets();
  if (!sameScope(start, scope())) throw new Error("scope_changed");
  store.update((s) => ({
    ...s,
    collectorLinked: walletIsLinked(data, start.wallet),
    response: traceValue(data),
  }));
  return data;
}
async function readTreasury(next = false) {
  const start = scope(),
    ticket = revision;
  treasuryAbort?.abort();
  const ac = new AbortController();
  treasuryAbort = ac;
  const sdk = createRiptBrowserClient({ environment: start.environment });
  const current = () =>
    !ac.signal.aborted && ticket === revision && sameScope(start, scope());
  store.update((s) => ({
    ...s,
    treasuryStatus: "Checking finalized observations…",
    ...(next ? {} : { treasurySnapshot: null, treasuryActivity: null }),
  }));
  try {
    if (!next) {
      const raw = await sdk.treasury.get({ signal: ac.signal });
      if (!current()) return;
      const snapshot = validateTreasurySnapshot(raw, start);
      if (snapshot.mint !== store.get().network?.token)
        throw new Error("treasury_mint_mismatch");
      store.update((s) => ({
        ...s,
        treasurySnapshot: snapshot,
        treasuryStatus: snapshot.status,
      }));
      if (snapshot.status !== "observed") return;
    }
    const before = next
      ? (store.get().treasuryActivity?.nextCursor ?? undefined)
      : undefined;
    if (next && !before) return;
    const raw = await sdk.treasury.activity.list(
      { limit: 20, ...(before ? { before } : {}) },
      { signal: ac.signal },
    );
    if (!current()) return;
    const page = validateTreasuryActivity(
      raw,
      start,
      store.get().treasurySnapshot!,
    );
    store.update((s) => ({
      ...s,
      treasuryStatus: "observed",
      treasuryActivity: {
        ...page,
        items: next
          ? [...(s.treasuryActivity?.items ?? []), ...page.items].filter(
              (x, i, a) =>
                a.findIndex((y) => y.signature === x.signature) === i,
            )
          : page.items,
      },
    }));
  } catch {
    if (current())
      store.update((s) => ({
        ...s,
        treasuryStatus: s.treasurySnapshot
          ? "Activity unavailable; history unknown"
          : "Unavailable; funds unknown",
      }));
  }
}
const actions: Actions = {
  treasuryRead: () => void readTreasury(),
  treasuryActivityNext: () => void readTreasury(true),
  service: (service, operation, params, body) =>
    void action(async () => {
      if (service === "collector" && operation === "wallets") {
        await checkCollector();
        return;
      }
      const start = scope();
      const route = resolveServiceOperation(
        service,
        operation,
        params,
        body,
        start.environment,
      );
      const result = await callService(
        service,
        operation,
        start,
        params,
        body,
        route.effect === "mutation",
      );
      if (!sameScope(start, scope())) throw new Error("scope_changed");
      store.update((s) => ({ ...s, response: traceValue(result) }));
    }),
  linkCollector: () =>
    void action(async () => {
      if (!wallet?.signMessage)
        throw new Error("wallet_signMessage_unavailable");
      const start = scope(),
        ticket = revision;
      await withFinancialLock(start, new AbortController().signal, () =>
        collector.linkWallet(
          start.wallet,
          () => (ticket === revision ? scope().wallet : ""),
          (bytes) => wallet!.signMessage!(bytes),
        ),
      );
      await checkCollector();
    }),
  readCollection: () =>
    void action(async () => {
      const start = scope();
      const result = await collector.list({ limit: 100 });
      if (!sameScope(start, scope())) throw new Error("scope_changed");
      store.update((s) => ({ ...s, collectorCollection: traceValue(result) }));
    }),
  uploadCapture: (file, format) =>
    void action(async () => {
      const start = scope(),
        ticket = revision;
      const check = () => {
        if (ticket !== revision || !sameScope(start, scope()))
          throw new Error("scope_changed");
      };
      await withFinancialLock(start, new AbortController().signal, async () => {
        const bytes = await file.arrayBuffer(),
          hash = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (b) => b.toString(16).padStart(2, "0"),
          ).join("");
        check();
        const row = await collector.capture({
          captureId: "clientlab:" + start.wallet + ":" + hash,
          revision: 1,
          frontSha256: hash,
          scanFormat: format,
        });
        check();
        const result = await collector.uploadPhoto(
          row.id,
          "front",
          1,
          file,
          check,
        );
        check();
        store.update((s) => ({
          ...s,
          collectorCollection: traceValue(result),
          response: traceValue(result),
        }));
        await collector.followCapture(row.id, 1, {
          deadline: Date.now() + 180000,
          check,
          sleep: (ms) => sleep(ms, new AbortController().signal),
          observe: (observed) =>
            store.update((s) => ({
              ...s,
              collectorCollection: traceValue(observed),
              progress:
                "Identification: " +
                observed.jobStatus +
                " · " +
                observed.identityStatus,
            })),
        });
      });
    }),
  connect: () => void action(connect),
  refresh: () => void refresh(),
  open: () =>
    void action(async () => {
      if (!wallet) await connect();
      recovery();
      const s = store.get();
      const start = scope(),
        pack = s.catalog?.packs?.find((p: any) => p.id === s.selectedPack);
      if (!pack || !s.network?.token)
        throw new Error("pack_or_network_unavailable");
      if (!canDraw(pack, s.quantity, true)) throw new Error("pack_unavailable");
      const balances = await observeBuyerBalances(
        start,
        s.config.environments[start.environment].rpcUrl,
        s.network.token,
      );
      if (!sameScope(start, scope())) throw new Error("scope_changed");
      assertPurchaseFunds(
        balances,
        start,
        s.network.token,
        pack.priceUsd,
        s.quantity,
      );
      store.update((v) => ({ ...v, balances }));
      await controller.open({ packId: s.selectedPack, quantity: s.quantity });
      store.update((v) => ({ ...v, view: "collection" }));
    }),
  resume: () =>
    void action(async () => {
      await controller.resume();
      store.update((s) => ({ ...s, view: "collection" }));
    }),
  load: (id) => void action(() => controller.load(id)),
  release: () =>
    void action(async () => {
      await controller.release();
      store.update((s) => ({ ...s, order: null, view: "gacha" }));
      recovery();
    }),
  keep: (id) =>
    void action(async () => {
      await checkCollector();
      if (!store.get().collectorLinked)
        throw new Error("collector_wallet_not_verified");
      return controller.keep(id);
    }),
  sell: (ids) => void action(() => controller.sell(ids)),
  balance: () =>
    void action(async () => {
      const start = scope();
      if (!start.wallet || !store.get().network?.token)
        throw new Error("wallet_or_mint_missing");
      const balances = await observeBuyerBalances(
        start,
        store.get().config.environments[start.environment].rpcUrl,
        store.get().network.token,
      );
      if (!sameScope(start, scope())) throw new Error("scope_changed");
      store.update((s) => ({
        ...s,
        balances,
        readiness: evaluateReadiness({
          configured: s.config.environments[s.environment].configured,
          packs: s.catalog?.packs ?? [],
          wallet: start.wallet,
          chain: start.chain,
          mint: s.network.token,
          balances,
          locksAvailable: !!navigator.locks,
          recoveryBlocked: ["corrupt", "unavailable"].includes(s.recovery.kind),
        }).checks,
      }));
    }),
  fund: (kind) =>
    void action(async () => {
      const start = scope();
      if (kind !== "status")
        await withFinancialLock(start, new AbortController().signal, () =>
          requestTestingFunds(kind, start, scope, callTesting),
        );
      const ac = new AbortController(),
        deadline = Date.now() + 180000;
      let data = await readTestingStatus(start, scope, (op, payload) =>
        callTesting(op, payload, start),
      );
      store.update((s) => ({ ...s, testing: traceValue(data) }));
      while (
        kind !== "status" &&
        data.operations?.some(
          (o: any) => !["reconciled", "failed"].includes(o.status),
        ) &&
        Date.now() < deadline
      ) {
        if (!sameScope(start, scope())) throw new Error("scope_changed");
        await sleep(1000, ac.signal);
        data = await retry(
          () =>
            readTestingStatus(start, scope, (op, payload) =>
              callTesting(op, payload, start),
            ),
          {
            deadline,
            signal: ac.signal,
            check: () => {
              if (!sameScope(start, scope())) throw new Error("scope_changed");
            },
            now: Date.now,
            sleep: (ms) => sleep(ms, ac.signal),
            random: Math.random,
          },
        );
        store.update((s) => ({ ...s, testing: traceValue(data) }));
      }
    }),
  execute: (operation, paramsText, bodyText, service = "gacha") =>
    void action(async () => {
      const op = operation as OperationId,
        params = JSON.parse(paramsText || "{}"),
        body = bodyText ? JSON.parse(bodyText) : undefined;
      if (service !== "gacha") {
        const start = scope(),
          ticket = revision;
        const check = () => {
          if (ticket !== revision || !sameScope(start, scope()))
            throw new Error("scope_changed");
        };
        if (service === "testing") {
          if (start.environment !== "sandbox")
            throw new Error("testing_sandbox_only");
          const resolved = resolveTestingOperation(operation, params, body);
          if (body?.wallet && body.wallet !== start.wallet)
            throw new Error("wallet_scope_mismatch");
          const work = async () => {
            check();
            if (resolved.method === "POST") {
              const key =
                "ript-testing-explorer:" +
                JSON.stringify([
                  start.environment,
                  start.partnerId,
                  start.wallet,
                  body.requestId,
                ]);
              const original = localStorage.getItem(key),
                encoded = JSON.stringify(body);
              if (original && original !== encoded)
                throw new Error("original_testing_request_required");
              localStorage.setItem(key, encoded);
            }
            const result = await callTesting(
              operation,
              { environment: "sandbox", params, body },
              start,
            );
            check();
            store.update((s) => ({ ...s, response: traceValue(result) }));
          };
          if (resolved.method === "POST")
            await withFinancialLock(start, new AbortController().signal, work);
          else await work();
          return;
        }
        const route = resolveServiceOperation(
          service,
          operation,
          params,
          body,
          start.environment,
        );
        const work = async () => {
          check();
          if (route.idempotencyKey) {
            const key =
              "ript-service-consent:" +
              JSON.stringify([
                start.environment,
                start.partnerId,
                start.wallet,
                service,
                operation,
                route.idempotencyKey,
              ]);
            const encoded = JSON.stringify(body);
            const previous = localStorage.getItem(key);
            if (previous && previous !== encoded)
              throw new Error("original_inventory_request_required");
            localStorage.setItem(key, encoded);
          }
          const result = await callService(
            service,
            operation,
            start,
            params,
            body,
            route.effect === "mutation",
          );
          check();
          if (service === "partner" && operation === "session") {
            if (
              result.slug !== params.vendor ||
              result.environment !== start.environment ||
              result.door !== (params.door ?? "packs")
            )
              throw new Error("partner_session_binding_invalid");
            store.update((s) => ({
              ...s,
              partnerSession: result,
              partnerAcceptedOrigin: params.parentOrigin,
            }));
          }
          if (
            service === "partner" &&
            operation === "preview" &&
            !result.readOnly
          )
            throw new Error("partner_preview_not_readonly");
          store.update((s) => ({ ...s, response: traceValue(result) }));
        };
        if (route.effect === "mutation")
          await withFinancialLock(start, new AbortController().signal, work);
        else await work();
        return;
      }
      resolveOperation(op, params);
      validateBody(op, body);
      const start = scope(),
        ticket = revision;
      const check = () => {
        if (ticket !== revision || !sameScope(start, scope()))
          throw new Error("scope_changed");
      };
      const work = async () => {
        check();
        let pending = loadPending(start, localStorage);
        if (
          ["payment", "sellbackPrepare", "keep"].includes(op) &&
          (!pending?.orderId || pending.orderId !== params.id)
        )
          throw new Error("load_scoped_order_before_quote");
        const result = await executeOperation(op, start, params, body, {
          pending,
          quote,
          save: (p) => {
            check();
            savePending(start, p, localStorage);
          },
          call: (o, p, b) => callGacha(o, start, p, b),
        });
        check();
        if (["create", "read", "submit"].includes(op) && result.id) {
          pending = mergeOrder(loadPending(start, localStorage), result, start);
          savePending(start, pending, localStorage);
          recordOrder(start, result, localStorage);
          store.update((s) => ({ ...s, order: result }));
        }
        if (op === "payment" || op === "sellbackPrepare")
          quote = bindQuote(
            result,
            start,
            params.id,
            op === "payment" ? "payment" : "sellback",
            (body?.skuIds as string[]) ?? [],
          );
        store.update((s) => ({ ...s, response: traceValue(result) }));
        recovery();
      };
      if (["packs", "read", "proof", "receipts"].includes(op)) await work();
      else await withFinancialLock(start, new AbortController().signal, work);
    }),
  export: () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          exportWorkspace(
            store
              .get()
              .evidenceRuns.find((r) => r.id === store.get().order?.id) ?? {
              version: 1,
              id: "incomplete",
              clientVersion: CLIENT_BUILD,
              mint: store.get().network?.token ?? "",
              scope: scope(),
              steps: [],
            },
            {
              scope: scope(),
              traces: store.get().diagnostics,
              treasurySnapshot: store.get().treasurySnapshot,
              treasuryActivity: store.get().treasuryActivity,
            },
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "ript-client-run.json";
    a.click();
    URL.revokeObjectURL(url);
  },
};
mountShell(document.querySelector<HTMLElement>("#app")!, store, actions);
let lastEnvironment = store.get().environment;
store.subscribe((s) => {
  if (s.environment !== lastEnvironment) {
    lastEnvironment = s.environment;
    revision++;
    controller.cancelActive();
    refreshing?.abort();
    quote = null;
    store.update((v) => ({
      ...v,
      catalog: null,
      network: null,
      order: null,
      recovery: { kind: "absent" },
      selectedPack: "",
      history: [],
      treasurySnapshot: null,
      treasuryActivity: null,
      treasuryStatus: "Unverified",
      balances: null,
      balanceObservation: "unverified",
      readiness: [],
      collectorLinked: undefined,
      collectorCollection: undefined,
      collectorCapabilities: undefined,
      partnerSession: undefined,
      partnerAcceptedOrigin: undefined,
      evidenceRuns: [],
      testing: null,
      response: null,
      busy: false,
      error: "",
    }));
    void refresh();
  }
});
window.addEventListener("storage", () => recovery());
void refresh();
