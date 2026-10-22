import {test} from "node:test";
import assert from "node:assert/strict";
import {sellbackReceipt} from "./settlement.js";
const scope={environment:'sandbox' as const,partnerId:'p',wallet:'w',chain:'c'};
const order={id:'o',cards:[{skuId:'sku',disposition:'sold'}]};
const row=(amount:string)=>({accountIndex:1,owner:'w',mint:'m',uiTokenAmount:{amount,decimals:6}});
const receipt=()=>({...scope,orderId:'o',mint:'m',sellback:{status:'finalized',sellbackSignature:'2'.repeat(88),skuIds:['sku'],accounting:{source:'finalized-transaction',mint:'m',preTokenBalances:[row('99529390000')],postTokenBalances:[row('99550480000')]}}});
test('sellback confirmation uses exact credited token units from the scoped finalized receipt',()=>{
 assert.equal(sellbackReceipt(receipt(),scope,order,'m').creditedUnits,'21090000');
});
test('a stale, pending, unrelated or missing-credit receipt cannot claim a payout',()=>{
 for(const change of [(r:any)=>r.wallet='other',(r:any)=>r.orderId='other',(r:any)=>r.sellback.status='pending',(r:any)=>r.sellback.skuIds=['other'],(r:any)=>r.sellback.accounting.postTokenBalances=[row('99529390000')],(r:any)=>r.sellback.accounting.postTokenBalances=[]]) {
   const r=receipt();change(r);assert.throws(()=>sellbackReceipt(r,scope,order,'m'));
 }
});

test('an older sale receipt cannot confirm a new selected sale on the same order',()=>{
 const mixed={...order,cards:[...order.cards,{skuId:'new',disposition:'sold'}]};
 assert.throws(()=>sellbackReceipt(receipt(),scope,mixed,'m',['new']),/receipt_selection_mismatch/);
 assert.deepEqual(sellbackReceipt(receipt(),scope,mixed,'m',['sku']).skuIds,['sku']);
});
