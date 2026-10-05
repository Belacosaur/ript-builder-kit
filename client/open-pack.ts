import { normalizeError } from "../shared/errors.js";
type Ports = {
  resume: () => Promise<any>;
  pay: () => Promise<void>;
  submit: () => Promise<any>;
  read: () => Promise<any>;
  accept: (order: any) => void;
  check: () => void;
  progress: (message: string) => void;
  wait: () => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
};
const transient = (e: unknown) => normalizeError(e).retryable;
export async function openPack(p: Ports) {
  const now = p.now ?? Date.now,
    deadline = now() + (p.timeoutMs ?? 180000);
  p.check();
  p.progress("Restoring or creating your order…");
  let order: any;
  while (true) {
    p.check();
    try {
      order = await p.resume();
      break;
    } catch (e) {
      p.check();
      if (!transient(e) || now() >= deadline) throw e;
      await p.wait();
    }
  }
  p.check();
  p.accept(order);
  let submitted = Boolean(order.hasSignedPayment || order.paymentSignature);
  while (order.state !== "complete" && now() < deadline) {
    p.check();
    if (["expired", "refunded", "failed"].includes(order.state))
      throw new Error(
        `Order ${order.state}. Check Activity & Recovery before starting again.`,
      );
    if (order.state === "awaiting_payment" && !submitted) {
      p.progress("Preparing payment — approve the transaction in your wallet.");
      try {
        await p.pay();
      } catch (e) {
        p.check();
        if (!transient(e)) throw e;
        await p.wait();
        continue;
      }
      p.check();
      p.progress("Submitting your signed payment…");
      // Signed bytes are durable before this call. A lost response must not prompt again.
      submitted = true;
      try {
        order = await p.submit();
        p.check();
        p.accept(order);
      } catch (e) {
        p.check();
        if (!transient(e)) throw e;
      }
      if (order.state === "complete") break;
    }
    p.progress(
      submitted
        ? "Payment submitted. Waiting for confirmed payment and card fulfilment…"
        : "Preparing your order. Waiting for payment readiness…",
    );
    await p.wait();
    p.check();
    try {
      order = await p.read();
      p.check();
      p.accept(order);
    } catch (e) {
      p.check();
      if (!transient(e)) throw e;
    }
  }
  if (order.state !== "complete")
    throw new Error(
      "Your order is still processing. Use Resume pack opening; the same order and signed payment are retained.",
    );
  p.progress("Pack opened — your cards are ready in Collection.");
  return order;
}
