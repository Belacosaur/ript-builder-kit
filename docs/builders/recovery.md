# Recover uncertain operations

The SDK retries transient reads only (default two retries) and bounds each request with a 15-second timeout. Request methods accept `{signal,retries}`; mutations always have zero automatic retries. `RiptError` exposes sanitized `code`, `status`, `retryable`, `uncertain` and `retryAfterMs`. An uncertain mutation outcome requires reconciliation before a new operation.

Persist the original Gacha `clientNonce`, order ID, intent ID and signed transaction bytes before submission. Keep the same order on retry; never create another opening because submission timed out. Inventory draw/pack operations require a caller-supplied durable `Idempotency-Key`; persist both identity and payload. Testing grants retain their original request ID. Abort or timeout does not prove an upstream mutation was cancelled.

Wallet signing stays outside the core SDK. Validate the returned quote, chain, mint, recipient, amount, order and allowed instructions before requesting a wallet signature. Existing reference controllers implement these checks and recovery. Keep, sellback, physical shipment and owner changes need deliberate user authorization. Scope all saved state by environment, partner, wallet and actual chain; discard pending display observations on any context change.
