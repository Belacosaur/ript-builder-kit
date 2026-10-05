export type Section = 'gacha'|'treasury'|'wallet'|'collection'|'explorer'|'activity';
const sections: [Section,string,string][] = [
 ['gacha','Gacha','Choose a pack and follow your draw from payment to reveal.'],
 ['treasury','Treasury','Check draw readiness and manage your sandbox test balance.'],
 ['wallet','Wallet','Connect your collector wallet and prepare test funds.'],
 ['collection','Collection','Review revealed cards, keep favourites or prepare a sellback.'],
 ['explorer','API Explorer','Inspect and exercise every direct Gacha API operation.'],
 ['activity','Activity & Recovery','Inspect request history and safely resume saved orders.'],
];
export function organizeWorkspace(root:HTMLElement, meta:{active:Section;environment:string;chain:string},onSelect:(s:Section)=>void){
 const main=root.querySelector('main')!;
 const original=[...main.querySelectorAll<HTMLElement>('section.panel')];
 const find=(title:string)=>original.find(s=>s.querySelector('h2')?.textContent===title);
 const nav=document.createElement('nav');nav.className='workspace-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Developer workspace sections');
 const workspace=document.createElement('div');workspace.className='workspace';
 const panels=new Map<Section,HTMLElement>();
 const network=meta.chain==='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'?'Devnet':meta.chain?'Custom network':'Network unverified';
 const context=`${meta.environment==='sandbox'?'Sandbox':'Live API'} · ${network} · API v1`;
 for(const [id,label,description] of sections){
  const tab=document.createElement('button');tab.id=`tab-${id}`;tab.type='button';tab.textContent=label;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`panel-${id}`);nav.append(tab);
  const panel=document.createElement('section');panel.id=`panel-${id}`;panel.className='workspace-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);
  const hero=document.createElement('div');hero.className='section-heading';
  const badge=document.createElement('p');badge.className='section-context';badge.textContent=context;
  const heading=document.createElement('h2');heading.textContent=label;
  const help=document.createElement('p');help.textContent=description;
  hero.append(badge,heading,help);panel.append(hero);workspace.append(panel);panels.set(id,panel);
 }
 function select(id:Section,focus=false){for(const [key,panel]of panels){panel.hidden=key!==id;const tab=nav.querySelector<HTMLButtonElement>(`#tab-${key}`)!;tab.setAttribute('aria-selected',String(key===id));tab.tabIndex=key===id?0:-1;if(key===id&&focus)tab.focus();}onSelect(id);}
 nav.addEventListener('click',e=>{const tab=(e.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');if(tab)select(tab.id.slice(4) as Section);});
 nav.addEventListener('keydown',e=>{const index=sections.findIndex(([id])=>`tab-${id}`===(e.target as HTMLElement).id);if(index<0)return;let next=index;if(e.key==='ArrowRight')next=(index+1)%sections.length;else if(e.key==='ArrowLeft')next=(index+sections.length-1)%sections.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=sections.length-1;else return;e.preventDefault();select(sections[next][0],true);});
 const move=(section:HTMLElement|undefined,to:Section,title?:string)=>{if(!section)return;if(title){const h=section.querySelector('h2');if(h)h.textContent=title;}panels.get(to)!.append(section);};
 const lifecycle=find('02 / Guided lifecycle');
 const collection=document.createElement('div');collection.className='panel';
 const cards=lifecycle?.querySelector<HTMLElement>('.cards');
 if(cards){const decisions=cards.nextElementSibling;collection.append(cards);if(decisions?.classList.contains('toolbar'))collection.append(decisions);}
 if(!cards?.children.length){const p=document.createElement('p');p.className='empty';p.textContent='Your revealed cards will appear here after a completed draw. Start with a pack in Gacha, or load an existing order in Activity & Recovery.';collection.append(p);}
 const shortcut=document.createElement('button');shortcut.className='secondary';shortcut.textContent='Open Gacha to draw or sign';shortcut.addEventListener('click',()=>select('gacha',true));collection.append(shortcut);panels.get('collection')!.append(collection);
 move(find('01 / Pack catalog'),'gacha','Pack catalog');move(lifecycle,'gacha','Draw lifecycle');move(find('Integration readiness'),'gacha');
 const testing=find('Devnet sandbox testing');
 if(testing){const walletPanel=document.createElement('div');walletPanel.className='panel';const h=document.createElement('h3');h.textContent='Wallet test funds';const p=document.createElement('p');p.textContent='Request 1,000 test USDC and a top-up toward 0.1 Devnet SOL. Funding is subject to 24-hour limits.';const actions=document.createElement('div');actions.className='toolbar';for(const id of ['test-wallet','test-new-wallet']){const b=testing.querySelector(`#${id}`);if(b)actions.append(b);}walletPanel.append(h,p,actions);panels.get('wallet')!.append(walletPanel);const receipts=document.createElement('div');receipts.className='panel';const receiptHeading=document.createElement('h3');receiptHeading.textContent='Funding receipts';receipts.append(receiptHeading);for(const p of [...testing.querySelectorAll('p')]){if(p.querySelector('a')||p.textContent?.startsWith('Funding operation'))receipts.append(p);}if(receipts.children.length>1)panels.get('activity')!.append(receipts);move(testing,'treasury','Sandbox treasury');}
 else {const p=document.createElement('div');p.className='panel';p.textContent='Live treasury readiness and balances are shown in the pack catalog. Manage treasury funding through the partner portal.';panels.get('treasury')!.append(p);}
 move(original.find(s=>s.classList.contains('connection')),'wallet');
 move(find('Recovery workspace'),'activity','Saved orders');move(find('04 / Request trace'),'activity','Request history');move(find('03 / API explorer'),'explorer','Direct API requests');
 main.querySelector('.layout')?.remove();
 const footer=main.querySelector('footer')!;main.insertBefore(nav,footer);main.insertBefore(workspace,footer);select(meta.active);
}
