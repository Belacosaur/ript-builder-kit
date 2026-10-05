import { Connection, PublicKey } from "@solana/web3.js";
import type { Scope } from "./recovery.js";
export type BuyerBalances = {
  source: "chain";
  chain: string;
  mint: string;
  wallet: string;
  solLamports: string;
  tokenUnits: string;
  decimals: number;
  observedAt: string;
};
export async function readBuyerBalances(
  scope: Scope,
  rpcUrl: string,
  mint: string,
  rpc: Pick<
    Connection,
    | "getGenesisHash"
    | "getBalance"
    | "getParsedAccountInfo"
    | "getParsedTokenAccountsByOwner"
  > = new Connection(rpcUrl, "finalized"),
): Promise<BuyerBalances> {
  if (new URL(rpcUrl).protocol !== "https:")
    throw new Error("rpc_requires_https");
  if ((await rpc.getGenesisHash()) !== scope.chain)
    throw new Error("chain_mismatch");
  const owner = new PublicKey(scope.wallet),
    token = new PublicKey(mint);
  const [lamports, info, accounts] = await Promise.all([
    rpc.getBalance(owner, "finalized"),
    rpc.getParsedAccountInfo(token, "finalized"),
    rpc.getParsedTokenAccountsByOwner(owner, { mint: token }, "finalized"),
  ]);
  if (!Number.isSafeInteger(lamports) || lamports < 0)
    throw new Error("balance_invalid");
  const data: any = info.value?.data,
    decimals = data?.parsed?.info?.decimals;
  if (
    data?.parsed?.type !== "mint" ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18
  )
    throw new Error("mint_metadata_invalid");
  let total = 0n;
  for (const a of accounts.value) {
    const parsed: any = a.account.data;
    const v = parsed?.parsed?.info;
    if (
      v?.mint !== mint ||
      v.tokenAmount?.decimals !== decimals ||
      !/^\d+$/.test(v.tokenAmount?.amount ?? "")
    )
      throw new Error("token_account_invalid");
    total += BigInt(v.tokenAmount.amount);
  }
  return {
    source: "chain",
    chain: scope.chain,
    mint,
    wallet: scope.wallet,
    solLamports: String(lamports),
    tokenUnits: total.toString(),
    decimals,
    observedAt: new Date().toISOString(),
  };
}

export function assertPurchaseFunds(
  b: BuyerBalances,
  scope: Scope,
  mint: string,
  priceUsd: number,
  quantity: number,
) {
  if (
    b.source !== "chain" ||
    b.chain !== scope.chain ||
    b.wallet !== scope.wallet ||
    b.mint !== mint ||
    b.decimals !== 6
  )
    throw new Error("balance_scope_invalid");
  const cents = Math.round(priceUsd * 100);
  if (
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    Math.abs(cents - priceUsd * 100) > 0.000001 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10
  )
    throw new Error("pack_price_invalid");
  if (
    BigInt(b.tokenUnits) < BigInt(cents) * 10000n * BigInt(quantity) ||
    BigInt(b.solLamports) <= 0n
  )
    throw new Error("buyer_funds_insufficient");
}
