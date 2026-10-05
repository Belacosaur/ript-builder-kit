import {Buffer} from 'buffer';
import {ComputeBudgetProgram,Message,MessageV0,Transaction,VersionedTransaction} from '@solana/web3.js';
// Mirrors the partner backend payment validator; keep both policies aligned.
export function onlyVersionedWalletFeeAdditions(tx:VersionedTransaction,expected:string) {
 if(tx.message.version!==0)return false;
 const original=MessageV0.deserialize(Buffer.from(expected,'base64')),actual=tx.message;
 if(actual.recentBlockhash!==original.recentBlockhash||JSON.stringify(actual.header)!==JSON.stringify(original.header)
  ||JSON.stringify(actual.staticAccountKeys.map(k=>k.toBase58()))!==JSON.stringify(original.staticAccountKeys.map(k=>k.toBase58()))
  ||JSON.stringify(actual.addressTableLookups)!==JSON.stringify(original.addressTableLookups))return false;
 const kinds=new Set<number>();let purchaseStarted=false;
 for(const ix of actual.compiledInstructions){
  if(!actual.staticAccountKeys[ix.programIdIndex]?.equals(ComputeBudgetProgram.programId)){purchaseStarted=true;continue;}
  const data=Buffer.from(ix.data),kind=data[0];if(purchaseStarted||ix.accountKeyIndexes.length||kinds.has(kind))return false;
  if(kind===2){if(data.length!==5||data.readUInt32LE(1)===0||data.readUInt32LE(1)>1_400_000)return false;}
  else if(kind!==3||data.length!==9)return false;kinds.add(kind);
 }
 const purchase=(message:MessageV0)=>message.compiledInstructions.filter(ix=>!message.staticAccountKeys[ix.programIdIndex]?.equals(ComputeBudgetProgram.programId)).map(ix=>({program:ix.programIdIndex,accounts:ix.accountKeyIndexes,data:Buffer.from(ix.data).toString('hex')}));
 return kinds.size>0&&JSON.stringify(purchase(actual))===JSON.stringify(purchase(original));
}

export function onlyWalletFeeAdditions(tx:Transaction,expected:string) {
  const kinds=new Set<number>();let purchaseStarted=false;
  const purchase=new Transaction({feePayer:tx.feePayer,recentBlockhash:tx.recentBlockhash});
  for(const ix of tx.instructions) {
    if(!ix.programId.equals(ComputeBudgetProgram.programId)) {purchaseStarted=true;purchase.add(ix);continue;}
    const kind=ix.data[0];
    if(purchaseStarted||ix.keys.length||kind===undefined||kinds.has(kind)) return false;
    if(kind===2) {
      if(ix.data.length!==5||ix.data.readUInt32LE(1)===0||ix.data.readUInt32LE(1)>1_400_000) return false;
    } else if(kind!==3||ix.data.length!==9) return false;
    kinds.add(kind);
  }
  // Recompile after stripping only fee instructions: every purchase byte and account privilege must match.
  const original=Transaction.populate(Message.from(Buffer.from(expected,'base64')));
  const baseline=new Transaction({feePayer:original.feePayer,recentBlockhash:original.recentBlockhash})
    .add(...original.instructions.filter(ix=>!ix.programId.equals(ComputeBudgetProgram.programId)));
  return kinds.size>0&&purchase.instructions.length>0&&purchase.serializeMessage().equals(baseline.serializeMessage());
}

