# Ript API deployment verification

Verified on 5 October 2026 against `https://ript-backend-production.up.railway.app`.

Backend repository: Ript-fun/Ript-Backend. Release commit: `5c64e171465191d7eb2c0f57e96360f667edd531`. Deployment uses a Git push to main; Railway deployment `104a2da1-36cc-49a9-be74-1d21fa5c71be` reached SUCCESS. Health reported that exact commit, `ok:true` and `database:true`.

The release preserves the latest production source and adds credential-bound treasury snapshot/activity, latest finalized sellback receipt reads and synthetic-source physical fulfilment refusal. Full backend build and 29 focused/regression tests passed before the push.

Read-only deployed checks with matching credentials:

- Sandbox and live treasury snapshots returned `observed`.
- Bounded activity returned one sandbox observation and an empty live page; `historyComplete:false` remained explicit.
- Treasury requests without credentials or with the other environment's credential returned 401 in both environments.
- Receipt reads for a nonexistent order returned the existing `409 opening_not_found` response in both environments, establishing route availability and missing-order handling.

No account creation, funding, signing, purchase, sellback or shipment was performed during deployment verification. A real paid receipt, payout accounting, independent cryptographic proof verification, cross-partner authorization and physical shipment acceptance remain unverified. Live is an API environment; read actual chain metadata. Deployment availability does not establish financial readiness.

Other API origins need corresponding backend support. Unknown observations must remain unknown.
