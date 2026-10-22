import type { Store, AppState } from "../store.js";
export type Actions = {
  checkSellback?: () => void;
  linkCollector?: () => void;
  readCollection?: () => void;
  uploadCapture?: (file: File, format: "raw" | "slab") => void;

  treasuryRead?: () => void;
  treasuryActivityNext?: () => void;
  connect: () => void;
  refresh: () => void;
  open: () => void;
  resume: () => void;
  load: (id: string) => void;
  release: () => void;
  keep: (id: string) => void;
  sell: (ids: string[]) => void;
  fund: (action: "status" | "wallet-funds" | "treasury-refill") => void;
  execute: (
    operation: string,
    params: string,
    body: string,
    service?: string,
  ) => void;
  export: () => void;
  balance: () => void;
  service?: (
    service: string,
    operation: string,
    params: Record<string, string>,
    body?: unknown,
  ) => void;
};
export const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function subscribe(store: Store, update: (s: AppState) => void) {
  update(store.get());
  return store.subscribe(update);
}
export function money(cents: unknown) {
  if (cents == null || cents === "" || !Number.isSafeInteger(Number(cents))) return "Unknown";
  return "$" + (Number(cents) / 100).toFixed(2);
}
export function units(value: unknown, decimals: number) {
  if (typeof value !== "string" || !/^-?\d+$/.test(value) || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) return "Unknown";
  const n = BigInt(value), negative = n < 0n, digits = (negative ? -n : n).toString().padStart(decimals + 1, "0");
  if (!decimals) return (negative ? "-" : "") + digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return (negative ? "-" : "") + digits.slice(0, -decimals) + (fraction ? "." + fraction : "");
}
export function explainError(code: string) {
  const messages: Record<string,string> = {
    buyer_funds_insufficient: "Your wallet needs more USDC or SOL for this opening. In Sandbox, request test funds in Wallet & Treasury.",
    pending_order_exists: "A saved opening still needs attention. Resume it before starting another pack.",
    saved_order_missing: "There is no saved opening to resume. Load an order from Collection history.",
    collector_wallet_not_verified: "Link this wallet to your collector account in Wallet & Treasury before keeping a card.",
    credential_not_configured: "This service is not configured. Add its matching credential to the server's .env file and restart.",
    network_metadata_unavailable: "We could not check the network. Refresh to try again; opening is paused until this check succeeds.",
    chain_mismatch: "The wallet RPC and API use different networks. Check the server's RPC settings before signing.",
    recovery_corrupt: "The saved opening could not be read. Keep the record and use Runs & Recovery to inspect the original order.",
    recovery_unavailable: "Browser storage is unavailable. Allow local storage before starting a wallet action.",
    retry_deadline: "Confirmation is taking longer than expected. Your saved request is preserved; resume it to check again.",
    buyback_expired: "The sellback quote expired. Its status has been checked; try again when the cards are available.",
    quote_expired: "The payment window is too short to request approval safely. Resume to get a fresh quote; no new payment was submitted.",
    quote_invalid: "We could not prepare the wallet transaction. Your opening is saved. Resume it to request a fresh payment quote.",
    order_expired: "This opening expired. Resume it to check whether the server confirms it is safe to retry.",
    financial_lock_unavailable: "Use a current browser on localhost that supports Web Locks for safe wallet actions.",
    signature_missing: "Your wallet did not return a signed transaction. No new transaction was submitted; resume when ready.",
  };
  return messages[code] ?? (/^[a-z][a-z0-9_]+$/.test(code) ? "This action could not finish. Check the details below and retry or resume the saved request." : code);
}
export function imageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value, "https://ript.fun");
    if (
      url.protocol === "https:" &&
      [
        "ript.fun",
        "www.ript.fun",
        "images.pokemontcg.io",
        "i.ebayimg.com",
        "assets.ript.fun",
        "pub-539ad16e2f8b4637ac2b6f2d440c7605.r2.dev",
      ].includes(url.hostname)
    )
      return url.href;
  } catch {}
}
export function image(value: unknown, alt: string) {
  const url = imageUrl(value);
  return url
    ? `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">`
    : '<div class="art-fallback">Artwork unavailable</div>';
}
export function panel(root: HTMLElement, html: string) {
  root.innerHTML = html;
}
