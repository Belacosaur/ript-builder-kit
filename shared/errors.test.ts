import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, normalizeError } from "./errors.js";
test("uncertain transport and timeouts retry but wallet rejection does not", () => {
  for (const e of [
    new TypeError("fetch failed"),
    new DOMException("timeout", "TimeoutError"),
  ]) {
    const a = normalizeError(e, true);
    assert.ok(a instanceof ApiError);
    assert.equal(a.retryable, true);
    assert.equal(a.uncertain, true);
  }
  assert.equal(
    normalizeError(new Error("User rejected"), true).retryable,
    false,
  );
});
