import { test } from "node:test";
import assert from "node:assert/strict";
import { createFulfilmentClient } from "./fulfilment.js";
import { resolveFulfilment } from "../../shared/supplier-contract.js";
test("synthetic or sandbox claims never create a physical shipment", async () => {
  let calls = 0;
  const c = createFulfilmentClient(async () => {
    calls++;
  });
  await assert.rejects(
    c.prepare(
      { id: "id", environment: "sandbox", isSynthetic: true },
      {} as any,
    ),
    /synthetic_fulfilment_unavailable/,
  );
  assert.equal(calls, 0);
  assert.throws(
    () =>
      resolveFulfilment(
        "prepare",
        { id: "11111111-1111-4111-8111-111111111111" },
        {
          shipping: {
            name: "N",
            line1: "L",
            city: "C",
            postalCode: "P",
            country: "US",
          },
        },
        "sandbox",
      ),
    /synthetic_fulfilment_unavailable/,
  );
});
