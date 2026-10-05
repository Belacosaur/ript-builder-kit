import { formatTreasuryUnits } from "../../shared/treasury-dto.js";
import { subscribe, esc, type Actions } from "./common.js";
import type { Store } from "../store.js";
export function mount(root: HTMLElement, store: Store, actions: Actions) {
  root.innerHTML = `<div class="section-heading"><div class="eyebrow">BUYER AND PARTNER FUNDS</div><h1>Know what is ready.</h1><p>Buyer balances and partner reserves have separate evidence.</p></div><div class="columns"><section class="panel"><h2>Buyer wallet</h2><p id="buyer-address" class="mono"></p><button id="read-balances">Check chain balances</button><div id="buyer-balances"></div><div id="wallet-link"><h3>Collector linkage</h3><p id="collector-link-status">Supply an explicit collector session to verify this wallet before Keep.</p><button id="collector-check" class="secondary">Check linked wallet</button><button id="collector-link" class="secondary">Link with signed message</button></div></section><section class="panel"><h2>Partner reserves</h2><div id="partner-reserves"></div><p class="muted">Server-reported reserves do not establish buyer funds.</p></section></div><section class="panel"><h2>Partner treasury · finalized chain observations</h2><p>Inspect balances and deposit accounts using the public API. Activity is a bounded chain history, without business classifications.</p><button id="treasury-read">Read partner treasury</button><div id="treasury-snapshot" aria-live="polite"></div><div id="treasury-activity"></div><button id="treasury-next" class="secondary">Older observations</button></section><section class="panel"><h2>Devnet testing controls</h2><p>Sandbox grants retain one request ID through uncertainty. Read reconciled receipts before assuming funds arrived.</p><div class="toolbar"><button id="test-status" class="secondary">Refresh testing status</button><button id="test-wallet">Request buyer test funds</button><button id="test-refill" class="secondary">Request treasury refill</button></div><pre id="testing-status"></pre></section>`;
  root.querySelector("#treasury-read")!.addEventListener("click", () => actions.treasuryRead?.());
  root.querySelector("#treasury-next")!.addEventListener("click", () => actions.treasuryActivityNext?.());
  root
    .querySelector("#collector-check")!
    .addEventListener("click", () =>
      actions.service?.("collector", "wallets", {}),
    );
  root
    .querySelector("#collector-link")!
    .addEventListener("click", () => actions.linkCollector?.());
  root
    .querySelector("#read-balances")!
    .addEventListener("click", () => actions.balance?.());
  for (const [id, action] of [
    ["test-status", "status"],
    ["test-wallet", "wallet-funds"],
    ["test-refill", "treasury-refill"],
  ] as const)
    root
      .querySelector("#" + id)!
      .addEventListener("click", () => actions.fund?.(action));
  return subscribe(store, (s) => {
    const t = s.treasurySnapshot;
    root.querySelector("#treasury-snapshot")!.innerHTML = t ? `<p>${esc(t.status)} · ${esc(t.observedAt)} · finalized</p><p>Balance: ${formatTreasuryUnits(t.balanceUnits)} USDC · Required float: ${formatTreasuryUnits(t.requiredFloatUnits)} · Shortfall: ${formatTreasuryUnits(t.shortfallUnits)}</p><p class="mono">Chain: ${esc(t.chain)}<br>Mint: ${esc(t.mint)}<br>Vault: ${esc(t.vault ?? "Not provisioned")}<br>Deposit token account: ${esc(t.tokenAccount ?? "Unknown")}</p>${t.packHealth.map(p=>`<p>${esc(p.packId)} · ${p.ready?"Ready":"Blocked"} · required ${formatTreasuryUnits(p.requiredFloatUnits)} · shortfall ${formatTreasuryUnits(p.shortfallUnits)}</p>`).join("")}<p>${esc(t.reasons.join(", "))}</p>` : `<p>${esc(s.treasuryStatus)}. No verified balance.</p>`;
    root.querySelector("#treasury-activity")!.innerHTML = `<p>${esc(s.treasuryStatus)}. Observations do not establish a complete ledger.</p>`+(s.treasuryActivity?.items.map(x=>`<p data-treasury-event class="mono">${esc(x.signature)} · slot ${x.slot} · ${esc(x.status)} · ${formatTreasuryUnits(x.deltaUnits)} USDC</p>`).join("") ?? "");
    root.querySelector<HTMLButtonElement>("#treasury-read")!.disabled = !s.catalog || s.treasuryStatus.startsWith("Checking");
    root.querySelector<HTMLButtonElement>("#treasury-next")!.disabled = !s.treasuryActivity?.nextCursor || s.treasuryStatus.startsWith("Checking");
    root.querySelector("#collector-link-status")!.textContent =
      s.collectorLinked === true
        ? "Connected wallet verified under collector session"
        : s.collectorLinked === false
          ? "Connected wallet is not verified under this collector session"
          : "Unverified: configure an explicit collector session and check linkage";
    root.querySelector("#buyer-address")!.textContent =
      s.wallet || "No wallet connected";
    root.querySelector("#buyer-balances")!.textContent = s.balances
      ? `${s.balances.solLamports} lamports · ${s.balances.tokenUnits} token base units (${s.balances.decimals} decimals) · observed ${s.balances.observedAt}`
      : s.balanceObservation === "unavailable"
        ? "Unavailable: the last chain balance check failed. Funds are unknown."
        : s.balanceObservation === "loading"
          ? "Checking configured chain balances…"
          : "Unverified. Read the configured RPC and mint.";
    root.querySelector("#partner-reserves")!.innerHTML =
      s.catalog?.packs
        ?.map(
          (p: any) =>
            `<p>${esc(p.label ?? p.id)} · $${esc(p.balanceUsdc)} reserve / $${esc(p.requiredFloatUsdc)} required</p>`,
        )
        .join("") || "<p>Catalog unavailable</p>";
    root.querySelector("#testing-status")!.textContent = s.testing
      ? JSON.stringify(s.testing, null, 2)
      : "No testing status observed.";
    for (const id of ["test-status", "test-wallet", "test-refill"])
      root.querySelector<HTMLButtonElement>("#" + id)!.disabled =
        s.busy ||
        s.environment !== "sandbox" ||
        !s.catalog ||
        (id === "test-wallet" && !s.wallet);
  });
}
