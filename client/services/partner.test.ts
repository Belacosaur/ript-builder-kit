import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePartner } from "../../shared/partner-contract.js";
import { createPartnerClient } from "./partner.js";
test("public partner session uses exact namespace; draft preview remains read-only", async () => {
  const r = resolvePartner(
    "session",
    { vendor: "shop", door: "iframe", parentOrigin: "http://127.0.0.1:4315" },
    undefined,
    "sandbox",
  );
  assert.ok(r.path.startsWith("/sandbox/opening/partner-session"));
  assert.equal(r.auth, "public");
  assert.throws(() =>
    resolvePartner(
      "session",
      { vendor: "shop", environment: "live" },
      undefined,
      "sandbox",
    ),
  );
  const c = createPartnerClient(async () => ({ readOnly: true }));
  assert.equal((await c.preview("shop", "sandbox")).readOnly, true);
});
import { iframePreviewUrl } from "./partner.js";
test("iframe requires an accepted origin and exact published session binding", () => {
  assert.throws(
    () =>
      iframePreviewUrl(
        { slug: "shop", door: "packs", environment: "sandbox" },
        "http://localhost:4315",
      ),
    /iframe_session_required/,
  );
  assert.throws(
    () =>
      iframePreviewUrl(
        { slug: "shop", door: "iframe", environment: "sandbox" },
        "https://evil.example",
      ),
    /iframe_origin_unverified/,
  );
});

test("hosted iframe is blocked without a documented read-only sandbox capability", () => {
  assert.throws(
    () =>
      iframePreviewUrl(
        { slug: "shop", door: "iframe", environment: "sandbox" },
        "http://localhost:4315",
        "http://localhost:4315",
      ),
    /embedded_readonly_capability_unavailable/,
  );
});
