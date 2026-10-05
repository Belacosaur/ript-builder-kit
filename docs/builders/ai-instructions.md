# Instructions for AI builders

1. Read quickstart, authentication and OpenAPI before writing integration code. Install the supplied local SDK tarball; do not assume an npm publication exists.
2. Ask for the builder's own API origin and matching server-side service credentials. Choose sandbox/live explicitly. Live is an API environment, not proof of mainnet: inspect actual chain/mint metadata.
3. Prefer named SDK methods. Use `.request(service,operation,params,body,options)` only for operations listed in capabilities. Do not invent routes, withdrawals, fine-grained key scopes, aggregator support or complete receipt/history APIs.
4. Keep every credential and owner operation on the server. Browser SDK calls an authenticated same-origin proxy. Preserve fixed routes and service-specific auth; never build an arbitrary URL forwarding proxy.
5. Unknown/unavailable funds must remain unknown. Preserve exact string base units and finalized observation identity; chain activity is not a business ledger.
6. Persist financial request identities before mutations; reconcile uncertainty. Do not auto-sign, issue keys, fund treasuries, submit transactions or ship claims without the user's explicit authorization.
7. Report separately what passed locally and what was verified against a deployed API. Treasury/receipt additions are local; missing routes require deployment, not fabricated fixtures presented as real acceptance.
