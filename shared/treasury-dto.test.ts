import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTreasurySnapshot } from "./treasury-dto.js";
const address = "11111111111111111111111111111111";
const scope = {
  environment: "sandbox",
  partnerId: "11111111-1111-4111-8111-111111111111",
  chain: "genesis",
};
const base = {
  ...scope,
  mint: address,
  commitment: "finalized",
  observedAt: "2026-10-05T00:00:00Z",
  status: "observed",
  vault: address,
  tokenAccount: address,
  decimals: 6,
  balanceUnits: "600000000",
  requiredFloatUnits: "500000000",
  shortfallUnits: "0",
  packHealth: [
    {
      packId: "pack",
      requiredFloatUnits: "500000000",
      shortfallUnits: "0",
      enabled: true,
      ready: true,
    },
  ],
  reasons: [],
};
test("unknown treasury funds reject ready packs and missing or fabricated monetary fields", () => {
  for (const status of ["unavailable", "not-provisioned"]) {
    assert.throws(() =>
      validateTreasurySnapshot({ ...base, status, balanceUnits: null }, scope),
    );
    assert.throws(() =>
      validateTreasurySnapshot(
        {
          ...base,
          status,
          balanceUnits: null,
          packHealth: [],
          requiredFloatUnits: undefined,
          shortfallUnits: null,
        },
        scope,
      ),
    );
    assert.equal(
      validateTreasurySnapshot(
        {
          ...base,
          status,
          balanceUnits: null,
          requiredFloatUnits: null,
          shortfallUnits: null,
          packHealth: [],
        },
        scope,
      ).status,
      status,
    );
  }
});
