import { createRiptBrowserClient } from "@ript/sdk/browser";
// Must match the server environment. No API key belongs in this file.
const sdk = createRiptBrowserClient({ environment: "sandbox" });
const snapshot = document.querySelector("#snapshot"), activity = document.querySelector("#activity"), read = document.querySelector("#read"), older = document.querySelector("#older");
let cursor=null,items=[];
function render(page){cursor=page.nextCursor;items.push(...page.items);activity.textContent=JSON.stringify({source:page.source,historyComplete:false,items},null,2);older.disabled=!cursor;}
read.onclick=async()=>{read.disabled=true;older.disabled=true;cursor=null;items=[];snapshot.textContent="Checking…";activity.textContent="";try{const data=await sdk.treasury.get();snapshot.textContent=JSON.stringify(data,null,2);if(data.status==="observed")render(await sdk.treasury.activity.list({limit:20}));}catch{snapshot.textContent="Unavailable; funds unknown. Check server configuration and API deployment.";}finally{read.disabled=false;}};
older.onclick=async()=>{older.disabled=true;try{render(await sdk.treasury.activity.list({limit:20,before:cursor}));}catch{activity.textContent+="\nOlder history unavailable.";}finally{older.disabled=!cursor;}};
