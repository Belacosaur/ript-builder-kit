import { normalizeError } from "../shared/errors.js";
type Ports = {
  read: () => Promise<any>;
  accept: (order: any) => void;
  check: () => void;
  progress: () => void;
  wait: () => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
};
export async function waitForSellback(skuIds: string[], p: Ports) {
  const now = p.now ?? Date.now,
    deadline = now() + (p.timeoutMs ?? 180000);
  if (!skuIds.length) throw new Error("sellback_selection_missing");
  while (now() < deadline) {
    p.check();
    let order: any;
    try {
      order = await p.read();
    } catch (e) {
      p.check();
      if (!normalizeError(e).retryable) throw e;
      p.progress();
      await p.wait();
      continue;
    }
    p.check();
    p.accept(order);
    if (
      skuIds.every((id) =>
        order.cards?.some(
          (c: any) => c.skuId === id && c.disposition === "sold",
        ),
      )
    )
      return order;
    if (
      skuIds.some((id) =>
        order.cards?.some(
          (c: any) => c.skuId === id && c.disposition === "kept",
        ),
      )
    )
      throw new Error("sellback_card_conflict");
    p.progress();
    await p.wait();
  }
  throw new Error(
    "Sellback is still processing. Resume sellback retains the same signed transaction.",
  );
}
