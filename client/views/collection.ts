import { subscribe, esc, image, money, units, type Actions } from "./common.js";
import { canDecide } from "../model.js";
import type { Store } from "../store.js";
export function mount(root: HTMLElement, store: Store, actions: Actions) {
  root.innerHTML = `<div class="section-heading"><div class="eyebrow">YOUR REVEALED CARDS</div><h1>Keep what you love.</h1><p>Keep permanently settles a card into your collector account. Sellback follows a separate signed settlement.</p></div><div id="collection-order" class="panel order"></div><section id="sellback-confirmation" class="panel" aria-live="polite" hidden></section><div id="cards" class="card-grid"></div><details id="sold-history" hidden><summary>Sold cards from this opening</summary><div id="sold-cards" class="card-grid"></div></details><section class="panel"><div class="toolbar"><button id="sellback">Sell selected cards</button><button id="sell-all" class="secondary">Sell all eligible</button><strong id="sell-total">No cards selected</strong></div><p class="muted">Sold cards cannot be sold again. Settlement details are available in the order receipts through API Explorer.</p></section><section class="panel"><h2>Your recent openings</h2><p>Open a previous order to view its cards. History is saved in this browser for the connected wallet.</p><div id="collection-history"></div><button id="read-collection" class="secondary">Load authenticated collection</button><div id="collector-collection"></div></section><section class="panel"><h2>Private scan and identification</h2><p>Select a test JPEG explicitly. Your photo is saved privately for card identification. It is not listed for sale. Configure collector access on your server to use scanning.</p><label for="scan-file">Test JPEG</label><input id="scan-file" type="file" accept="image/jpeg"><label for="scan-format">Scan format</label><select id="scan-format"><option value="raw">Raw card</option><option value="slab">Graded slab</option></select><button id="upload-capture">Upload private capture</button></section>`;
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
  root.querySelector("#scan-file")!.addEventListener("change", () => {
    const s = store.get();
    root.querySelector<HTMLButtonElement>("#upload-capture")!.disabled = s.busy || !s.config?.services?.collector?.configured || !s.wallet || !root.querySelector<HTMLInputElement>("#scan-file")!.files?.length;
  });
  root.querySelector("#sellback-confirmation")!.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-check-sellback]")) actions.checkSellback?.();
  });
  const selected = new Set<string>(),
    cards = root.querySelector("#cards")!;
  let last: any;
  const total = () => {
    const state = store.get();
    for (const id of selected)
      if (!state.order?.cards?.some((c: any) => c.skuId === id && canDecide(state.order, c.disposition))) selected.delete(id);
    root.querySelector<HTMLButtonElement>("#sellback")!.disabled = state.busy || selected.size === 0;
    const amounts = (state.order?.cards ?? [])
      .filter((c: any) => selected.has(c.skuId))
      .map((c: any) => c.buybackCents);
    const cents = amounts.some((value: any) => money(value) === "Unknown")
      ? undefined
      : amounts.reduce((sum: number, value: any) => sum + Number(value), 0);
    root.querySelector("#sell-total")!.textContent =
      selected.size + " selected · " + money(cents);
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
    const configured = !!s.config?.services?.collector?.configured;
    root.querySelector<HTMLButtonElement>("#read-collection")!.disabled = s.busy || !configured;
    root.querySelector<HTMLButtonElement>("#upload-capture")!.disabled = s.busy || !configured || !s.wallet || !root.querySelector<HTMLInputElement>("#scan-file")!.files?.length;
    const personal = s.collectorCollection;
    root.querySelector("#collector-collection")!.setAttribute("aria-live", "polite");
    const rows = Array.isArray(personal?.items)
      ? personal.items
      : personal?.id
        ? [personal]
        : [];
    root.querySelector("#collector-collection")!.innerHTML = rows.length
      ? rows
          .map(
            (row: any) =>
              `<article class="panel"><span class="badge">${esc(row.identityStatus ?? "Unidentified")}</span><h3>${esc(row.title ?? row.captureId ?? row.id)}</h3><p>${esc(row.setName ?? "")} ${esc(row.cardNumber ?? "")} · ${esc(row.scanFormat ?? "")}</p><p>Recognition: ${esc(row.jobStatus ?? "Unobserved")} · revision ${esc(row.revision)} · metadata ${esc(row.metadataVersion)}</p><p>${row.valueCents != null ? money(row.valueCents) : "Value unverified"} · ${esc(row.pricingStatus ?? "Pricing pending")}</p><details><summary>Safe record</summary><pre>${esc(JSON.stringify(row, null, 2))}</pre></details></article>`,
          )
          .join("")
      : '<p class="muted">' +
        (personal
          ? "No personal records in this response."
          : "Authenticated collection not loaded. Configure an explicit collector session.") +
        "</p>";
    root.querySelector("#collection-order")!.textContent = s.order
      ? "Order " + s.order.id + " · " + s.order.state
      : "No order loaded. Open a pack or resume an existing order.";
    const sold = s.order?.cards?.filter((c: any) => c.disposition === "sold") ?? [];
    const confirmation = root.querySelector<HTMLElement>("#sellback-confirmation")!;
    confirmation.hidden = sold.length === 0;
    const receipt = s.sellbackReceipt?.orderId === s.order?.id ? s.sellbackReceipt : null;
    confirmation.innerHTML = receipt
      ? `<h2>Latest sellback confirmed</h2><p><strong>${units(receipt.creditedUnits,receipt.decimals)} ${s.environment === "sandbox" ? "test USDC" : "USDC"} credited to your wallet.</strong></p><p>Finalized receipt for ${receipt.skuIds.length} card(s) in the latest sellback. This is not a total of earlier sellbacks. Sold cards are saved below as history.</p><details><summary>Transaction receipt</summary><p class="mono">${esc(receipt.signature)}</p></details>`
      : `<h2>${sold.length} card${sold.length === 1 ? "" : "s"} sold</h2><p>${esc(s.sellbackStatus || "Sold cards are saved below as history. Check the receipt to confirm your payout.")}</p><button data-check-sellback ${s.busy ? "disabled" : ""}>Check sellback receipt</button>`;
    root.querySelector<HTMLElement>("#sold-history")!.hidden = sold.length === 0;
    root.querySelector("#sold-cards")!.innerHTML = sold.map((c: any) => `<article class="collector-card"><div class="card-art">${image(c.imageUrl,c.title ?? c.name ?? "Sold card")}</div><div class="card-details"><span class="badge">Sold</span><h2>${esc(c.title ?? c.name ?? c.skuId)}</h2><p>Already sold. This card is history and cannot be kept or sold again.</p><p>Sellback value: ${money(c.buybackCents)}</p></div></article>`).join("");
    if (last !== s.order) {
      last = s.order;
      selected.clear();
      cards.innerHTML = s.order?.cards?.length
        ? s.order.cards
            .filter((c: any) => c.disposition !== "sold")
            .map(
              (c: any) =>
                `<article class="collector-card"><div class="card-art">${image(c.imageUrl, c.title ?? c.name ?? "Revealed card")}</div><div class="card-details"><span class="badge">${esc(c.disposition)}</span><h2>${esc(c.title ?? c.name ?? c.skuId)}</h2><p>${esc(c.setName)} ${esc(c.cardNumber)} · ${esc(c.grade ?? "Ungraded")}</p><dl><dt>Insured value</dt><dd>${money(c.insuredCents)}</dd><dt>Sellback</dt><dd>${money(c.buybackCents)}</dd></dl>${c.disposition === "sold" ? '<p class="muted">Already sold. This card can no longer be kept or sold again.</p>' : ""}<label><input type="checkbox" data-select="${esc(c.skuId)}" ${canDecide(s.order, c.disposition) ? "" : "disabled"}> Select for sellback</label><button data-keep="${esc(c.skuId)}" ${canDecide(s.order, c.disposition) && !s.busy ? "" : "disabled"} class="secondary">Keep permanently</button></div></article>`,
            )
            .join("")
        : '<div class="empty"><h2>Your cards will appear here.</h2><p>Complete orders with payment evidence reveal cards.</p></div>';
      total();
    }
    for (const b of cards.querySelectorAll<HTMLButtonElement>("[data-keep]"))
      b.disabled =
        s.busy || !configured || s.collectorLinked === false ||
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
            `<button data-load="${esc(o.id)}" class="history-row"><strong>${esc(o.packId)} · ${esc(o.quantity)} card(s)</strong><span>${esc(o.state)} · ${esc(o.observedAt)}</span><span class="mono">${esc(o.id)}</span></button>`,
        )
        .join("") || '<p class="muted">No history for this context.</p>';
  });
}
