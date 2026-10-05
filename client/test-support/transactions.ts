import {
  Keypair,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
// Isolated fixture signers. Never broadcast; never use existing wallet secrets.
export function transactionFixture(version: "legacy" | "v0") {
  const buyer = Keypair.generate(),
    partner = Keypair.generate();
  const blockhash = Keypair.generate().publicKey.toBase58();
  const instructions = [
    SystemProgram.transfer({
      fromPubkey: buyer.publicKey,
      toPubkey: partner.publicKey,
      lamports: 1,
    }),
    SystemProgram.transfer({
      fromPubkey: partner.publicKey,
      toPubkey: buyer.publicKey,
      lamports: 1,
    }),
  ];
  let tx: Transaction | VersionedTransaction;
  if (version === "legacy") {
    tx = new Transaction({
      feePayer: partner.publicKey,
      recentBlockhash: blockhash,
    }).add(...instructions);
    tx.partialSign(partner);
  } else {
    tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: partner.publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message(),
    );
    tx.sign([partner]);
  }
  const unsigned = Buffer.from(
    tx instanceof Transaction
      ? tx.serialize({ requireAllSignatures: false, verifySignatures: false })
      : tx.serialize(),
  ).toString("base64");
  return { buyer, partner, unsigned };
}
