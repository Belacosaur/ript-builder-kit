export function canDraw(pack: any, quantity: number, walletConnected: boolean) {
  return (
    !!pack &&
    walletConnected &&
    pack.status === "available" &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= Math.min(10, pack.maxQuantity) &&
    pack.balanceUsdc >= pack.requiredFloatUsdc
  );
}
export function canDecide(order: any, disposition: string) {
  return (
    order?.state === "complete" &&
    !order.cards?.some((c: any) => c.disposition === "buyback_pending") &&
    disposition === "vaulted"
  );
}
export function canSignQuote(kind: "payment" | "sellback", pending: any) {
  return kind === "payment" ? !pending?.signedTransaction : !pending?.sellback;
}
export {sanitize as traceValue} from '../shared/sanitize.js';
export class ScopeGate {
  private revision = 0;
  capture() {
    return this.revision;
  }
  invalidate() {
    this.revision++;
  }
  current(ticket: number) {
    return ticket === this.revision;
  }
}
