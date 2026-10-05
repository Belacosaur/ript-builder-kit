import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";
import { createRiptServerClient, RiptError } from "@ript/sdk/server";
const {RIPT_API_URL:baseUrl,RIPT_ENVIRONMENT:environment,RIPT_GACHA_KEY:gachaKey}=process.env;
if (!baseUrl || !gachaKey || !["sandbox","live"].includes(environment)) {
 console.error("Set RIPT_API_URL, RIPT_ENVIRONMENT (sandbox/live), and RIPT_GACHA_KEY in .env. Copy .env.example; keep the key on this server.");process.exit(1);
}
const sdk=createRiptServerClient({baseUrl,environment,credentials:{gachaKey}});
const sdkRoot=resolve(fileURLToPath(new URL("../../../",import.meta.resolve("@ript/sdk/browser"))));
const dashboard=fileURLToPath(new URL("../dashboard/",import.meta.url));
const port=configuredPort();
createServer(async(req,res)=>{
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
 try {
  const path=new URL(req.url,"http://127.0.0.1").pathname;
  if(req.method==="GET") {
   let file,contentType="text/javascript";
   if(path==="/"){file=resolve(dashboard,"index.html");contentType="text/html";}
   else if(path==="/main.js")file=resolve(dashboard,"main.js");
   else if(path.startsWith("/sdk/") && /^[a-zA-Z0-9_./-]+\.js$/.test(path)) {
    file=resolve(sdkRoot,path.slice(5));if(!file.startsWith(sdkRoot+sep))throw new Error("invalid_path");
   } else {res.writeHead(404);return res.end();}
   const data=await readFile(file);res.setHeader("Content-Type",contentType);res.writeHead(200);return res.end(data);
  }
  if(req.method!=="POST" || !["/api/services/treasury/get","/api/services/treasury/activity"].includes(path)){res.writeHead(404);return res.end();}
  // This local example exposes only two fixed reads. Authenticate your users before hosting it remotely.
  if(req.headers.origin && req.headers.origin!==`http://127.0.0.1:${port}`)throw new Error("invalid_origin");
  let raw="";for await(const part of req){raw+=part;if(raw.length>4096)throw new Error("invalid_request");}
  const input=JSON.parse(raw);if(input.environment!==environment || !input.params || Object.keys(input).some(k=>!["environment","params"].includes(k)))throw new Error("invalid_request");
  const result=await sdk.request("treasury",path.endsWith("/get")?"get":"activity",input.params);
  res.setHeader("Content-Type","application/json");res.writeHead(200);res.end(JSON.stringify(result));
 } catch(error) {res.setHeader("Content-Type","application/json");res.writeHead(error instanceof RiptError ? error.status || 502 : 400);res.end(JSON.stringify({error:error instanceof RiptError ? error.code : "invalid_request"}));}
}).listen(port,"127.0.0.1",()=>console.log(`Treasury dashboard: http://127.0.0.1:${port}/ (${environment})`));
function configuredPort(){const value=Number(process.env.PORT??4320);if(!Number.isInteger(value)||value<1024||value>65535)throw new Error("Invalid PORT");return value;}
