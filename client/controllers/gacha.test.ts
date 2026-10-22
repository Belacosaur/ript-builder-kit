import { test } from "node:test";
import assert from "node:assert/strict";
import { createGachaController } from "./gacha.js";
const scope = {
  environment: "sandbox" as const,
  partnerId: "11111111-1111-4111-8111-111111111111",
  wallet: "11111111111111111111111111111111",
  chain: "genesis",
};
const p = {
  ...scope,
  packId: "pack",
  quantity: 1,
  clientNonce: "abcdefghijklmnop",
  orderId: "a".repeat(64),
};
const order = {
  ...p,
  id: p.orderId,
  state: "complete",
  paymentSignature: "receipt",
  cards: [
    { skuId: "11111111-1111-4111-8111-111111111111", disposition: "vaulted" },
  ],
};
test("fresh purchase uses the combined quote and accepts a completed submit without another read", async () => {
  const f = setup(null);
  let nonce = "";
  const messages: string[] = [];
  f.ports.progress = (message: string) => messages.push(message);
  f.ports.signQuote = async (transaction: string) => {
    assert.equal(transaction, "deposit-quote");
    return "c2lnbmVk";
  };
  f.ports.call = async (op: string, _params: any, body: any) => {
    f.calls.push(op);
    if (op === "create") {
      assert.equal(body.preparePayment, true);
      nonce = body.clientNonce;
      return { ...order, clientNonce: nonce, state: "awaiting_payment", paymentSignature: null,
        payment: { intentId: "11111111-1111-4111-8111-111111111111", transaction: "deposit-quote" } };
    }
    if (op === "submit") return { ...order, clientNonce: nonce };
    throw new Error("unexpected extra request: " + op);
  };
  await createGachaController(f.ports).open({ packId: "pack", quantity: 1 });
  assert.deepEqual(f.calls, ["create", "submit"]);
  assert.equal(messages[0], "Preparing your opening…");
});
test("paid pack processing only polls and never asks for payment again", async () => {
  const f = setup();
  let reads = 0;
  const progress: string[] = [];
  f.ports.progress = (message: string) => progress.push(message);
  f.ports.signQuote = async () => { throw new Error("must not sign again"); };
  f.ports.call = async (op: string) => {
    f.calls.push(op);
    assert.equal(op, "read");
    return ++reads === 1 ? { ...order, state: "processing", paymentFirst: true, cards: [] } : order;
  };
  await createGachaController(f.ports).resume();
  assert.deepEqual(f.calls, ["read", "read"]);
  assert.ok(progress.includes("Payment received. Preparing your cards…"));
});
function setup(pending: any = p) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
  if (pending)
    data.set(
      "gacha-lab:" +
        JSON.stringify(["sandbox", scope.partnerId, scope.wallet, scope.chain]),
      JSON.stringify(pending),
    );
  let current = { ...scope },
    time = 0;
  const calls: string[] = [];
  const ports: any = {
    scope: () => current,
    storage,
    call: async (op: string) => {
      calls.push(op);
      return order;
    },
    signQuote: async () => "",
    accept() {},
    progress() {},
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
    random: () => 0.5,
    lock: async (_s: any, _signal: any, work: any) => work(),
    canOpen: () => true,
  };
  return {
    ports,
    calls,
    change: () => {
      current = { ...current, environment: "live" as any };
    },
  };
}
test("resume completed historical order reads without a new purchase or signature", async () => {
  const f = setup();
  await createGachaController(f.ports).resume();
  assert.deepEqual(f.calls, ["read"]);
});
test("explicit purchase cannot overwrite an unresolved or corrupt record", async () => {
  const f = setup();
  await assert.rejects(
    createGachaController(f.ports).open({ packId: "pack", quantity: 1 }),
    /pending_order_exists/,
  );
  assert.deepEqual(f.calls, ["read"]);
});
test("uncertain create retries identical nonce and survives read interruption", async () => {
  const f = setup(null);
  let nonce = "",
    attempt = 0;
  f.ports.call = async (op: string, _params: any, body: any) => {
    if (op === "create") {
      assert.ok(body.clientNonce);
      if (nonce) assert.equal(body.clientNonce, nonce);
      nonce = body.clientNonce;
      if (++attempt === 1) throw new TypeError("fetch");
      return { ...order, clientNonce: nonce };
    }
    return { ...order, clientNonce: nonce };
  };
  await createGachaController(f.ports).open({ packId: "pack", quantity: 1 });
  assert.equal(attempt, 2);
});
test("scope change during wallet approval never submits", async () => {
  const f = setup({ ...p });
  f.ports.call = async (op: string) => {
    f.calls.push(op);
    return op === "payment"
      ? {
          intentId: "11111111-1111-4111-8111-111111111111",
          transaction: "quote",
        }
      : {
          ...order,
          state: "awaiting_payment",
          paymentSignature: undefined,
          cards: [],
        };
  };
  f.ports.signQuote = async () => {
    f.change();
    return "c2lnbmVk";
  };
  await assert.rejects(
    createGachaController(f.ports).resume(),
    /scope_changed/,
  );
  assert.ok(!f.calls.includes("submit"));
});
test("signed accepted payment reads before retransmission", async () => {
  const f = setup({
    ...p,
    intentId: "11111111-1111-4111-8111-111111111111",
    signedTransaction: "c2lnbmVk",
  });
  await createGachaController(f.ports).resume();
  assert.deepEqual(f.calls, ["read"]);
});

test("already sold batch resumes without preparing another sellback", async () => {
  const sku = "11111111-1111-4111-8111-111111111111";
  const f = setup({
    ...p,
    sellback: { intentId: sku, transaction: "c2lnbmVk", skuIds: [sku] },
  });
  f.ports.call = async (op: string) => {
    f.calls.push(op);
    return { ...order, cards: [{ skuId: sku, disposition: "sold" }] };
  };
  await createGachaController(f.ports).sell([sku]);
  assert.deepEqual(f.calls, ["read"]);
});
test("lock acquisition re-reads consent written by another tab", async () => {
  const f = setup(null);
  f.ports.lock = async (_s: any, _a: any, work: any) => {
    f.ports.storage.setItem(
      "gacha-lab:" +
        JSON.stringify(["sandbox", scope.partnerId, scope.wallet, scope.chain]),
      JSON.stringify(p),
    );
    return work();
  };
  await assert.rejects(
    createGachaController(f.ports).open({ packId: "pack", quantity: 1 }),
    /pending_order_exists/,
  );
  assert.deepEqual(f.calls, ["read"]);
});

for (const damaged of ["{broken", JSON.stringify({ version: 99 })])
  test(
    "manual reconciliation reads without replacing damaged consent: " + damaged,
    async () => {
      const f = setup(null);
      const key =
        "gacha-lab:" +
        JSON.stringify(["sandbox", scope.partnerId, scope.wallet, scope.chain]);
      f.ports.storage.setItem(key, damaged);
      f.ports.lock = async () => {
        throw new Error("financial_lock_unavailable");
      };
      let accepted: any;
      f.ports.accept = (v: any) => {
        accepted = v;
      };
      await createGachaController(f.ports).load(order.id);
      assert.deepEqual(f.calls, ["read"]);
      assert.equal(accepted.id, order.id);
      assert.equal(f.ports.storage.getItem(key), damaged);
      await assert.rejects(
        createGachaController(f.ports).open({ packId: "pack", quantity: 1 }),
      );
      assert.deepEqual(f.calls, ["read"]);
    },
  );
test("manual reconciliation works with unavailable storage and no financial locks", async () => {
  const f = setup(null);
  f.ports.storage = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
    removeItem() {
      throw Error("blocked");
    },
  };
  f.ports.lock = async () => {
    throw Error("financial_lock_unavailable");
  };
  const loaded = await createGachaController(f.ports).load(order.id);
  assert.equal(loaded.id, order.id);
  assert.deepEqual(f.calls, ["read"]);
});

test("sold cards automatically release saved recovery after reconciliation",async()=>{
 const f=setup();f.ports.call=async()=>({...order,cards:[{...order.cards[0],disposition:'sold'}]});
 await createGachaController(f.ports).resume();
 assert.equal(f.ports.storage.getItem('gacha-lab:'+JSON.stringify([scope.environment,scope.partnerId,scope.wallet,scope.chain])),null);
});
test("unsettled sellback retains saved recovery",async()=>{
 const f=setup();f.ports.call=async()=>({...order,cards:[{...order.cards[0],disposition:'buyback_pending'}]});
 await createGachaController(f.ports).resume();
 assert.ok(f.ports.storage.getItem('gacha-lab:'+JSON.stringify([scope.environment,scope.partnerId,scope.wallet,scope.chain])));
});

test("opening again reconciles a sold prior order before creating a new identity",async()=>{
 const f=setup();const ops:string[]=[];
 f.ports.call=async(op:string,_params:any,body:any)=>{ops.push(op);if(op==='read')return {...order,cards:[{...order.cards[0],disposition:'sold'}]};assert.equal(op,'create');return {...order,id:'b'.repeat(64),clientNonce:body.clientNonce};};
 await createGachaController(f.ports).open({packId:'pack',quantity:1});
 assert.deepEqual(ops,['read','create']);assert.ok(f.ports.storage.getItem('gacha-lab:'+JSON.stringify([scope.environment,scope.partnerId,scope.wallet,scope.chain])));
});

test("restoring a sold saved order only reads and automatically releases it",async()=>{
 const f=setup();f.ports.call=async(op:string)=>{f.calls.push(op);assert.equal(op,'read');return {...order,cards:[{...order.cards[0],disposition:'sold'}]};};
 await (createGachaController(f.ports) as any).reconcileSaved();
 assert.deepEqual(f.calls,['read']);assert.equal(f.ports.storage.getItem('gacha-lab:'+JSON.stringify([scope.environment,scope.partnerId,scope.wallet,scope.chain])),null);
});

for(const safeToRetry of [true,false])test(`expired restore releases only when backend confirms safeToRetry=${safeToRetry}`,async()=>{
 const f=setup();f.ports.call=async(op:string)=>{assert.equal(op,'read');return {...order,state:'expired',safeToRetry,paymentSignature:null,cards:[]};};
 await createGachaController(f.ports).reconcileSaved();
 const saved=f.ports.storage.getItem('gacha-lab:'+JSON.stringify([scope.environment,scope.partnerId,scope.wallet,scope.chain]));assert.equal(saved===null,safeToRetry);
});

test("resume of a safely expired order clears recovery without payment or resubmission",async()=>{
 const f=setup();f.ports.call=async(op:string)=>{f.calls.push(op);assert.equal(op,'read');return {...order,state:'expired',safeToRetry:true,paymentSignature:null,cards:[]};};
 await createGachaController(f.ports).resume();assert.deepEqual(f.calls,['read']);assert.equal(f.ports.storage.getItem('gacha-lab:'+JSON.stringify([scope.environment,scope.partnerId,scope.wallet,scope.chain])),null);
});


test("explicit Keep can adopt a completed historical order without recreating purchase",async()=>{
 const f=setup(null);let kept=false;
 f.ports.call=async(op:string)=>{f.calls.push(op);if(op==='keep'){kept=true;return {};};return {...order,cards:[{...order.cards[0],disposition:kept?'kept':'vaulted'}]};};
 await createGachaController(f.ports).load(order.id);
 assert.equal(f.ports.storage.getItem('gacha-lab:'+JSON.stringify([scope.environment,scope.partnerId,scope.wallet,scope.chain])),null);
 await (createGachaController(f.ports).keep as any)(order.cards[0].skuId,order.id);
 assert.ok(f.calls.includes('keep'));assert.ok(!f.calls.includes('create'));assert.ok(!f.calls.includes('payment'));
});
test("historical decision cannot replace another order's saved consent",async()=>{
 const f=setup();
 await assert.rejects((createGachaController(f.ports).keep as any)(order.cards[0].skuId,'b'.repeat(64)),/pending_order_exists/);
 assert.ok(!f.calls.includes('keep'));
});

test("explicit historical Sell requests only sellback consent and preserves other orders",async()=>{
 const f=setup(null);let sold=false;const signed:string[]=[];
 f.ports.signQuote=async(transaction:string)=>{signed.push(transaction);return 'c2lnbmVk';};
 f.ports.call=async(op:string)=>{
   f.calls.push(op);
   if(op==='sellbackPrepare')return {intentId:'11111111-1111-4111-8111-111111111111',transaction:'sellback-quote'};
   if(op==='sellbackSubmit'){sold=true;return {};}
   assert.equal(op,'read');return {...order,cards:[{...order.cards[0],disposition:sold?'sold':'vaulted'}]};
 };
 await createGachaController(f.ports).sell([order.cards[0].skuId],order.id);
 assert.deepEqual(signed,['sellback-quote']);
 assert.ok(!f.calls.includes('create'));assert.ok(!f.calls.includes('payment'));
 const other=setup();const key='gacha-lab:'+JSON.stringify([scope.environment,scope.partnerId,scope.wallet,scope.chain]);
 const original=other.ports.storage.getItem(key);
 await assert.rejects(createGachaController(other.ports).sell([order.cards[0].skuId],'b'.repeat(64)),/pending_order_exists/);
 const retained=JSON.parse(other.ports.storage.getItem(key));
 assert.deepEqual(retained.pending ?? retained,JSON.parse(original));assert.deepEqual(other.calls,[]);
});


test('expired payment quote is refreshed on the same order before wallet approval', async () => {
 const f=setup(null);let nonce='',signs=0;const payment={intentId:'11111111-1111-4111-8111-111111111111',transaction:'old-quote',lastValidBlockHeight:110};
 f.ports.call=async(op:string,_params:any,body:any)=>{f.calls.push(op);if(op==='create'){nonce=body.clientNonce;return {...order,clientNonce:nonce,state:'awaiting_payment',paymentSignature:null,payment};}if(op==='payment')return {...payment,transaction:'fresh-quote',lastValidBlockHeight:250};if(op==='submit'){assert.equal(body.transaction,'c2lnbmVkZnJlc2g=');return {...order,clientNonce:nonce};}throw Error('unexpected '+op);};
 f.ports.signQuote=async(transaction:string,_s:any,height:number)=>{signs++;if(transaction==='old-quote'){assert.equal(height,110);throw Error('quote_expired');}assert.equal(height,250);return 'c2lnbmVkZnJlc2g=';};
 await createGachaController(f.ports).open({packId:'pack',quantity:1});assert.equal(signs,2);assert.deepEqual(f.calls,['create','payment','submit']);
});


test('sellback expiry reconciles before requesting one renewed wallet approval', async()=>{
 const f=setup();let submits=0,quotes=0,signs=0;
 f.ports.call=async(op:string,_params:any,body:any)=>{f.calls.push(op);if(op==='read')return submits>=2?{...order,cards:[{...order.cards[0],disposition:'sold'}]}:order;if(op==='sellbackPrepare'){quotes++;return {intentId:'11111111-1111-4111-8111-111111111111',transaction:'quote',lastValidBlockHeight:250};}if(op==='sellbackSubmit'){if(++submits===1)throw Error('buyback_expired');return {accepted:true};}throw Error('unexpected '+op);};
 f.ports.signQuote=async()=>{signs++;return 'c2lnbmVk';};
 const result=await createGachaController(f.ports).sell([order.cards[0].skuId]);assert.equal(result.cards[0].disposition,'sold');assert.equal(quotes,2);assert.equal(signs,2);assert.deepEqual(f.calls,['read','sellbackPrepare','sellbackSubmit','read','sellbackPrepare','sellbackSubmit','read']);
});

test('payment accepted during quote preparation is reconciled without another wallet prompt',async()=>{
 const f=setup();let reads=0;
 f.ports.call=async(op:string)=>{f.calls.push(op);if(op==='read')return ++reads===1?{...order,state:'awaiting_payment',paymentSignature:null}:order;if(op==='payment')throw Error('opening_payment_received');throw Error('unexpected '+op);};
 f.ports.signQuote=async()=>{throw Error('must not prompt');};
 assert.equal((await createGachaController(f.ports).resume()).state,'complete');assert.deepEqual(f.calls,['read','payment','read']);
});
