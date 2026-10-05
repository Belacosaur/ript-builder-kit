import { evaluateReadiness } from "../../shared/readiness.js";
import { assessCoverage, configuredCoverage } from "../../shared/coverage.js";
import { services } from "../../shared/services.js";
import { subscribe, esc, type Actions } from "./common.js";
import type { Store } from "../store.js";
export function mount(root: HTMLElement, store: Store, _actions: Actions) {
  root.innerHTML = `<div class="hero"><div class="eyebrow">BUILD WITH RIPT</div><h1>Your integration starts here.</h1><p>Explore real packs. Follow wallet consent through settlement. Verify each service with its own evidence.</p><button id="overview-gacha">Explore Gacha →</button></div><div id="overview-stats" class="stats"></div><div class="columns"><section class="panel"><h2>Ready for your first opening?</h2><ol id="setup-checks" class="checklist"></ol></section><section class="panel"><h2>A result you can trust</h2><p>Reachability confirms an endpoint responds. Readiness checks prerequisites. Acceptance requires finalized transactions and accounting.</p><p class="muted">Fixture tests prove client behavior. They do not certify deployed services.</p></section></div><section class="panel"><h2>Service coverage</h2><div class="table-scroll"><table><thead><tr><th>Service</th><th>Configuration</th><th>Ready</th><th>Acceptance</th><th>Next step</th></tr></thead><tbody id="coverage"></tbody></table></div></section>`;
  root
    .querySelector("#overview-gacha")!
    .addEventListener("click", () =>
      store.update((s) => ({ ...s, view: "gacha" })),
    );
  return subscribe(store, (s) => {
    const cfg = s.config?.environments?.[s.environment];
    const pack = s.catalog?.packs?.find((p: any) => p.id === s.selectedPack);
    const readiness = evaluateReadiness({
      configured: !!cfg?.configured,
      packs: s.catalog?.packs ?? [],
      wallet: s.wallet,
      chain: s.network?.chain ?? "",
      mint: s.network?.token ?? "",
      balances: s.balances,
      requiredTokenUnits:
        pack && Number.isFinite(pack.priceUsd)
          ? String(Math.round(pack.priceUsd * 100) * 10000 * s.quantity)
          : "1",
      collectorLinked: s.collectorLinked,
      locksAvailable: !!(root.ownerDocument.defaultView?.navigator as any)
        ?.locks,
      recoveryBlocked: ["corrupt", "unavailable"].includes(s.recovery.kind),
    });

    root.querySelector("#overview-stats")!.innerHTML =
      `<div><small>API environment</small><strong>${esc(s.environment)}</strong></div><div><small>Playable packs</small><strong>${s.catalog?.packs?.filter((p: any) => p.status === "available" && p.maxQuantity > 0).length ?? "—"}</strong></div><div><small>Known orders</small><strong>${s.history.length}</strong></div>`;
    root.querySelector("#setup-checks")!.innerHTML = [
      [
        "Server credentials",
        cfg?.configured ? "Configured" : "Set matching GACHA key",
      ],
      [
        "Catalog",
        s.catalog ? "Loaded from API" : "Refresh after configuration",
      ],
      ["Buyer wallet", s.wallet ? "Connected" : "Connect an injected wallet"],
      [
        "Buyer balances",
        s.balances ? "Observed on configured chain" : "Check Wallet & Treasury",
      ],
      ["Collector linkage", "Verify a collector session before Keep"],
    ]
      .map(
        ([label, value]) =>
          `<li><strong>${esc(label)}</strong><span>${esc(value)}</span></li>`,
      )
      .join("");
    root.querySelector("#coverage")!.innerHTML = assessCoverage(
      services,
      configuredCoverage(s.config, s.environment),
      {
        gacha: {
          ready: readiness.ready,
          blockedReasons: readiness.checks
            .filter((c) => c.status !== "verified")
            .map((c) => c.id + ": " + c.reason),
        },
      },
      [],
    )
      .map(
        (c: any) =>
          `<tr><td>${esc(c.service)}</td><td>${c.configured ? "Configured" : "Unconfigured"}</td><td>${c.ready ? "Ready" : "Unchecked / blocked"}</td><td><span class="badge">${c.verified ? "Verified" : c.service === "aggregator" ? "Paused" : "Unverified"}</span></td><td>${esc(c.blockedReasons?.join("; "))}</td></tr>`,
      )
      .join("");
  });
}
