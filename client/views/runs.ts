import { CLIENT_BUILD } from "../build.js";
import { subscribe, esc, type Actions } from "./common.js";
import type { Store } from "../store.js";
export function mount(root: HTMLElement, store: Store, actions: Actions) {
  root.innerHTML = `<div class="section-heading"><div class="eyebrow">SCOPED RECOVERY AND EVIDENCE</div><h1>Every step leaves a trail.</h1><p>Resume the original order. Separate API observations from chain acceptance.</p></div><section class="panel"><h2>Recovery workspace</h2><p id="recovery-state"></p><label for="order-id">Existing order ID</label><input id="order-id" placeholder="64-character order ID"><div class="toolbar"><button id="load-order">Load order</button><button id="resume" class="secondary">Resume saved</button><button id="resume-sellback" class="secondary">Resume sellback</button><button id="new-order" class="secondary">Release resolved order</button></div><p class="muted">Damaged records remain preserved. Reconcile the original order before manually resetting storage. No automatic replacement purchase.</p></section><section class="panel"><div class="toolbar"><h2>Request trace</h2><button id="export" class="secondary">Export current run + trace</button></div><div id="trace"></div></section><section class="panel" id="acceptance-runs"><h2>Acceptance gates</h2><p>Fixture lifecycle, readiness, and real settlement are separate results.</p><p id="build-version"></p><div id="run-evidence"></div></section>`;
  root
    .querySelector("#load-order")!
    .addEventListener("click", () =>
      actions.load?.(
        (root.querySelector("#order-id") as HTMLInputElement).value,
      ),
    );
  root
    .querySelector("#resume")!
    .addEventListener("click", () => actions.resume?.());
  root
    .querySelector("#resume-sellback")!
    .addEventListener("click", () => actions.sell?.([]));
  root
    .querySelector("#new-order")!
    .addEventListener("click", () => actions.release?.());
  root
    .querySelector("#export")!
    .addEventListener("click", () => actions.export?.());
  return subscribe(store, (s) => {
    const r = s.recovery;
    root.querySelector("#build-version")!.textContent =
      "Client build " + CLIENT_BUILD;
    root.querySelector("#run-evidence")!.innerHTML =
      '<p class="muted">' +
      esc(
        s.evidenceError ||
          "API observations are recorded as unverified. Finalized payment, fulfilment, proof and sellback accounting require independent chain acceptance.",
      ) +
      "</p>" +
      s.evidenceRuns
        .map(
          (run) =>
            "<details><summary>" +
            esc(run.id) +
            " · " +
            run.steps.length +
            " API observations · Unverified</summary><pre>" +
            esc(JSON.stringify(run, null, 2)) +
            "</pre></details>",
        )
        .join("");

    root.querySelector("#recovery-state")!.textContent =
      r.kind === "ready"
        ? `Saved ${r.pending.orderId ?? "uncertain create"} · original nonce ${r.pending.clientNonce} · ${r.pending.signedTransaction ? "signed payment retained" : "awaiting consent"}`
        : r.kind === "absent"
          ? "No saved order in this scope."
          : `BLOCKED: ${r.reason}. Stored evidence preserved.`;
    root.querySelector<HTMLButtonElement>("#resume")!.disabled =
      s.busy || r.kind !== "ready";
    root.querySelector<HTMLButtonElement>("#resume-sellback")!.disabled =
      s.busy || r.kind !== "ready" || !r.pending.sellback;
    root.querySelector<HTMLButtonElement>("#load-order")!.disabled =
      s.busy || !s.wallet;
    root.querySelector<HTMLButtonElement>("#new-order")!.disabled =
      s.busy || r.kind !== "ready" || !s.order || !!r.pending.sellback;
    root.querySelector("#trace")!.innerHTML =
      s.diagnostics
        .slice()
        .reverse()
        .map(
          (t) =>
            `<details><summary>${esc(t.at)} · ${esc(t.environment)} · ${esc(t.operation)} · HTTP ${esc(t.status)} · ${esc(t.latencyMs)}ms</summary><pre>${esc(JSON.stringify(t, null, 2))}</pre></details>`,
        )
        .join("") || "<p>No requests in this session.</p>";
  });
}
