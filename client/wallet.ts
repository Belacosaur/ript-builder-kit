import {onlyWalletFeeAdditions,onlyVersionedWalletFeeAdditions} from './payment-policy.js';
import { Transaction, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { sameScope, type Scope } from "./recovery.js";
export type Wallet = {
  publicKey: PublicKey | null;
  connect?: () => Promise<unknown>;
  signTransaction: (
    tx: Transaction | VersionedTransaction,
  ) => Promise<Transaction | VersionedTransaction>;
  signMessage?: (bytes:Uint8Array)=>Promise<Uint8Array|{signature:Uint8Array}>;
  on?: (event: string, handler: () => void) => void;
};
function bytes(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function base64(value: Uint8Array) {
  return btoa(Array.from(value, (c) => String.fromCharCode(c)).join(""));
}
export async function signQuote(
  transaction: string,
  startScope: Scope,
  getCurrentScope: () => Scope,
  wallet: Wallet,
  rpc: { getGenesisHash: () => Promise<string> },
): Promise<string> {
  const check = () => {
    if (
      !sameScope(startScope, getCurrentScope()) ||
      wallet.publicKey?.toBase58() !== startScope.wallet
    )
      throw new Error("scope_changed");
  };
  check();
  if ((await rpc.getGenesisHash()) !== startScope.chain)
    throw new Error("chain_mismatch");
  check();
  let tx: Transaction | VersionedTransaction;
  // Preserve the exact compiled message, including legacy account ordering.
  // Rebuilding a legacy Transaction can reorder accounts across wallet SDKs.
  tx = VersionedTransaction.deserialize(bytes(transaction));
  const before =
    tx instanceof Transaction ? tx.serializeMessage() : tx.message.serialize();
  const returned = await wallet.signTransaction(tx);
  // Injected wallets may use another SDK copy, so instanceof is not reliable
  // until their wire bytes have been decoded with our own constructors.
  if (!returned || typeof returned.serialize !== 'function')
    throw new Error('wallet_returned_invalid_transaction');
  let signed: Transaction | VersionedTransaction;
  try {
    const raw = returned.serialize({requireAllSignatures:false,verifySignatures:false});
    signed = tx instanceof Transaction
      ? Transaction.from(raw)
      : VersionedTransaction.deserialize(raw);
  } catch {
    throw new Error('wallet_returned_invalid_transaction');
  }
  check();
  const after =
    signed instanceof Transaction
      ? signed.serializeMessage()
      : signed.message.serialize();
  const equivalent = base64(before) === base64(after) ||
    (signed instanceof VersionedTransaction && signed.message.version === 'legacy'
      ? onlyWalletFeeAdditions(Transaction.from(signed.serialize()), base64(before))
      : signed instanceof VersionedTransaction
        ? onlyVersionedWalletFeeAdditions(signed,base64(before))
        : onlyWalletFeeAdditions(signed,base64(before)));
  if (!equivalent)
    throw new Error("wallet_changed_transaction");
  const signature =
    signed instanceof Transaction
      ? signed.signatures.find(
          (s) => s.publicKey.toBase58() === startScope.wallet,
        )?.signature
      : signed.signatures[
          signed.message.staticAccountKeys.findIndex(
            (k) => k.toBase58() === startScope.wallet,
          )
        ];
  if (!signature || signature.every((v) => v === 0))
    throw new Error("wallet_signature_missing");
  const encoded = base64(
    signed instanceof Transaction
      ? signed.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
      : signed.serialize(),
  );
  await validateSignedQuote(encoded,encoded,startScope);
  return encoded;
}
export async function validateSignedQuote(
  transaction: string,
  unsigned: string,
  scope: Scope,
) {
  const decode = (value: string) => {
    try {
      return Transaction.from(bytes(value));
    } catch {
      return VersionedTransaction.deserialize(bytes(value));
    }
  };
  const tx = decode(transaction),
    quote = decode(unsigned);
  const message = (t: Transaction | VersionedTransaction) =>
    t instanceof Transaction ? t.serializeMessage() : t.message.serialize();
  if (base64(message(tx)) !== base64(message(quote)))
    throw new Error("signed_message_mismatch");
  const signature =
    tx instanceof Transaction
      ? tx.signatures.find((s) => s.publicKey.toBase58() === scope.wallet)
          ?.signature
      : tx.signatures[
          tx.message.staticAccountKeys
            .slice(0, tx.message.header.numRequiredSignatures)
            .findIndex((k) => k.toBase58() === scope.wallet)
        ];
  if (!signature || signature.every((v) => v === 0))
    throw new Error("wallet_signature_missing");
  if (tx instanceof Transaction) {
    if (!tx.verifySignatures(false))
      throw new Error("wallet_signature_invalid");
  } else {
    const pubkey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(new PublicKey(scope.wallet).toBytes()).buffer,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        "Ed25519",
        pubkey,
        new Uint8Array(signature).buffer,
        new Uint8Array(message(tx)).buffer,
      ))
    )
      throw new Error("wallet_signature_invalid");
  }
}
