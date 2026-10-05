import { test } from "node:test";
import assert from "node:assert/strict";
import { readBuyerBalances } from "./balances.js";
const scope = {
  environment: "sandbox" as const,
  partnerId: "p",
  wallet: "11111111111111111111111111111111",
  chain: "devnet",
};
const mint = "11111111111111111111111111111111";
test("balances use configured genesis and actual mint with integer amounts", async () => {
  let observed = "";
  const rpc: any = {
    getGenesisHash: async () => scope.chain,
    getBalance: async () => 1000,
    getParsedAccountInfo: async () => ({
      value: { data: { parsed: { type: "mint", info: { decimals: 6 } } } },
    }),
    getParsedTokenAccountsByOwner: async (_owner: any, filter: any) => {
      observed = filter.mint.toBase58();
      return {
        value: [
          {
            account: {
              data: {
                parsed: {
                  info: {
                    mint,
                    tokenAmount: { amount: "25000000", decimals: 6 },
                  },
                },
              },
            },
          },
          {
            account: {
              data: {
                parsed: {
                  info: {
                    mint,
                    tokenAmount: { amount: "5000000", decimals: 6 },
                  },
                },
              },
            },
          },
        ],
      };
    },
  };
  const result = await readBuyerBalances(
    scope,
    "https://api.devnet.solana.com",
    mint,
    rpc,
  );
  assert.equal(result.tokenUnits, "30000000");
  assert.equal(result.solLamports, "1000");
  assert.equal(observed, mint);
  rpc.getGenesisHash = async () => "mainnet";
  await assert.rejects(
    readBuyerBalances(scope, "https://api.devnet.solana.com", mint, rpc),
    /chain_mismatch/,
  );
});

import { assertPurchaseFunds } from "./balances.js";
test("purchase preflight requires exact selected total and current scope funds", () => {
  const s = {
    environment: "sandbox" as const,
    partnerId: "p",
    chain: "c",
    wallet: "w",
  };
  const b: any = {
    source: "chain",
    chain: "c",
    mint: "m",
    wallet: "w",
    tokenUnits: "49999999",
    solLamports: "1000000",
    decimals: 6,
  };
  assert.throws(
    () => assertPurchaseFunds(b, s, "m", 25, 2),
    /buyer_funds_insufficient/,
  );
  assert.doesNotThrow(() =>
    assertPurchaseFunds({ ...b, tokenUnits: "50000000" }, s, "m", 25, 2),
  );
  assert.throws(
    () =>
      assertPurchaseFunds(
        { ...b, tokenUnits: "50000000", wallet: "other" },
        s,
        "m",
        25,
        2,
      ),
    /balance_scope_invalid/,
  );
});
