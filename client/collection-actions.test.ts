import {test} from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {mount} from "./views/collection.js";
import {createStore,initialState} from "./store.js";

test("collection sell controls require an eligible selection and cannot resell sold cards",()=>{
 const dom=new JSDOM('<div id="app"></div>');const root=dom.window.document.querySelector<HTMLElement>('#app')!;
 const order={id:'order',state:'complete',cards:[{skuId:'card',disposition:'vaulted',buybackCents:1700}]};
 const store=createStore({...initialState(),order});let calls=0;
 mount(root,store,{sell:()=>{calls++;}} as any);
 const sell=root.querySelector<HTMLButtonElement>('#sellback')!;
 assert.equal(sell.disabled,true);
 let checkbox=root.querySelector<HTMLInputElement>('[data-select]')!;
 checkbox.checked=true;checkbox.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 assert.equal(sell.disabled,false);
 store.update(s=>({...s,busy:true}));assert.equal(sell.disabled,true);
 store.update(s=>({...s,busy:false}));assert.equal(sell.disabled,false);
 store.update(s=>({...s,order:{...order,cards:[{...order.cards[0],disposition:'sold'}]}}));
 assert.equal(sell.disabled,true);assert.equal(root.querySelector<HTMLButtonElement>('#sell-all')!.disabled,true);
 assert.match(root.textContent!,/already sold/i);
 sell.click();assert.equal(calls,0);
 dom.window.close();
});

test("finish order is available only for settled cards and invokes guarded release",()=>{
 const dom=new JSDOM('<div id="app"></div>');const root=dom.window.document.querySelector<HTMLElement>('#app')!;
 const order={id:'order',state:'complete',cards:[{skuId:'card',disposition:'sold'}]};
 const store=createStore({...initialState(),order,recovery:{kind:'ready',pending:{} as any}});let released=0;
 mount(root,store,{release:()=>released++} as any);
 const button=root.querySelector<HTMLButtonElement>('#finish-order')!;assert.ok(button);assert.equal(button.disabled,false);button.click();assert.equal(released,1);
 store.update(s=>({...s,order:{...order,cards:[{skuId:'card',disposition:'buyback_pending'}]}}));assert.equal(button.disabled,true);
 store.update(s=>({...s,order,busy:true}));assert.equal(button.disabled,true);dom.window.close();
});
