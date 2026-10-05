import { subscribe, esc, image, type Actions } from "./common.js";
import { canDraw } from "../model.js";
import type { Store } from "../store.js";
export function mount(root: HTMLElement, store: Store, actions: Actions) {
  root.innerHTML = `<div class="section-heading"><div class="eyebrow">CATALOG → PAYMENT → REVEAL</div><h1>Find your next card.</h1><p>Choose a pack. Approve one payment. Follow the original order through confirmation.</p></div><div id="packs" class="pack-grid"></div><section class="panel purchase"><div><label for="quantity">Cards to open</label><input id="quantity" type="number" min="1" max="10" value="1"><p id="purchase-total"></p></div><div><button id="open-pack">Open pack →</button><p id="purchase-reason" class="muted"></p><button id="gacha-resume" class="secondary">Resume saved opening</button></div></section><section class="panel"><h2>What happens next</h2><div class="journey"><span>01 · Create order</span><span>02 · Wallet consent</span><span>03 · Payment & fulfilment</span><span>04 · Reveal</span></div><p>The server fulfils after payment. An interrupted request resumes the same order and saved consent.</p></section>`;
  const qty = root.querySelector<HTMLInputElement>("#quantity")!;
  qty.addEventListener("input", () =>
    store.update((s) => ({ ...s, quantity: Number(qty.value) })),
  );
  root
    .querySelector("#open-pack")!
    .addEventListener("click", () => actions.open?.());
  root
    .querySelector("#gacha-resume")!
    .addEventListener("click", () => actions.resume?.());
  const packs = root.querySelector("#packs")!;
  packs.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pack]");
    if (b) store.update((s) => ({ ...s, selectedPack: b.dataset.pack! }));
  });
  let last: any,
    lastSelected = "";
  return subscribe(store, (s) => {
    if (last !== s.catalog || lastSelected !== s.selectedPack) {
      last = s.catalog;
      lastSelected = s.selectedPack;
      packs.innerHTML = s.catalog?.packs?.length
        ? s.catalog.packs
            .map(
              (p: any) =>
                `<button class="pack ${s.selectedPack === p.id ? "chosen" : ""}" data-pack="${esc(p.id)}" aria-pressed="${s.selectedPack === p.id}"><div class="pack-art">${image(p.imageUrl, p.label ?? p.id)}</div><span class="badge">${esc(p.status)}</span><h2>${esc(p.label ?? p.id)}</h2><strong class="price">$${esc(p.priceUsd)} <small>/ card</small></strong><p>${esc(p.available ?? "Unknown")} available · up to ${esc(p.maxQuantity)}</p><p class="muted">Reserve $${esc(p.balanceUsdc)} / $${esc(p.requiredFloatUsdc)} required</p></button>`,
            )
            .join("")
        : '<div class="empty"><h2>Catalog unavailable</h2><p>Configure this environment and refresh to load real packs.</p></div>';
    }
    const p = s.catalog?.packs?.find((v: any) => v.id === s.selectedPack),
      eligible = canDraw(p, s.quantity, true);
    root.querySelector<HTMLButtonElement>("#open-pack")!.disabled =
      s.busy || !eligible || (s.recovery.kind !== "absent" && !(s.recovery.kind === "ready" && s.recovery.pending.orderId === s.order?.id && s.order?.state === "complete" && s.order.cards?.length && s.order.cards.every((c: any) => ["sold", "kept"].includes(c.disposition))));
    root.querySelector("#purchase-total")!.textContent =
      p && Number.isInteger(s.quantity)
        ? "$" + (p.priceUsd * s.quantity).toFixed(2) + " total"
        : "Choose a pack";
    root.querySelector("#purchase-reason")!.textContent = [
      "corrupt",
      "unavailable",
    ].includes(s.recovery.kind)
      ? "Recovery blocked. Reconcile the saved record in Runs & Recovery."
      : s.recovery.kind === "ready"
        ? "An unresolved saved order exists. Resume it to reconcile its status." +
          (!eligible
            ? " This pack is paused or unavailable for new purchasing."
            : "")
        : !p
          ? "Select an available pack."
          : !eligible
            ? "This pack is paused or cannot support this quantity. " +
              (p.balanceUsdc < p.requiredFloatUsdc
                ? "Partner reserves $" +
                  p.balanceUsdc +
                  " are below the required $" +
                  p.requiredFloatUsdc +
                  ". "
                : "") +
              (Array.isArray(p.pauseReasons) && p.pauseReasons.length
                ? "Server reasons: " + p.pauseReasons.join(", ")
                : "Check stock and quantity limits.")
            : !s.wallet
              ? "Connect your wallet when opening."
              : "Wallet approval required.";
    root.querySelector<HTMLButtonElement>("#gacha-resume")!.disabled =
      s.busy || s.recovery.kind !== "ready";
  });
}
