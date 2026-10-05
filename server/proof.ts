import { createHash } from "node:crypto";
import type { GachaOrder } from "../shared/dto.js";
export function manifestHash(m: any) {
  if (
    ![1, 2].includes(m?.version) ||
    !Array.isArray(m.candidates) ||
    m.candidates.length > 10000 ||
    !Number.isInteger(m.quantity) ||
    m.quantity < 1 ||
    m.quantity > 10 ||
    !/^([1-9][0-9]*)$/.test(m.amount) ||
    BigInt(m.amount) > 18446744073709551615n ||
    !/^[a-f0-9]{64}$/.test(m.vrfAuthority) ||
    !Array.isArray(m.weights) ||
    m.weights.length !== 4 ||
    !m.weights.every(
      (w: any) => Number.isSafeInteger(w) && w >= 0 && w <= 10000,
    ) ||
    !m.weights.some((w: number) => w > 0)
  )
    throw new Error("invalid_manifest");
  const ids = new Set(),
    sources = new Set();
  const candidates = m.candidates
    .slice()
    .sort((a: any, b: any) =>
      a.skuId < b.skuId ? -1 : a.skuId > b.skuId ? 1 : 0,
    )
    .map((c: any) => {
      if (ids.has(c.skuId) || sources.has(c.sourceRef))
        throw new Error("duplicate_inventory_item");
      ids.add(c.skuId);
      sources.add(c.sourceRef);
      if (
        !Number.isInteger(c.band) ||
        c.band < 0 ||
        c.band > 3 ||
        !Number.isSafeInteger(c.insuredCents) ||
        !Number.isSafeInteger(c.buybackCents) ||
        c.buybackCents < 0 ||
        c.buybackCents > c.insuredCents
      )
        throw new Error("invalid_manifest");
      const base = [
        c.skuId,
        c.sourceRef,
        c.band,
        c.title,
        c.imageUrl,
        c.insuredCents,
        c.buybackCents,
      ];
      const s = c.supplier;
      if (s)
        base.push([
          s.ownerPartnerId,
          s.physicalIdentity,
          s.marketCents,
          s.supplierPayoutBps,
          s.supplierExitCents,
          s.riptTakeBps,
          s.riptMinFeeCents,
          s.frozenRiptFeeCents,
          s.pullFeeShareCents,
        ]);
      return base;
    });
  if (
    m.candidates.filter((c: any) => m.weights[c.band] > 0).length < m.quantity
  )
    throw new Error("insufficient_inventory");
  const fields: any[] = [
    "ript-opening-v2-manifest",
    m.version,
    m.chain,
    m.program,
    m.orderId,
    m.wallet,
    m.clientNonce,
    m.packId,
    m.packVersion,
    m.quantity,
    m.token,
    m.recipient,
    m.amount,
    m.expiresAt,
    m.vrfAuthority,
    m.weights,
    candidates,
  ];
  if (m.partner) {
    const p = m.partner;
    fields.push([
      "gacha-partner-v1",
      p.partnerId,
      p.environment,
      p.door,
      p.treasuryId,
      p.treasuryVault,
      p.gate,
      p.highestWinCents,
    ]);
  }
  return createHash("sha256")
    .update(JSON.stringify(fields), "utf8")
    .digest("hex");
}
export function verifyProofBindings(proof: any, order: GachaOrder) {
  const result = {
    retrieved: !!proof?.manifest && typeof proof?.proof === "string",
    bindingsVerified: false,
    cryptographyVerified: false,
    reasons: ["independent-ecvrf-verifier-unavailable"],
  };
  try {
    const m = proof.manifest;
    const fields: [[string, string], ...Array<[string, string]>] = [
      ["orderId", "id"],
      ["wallet", "wallet"],
      ["chain", "chain"],
      ["packId", "packId"],
      ["clientNonce", "clientNonce"],
      ["quantity", "quantity"],
      ["amount", "amount"],
    ];
    if (
      fields.some(([a, b]) => m[a] !== order[b]) ||
      m.token !== (order.mint ?? order.token) ||
      (order.partnerId &&
        (m.partner?.partnerId !== order.partnerId ||
          m.partner.environment !== order.environment)) ||
      manifestHash(m) !== proof.manifestHash
    )
      throw new Error();
    result.bindingsVerified = true;
  } catch {
    result.reasons.push("manifest-or-order-binding-invalid");
  }
  return result;
}
