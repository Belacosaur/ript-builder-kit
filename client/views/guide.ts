import type { Store } from "../store.js";
import type { Actions } from "./common.js";
export function mount(root: HTMLElement, _store: Store, _actions: Actions) {
  root.innerHTML = `<div class="section-heading"><div class="eyebrow">INDEPENDENT REFERENCE CLIENT</div><h1>Build with confidence.</h1><p>Keep consent, credentials and verification boundaries explicit.</p></div><div class="columns"><section class="panel"><h2>01 / Install</h2><pre>npm ci
npm run build
# Set GACHA_SANDBOX_KEY server-side
npm start</pre><p>Open the printed loopback URL. Separate Inventory and collector credentials enable those modules.</p></section><section class="panel"><h2>02 / Prepare</h2><p>Connect an injected wallet. Confirm actual chain and mint. Read testing receipts and RPC balances. Link the wallet through a collector session before Keep.</p></section><section class="panel"><h2>03 / Recover</h2><p>Create once with a durable nonce. Bind quote to scope and order. Validate the wallet signature, persist exact bytes, submit and poll for complete evidence.</p><p>Resume preserves identity. Storage errors block purchases.</p></section><section class="panel"><h2>04 / Verify</h2><pre>npm test
npm run smoke
npm run check:readiness -- --service=gacha --environment=sandbox
npm run acceptance:verify -- --file=run.json</pre><p>Missing real receipts remain blockers. Fixture tests do not certify settlement.</p></section></div><section class="panel"><h2>Troubleshooting</h2><dl><dt>opening_preparing</dt><dd>Bounded retries preserve the original order.</dd><dt>recovery_corrupt</dt><dd>Preserve the record and reconcile before another purchase.</dd><dt>chain_mismatch</dt><dd>RPC genesis differs from catalog; signing is refused.</dd><dt>financial_lock_unavailable</dt><dd>Use a browser supporting Web Locks on localhost.</dd></dl><p>Aggregator remains paused. Synthetic stock cannot fulfil physical shipments. Live API does not establish mainnet.</p></section>`;
  return () => {};
}
