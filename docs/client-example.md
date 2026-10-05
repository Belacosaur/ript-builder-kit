# Independent client integration

1. Supply the matching Gacha key on the server. Fetch `/api/config`, actual network metadata and catalog.
2. Persist a scoped client nonce before POST create. Bind every response to partner/environment/chain/wallet, pack, quantity and nonce.
3. Prepare a payment quote; verify actual genesis, exact message and supported wallet fee adjustments. Persist the exact buyer-signed bytes before submit.
4. Poll the same order. Uncertainty never creates a replacement nonce or signature. Reveal only complete payment/fulfilment evidence with unique expected cards.
5. Keep is permanent and requires a verified collector wallet. Sellback signs separate consent bound to selected SKU IDs. Poll every selected disposition, then independently verify payout accounting.

`shared/operations.ts` is the copyable operation/example catalog; validators in `shared/contract.ts` and `shared/testing.ts` define allowed fields and exact route assembly. Sandbox direct routes prepend `/sandbox`; Inventory uses its own key namespace instead.

No direct client broadcast substitutes for submit. Stored signed bytes are private consent, excluded from history and trace exports. Browser Web Locks coordinate financial mutations. History contains only locally known orders in the current scope.

The built-UI lifecycle tests use valid legacy and v0 two-signer transactions with isolated generated keys. Those fixture transactions are never broadcast and do not certify actual Ript settlement.

## Optional settlement evidence

The local additive receipt route is `GET /sandbox/v1/gacha/orders/<64-hex-order-id>/receipts?wallet=<buyer-public-key>` with the sandbox Gacha credential. The client fixed proxy operation is `receipts`. A deployed 404 means the capability is missing; never infer payout from card dispositions. The response has `historyComplete:false` and latest `sellback` intent only. `sellbackSignature` is a public chain reference; raw signed consent remains private. Finalized accounting includes safe pre/post token balances/account keys and frozen selected-card amounts. The client must independently check exact buyer credit, partner debit and Ript fee.

Use the typed Explorer for Inventory/collector/partner/supplier/fulfilment contracts. Keep sessions and rk_test/rk_live keys on the server. Missing optional credentials return actionable errors without forwarding a Gacha key. See backend-capability-gaps.md for deployment and acceptance boundaries.

Manual reconciliation remains available without financial locks or valid local storage. It only reads and validates an order, never adopts or overwrites saved consent. Resume and all financial mutations still require valid scoped consent and Web Locks. Failed balance refreshes mark funds unknown and remove readiness.
