import { subscribe, esc, image, money, type Actions } from "./common.js";
import { canDecide } from "../model.js";
import type { Store } from "../store.js";
export function mount(root: HTMLElement, store: Store, actions: Actions) {
  root.innerHTML = `<div class="section-heading"><div class="eyebrow">YOUR REVEALED CARDS</div><h1>Keep what you love.</h1><p>Keep permanently settles a card into your collector account. Sellback follows a separate signed settlement.</p></div><div id="collection-order" class="panel order"></div><div id="cards" class="card-grid"></div><section class="panel"><div class="toolbar"><button id="sellback">Sell selected cards</button><button id="sell-all" class="secondary">Sell all eligible</button><strong id="sell-total">No cards selected</strong></div><p class="muted">A sold disposition is server evidence. Payout accounting remains a separate verification check.</p></section><section class="panel"><h2>Locally known order history</h2><p>This browser's history is separate from authenticated personal collection.</p><div id="collection-history"></div><button id="read-collection" class="secondary">Load authenticated collection</button><div id="collector-collection"></div></section><section class="panel"><h2>Private scan and identification</h2><p>Select a test JPEG explicitly. Capture identity and SHA256 bind the upload. Identification stays private until an explicit submit-for-sale request.</p><label for="scan-file">Test JPEG</label><input id="scan-file" type="file" accept="image/jpeg"><label for="scan-format">Scan format</label><select id="scan-format"><option value="raw">Raw card</option><option value="slab">Graded slab</option></select><button id="upload-capture">Upload private capture</button></section>`;
  root
    .querySelector("#read-collection")!
    .addEventListener("click", () => actions.readCollection?.());
  root.querySelector("#upload-capture")!.addEventListener("click", () => {
    const file = root.querySelector<HTMLInputElement>("#scan-file")!.files?.[0];
    if (file)
      actions.uploadCapture?.(
        file,
        root.querySelector<HTMLSelectElement>("#scan-format")!.value as
          "raw" | "slab",
      );
  });
  const selected = new Set<string>(),
    cards = root.querySelector("#cards")!;
  let last: any;
  const total = () => {
    const state = store.get();
    for (const id of selected)
      if (!state.order?.cards?.some((c: any) => c.skuId === id && canDecide(state.order, c.disposition))) selected.delete(id);
    root.querySelector<HTMLButtonElement>("#sellback")!.disabled = state.busy || selected.size === 0;
    const cents = (state.order?.cards ?? [])
      .filter((c: any) => selected.has(c.skuId))
      .reduce((n: number, c: any) => n + Number(c.buybackCents ?? 0), 0);
    root.querySelector("#sell-total")!.textContent =
      selected.size + " selected Â· " + money(cents);
  };
  cards.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.select) {
      if (input.checked && !input.disabled && !store.get().busy) selected.add(input.dataset.select);
      else selected.delete(input.dataset.select);
      total();
    }
  });
  cards.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-keep]");
    if (
      b &&
      globalThis.confirm?.(
        "Keep this card permanently? It will no longer be eligible for partner sellback.",
      )
    )
      actions.keep?.(b.dataset.keep!);
  });
  root
    .querySelector("#sellback")!
    .addEventListener("click", () => {
      total();
      if (!root.querySelector<HTMLButtonElement>("#sellback")!.disabled) actions.sell?.([...selected]);
    });
  root
    .querySelector("#sell-all")!
    .addEventListener("click", () =>
      actions.sell?.(
        (store.get().order?.cards ?? [])
          .filter((c: any) => canDecide(store.get().order, c.disposition))
          .map((c: any) => c.skuId),
      ),
    );
  root.querySelector("#collection-history")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-load]");
    if (b) actions.load?.(b.dataset.load!);
  });
  return subscribe(store, (s) => {
    const personal = s.collectorCollection;
    const rows = Array.isArray(personal?.items)
      ? personal.items
      : personal?.id
        ? [personal]
        : [];
    root.querySelector("#collector-collection")!.innerHTML = rows.length
      ? rows
          .map(
            (row: any) =>
              `<article class="panel"><span class="badge">${esc(row.identityStatus ?? "Unidentified")}</span><h3>${esc(row.title ?? row.captureId ?? row.id)}</h3><p>${esc(row.setName ?? "")} ${esc(row.cardNumber ?? "")} Â· ${esc(row.scanFormat ?? "")}</p><p>Recognition: ${esc(row.jobStatus ?? "Unobserved")} Â· revision ${esc(row.revision)} Â· metadata ${esc(row.metadataVersion)}</p><p>${row.valueCents != null ? money(row.valueCents) : "Value unverified"} Â· ${esc(row.pricingStatus ?? "Pricing pending")}</p><details><summary>Safe record</summary><pre>${esc(JSON.stringify(row, null, 2))}</pre></details></article>`,
          )
          .join("")
      : '<p class="muted">' +
        (personal
          ? "No personal records in this response."
          : "Authenticated collection not loaded. Configure an explicit collector session.") +
        "</p>";
    root.querySelector("#collection-order")!.textContent = s.order
      ? "Order " + s.order.id + " Â· " + s.order.state
      : "No order loaded. Open a pack or resume an existing order.";
    if (last !== s.order) {
      last = s.order;
      selected.clear();
      cards.innerHTML = s.order?.cards?.length
        ? s.order.cards
            .map(
              (c: any) =>
                `<article class="collector-card"><div class="card-art">${image(c.imageUrl, c.title ?? c.name ?? "Revealed card")}</div><div class="card-details"><span class="badge">${esc(c.disposition)}</span><h2>${esc(c.title ?? c.name ?? c.skuId)}</h2><p>${esc(c.setName)} ${esc(c.cardNumber)} Â· ${esc(c.grade ?? "Ungraded")}</p><dl><dt>Insured value</dt><dd>${money(c.insuredCents)}</dd><dt>Sellback</dt><dd>${money(c.buybackCents)}</dd></dl>${c.disposition === "sold" ? '<p class="muted">Already sold according to this order. Keep and further sellback are unavailable. Verify the settlement receipt for payout evidence.</p>' : ""}<label><input type="checkbox" data-select="${esc(c.skuId)}" ${canDecide(s.order, c.disposition) ? "" : "disabled"}> Select for sellback</label><button data-keep="${esc(c.skuId)}" ${canDecide(s.order, c.disposition) && !s.busy ? "" : "disabled"} class="secondary">Keep permanently</button></div></article>`,
            )
            .join("")
        : '<div class="empty"><h2>Your cards will appear here.</h2><p>Complete orders with payment evidence reveal cards.</p></div>';
      total();
    }
    for (const b of cards.querySelectorAll<HTMLButtonElement>("[data-keep]"))
      b.disabled =
        s.busy ||
        !s.order?.cards?.some(
          (c: any) =>
            c.skuId === b.dataset.keep && canDecide(s.order, c.disposition),
        );
    for (const input of cards.querySelectorAll<HTMLInputElement>("[data-select]"))
      input.disabled = s.busy || !s.order?.cards?.some((c: any) => c.skuId === input.dataset.select && canDecide(s.order, c.disposition));
    total();
    root.querySelector<HTMLButtonElement>("#sell-all")!.disabled =
      s.busy ||
      !s.order?.cards?.some((c: any) => canDecide(s.order, c.disposition));
    root.querySelector("#collection-history")!.innerHTML =
      s.history
        .map(
          (o) =>
            `<button data-load="${esc(o.id)}" class="history-row"><strong>${esc(o.packId)} Â· ${esc(o.quantity)} card(s)</strong><span>${esc(o.state)} Â· ${esc(o.observedAt)}</span><span class="mono">${esc(o.id)}</span></button>`,
        )
        .join("") || '<p class="muted">No history for this context.</p>';
  });
}
