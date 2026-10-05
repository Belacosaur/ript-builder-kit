# API capability boundaries

The SDK and reference client are integrations with an independently operated Ript API. This repository does not contain or deploy the backend.

Treasury snapshot/activity and Gacha receipts require corresponding API support. These routes are deployed on the Ript API; see builders/deployment.md for the bounded read-only verification. Paid settlement acceptance remains unverified. A missing route is unavailable, never zero balance or successful settlement.

Receipts expose latest sellback evidence with `historyComplete:false`; no complete historical receipt archive is promised. Chain activity is a bounded finalized observation feed, not a business ledger.

Aggregator is paused. Hosted iframe preview has no supported read-only sandbox contract. Physical fulfilment requires explicitly approved live fixtures; sandbox physical mutations are refused by the reference proxy. Authenticated service acceptance requires your own matching credentials and fixtures.

Proof retrieval and manifest binding do not establish independent cryptographic ECVRF verification. Local contract tests do not establish real settlement, deployment readiness or cross-user access protection.
