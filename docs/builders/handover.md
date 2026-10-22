# Client handover checklist

Use the client's own credentials and approved fixtures. Record environment, actual network, mint and application revision. Keep private evidence outside the public repository.

1. **Fresh setup:** clone, `npm ci`, build, copy `.env.example` to `.env`, add the Sandbox Gacha key, start. Check catalog images and prices. Optional features explain their required credentials.
2. **Wallet:** connect a supported wallet. Check SOL and USDC balances. Request Sandbox test funds and verify balances after the funding receipt reconciles. A network mismatch must block signing.
3. **Opening:** open one card, then a batch. Confirm exact payment, one order identity, finalized payment and the expected number of cards. Independently verify the available proof; an API success is not proof certification.
4. **Decisions:** configure and verify collector linkage before Keep. Keep one card and sell another. Confirm dispositions, finalized sellback receipt and collector token credit. The receipt API exposes only the latest durable sellback; preserve each receipt during the rehearsal.
5. **Recovery:** interrupt after create, before signing and after submission. Reload and resume. Verify original nonce, order and transaction stay unchanged. Safely expired and fully settled orders should stop blocking new packs. Load a historical completed order and decide a remaining card without another purchase.
6. **Treasury:** inspect balance, float, shortfall and activity pagination. Missing/pruned transaction metadata must remain unknown. Partner reserves and buyer funds are separate.
7. **Collector:** with a collector session, list records, link the intended wallet, upload an approved JPEG, follow recognition and check private photo access, stale revisions and account isolation.
8. **Inventory:** this is a separate API partner integration, billed monthly by invoice. Use its Sandbox Inventory key to inspect candidates, draw an approved fixture with one durable idempotency key, poll its claim and verify claim/billing reports. The Gacha wallet and treasury journey is not a prerequisite. Mutations require the matching server flag.
9. **Partner/supplier:** with the intended owner session, inspect profile, published session, settings and supplier reports. Verify a different owner cannot access or change these resources. Gacha keys are not owner sessions.
10. **Fulfilment:** use approved Live, non-synthetic claims and confirm custody/shipment state with the operator. Sandbox shipment and claims outside the allowlist are refused. Hosted iframe preview and aggregator remain unsupported.
11. **SDK/interface:** pack and install the SDK in an independent project, run its examples, check desktop/mobile and keyboard navigation, errors and export redaction. Never commit credentials, private uploads or signed bytes.

Handover requires the relevant journeys to pass against deployed services. Local tests establish application behavior, not transaction finality or physical fulfilment.
