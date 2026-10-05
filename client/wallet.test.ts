import { test } from "node:test";
import assert from "node:assert/strict";
import { ComputeBudgetProgram, Keypair, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";
import { signQuote } from "./wallet.js";
import type { Scope } from "./recovery.js";
const key = Keypair.generate();
const scope: Scope = {
  environment: "sandbox",
  partnerId: "p",
  wallet: key.publicKey.toBase58(),
  chain: "genesis",
};
const tx = new Transaction({
  feePayer: key.publicKey,
  recentBlockhash: Keypair.generate().publicKey.toBase58(),
}).add(
  SystemProgram.transfer({
    fromPubkey: key.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1,
  }),
);
const quote = tx.serialize({ requireAllSignatures: false }).toString("base64");
test("wrong genesis prevents wallet prompt", async () => {
  let signed = false;
  await assert.rejects(
    () =>
      signQuote(
        quote,
        scope,
        () => scope,
        {
          publicKey: key.publicKey,
          signTransaction: async (t) => {
            signed = true;
            return t;
          },
        },
        { getGenesisHash: async () => "wrong" },
      ),
    /chain_mismatch/,
  );
  assert.equal(signed, false);
});
test("scope change during wallet prompt prevents accepting signed bytes", async () => {
  let current = scope;
  await assert.rejects(
    () =>
      signQuote(
        quote,
        scope,
        () => current,
        {
          publicKey: key.publicKey,
          signTransaction: async (t) => {
            current = { ...scope, environment: "live" };
            return t;
          },
        },
        { getGenesisHash: async () => "genesis" },
      ),
    /scope_changed/,
  );
});
test('wallet transaction from another SDK instance is normalized before inspection',async()=>{
 const result=await signQuote(quote,scope,()=>scope,{publicKey:key.publicKey,signTransaction:async(t)=>{(t as VersionedTransaction).sign([key]);return {serialize:(options:any)=>(t as VersionedTransaction).serialize(),serializeMessage:()=>(t as VersionedTransaction).message.serialize()} as any;}},{getGenesisHash:async()=>scope.chain});
 assert.ok(Transaction.from(Buffer.from(result,'base64')).signatures[0].signature);
});
test('wallet receives the exact original compiled message for a legacy quote',async()=>{
 const original=VersionedTransaction.deserialize(Buffer.from(quote,'base64')).message.serialize();
 const result=await signQuote(quote,scope,()=>scope,{publicKey:key.publicKey,signTransaction:async(t)=>{assert.ok(t instanceof VersionedTransaction);assert.deepEqual(t.message.serialize(),original);t.sign([key]);return t;}},{getGenesisHash:async()=>scope.chain});
 assert.deepEqual(VersionedTransaction.deserialize(Buffer.from(result,'base64')).message.serialize(),original);
});
test('supported leading wallet priority fee preserves buyer consent',async()=>{const result=await signQuote(quote,scope,()=>scope,{publicKey:key.publicKey,signTransaction:async(t)=>{const legacy=Transaction.from(t.serialize());legacy.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}));legacy.partialSign(key);return legacy;}},{getGenesisHash:async()=>scope.chain});assert.ok(result);});
test('wallet cannot change the purchase amount',async()=>{await assert.rejects(signQuote(quote,scope,()=>scope,{publicKey:key.publicKey,signTransaction:async(t)=>{const legacy=Transaction.from(t.serialize());legacy.instructions[0].data[4]^=1;legacy.partialSign(key);return legacy;}},{getGenesisHash:async()=>scope.chain}),/wallet_changed_transaction/);});
