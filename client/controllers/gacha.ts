import type { OperationId, Params } from "../../shared/contract.js";

import {
  loadPending,
  savePending,
  mergeOrder,
  validateOrder,
  canReleasePending,
  canAutoReleasePending,
  removeResolvedConsent,
  recoverExpiredSellback,
  sameScope,
  type Pending,
  type Scope,
  type StoragePort,
} from "../recovery.js";

import { recordOrder } from "../history.js";
import { withFinancialLock } from "../locks.js";
import { retry, sleep } from "../retry.js";
import { normalizeError, ApiError } from "../../shared/errors.js";
import { bindQuote } from "../quotes.js";

export type GachaPorts = {
  scope: () => Scope;
  storage: StoragePort;
  call: (
    op: OperationId,
    params: Params,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<any>;
  signQuote: (transaction: string, scope: Scope, lastValidBlockHeight?: number) => Promise<string>;
  accept: (order: any) => void;
  progress: (text: string) => void;
  canOpen: (packId: string, quantity: number) => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  lock?: typeof withFinancialLock;
};

export function createGachaController(p: GachaPorts) {
  let active: AbortController | undefined;

  async function approve(raw: any, refresh: () => Promise<any>, s: Scope, check: () => void, orderId: string, kind: "payment" | "sellback", skuIds: string[] = []) {
    for (let attempt = 0; ; attempt++) {
      const q = bindQuote(raw, s, orderId, kind, skuIds);
      check();
      try {
        p.progress("Approve " + kind + " in your wallet");
        const signed = await p.signQuote(q.transaction, s, q.lastValidBlockHeight);
        check();
        return {q, signed};
      } catch (error) {
        check();
        if (!(error instanceof Error) || error.message !== "quote_expired" || attempt >= 2) throw error;
        p.progress("Refreshing your " + kind + " quote before wallet approval…");
        raw = await refresh();
        check();
      }
    }
  }

  async function run<T>(
    work: (
      s: Scope,
      check: () => void,
      request: GachaPorts["call"],
      read: () => Promise<any>,
      get: () => Pending | null,
      save: (v: Pending) => void,
      poll: () => Promise<void>,
    ) => Promise<T>,
    readOnly = false,
  ): Promise<T> {
    if (active) throw new Error("operation_in_progress");
    const controller = new AbortController();
    active = controller;
    const s = { ...p.scope() },
      now = p.now ?? Date.now,
      deadline = now() + 180000;
    const check = () => {
      controller.signal.throwIfAborted();
      if (!sameScope(s, p.scope())) throw new Error("scope_changed");
    };

    const wait = (ms: number) =>
      p.sleep ? p.sleep(ms) : sleep(ms, controller.signal);
    const get = () => loadPending(s, p.storage),
      save = (v: Pending) => {
        check();
        savePending(s, v, p.storage);
      };

    const request: GachaPorts["call"] = (op, params, body) =>
      retry(
        () => {
          check();
          return p.call(op, params, body, controller.signal);
        },
        {
          deadline,
          signal: controller.signal,
          check,
          now,
          sleep: wait,
          random: p.random ?? Math.random,
        },
      );

    const read = async () => {
      const pending = get();
      if (!pending?.orderId) throw new Error("saved_order_missing");
      const order = await request("read", {
        id: pending.orderId,
        wallet: s.wallet,
      });
      check();
      const merged = mergeOrder(pending, order, s);
      save(merged);
      recordOrder(s, order, p.storage);
      p.accept(order);
      return order;
    };

    const poll = async () => {
      check();
      if (now() + 500 >= deadline)
        throw new ApiError("retry_deadline", 0, false, true);
      await wait(500);
    };

    try {
      const execute = async () => {
        check();
        if (!readOnly) get();
        const result = await work(s, check, request, read, get, save, poll);
        check();
        const pending = readOnly ? null : get(), resolved = result as any;
        if (canAutoReleasePending(pending, resolved)) {
          const reconciled = mergeOrder(pending, result, s);
          if (canReleasePending(reconciled, result)) {
            removeResolvedConsent(s, reconciled, result, p.storage);
            p.accept(result);
          }
        }
        return result;
      };
      return readOnly
        ? await execute()
        : await (p.lock ?? withFinancialLock)(s, controller.signal, execute);
    } finally {
      if (active === controller) active = undefined;
    }
  }

  async function lifecycle(
    s: Scope,
    check: () => void,
    request: GachaPorts["call"],
    read: () => Promise<any>,
    get: () => Pending | null,
    save: (v: Pending) => void,
    poll: () => Promise<void>,
  ) {
    let pending = get();
    if (!pending) throw new Error("saved_order_missing");
    let order: any;
    let freshPayment: any;

    if (pending.orderId) order = await read();
    else {
      p.progress("Preparing your opening…");
      order = await request(
        "create",
        {},
        {
          partner_id: s.partnerId,
          wallet: s.wallet,
          packId: pending.packId,
          quantity: pending.quantity,
          clientNonce: pending.clientNonce,
          preparePayment: true,
        },
      );
      check();
      save(mergeOrder(pending, order, s));
      recordOrder(s, order, p.storage);
      p.accept(order);
      freshPayment = order.payment;
    }

    while (order.state !== "complete") {
      check();
      if (order.state === "expired" && canAutoReleasePending(get(), order)) return order;
      if (["expired", "refunded", "failed"].includes(order.state))
        throw new Error("order_" + order.state);
      pending = get()!;

      if (
        order.state === "awaiting_payment" &&
        !order.hasSignedPayment &&
        !order.paymentSignature
      ) {
        if (!pending.signedTransaction) {
          try {
          p.progress("Approve payment in your wallet");
          const raw = freshPayment ?? await request(
            "payment",
            { id: order.id },
            { wallet: s.wallet },
          );
          freshPayment = undefined;
          const {q, signed} = await approve(raw, () => request("payment", {id:order.id}, {wallet:s.wallet}), s, check, order.id, "payment");
          pending = {
            ...get()!,
            intentId: q.intentId,
            signedTransaction: signed,
          };
          save(pending);
          } catch (error) {
            check();
            if (!(error instanceof Error) || !["opening_payment_received", "opening_expired"].includes(error.message)) throw error;
            order = await read();
            if (order.state === "awaiting_payment" && !order.hasSignedPayment && !order.paymentSignature) throw error;
            freshPayment = undefined;
            continue;
          }
        }

        p.progress("Submitting saved payment…");
        try {
          const result = await p.call(
            "submit",
            { id: order.id },
            {
              wallet: s.wallet,
              intentId: pending.intentId!,
              transaction: pending.signedTransaction!,
            },
            active!.signal,
          );
          check();
          if (result.id) {
            order = validateOrder(result, s);
            save(mergeOrder(get(), order, s));
            p.accept(order);
            recordOrder(s, order, p.storage);
          }
        } catch (e) {
          check();
          if (!normalizeError(e, true).retryable) throw e;
        }

        // Read authoritative state before any retransmission of the same consent.

        if (order.state !== "complete") order = await read();
        if (order.state === "complete") break;
      }

      p.progress(order.paymentSignature
        ? "Payment received. Preparing your cards…"
        : "Payment submitted. Confirming your payment…");
      await poll();
      order = await read();
    }

    p.progress("Cards revealed. Payment evidence received.");
    return order;
  }

  // Loading history stays read-only. A deliberate card decision can restore a
  // completed purchase, under the same lock, without inventing payment consent.
  async function restoreDecisionOrder(
    id: string | undefined, s: Scope, check: () => void,
    request: GachaPorts["call"], get: () => Pending | null,
    save: (v: Pending) => void,
  ) {
    if (!id || get()?.orderId === id) return;
    if (get()) throw new Error("pending_order_exists");
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("invalid_order_id");
    const order = validateOrder(await request("read", { id, wallet: s.wallet }), s);
    check();
    if (order.id !== id || order.state !== "complete")
      throw new Error("card_not_decidable");
    save(mergeOrder(null, order, s));
  }

  return {
    open: (input: { packId: string; quantity: number }) =>
      run(async (s, check, request, read, get, save, poll) => {
        if (get()) {
          const previous = await read(), pending = get()!;
          if (!canAutoReleasePending(pending, previous)) throw new Error("pending_order_exists");
          removeResolvedConsent(s, pending, previous, p.storage);
        }
        if (!p.canOpen(input.packId, input.quantity))
          throw new Error("pack_not_available");
        save({ ...s, ...input, clientNonce: crypto.randomUUID() });
        return lifecycle(s, check, request, read, get, save, poll);
      }),

    reconcileSaved: () => run(async (_s, _check, _request, read) => read()),

    resume: () => run(lifecycle),

    load: (id: string) =>
      run(async (s, check, request) => {
        if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("invalid_order_id");
        const order = validateOrder(
          await request("read", { id, wallet: s.wallet }),
          s,
        );
        check();
        // Reconciliation is observation only: unknown consent must never be replaced.
        p.accept(order);
        try {
          recordOrder(s, order, p.storage);
        } catch {
          p.progress(
            "Order reconciled. Local history is unavailable; saved consent remains preserved.",
          );
        }
        return order;
      }, true),

    release: () =>
      run(async (s, _check, _request, read, get) => {
        const order = await read(),
          pending = get()!;
        if (!canReleasePending(pending, order))
          throw new Error("pending_not_resolved");
        removeResolvedConsent(s, pending, order, p.storage);
      }),

    keep: (skuId: string, orderId?: string) =>
      run(async (s, check, request, read, get, save) => {
        await restoreDecisionOrder(orderId, s, check, request, get, save);
        const order = await read();
        if (
          order.state !== "complete" ||
          order.cards?.some((c: any) => c.disposition === "buyback_pending") ||
          !order.cards?.some(
            (c: any) => c.skuId === skuId && c.disposition === "vaulted",
          )
        )
          throw new Error("card_not_decidable");
        await request("keep", { id: order.id, skuId }, { wallet: s.wallet });
        check();
        return read();
      }),

    sell: (skuIds: string[], orderId?: string) =>
      run(async (s, check, request, read, get, save, poll) => {
        await restoreDecisionOrder(orderId, s, check, request, get, save);
        const savedSelection = get()?.sellback?.skuIds;
        let order = await read(),
          pending = get()!;
        let expiredRenewals = 0;
        const prepareConsent = async () => {
          const raw = await request("sellbackPrepare", {id:order.id}, {wallet:s.wallet,skuIds});
          p.progress("Approve sellback in your wallet");
          const {q, signed} = await approve(raw, () => request("sellbackPrepare", {id:order.id}, {wallet:s.wallet,skuIds}), s, check, order.id, "sellback", skuIds);
          pending = {...get()!, sellback:{intentId:q.intentId,transaction:signed,skuIds:[...skuIds]}};
          save(pending);
        };
        if (
          savedSelection &&
          savedSelection.every((id) =>
            order.cards?.some(
              (c: any) => c.skuId === id && c.disposition === "sold",
            ),
          )
        )
          return order;
        if (pending.sellback) {
          skuIds = pending.sellback.skuIds;
        } else {
          if (
            order.state !== "complete" ||
            !skuIds.length ||
            new Set(skuIds).size !== skuIds.length ||
            order.cards?.some(
              (c: any) => c.disposition === "buyback_pending",
            ) ||
            skuIds.some(
              (id) =>
                !order.cards?.some(
                  (c: any) => c.skuId === id && c.disposition === "vaulted",
                ),
            )
          )
            throw new Error("sellback_selection_invalid");
          await prepareConsent();
        }

        while (true) {
          check();
          pending = get()!;
          if (!pending.sellback) return order;
          try {
            if (
              !order.cards?.some(
                (c: any) =>
                  skuIds.includes(c.skuId) &&
                  c.disposition === "buyback_pending",
              )
            ) {
              p.progress("Submitting your sellback…");
              await p.call(
                "sellbackSubmit",
                { id: pending.orderId! },
                {
                  wallet: s.wallet,
                  intentId: pending.sellback.intentId,
                  transaction: pending.sellback.transaction,
                },
                active!.signal,
              );
              p.progress("Sellback submitted. Confirming your payout…");
            }
          } catch (e) {
            check();
            if (e instanceof Error && e.message === "buyback_expired") {
              const reconciled = await recoverExpiredSellback(pending, e, read);
              save(reconciled.pending);
              if (reconciled.order) {
                order = reconciled.order;
                p.accept(order);
                if (expiredRenewals++ < 1) {
                  p.progress("The quote expired. Requesting a fresh sellback approval…");
                  await prepareConsent();
                  continue;
                }
              }
              throw e;
            }
            if (!normalizeError(e, true).retryable) throw e;
          }

          order = await read();
          if (
            skuIds.every((id) =>
              order.cards?.some(
                (c: any) => c.skuId === id && c.disposition === "sold",
              ),
            )
          )
            return order;
          if (
            order.cards?.some(
              (c: any) => skuIds.includes(c.skuId) && c.disposition === "kept",
            )
          )
            throw new Error("sellback_card_conflict");
          p.progress("Sellback submitted. Confirming your payout…");
          await poll();
          order = await read();
        }
      }),
    cancelActive() {
      active?.abort(new Error("scope_changed"));
    },
  };
}

