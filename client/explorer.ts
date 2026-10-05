import type { OperationId, Params } from "../shared/contract.js";
import { sameScope, type Scope, type Pending } from "./recovery.js";
import { validateBoundQuote, type BoundQuote } from "./quotes.js";
import { validateSignedQuote } from "./wallet.js";
type Ports = {
  pending: Pending | null;
  quote?: BoundQuote | null;
  save: (pending: Pending) => void;
  call: (
    op: OperationId,
    params: Params,
    body?: Record<string, unknown>,
  ) => Promise<any>;
};
export async function executeOperation(
  op: OperationId,
  scope: Scope,
  params: Params,
  body: Record<string, unknown> | undefined,
  ports: Ports,
) {
  if (body?.wallet && body.wallet !== scope.wallet)
    throw new Error("wallet_scope_mismatch");
  if (op === "create") {
    if (!scope.wallet || body?.partner_id !== scope.partnerId)
      throw new Error("partner_scope_mismatch");
    let pending = ports.pending;
    if (
      pending &&
      (!sameScope(pending, scope) ||
        pending.clientNonce !== body.clientNonce ||
        pending.packId !== body.packId ||
        pending.quantity !== body.quantity)
    )
      throw new Error("pending_order_exists");
    pending ??= {
      ...scope,
      packId: String(body!.packId),
      quantity: Number(body!.quantity),
      clientNonce: String(body!.clientNonce),
    };
    ports.save(pending);
  }
  if (op === "submit" || op === "sellbackSubmit") {
    const p = ports.pending;
    if (!p || !sameScope(p, scope) || p.orderId !== params.id)
      throw new Error("load_scoped_order_before_submit");
    if (op === "submit") {
      if (
        p.signedTransaction &&
        (p.signedTransaction !== body!.transaction ||
          p.intentId !== body!.intentId)
      )
        throw new Error("original_payment_required");
      if (!p.signedTransaction) {
        if (
          !ports.quote ||
          ports.quote.kind !== "payment" ||
          ports.quote.intentId !== body!.intentId
        )
          throw new Error("prepare_bound_quote_before_submit");
        validateBoundQuote(ports.quote, scope, params.id);
        await validateSignedQuote(
          String(body!.transaction),
          ports.quote.transaction,
          scope,
        );
      }
      p.intentId = String(body!.intentId);
      p.signedTransaction = String(body!.transaction);
    } else {
      if (
        !p.sellback ||
        p.sellback.intentId !== body!.intentId ||
        p.sellback.transaction !== body!.transaction
      )
        throw new Error("use_guided_sellback_signing");
    }
    ports.save(p);
  }
  return ports.call(op, params, body);
}
