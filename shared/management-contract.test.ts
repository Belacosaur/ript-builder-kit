import { test } from "node:test";
import assert from "node:assert/strict";
const module = await import("./management-contract.js").catch(() => null);
test("owner operations use actual environment-qualified routes and never accept a partner selector", () => {
  assert.ok(module, "management contract missing");
  const r = module.resolveManagement(
    "credentialsList",
    {},
    undefined,
    "sandbox",
  );
  assert.equal(r.path, "/program/me/credentials?environment=sandbox");
  assert.equal(r.auth, "partner-session");
  assert.equal(
    module.resolveManagement(
      "packsConfigure",
      {},
      { packIds: ["pack"], pricesCents: { pack: 2500 } },
      "live",
    ).method,
    "PUT",
  );
  assert.throws(() =>
    module.resolveManagement(
      "credentialsList",
      { partnerId: "other" },
      undefined,
      "sandbox",
    ),
  );
  assert.throws(() =>
    module.resolveManagement(
      "packsConfigure",
      {},
      { packIds: ["pack"], pricesCents: { pack: 0 } },
      "sandbox",
    ),
  );
});
