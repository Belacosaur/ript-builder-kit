import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountShell } from "./shell.js";
import { createStore, initialState } from "./store.js";
import { money } from "./views/common.js";

function fixture() {
  const dom = new JSDOM('<div id="app"></div>');
  const root = dom.window.document.querySelector<HTMLElement>('#app')!;
  const store = createStore(initialState());
  mountShell(root, store, {} as any);
  return { dom, root, store };
}
test('unconfigured collector and disconnected wallet cannot offer working actions', () => {
  const f = fixture();
  for (const id of ['read-balances','collector-check','collector-link','read-collection','upload-capture'])
    assert.equal(f.root.querySelector<HTMLButtonElement>('#'+id)!.disabled,true,id);
  f.dom.window.close();
});
test('unknown card value stays unknown instead of appearing as zero', () => {
  assert.equal(money(undefined),'Unknown');
  assert.equal(money(null),'Unknown');
  assert.equal(money('invalid'),'Unknown');
  assert.equal(money(0),'$0.00');
});

test('selected sellback total stays unknown for missing values and mixed selections', () => {
  const f = fixture();
  f.store.update(s => ({...s, order: {id:'order',state:'complete',cards:[
    {skuId:'unknown',disposition:'vaulted'},
    {skuId:'known',disposition:'vaulted',buybackCents:2500}
  ]}}));
  for (const id of ['unknown','known']) {
    const input = f.root.querySelector<HTMLInputElement>(`[data-select="${id}"]`)!;
    input.checked = true;
    input.dispatchEvent(new f.dom.window.Event('change', {bubbles:true}));
    assert.match(f.root.querySelector('#sell-total')!.textContent!, /Unknown/);
  }
  assert.equal(f.root.querySelector<HTMLButtonElement>('[data-keep]')!.disabled, true);
  f.dom.window.close();
});
test('changing explorer operation clears incompatible request and typed fields', () => {
  const f = fixture();
  const operation = f.root.querySelector<HTMLSelectElement>('#operation')!;
  operation.value='create'; operation.dispatchEvent(new f.dom.window.Event('change'));
  f.root.querySelector<HTMLButtonElement>('#example')!.click();
  assert.ok(f.root.querySelector<HTMLTextAreaElement>('#body')!.value);
  operation.value='packs'; operation.dispatchEvent(new f.dom.window.Event('change'));
  assert.equal(f.root.querySelector<HTMLTextAreaElement>('#body')!.value,'');
  assert.equal(f.root.querySelector('#typed-fields')!.children.length,0);
  f.dom.window.close();
});
test('busy financial action prevents a refresh from invalidating its context', () => {
  const f=fixture();
  f.store.update(s=>({...s,busy:true}));
  assert.equal(f.root.querySelector<HTMLButtonElement>('#refresh')!.disabled,true);
  f.dom.window.close();
});
test('opening requires verified network context and a supported browser lock', () => {
  const f=fixture();
  f.store.update(s=>({...s,selectedPack:'pack',catalog:{chain:'c',packs:[{id:'pack',status:'available',maxQuantity:10,priceUsd:25,balanceUsdc:500,requiredFloatUsdc:500}]}}));
  assert.equal(f.root.querySelector<HTMLButtonElement>('#open-pack')!.disabled,true);
  f.store.update(s=>({...s,network:{chain:'other',token:'m'}}));
  assert.equal(f.root.querySelector<HTMLButtonElement>('#open-pack')!.disabled,true);
  f.dom.window.close();
});
test('API explorer defaults to a usable catalog read and refuses missing inputs', () => {
  const f=fixture();
  assert.equal(f.root.querySelector<HTMLSelectElement>('#operation')!.value,'packs');
  const operation=f.root.querySelector<HTMLSelectElement>('#operation')!;
  operation.value='read';operation.dispatchEvent(new f.dom.window.Event('change'));
  assert.equal(f.root.querySelector<HTMLButtonElement>('#execute')!.disabled,true);
  assert.equal(f.root.querySelector<HTMLButtonElement>('#use-order')!.disabled,true);
  f.dom.window.close();
});

test('sold cards become collapsed history and scoped receipt credit has a clear confirmation', () => {
 const f=fixture();
 f.store.update(s=>({...s,order:{id:'o',state:'complete',cards:[{skuId:'sold',title:'Bulbasaur',disposition:'sold',buybackCents:2109}]},sellbackReceipt:{orderId:'o',signature:'2'.repeat(88),creditedUnits:'21090000',decimals:6,skuIds:['sold']}}));
 assert.equal(f.root.querySelectorAll('#cards [data-keep]').length,0);
 assert.equal(f.root.querySelectorAll('#cards [data-select]').length,0);
 assert.equal(f.root.querySelector<HTMLDetailsElement>('#sold-history')!.open,false);
 assert.match(f.root.querySelector('#sellback-confirmation')!.textContent!,/Latest sellback confirmed/);
 assert.match(f.root.querySelector('#sellback-confirmation')!.textContent!,/21.09 test USDC credited/);
 f.store.update(s=>({...s,order:{...s.order,id:'other'}}));
 assert.doesNotMatch(f.root.querySelector('#sellback-confirmation')!.textContent!,/21.09/);
 f.dom.window.close();
});
