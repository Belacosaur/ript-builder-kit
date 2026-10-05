import type { Store, AppState } from "../store.js";
export type Actions = {
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
  return "$" + (Number(cents ?? 0) / 100).toFixed(2);
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
