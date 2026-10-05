import { iframePreviewUrl } from "../services/partner.js";
import { subscribe, esc, type Actions } from "./common.js";
import type { Store } from "../store.js";
import { services, resolveServiceOperation } from "../../shared/services.js";
import { operationDefinitions } from "../../shared/operations.js";
import { resolveOperation } from "../../shared/contract.js";
export function mount(root: HTMLElement, store: Store, actions: Actions) {
  root.innerHTML = `<div class="section-heading"><div class="eyebrow">REAL REQUESTS · EXPLICIT MUTATIONS</div><h1>Understand the contract.</h1><p>Exact supported routes. Separate credentials. Actual safe responses.</p></div><section class="panel"><div class="columns"><div><label for="service">Service</label><select id="service">${services
    .filter((s) => !s.paused)
    .map((s) => `<option value="${s.id}">${s.id}</option>`)
    .join(
      "",
    )}</select></div><div><label for="operation">Operation</label><select id="operation"></select></div></div><p id="route" class="mono"></p><p id="operation-auth" class="muted"></p><div class="toolbar"><button id="example" class="secondary">Use operation example</button><button id="use-order" class="secondary">Use active order</button></div><div id="typed-fields" class="columns"></div><div class="columns"><div><label for="params">Path / query parameters (JSON)</label><textarea id="params">{}</textarea></div><div><label for="body">Request body (JSON)</label><textarea id="body" placeholder="Leave empty for a read"></textarea></div></div><button id="execute">Execute request</button><p class="muted">Mutations require deliberate input. Gacha submit retains the original wallet consent. Inventory draw retries retain one idempotency key and exact SKU.</p><pre id="response" aria-label="API response">No request yet.</pre></section><section id="service-tools" class="panel"><h2>Service response and candidates</h2><div id="service-results"></div><div id="partner-preview"></div></section>`;
  const service = root.querySelector<HTMLSelectElement>("#service")!,
    operation = root.querySelector<HTMLSelectElement>("#operation")!,
    params = root.querySelector<HTMLTextAreaElement>("#params")!,
    body = root.querySelector<HTMLTextAreaElement>("#body")!,
    fields = root.querySelector("#typed-fields")!;
  const definitions = () =>
    service.value === "gacha" || service.value === "testing"
      ? operationDefinitions.filter((d) => d.service === service.value)
      : (services.find((s) => s.id === service.value)?.operations ?? []);
  const selected = () => definitions().find((d) => d.id === operation.value);
  function route() {
    const def = selected();
    root.querySelector("#operation-auth")!.textContent =
      (services.find((s) => s.id === service.value)?.auth ?? "unknown") +
      " · " +
      (def?.effect ?? "unavailable");
    try {
      const parsed = JSON.parse(params.value || "{}");
      if (service.value === "gacha") {
        const r = resolveOperation(operation.value, parsed);
        root.querySelector("#route")!.textContent =
          r.method +
          " " +
          (store.get().environment === "sandbox" ? "/sandbox" : "") +
          r.path;
      } else {
        const r = resolveServiceOperation(
          service.value,
          operation.value,
          parsed,
          body.value ? JSON.parse(body.value) : undefined,
          store.get().environment,
        );
        root.querySelector("#route")!.textContent = r.method + " " + r.path;
      }
    } catch {
      root.querySelector("#route")!.textContent = def
        ? def.method +
          " " +
          (service.value === "gacha" && store.get().environment === "sandbox"
            ? "/sandbox"
            : "") +
          def.pathTemplate +
          " · fill required inputs"
        : "No supported operations yet";
    }
  }
  function typed() {
    fields.innerHTML = "";
    for (const [group, area] of [
      ["params", params],
      ["body", body],
    ] as const) {
      let value: any;
      try {
        value = JSON.parse(area.value || "{}");
      } catch {
        continue;
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      for (const [key, v] of Object.entries(value)) {
        const label = root.ownerDocument.createElement("label");
        label.textContent = group + " · " + key;
        const input = root.ownerDocument.createElement("input");
        input.type = typeof v === "number" ? "number" : "text";
        input.value = typeof v === "object" ? JSON.stringify(v) : String(v);
        input.setAttribute("aria-label", group + " " + key);
        input.addEventListener("input", () => {
          const next = JSON.parse(area.value || "{}");
          next[key] =
            typeof v === "number"
              ? Number(input.value)
              : typeof v === "boolean"
                ? input.value === "true"
                : typeof v === "object"
                  ? JSON.parse(input.value)
                  : input.value;
          area.value = JSON.stringify(next, null, 2);
          route();
        });
        label.append(input);
        fields.append(label);
      }
    }
  }
  function populate() {
    operation.innerHTML = definitions()
      .map((d) => `<option value="${esc(d.id)}">${esc(d.id)}</option>`)
      .join("");
    params.value = "{}";
    body.value = "";
    typed();
    route();
  }
  service.addEventListener("change", populate);
  operation.addEventListener("change", route);
  params.addEventListener("input", route);
  body.addEventListener("input", route);
  root.querySelector("#example")!.addEventListener("click", () => {
    const example = (selected() as any)?.example;
    if (example) {
      params.value = JSON.stringify(example.params ?? {}, null, 2);
      body.value = example.body ? JSON.stringify(example.body, null, 2) : "";
      typed();
      route();
    }
  });
  root.querySelector("#use-order")!.addEventListener("click", () => {
    const s = store.get();
    params.value = JSON.stringify(
      { id: s.order?.id, wallet: s.wallet },
      null,
      2,
    );
    body.value = JSON.stringify({ wallet: s.wallet }, null, 2);
    typed();
    route();
  });
  root
    .querySelector("#execute")!
    .addEventListener("click", () =>
      actions.execute?.(
        operation.value,
        params.value,
        body.value,
        service.value,
      ),
    );
  root.querySelector("#service-results")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-candidate]",
    );
    if (b) {
      operation.value = "draw";
      params.value = JSON.stringify(
        { idempotencyKey: crypto.randomUUID() },
        null,
        2,
      );
      body.value = JSON.stringify(
        { skuId: b.dataset.candidate, partnerPullRef: crypto.randomUUID() },
        null,
        2,
      );
      typed();
      route();
    }
  });
  populate();
  let last: any;
  return subscribe(store, (s) => {
    route();
    root.querySelector("#response")!.textContent =
      s.response === null
        ? "No request yet."
        : JSON.stringify(s.response, null, 2);
    root.querySelector<HTMLButtonElement>("#execute")!.disabled = s.busy;
    if (last !== s.response) {
      last = s.response;
      const preview = root.querySelector("#partner-preview")!;
      preview.replaceChildren();
      if (s.partnerSession?.door === "iframe") {
        try {
          const frame = root.ownerDocument.createElement("iframe");
          frame.title = "Published partner iframe preview";
          frame.src = iframePreviewUrl(
            s.partnerSession,
            root.ownerDocument.defaultView!.location.origin,
            s.partnerAcceptedOrigin,
          );
          frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
          frame.referrerPolicy = "no-referrer";
          frame.style.cssText =
            "width:100%;height:640px;border:1px solid #314461;border-radius:12px";
          preview.append(frame);
        } catch (e) {
          preview.textContent =
            e instanceof Error ? e.message : "Preview unavailable";
        }
      }
      const data: any = s.response;
      root.querySelector("#service-results")!.innerHTML =
        service.value === "inventory" &&
        operation.value === "catalog" &&
        Array.isArray(data?.items)
          ? data.items
              .map(
                (c: any) =>
                  `<button data-candidate="${esc(c.skuId ?? c.id)}" class="history-row"><strong>${esc(c.title ?? c.skuId ?? c.id)}</strong><span>Market cents: ${esc(c.marketCents)} · choose exact SKU for draw</span></button>`,
              )
              .join("")
          : '<p class="muted">Read the response above. Unavailable and pending operations never reveal substitute inventory.</p>';
    }
  });
}
