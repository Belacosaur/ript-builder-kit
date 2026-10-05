export type Environment = "sandbox" | "live";
export const operations = [
  "packs",
  "create",
  "read",
  "proof",
  "receipts",
  "payment",
  "submit",
  "sellbackPrepare",
  "sellbackSubmit",
  "keep",
] as const;
export type OperationId = (typeof operations)[number];
export type Params = Record<string, string>;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validWallet(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44)
    return false;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return false;
    number = number * 58n + BigInt(digit);
  }
  let bytes = 0;
  for (let n = number; n > 0n; n >>= 8n) bytes++;
  return bytes + (value.match(/^1*/)?.[0].length ?? 0) === 32;
}
function check(ok: unknown): asserts ok {
  if (!ok) throw new Error("invalid_request");
}
export function resolveOperation(
  operation: string,
  params: Params,
): { method: "GET" | "POST"; path: string } {
  check(operations.includes(operation as OperationId));
  if (operation === "packs") return { method: "GET", path: "/v1/gacha/packs" };
  if (operation === "create")
    return { method: "POST", path: "/v1/gacha/orders" };
  check(/^[0-9a-f]{64}$/.test(params.id ?? ""));
  let path = "/v1/gacha/orders/" + params.id;
  if (["read", "proof", "receipts"].includes(operation)) {
    check(validWallet(params.wallet));
    return {
      method: "GET",
      path:
        path +
        (operation === "read" ? "" : "/" + operation) +
        "?wallet=" +
        encodeURIComponent(params.wallet),
    };
  }
  if (operation === "keep") {
    check(uuid.test(params.skuId ?? ""));
    path += "/cards/" + params.skuId + "/keep";
  } else
    path += (
      {
        payment: "/payment",
        submit: "/submit",
        sellbackPrepare: "/sellback/prepare",
        sellbackSubmit: "/sellback/submit",
      } as Record<string, string>
    )[operation];
  return { method: "POST", path };
}
export function validateBody(
  operation: string,
  input: unknown,
): Record<string, unknown> | undefined {
  if (["packs", "read", "proof", "receipts"].includes(operation)) {
    check(input === undefined || input === null);
    return undefined;
  }
  check(input && typeof input === "object" && !Array.isArray(input));
  const b = input as Record<string, unknown>;
  check(validWallet(b.wallet));
  let allowed = ["wallet"];
  if (operation === "create") {
    allowed.push(
      "partner_id",
      "packId",
      "quantity",
      "clientNonce",
      "preparePayment",
    );
    check(typeof b.partner_id === "string" && uuid.test(b.partner_id));
    check(
      typeof b.packId === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(b.packId),
    );
    check(
      Number.isInteger(b.quantity) &&
        Number(b.quantity) >= 1 &&
        Number(b.quantity) <= 10,
    );
    check(
      typeof b.clientNonce === "string" &&
        /^[A-Za-z0-9_-]{16,128}$/.test(b.clientNonce),
    );
    check(
      b.preparePayment === undefined || typeof b.preparePayment === "boolean",
    );
  }
  if (operation === "submit" || operation === "sellbackSubmit") {
    allowed.push("intentId", "transaction");
    check(typeof b.intentId === "string" && uuid.test(b.intentId));
    check(
      typeof b.transaction === "string" &&
        b.transaction.length > 0 &&
        b.transaction.length <= 2000 &&
        /^[A-Za-z0-9+/]+=*$/.test(b.transaction),
    );
  }
  if (operation === "sellbackPrepare") {
    allowed.push("skuIds");
    check(
      Array.isArray(b.skuIds) &&
        b.skuIds.length >= 1 &&
        b.skuIds.length <= 10 &&
        new Set(b.skuIds).size === b.skuIds.length &&
        b.skuIds.every((v) => typeof v === "string" && uuid.test(v)),
    );
  }
  check(Object.keys(b).every((k) => allowed.includes(k)));
  return b;
}
