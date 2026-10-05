# Treasury observations

Use `sdk.treasury.get()` with a matching Gacha credential. GET `/v1/gacha/treasury` or `/sandbox/v1/gacha/treasury` derives the partner from the credential; no partner selector is accepted. It performs reads without provisioning or lifecycle writes. Status is `observed`, `not-provisioned` or `unavailable`. Failed observations have `balanceUnits:null`; unknown is never zero. A genuinely absent token account can return observed zero with the explicit reason `token_account_missing`.

`balanceUnits`, `requiredFloatUnits` and `shortfallUnits` are exact integer strings with `decimals:6`. Example: `"25000000"` is 25 USDC. Use BigInt/string formatting; avoid floating-point conversion. Read actual chain/mint/vault/tokenAccount and finalized observation time. Pack health follows existing float floors and paused/disabled policy; it does not establish buyer funds, reserved settlement liabilities or readiness of other services.

`sdk.treasury.activity.list({limit:20,before:cursor})` returns at most 50 finalized canonical token-account observations with public signatures, slots and signed string deltas. Missing/pruned transactions are unavailable with null deltas; failed transactions have no invented movement. `nextCursor` advances the bounded scan; `historyComplete:false` is always explicit. This chain feed is not a business ledger, payment classifier or complete receipt history. Inventory's ledger and reports remain separate.

These additive backend routes are local implementations; deployed acceptance is still unverified. There is no SDK withdrawal, invented reserved/pending balance or silent account allocation. Safe reads do not imply the old owner portal GET is safe to inspect.

Backend observations have a total ten-second RPC/policy budget and stop on client disconnect. Exhausted activity pages contain explicit unavailable metadata and a resumable cursor; they never invent a delta. Workspace export includes current scoped treasury observations separately from financial acceptance, preserving public finalized references while redacting authentication signatures.
