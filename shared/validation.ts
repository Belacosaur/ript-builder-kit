export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function check(ok:unknown,code='invalid_request'):asserts ok{if(!ok)throw new Error(code);}
export function object(value:unknown,keys:string[]):Record<string,any>{check(value&&typeof value==='object'&&!Array.isArray(value));const result=value as Record<string,any>;check(Object.keys(result).every(k=>keys.includes(k)));return result;}
export function text(v:unknown,max:number,min=1){check(typeof v==='string'&&v.length>=min&&v.length<=max&&!/[\r\n]/.test(v));return v as string;}
export function integer(v:unknown,min:number,max:number){check(Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max);return v as number;}
export function query(params:Record<string,string>,rules:Record<string,(v:string)=>void>):string{for(const [k,v] of Object.entries(params)){check(!!rules[k]);rules[k](v);}const encoded=new URLSearchParams(params).toString();return encoded?'?'+encoded:'';}
export const queryInt=(min:number,max:number)=>(v:string)=>{check(/^\d+$/.test(v));integer(Number(v),min,max)};
export const queryText=(max:number,min=1)=>(v:string)=>{text(v,max,min)};export const queryUuid=(v:string)=>check(uuid.test(v));export const instant=(v:string)=>{text(v,64);check(Number.isFinite(Date.parse(v))&&/T/.test(v))};
