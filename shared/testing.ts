import {validWallet} from './contract.js';
export function resolveTestingOperation(operation:string,params:Record<string,string>,body:unknown):{method:'GET'|'POST';path:string;body?:Record<string,unknown>}{
 const base='/sandbox/v1/gacha/testing/';
 if(operation==='status'){if(Object.keys(params).length||body!==undefined)throw new Error('invalid_request');return {method:'GET',path:base+'status'};}
 if(operation==='operation'){if(!/^[0-9a-f-]{36}$/i.test(params.id??'')||Object.keys(params).some(k=>k!=='id')||body!==undefined)throw new Error('invalid_request');return {method:'GET',path:base+'operations/'+params.id};}
 if(!['wallet-funds','treasury-refill'].includes(operation)||Object.keys(params).length||!body||typeof body!=='object'||Array.isArray(body))throw new Error('invalid_request');
 const data=body as Record<string,unknown>;if(typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(data.requestId)||Object.keys(data).some(k=>!['requestId',...(operation==='wallet-funds'?['wallet']:[])].includes(k))||(operation==='wallet-funds'&&!validWallet(data.wallet)))throw new Error('invalid_request');return {method:'POST',path:base+operation,body:data};
}
