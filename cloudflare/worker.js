const COOKIE="cm_session", SESSION=43200, MAX_PHOTOS=8;
const enc=s=>new TextEncoder().encode(s);
function b64u(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
async function sign(secret,s){const k=await crypto.subtle.importKey("raw",enc(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64u(new Uint8Array(await crypto.subtle.sign("HMAC",k,enc(s))))}
function json(o,status=200,headers={}){return new Response(JSON.stringify(o),{status,headers:{"content-type":"application/json; charset=utf-8",...headers}})}
function cookie(v,age=SESSION,secure=true){return `${COOKIE}=${encodeURIComponent(v)}; Path=/; HttpOnly; ${secure?"Secure; ":""}SameSite=Lax; Max-Age=${age}`}
async function token(env){const p=b64u(enc(JSON.stringify({admin:true,exp:Date.now()+SESSION*1000})));return p+"."+await sign(env.SESSION_SECRET,p)}
async function admin(req,env){const c=(req.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));if(!c||!env.SESSION_SECRET)return false;try{const [p,s]=decodeURIComponent(c.slice(COOKIE.length+1)).split(".");if(s!==await sign(env.SESSION_SECRET,p))return false;const d=JSON.parse(atob(p.replace(/-/g,"+").replace(/_/g,"/")));return d.admin&&d.exp>Date.now()}catch{return false}}
let googleCache=null;
async function googleToken(env){
 if(googleCache&&googleCache.exp>Date.now()+60000)return googleCache.token;
 const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||"{}");if(!sa.client_email||!sa.private_key)throw Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON");
 const pem=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,""),bin=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey("pkcs8",bin,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]),now=Math.floor(Date.now()/1000);
 const head=b64u(enc(JSON.stringify({alg:"RS256",typ:"JWT"}))),claim=b64u(enc(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}))),unsigned=head+"."+claim;
 const sig=b64u(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc(unsigned))));
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+sig})}),j=await r.json();
 if(!r.ok)throw Error("Google OAuth: "+(j.error_description||j.error||r.status));googleCache={token:j.access_token,exp:Date.now()+(j.expires_in||3600)*1000};return j.access_token;
}
const sheetCache=new Map();
async function readTab(env,tab){const hit=sheetCache.get(tab);if(hit&&Date.now()-hit.at<60000)return hit.rows;const tok=await googleToken(env),range=encodeURIComponent("'"+tab+"'");const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SHEET_ID)}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,{headers:{Authorization:"Bearer "+tok}}),j=await r.json();if(!r.ok){if(hit)return hit.rows;throw Error("Google Sheets: "+(j.error?.message||r.status))}const rows=(j.values||[]).slice(1);sheetCache.set(tab,{at:Date.now(),rows});return rows}
const norm=s=>String(s??"").trim().replace(/\s+/g," "), cap=s=>{s=norm(s);return s?s[0].toUpperCase()+s.slice(1).toLowerCase():""};
const slug=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120);
const num=v=>{if(typeof v==="number")return v;const n=parseFloat(String(v??"").replace(/[^\d.,-]/g,"").replace(/\./g,"").replace(",", "."));return Number.isFinite(n)?n:null};
const isTotal=r=>/^total/i.test(String(r[0]||"").trim());
const gb=s=>{const m=String(s||"").match(/(\d+)\s*(gb|tb)?/i);return m?`${m[1]} ${(m[2]||"gb").toUpperCase()}`:""};
const model=s=>norm(s).replace(/iphone/gi,"iPhone").replace(/macbook/gi,"MacBook").replace(/\bpro\b/gi,"Pro").replace(/\bmax\b/gi,"Max").replace(/\bsamsung\b/gi,"Samsung");
const bat=v=>typeof v==="number"?`${Math.round(v<=1?v*100:v)}%`:norm(v);
async function cloudinaryRequest(env, path, options={}) {
 const cloud=env.CLOUDINARY_CLOUD_NAME, apiKey=env.CLOUDINARY_API_KEY, secret=env.CLOUDINARY_API_SECRET;
 if(!cloud||!apiKey||!secret) throw Error("Faltan secretos de Cloudinary en Cloudflare");
 const url=`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}${path}`;
 return fetch(url,{...options,headers:{...(options.headers||{}),Authorization:"Basic "+btoa(`${apiKey}:${secret}`)}});
}
async function cloudinarySignature(params,secret){
 const canonical=Object.keys(params).filter(k=>k!=="file"&&k!=="api_key"&&k!=="signature"&&params[k]!==undefined&&params[k]!==null&&params[k]!=="").sort().map(k=>`${k}=${params[k]}`).join("&")+secret;
 const digest=await crypto.subtle.digest("SHA-1",enc(canonical));
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
let cloudinaryCache={at:0,resources:[]};
async function allCloudinaryAssets(env){
 if(Date.now()-cloudinaryCache.at<30000)return cloudinaryCache.resources;
 const all=[];let cursor="";
 do{
  const qs=new URLSearchParams({max_results:"500"});if(cursor)qs.set("next_cursor",cursor);
  const r=await cloudinaryRequest(env,`/resources/image/upload?${qs}`),j=await r.json().catch(()=>({}));
  if(!r.ok)throw Error("Cloudinary: "+(j.error?.message||r.status));
  all.push(...(j.resources||[]));cursor=j.next_cursor||"";
 }while(cursor&&all.length<5000);
 cloudinaryCache={at:Date.now(),resources:all};return all;
}
async function cloudinaryAssets(env,key){return (await allCloudinaryAssets(env)).filter(x=>x.public_id.startsWith(key+"/")).sort((a,b)=>a.public_id.localeCompare(b.public_id))}
async function photos(env,key){return (await cloudinaryAssets(env,key)).map(x=>x.secure_url)}
async function loadAll(env){const [a,b,c]=await Promise.all([readTab(env,env.TAB_SEMI_1||"Stock Seminuevos 1"),readTab(env,env.TAB_SEMI_2||"Stock Seminuevos 2"),readTab(env,env.TAB_SELLADOS||"Stock Sellados").catch(()=>[])]);const semi=[...a,...b].filter(r=>r[0]&&!isTotal(r)).map(r=>({modelo:model(r[0]),gb:gb(r[1]),detalle:norm(r[2]),color:cap(r[3]),costo:num(r[4]),precio:num(r[5]),bateria:bat(r[6]),estado:"Seminuevo",moneda:env.CURRENCY_SEMI||"UYU"}));const sealed=c.filter(r=>r[0]&&!isTotal(r)).map(r=>({modelo:model(r[0]),gb:gb(r[1]),detalle:"",color:cap(r[2]),costo:num(r[3]),precio:num(r[4]),bateria:"",estado:"Sellado",moneda:env.CURRENCY_SELLADOS||"USD"}));return [...sealed,...semi].map(x=>({...x,photoKey:slug(`${x.modelo} ${x.gb} ${x.color}`)}))}
async function publicStock(env){const groups=new Map();for(const x of (await loadAll(env)).filter(x=>x.precio>0)){const k=[x.estado,x.modelo,x.gb,x.color,x.bateria,x.detalle,x.precio,x.moneda].join("|"),g=groups.get(k);if(g)g.cantidad++;else groups.set(k,{estado:x.estado,modelo:x.modelo,gb:x.gb,color:x.color,bateria:x.bateria,detalle:/^(nada|ninguno|-)?$/i.test(x.detalle)?"":x.detalle,precio:x.precio,moneda:x.moneda,cantidad:1,fotos:await photos(env,x.photoKey)})}return [...groups.values()]}
function parseDate(v){if(typeof v==="number")return new Date(Date.UTC(1899,11,30)+v*86400000);const m=String(v||"").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(Date.UTC(+m[3],+m[2]-1,+m[1])):null}
async function salesStats(env,month){const rows=(await readTab(env,env.TAB_VENTAS||"Ventas")).filter(r=>r[0]).map(r=>({nombre:norm(r[0]),costo:num(r[1])||0,venta:num(r[2])||0,fecha:parseDate(r[5]),ganancia:num(r[7])??((num(r[2])||0)-(num(r[1])||0))})).filter(x=>x.fecha),ym=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`,months=[...new Set(rows.map(x=>ym(x.fecha)))].sort(),sel=month&&months.includes(month)?month:months[months.length-1]||new Date().toISOString().slice(0,7),r=rows.filter(x=>ym(x.fecha)===sel),equipos=r.filter(x=>!/pr[eé]stamo|inter[eé]s/i.test(x.nombre)),fin=r.filter(x=>/pr[eé]stamo|inter[eé]s/i.test(x.nombre)),sum=(a,k)=>a.reduce((s,x)=>s+x[k],0),revenue=sum(equipos,"venta"),profit=sum(equipos,"ganancia"),[y,m]=sel.split("-").map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate(),max=Math.max(1,...r.map(x=>x.fecha.getUTCDate())),byDay=Array.from({length:max},(_,i)=>({dia:i+1,unidades:0}));equipos.forEach(x=>byDay[x.fecha.getUTCDate()-1].unidades++);const models=new Map();for(const x of equipos){const k=x.nombre.replace(/\s+(64|128|256|512|1024)\s*(gb)?$/i,""),o=models.get(k)||{modelo:k,unidades:0,facturado:0,ganancia:0};o.unidades++;o.facturado+=x.venta;o.ganancia+=x.ganancia;models.set(k,o)}return {month:sel,months,kpis:{unidades:equipos.length,facturado:revenue,ganancia:profit,margen:revenue?profit/revenue:0,ticketMedio:equipos.length?revenue/equipos.length:0,promedioDiario:equipos.length/max,financieroGanancia:sum(fin,"ganancia"),financieroMovimientos:fin.length},byDay,byModel:[...models.values()].sort((a,b)=>b.unidades-a.unidades||b.ganancia-a.ganancia).slice(0,10)}}
async function stockValue(env){const a=await loadAll(env);return ["UYU","USD"].map(moneda=>{const x=a.filter(i=>i.moneda===moneda&&i.precio>0),costo=x.reduce((s,i)=>s+(i.costo||0),0),venta=x.reduce((s,i)=>s+i.precio,0);return {moneda,equipos:x.length,costo,venta,ganancia:venta-costo}}).filter(x=>x.equipos)}
async function debts(env){const rows=(await readTab(env,env.TAB_DEUDORES||"Deudores")).filter(r=>r[0]),list=rows.map(r=>{const detalle=norm(r[2]),grupo=/iphone|samsung|macbook/i.test(detalle)?"Equipos":/pr[eé]stamo|inversi/i.test(detalle)?"Préstamos e inversión":"Otros";return {nombre:norm(r[0]),monto:num(r[1])||0,detalle,grupo}}).sort((a,b)=>b.monto-a.monto),grupos={};list.forEach(x=>{grupos[x.grupo]||={total:0,cantidad:0};grupos[x.grupo].total+=x.monto;grupos[x.grupo].cantidad++});return {total:list.reduce((s,x)=>s+x.monto,0),grupos,list}}
async function cash(env){const rows=await readTab(env,env.TAB_CAJA||"Caja"),names=["Préstamos","Publicidad","Gastos P","Ganancias","Invertido","Facturación"];return names.map((concepto,i)=>({concepto,importe:num((rows[0]||[])[i])})).filter(x=>x.importe!==null)}
async function settings(env){return await env.SETTINGS.get("settings","json")||{}}
async function saveSettings(env,v){const next={...(await settings(env)),...v};await env.SETTINGS.put("settings",JSON.stringify(next));return next}
let rateCache=null;
async function getRate(env){const s=await settings(env);if(s.rateOverride>0)return {rate:s.rateOverride,source:"manual"};if(rateCache&&Date.now()-rateCache.at<1800000)return {rate:rateCache.rate,source:"mercado"};try{const r=await fetch("https://open.er-api.com/v6/latest/USD"),j=await r.json();if(j.rates?.UYU>0){rateCache={rate:Math.round(j.rates.UYU*100)/100,at:Date.now()};return {rate:rateCache.rate,source:"mercado"}}}catch{}return {rate:Number(env.RATE_FALLBACK)||40,source:"fallback"}}
async function photoSlots(env){const map=new Map();for(const x of await loadAll(env)){let s=map.get(x.photoKey);if(!s){s={key:x.photoKey,modelo:x.modelo,gb:x.gb,color:x.color,equipos:0,fotos:await cloudinaryAssets(env,x.photoKey).then(a=>a.map(z=>({url:z.secure_url,id:z.public_id})))};map.set(x.photoKey,s)}s.equipos++}return [...map.values()].sort((a,b)=>a.fotos.length-b.fotos.length||a.modelo.localeCompare(b.modelo))}
async function route(req,env){const u=new URL(req.url),p=u.pathname,m=req.method;
 if(p.startsWith("/api/admin/")&&p!=="/api/admin/login"&&!(await admin(req,env)))return json({error:"No autorizado"},401);
 if(p==="/api/admin/login"&&m==="POST"){const b=await req.json().catch(()=>({}));if(!env.ADMIN_PASSWORD||b.password!==env.ADMIN_PASSWORD)return json({error:"Contraseña incorrecta"},401);return json({ok:true},200,{"set-cookie":cookie(await token(env),SESSION,new URL(req.url).protocol==="https:")})}
 if(p==="/api/admin/logout"&&m==="POST")return json({ok:true},200,{"set-cookie":cookie("",0,new URL(req.url).protocol==="https:")});
 if(p==="/api/admin/me")return json({admin:await admin(req,env)});
 if(p==="/api/stock")return json({items:await publicStock(env),whatsapp:env.WHATSAPP||""},200,{"cache-control":"public, max-age=30"});
 if(p==="/api/rate")return json(await getRate(env),200,{"cache-control":"public, max-age=300"});
 if(p==="/api/admin/stats"&&m==="GET"){const [sales,stock]=await Promise.all([salesStats(env,u.searchParams.get("month")),stockValue(env)]);return json({sales,stock})}
 if(p==="/api/admin/debts"&&m==="GET"){const [d,c]=await Promise.all([debts(env),cash(env)]);return json({debts:d,cash:c})}
 if(p==="/api/admin/photo-slots"&&m==="GET")return json(await photoSlots(env));
 const pm=p.match(/^\/api\/admin\/photos\/([a-z0-9-]{1,120})$/);
 if(pm&&m==="POST"){
  const key=pm[1],form=await req.formData(),files=form.getAll("photos").filter(x=>x&&typeof x.arrayBuffer==="function");
  if(!files.length)return json({error:"No llegó ninguna imagen"},400);
  const existing=await cloudinaryAssets(env,key);if(existing.length+files.length>MAX_PHOTOS)return json({error:`Máximo ${MAX_PHOTOS} fotos por modelo`},400);
  const saved=[];
  for(const f of files.slice(0,6)){
   if(!f.type.startsWith("image/"))continue;if(f.size>12*1024*1024)return json({error:"Máximo 12 MB por imagen"},400);
   const publicId=`${key}/${Date.now()}-${crypto.randomUUID().slice(0,8)}`,timestamp=Math.floor(Date.now()/1000),params={public_id:publicId,timestamp};
   const body=new FormData();body.set("file",f,f.name||"photo");body.set("public_id",publicId);body.set("timestamp",String(timestamp));body.set("api_key",env.CLOUDINARY_API_KEY);body.set("signature",await cloudinarySignature(params,env.CLOUDINARY_API_SECRET));
   const r=await cloudinaryRequest(env,"/image/upload",{method:"POST",body}),j=await r.json().catch(()=>({}));if(!r.ok)throw Error("Cloudinary: "+(j.error?.message||r.status));saved.push(j.secure_url);
  }
  return json({saved});
 }
 if(p==="/api/admin/photos"&&m==="DELETE"){
  const publicId=u.searchParams.get("public_id")||"";if(!/^[a-z0-9-]{1,120}\/[a-zA-Z0-9_-]{1,80}$/.test(publicId))return json({error:"Foto inválida"},400);
  const timestamp=Math.floor(Date.now()/1000),params={public_id:publicId,timestamp},body=new URLSearchParams({public_id:publicId,timestamp:String(timestamp),api_key:env.CLOUDINARY_API_KEY,signature:await cloudinarySignature(params,env.CLOUDINARY_API_SECRET)});
  const r=await cloudinaryRequest(env,"/image/destroy",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body}),j=await r.json().catch(()=>({}));if(!r.ok||j.result!=="ok"&&j.result!=="not found")throw Error("Cloudinary: "+(j.error?.message||j.result||r.status));return json({ok:true});
 }
 if(p==="/api/admin/settings"&&m==="GET")return json(await settings(env));
 if(p==="/api/admin/settings"&&m==="PUT"){const b=await req.json().catch(()=>({})),v=Number(b.rateOverride);return json(await saveSettings(env,{rateOverride:v>0&&v<1000?v:null}))}
 return env.ASSETS.fetch(req)}
export default {async fetch(req,env){try{return await route(req,env)}catch(e){console.error(e);return json({error:"Error interno del servidor",detail:env.ENVIRONMENT==="development"?String(e.message):undefined},500)}}};
