import { subscribe, type Actions } from "./views/common.js";
import type { Store, ViewId } from "./store.js";
import { mount as overview } from "./views/overview.js";
import { mount as gacha } from "./views/gacha.js";
import { mount as collection } from "./views/collection.js";
import { mount as wallet } from "./views/wallet.js";
import { mount as explorer } from "./views/explorer.js";
import { mount as runs } from "./views/runs.js";
import { mount as guide } from "./views/guide.js";
const views: [ViewId, string, typeof overview][] = [
  ["overview", "Overview", overview],
  ["gacha", "Gacha", gacha],
  ["collection", "Collection", collection],
  ["wallet", "Wallet & Treasury", wallet],
  ["explorer", "API Explorer", explorer],
  ["runs", "Runs & Recovery", runs],
  ["guide", "Integration Guide", guide],
];
export function mountShell(root: HTMLElement, store: Store, actions: Actions) {
  root.innerHTML = `<div class="app-shell"><aside class="sidebar" id="sidebar"><a class="brand" href="#">RIPT<span>CLIENT LAB</span></a><p class="eyebrow">INTEGRATION WORKSPACE</p><nav aria-label="Workspace" role="tablist">${views.map(([id, label], i) => `<button id="tab-${id}" data-view="${id}" role="tab" aria-controls="panel-${id}"><span class="nav-index" aria-hidden="true">0${i + 1}</span>${label}</button>`).join("")}</nav><div class="sidebar-foot">Independent reference client<br><small>Keys remain on your server.</small></div></aside><div class="app-content"><header class="topbar"><button id="menu-toggle" aria-controls="sidebar" aria-expanded="false" class="secondary">Menu</button><span id="context" class="context"></span><div class="toolbar"><label class="sr" for="environment">API environment</label><select id="environment"><option value="sandbox">Sandbox</option><option value="live">Live API</option></select><button id="connect">Connect wallet</button><button id="refresh" class="secondary">Refresh</button></div></header><div id="status" role="status" aria-live="polite" class="status"></div><main>${views.map(([id, label]) => `<section id="panel-${id}" class="workspace-panel" role="tabpanel" aria-labelledby="tab-${id}" aria-label="${label}"></section>`).join("")}</main><footer>Ript Client Lab · API v1 · loopback only · evidence before acceptance</footer></div></div>`;
  const cleanups = views.map(([id, _label, mount]) =>
    mount(root.querySelector<HTMLElement>("#panel-" + id)!, store, actions),
  );
  for (const id of ["connect", "refresh"] as const)
    root
      .querySelector("#" + id)!
      .addEventListener("click", () => actions[id]?.());
  root
    .querySelector("#environment")!
    .addEventListener("change", (e) =>
      store.update((s) => ({
        ...s,
        environment: (e.target as HTMLSelectElement).value as any,
      })),
    );
  const nav = root.querySelector("nav")!;
  nav.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-view]");
    if (b) {
      store.update((s) => ({ ...s, view: b.dataset.view as ViewId }));
      root.querySelector("#sidebar")!.classList.remove("open");
      root
        .querySelector("#menu-toggle")!
        .setAttribute("aria-expanded", "false");
    }
  });
  nav.addEventListener("keydown", (e) => {
    const event = e as KeyboardEvent,
      index = views.findIndex(
        ([id]) => "tab-" + id === (event.target as HTMLElement).id,
      );
    let next = index;
    if (["ArrowDown", "ArrowRight"].includes(event.key))
      next = (index + 1) % views.length;
    else if (["ArrowUp", "ArrowLeft"].includes(event.key))
      next = (index + views.length - 1) % views.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = views.length - 1;
    else return;
    event.preventDefault();
    store.update((s) => ({ ...s, view: views[next][0] }));
    root.querySelector<HTMLButtonElement>("#tab-" + views[next][0])!.focus();
  });
  root.querySelector("#menu-toggle")!.addEventListener("click", () => {
    const open = root.querySelector("#sidebar")!.classList.toggle("open");
    root
      .querySelector("#menu-toggle")!
      .setAttribute("aria-expanded", String(open));
  });
  cleanups.push(
    subscribe(store, (s) => {
      for (const [id] of views) {
        root.querySelector<HTMLElement>("#panel-" + id)!.hidden = s.view !== id;
        const b = root.querySelector<HTMLButtonElement>("#tab-" + id)!;
        b.setAttribute("aria-selected", String(s.view === id));
        b.tabIndex = s.view === id ? 0 : -1;
      }
      const status = root.querySelector("#status")!;
      status.textContent = s.error || s.progress;
      status.className = "status" + (s.error ? " error" : "");
      root.querySelector<HTMLSelectElement>("#environment")!.value =
        s.environment;
      root.querySelector("#connect")!.textContent = s.wallet
        ? "Wallet connected"
        : "Connect wallet";
      root.querySelector<HTMLButtonElement>("#connect")!.disabled = s.busy;
      root.querySelector("#context")!.textContent =
        s.environment.toUpperCase() +
        " · " +
        (s.network?.chain === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
          ? "DEVNET"
          : s.network?.chain
            ? "CUSTOM CHAIN"
            : "NETWORK UNVERIFIED") +
        " · API v1";
    }),
  );
  return () => cleanups.forEach((fn) => fn());
}
