// JSON Schema metadata for the supported SDK contract. Runtime validators remain authoritative.
export type Schema = Record<string, any>;
export const text = (maxLength = 128, minLength = 1): Schema => ({
  type: "string",
  minLength,
  maxLength,
});
export const int = (
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): Schema => ({ type: "integer", minimum, maximum });
export const enumeration = (...values: string[]): Schema => ({
  type: "string",
  enum: values,
});
export const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const uuid: Schema = {
  type: "string",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
};
export const wallet: Schema = {
  ...text(44, 32),
  pattern: "^[1-9A-HJ-NP-Za-km-z]{32,44}$",
  description:
    "Base58 encoding of exactly 32 bytes; SDK also verifies decoded length.",
};
const hash: Schema = { type: "string", pattern: "^[a-f0-9]{64}$" },
  signature: Schema = {
    type: "string",
    pattern: "^[1-9A-HJ-NP-Za-km-z]{64,88}$",
  },
  base64: Schema = { ...text(2000), pattern: "^[A-Za-z0-9+/]+=*$" },
  packId: Schema = {
    type: "string",
    pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
  };
const ids = (maxItems: number, minItems = 1) => ({
  type: "array",
  items: uuid,
  minItems,
  maxItems,
  uniqueItems: true,
});
const positive = (maximum: number) => ({
  type: "number",
  exclusiveMinimum: 0,
  maximum,
});
const bands = Object.fromEntries(
  ["common", "uncommon", "rare", "epic"].map((k) => [
    k,
    object({ minCents: int(0, 10000000), maxCents: int(0, 10000000) }),
  ]),
);
export function requestSchema(service: string, op: string): Schema | undefined {
  if (service === "gacha") {
    if (["packs", "read", "proof", "receipts"].includes(op)) return;
    const p: Record<string, Schema> = { wallet };
    let required = ["wallet"];
    if (op === "create") {
      Object.assign(p, {
        partner_id: uuid,
        packId,
        quantity: int(1, 10),
        clientNonce: { ...text(128, 16), pattern: "^[A-Za-z0-9_-]{16,128}$" },
        preparePayment: { type: "boolean" },
      });
      required.push("partner_id", "packId", "quantity", "clientNonce");
    }
    if (["submit", "sellbackSubmit"].includes(op)) {
      Object.assign(p, { intentId: uuid, transaction: base64 });
      required.push("intentId", "transaction");
    }
    if (op === "sellbackPrepare") {
      p.skuIds = ids(10);
      required.push("skuIds");
    }
    return object(p, required);
  }
  if (service === "testing" && ["wallet-funds", "treasury-refill"].includes(op))
    return object({
      requestId: { ...text(128, 8), pattern: "^[A-Za-z0-9_-]{8,128}$" },
      ...(op === "wallet-funds" ? { wallet } : {}),
    });
  if (service === "management") {
    if (op === "credentialsIssue") return object({ label: text(120) }, []);
    if (op === "packsConfigure")
      return object(
        {
          packIds: { type: "array", items: packId, maxItems: 100 },
          pricesCents: {
            type: "object",
            propertyNames: packId,
            additionalProperties: int(1),
          },
        },
        ["packIds"],
      );
    if (op === "fundPrepare")
      return object({ wallet, amountUsdc: positive(1000000) });
    return;
  }
  if (service === "collector") {
    const revision = int(1),
      sha256 = hash,
      bytes = int(4, 25 * 1024 * 1024);
    const schemas: Record<string, Schema> = {
      challenge: object({ pubkey: wallet }),
      verify: object({
        pubkey: wallet,
        signature: { ...base64, maxLength: 128 },
        message: text(1024),
      }),
      sync: object(
        {
          captureId: text(180),
          revision,
          frontSha256: hash,
          backSha256: { anyOf: [hash, { type: "null" }] },
          scanFormat: enumeration("raw", "slab"),
        },
        ["captureId", "revision", "frontSha256", "scanFormat"],
      ),
      resolve: object(
        {
          productId: text(64),
          metadataVersion: int(),
          grade: {
            type: "string",
            pattern: "^(psa|cgc|bgs|sgc)_(10|[1-9](?:\\.5)?)$",
          },
        },
        ["productId", "metadataVersion"],
      ),
      submit: object({ revision, confirmed: { const: true } }),
      photoPresign: object({ revision, sha256, bytes }),
      photoComplete: object({ revision, sha256, bytes }, [
        "revision",
        "sha256",
      ]),
      retry: object({}),
    };
    return schemas[op];
  }
  if (service === "inventory") {
    if (["draw", "pack"].includes(op)) {
      const p: Record<string, Schema> = {
        partnerPullRef: text(128),
        playerId: text(128),
        promoSessionId: uuid,
        feePolicy: enumeration("promo_only", "normal"),
        ...(op === "draw"
          ? { skuId: uuid }
          : {
              skuIds: ids(500),
              count: int(1, 500),
              rarityBand: enumeration("common", "uncommon", "rare", "epic"),
            }),
      };
      const result = object(
        p,
        op === "draw" ? ["partnerPullRef", "skuId"] : ["partnerPullRef"],
      );
      if (op === "pack")
        result.anyOf = [{ required: ["skuIds"] }, { required: ["count"] }];
      result.dependentRequired = {
        promoSessionId: ["playerId"],
        feePolicy: ["playerId", "promoSessionId"],
      };
      return result;
    }
    if (op === "skuStatus") return object({ skuIds: ids(200) });
    if (op === "buyback") return object({ receiptSig: text(128, 16) }, []);
    if (op === "preview")
      return {
        ...object(
          {
            packPriceUsd: positive(2000),
            targetEvUsd: positive(5000),
            finish: enumeration("raw", "graded", "cert", "both"),
            skuMode: enumeration("cert", "raw", "both"),
            poolSize: int(4, 2000),
            backupPct: { type: "number", minimum: 0, maximum: 200 },
            inFlightOpens: int(0, 2000),
            environment: enumeration("sandbox", "live"),
            weights: object(
              Object.fromEntries(
                Object.keys(bands).map((k) => [
                  k,
                  { type: "number", minimum: 0, maximum: 100 },
                ]),
              ),
              [],
            ),
            bands: object(bands, []),
          },
          ["packPriceUsd", "targetEvUsd"],
        ),
        description:
          "minCents <= maxCents within each band; environment, if supplied, must match the client.",
      };
    return;
  }
  if (service === "supplier" && op === "lookup")
    return object(
      {
        certNumber: text(64),
        grader: text(16),
        imageUrl: { ...text(2000), pattern: "^https:" },
        query: text(300),
        productId: text(64),
        rarityBand: enumeration("common", "uncommon", "rare", "epic"),
        hostStudio: { type: "boolean" },
      },
      [],
    );
  if (service === "fulfilment" && op === "prepare")
    return object(
      {
        receiptSig: text(128, 16),
        shipping: object(
          {
            name: text(200),
            line1: text(200),
            line2: text(200, 0),
            city: text(100),
            region: text(100, 0),
            postalCode: text(32),
            country: { type: "string", pattern: "^[A-Z]{2}$" },
            phone: text(40),
            email: text(320),
          },
          ["name", "line1", "city", "postalCode", "country"],
        ),
      },
      ["shipping"],
    );
}
export function querySchemas(
  service: string,
  op: string,
): Record<string, Schema> {
  if (service === "treasury" && op === "activity")
    return { limit: int(1, 50), before: signature };
  if (service === "partner") {
    const p: Record<string, Schema> = {
      environment: enumeration("sandbox", "live"),
    };
    if (["session", "preview"].includes(op))
      p.vendor = text(64, op === "preview" ? 2 : 1);
    if (op === "session")
      Object.assign(p, {
        door: enumeration("packs", "iframe"),
        parentOrigin: {
          ...text(500),
          description:
            "HTTPS origin, or HTTP localhost origin. Required for iframe door.",
        },
      });
    return p;
  }
  if (service === "management")
    return { environment: enumeration("sandbox", "live") };
  if (service === "gacha" && ["read", "proof", "receipts"].includes(op))
    return { wallet };
  if (service === "collector") {
    if (op === "collection")
      return {
        limit: int(1, 100),
        offset: int(),
        includeDeleted: { const: "1" },
        since: { type: "string", format: "date-time" },
      };
    if (op === "catalog") return { q: text(100, 3) };
    if (op === "photo") return { original: { const: "1" } };
  }
  if (service === "supplier" && op === "skus")
    return { paged: { const: "1" }, cursor: uuid };
  if (service === "inventory") {
    if (op === "catalog")
      return {
        limit: int(1, 500),
        cursor: uuid,
        rarityBand: enumeration("common", "uncommon", "rare", "epic"),
        minMarketCents: int(),
        maxMarketCents: int(),
      };
    if (op.startsWith("report")) {
      const p: Record<string, Schema> = {
        limit: int(1, 100),
        cursor: text(2048),
        from: { type: "string", format: "date-time" },
        to: { type: "string", format: "date-time" },
      };
      if (op === "reportOperations")
        Object.assign(p, {
          state: enumeration("pending", "submitted", "committed", "failed"),
          kind: enumeration("assign", "release", "fulfill"),
        });
      else {
        p.playerId = text(128);
        if (op !== "reportPacks")
          Object.assign(p, {
            status: enumeration(
              "open",
              "buyback_pending",
              "buyback",
              "fulfill_pending",
              "fulfilled",
              "expired",
            ),
            promoSessionId: uuid,
          });
      }
      if (op === "reportExport") {
        delete p.limit;
        delete p.cursor;
        p.format = enumeration("json", "csv");
      }
      return p;
    }
  }
  return {};
}
const nullableUnits = { type: ["string", "null"], pattern: "^\\d+$" },
  units = { type: "string", pattern: "^\\d+$" },
  nullableAddress = { anyOf: [wallet, { type: "null" }] };
export const responseSchemas: Record<string, Schema> = {
  Error: {
    type: "object",
    properties: { error: text(128), uncertain: { type: "boolean" } },
    required: ["error"],
    additionalProperties: true,
  },
  TreasurySnapshot: object({
    environment: enumeration("sandbox", "live"),
    partnerId: uuid,
    chain: text(128),
    mint: wallet,
    observedAt: { type: "string", format: "date-time" },
    commitment: { const: "finalized" },
    status: enumeration("observed", "not-provisioned", "unavailable"),
    vault: nullableAddress,
    tokenAccount: nullableAddress,
    balanceUnits: nullableUnits,
    decimals: { const: 6 },
    requiredFloatUnits: nullableUnits,
    shortfallUnits: nullableUnits,
    packHealth: {
      type: "array",
      items: object({
        packId: text(),
        requiredFloatUnits: units,
        shortfallUnits: units,
        enabled: { type: "boolean" },
        ready: { type: "boolean" },
      }),
    },
    reasons: { type: "array", items: text(200) },
  }),
  TreasuryActivityPage: object({
    environment: enumeration("sandbox", "live"),
    partnerId: uuid,
    chain: text(128),
    mint: wallet,
    tokenAccount: nullableAddress,
    source: { const: "finalized-chain-observations" },
    items: {
      type: "array",
      maxItems: 50,
      items: object(
        {
          signature,
          slot: int(),
          blockTime: { type: ["integer", "null"] },
          status: enumeration("observed", "unavailable", "failed"),
          deltaUnits: { type: ["string", "null"], pattern: "^-?\\d+$" },
          reason: text(200),
        },
        ["signature", "slot", "blockTime", "status", "deltaUnits"],
      ),
    },
    nextCursor: { anyOf: [signature, { type: "null" }] },
    historyComplete: { const: false },
  }),
};

responseSchemas.TreasurySnapshot.allOf = [
  {
    if: {
      properties: { status: { enum: ["unavailable", "not-provisioned"] } },
      required: ["status"],
    },
    then: {
      properties: {
        balanceUnits: { type: "null" },
        requiredFloatUnits: { type: "null" },
        shortfallUnits: { type: "null" },
        packHealth: { maxItems: 0 },
      },
    },
  },
  {
    if: { properties: { status: { const: "observed" } }, required: ["status"] },
    then: {
      properties: {
        balanceUnits: units,
        requiredFloatUnits: units,
        shortfallUnits: units,
        vault: wallet,
        tokenAccount: wallet,
      },
    },
  },
];
