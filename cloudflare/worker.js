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
 const head=b64u(enc(JSON.stringify({alg:"RS256",typ:"JWT"}))),claim=b64u(enc(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}))),unsigned=head+"."+claim;
 const sig=b64u(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc(unsigned))));
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+sig})}),j=await r.json();
 if(!r.ok)throw Error("Google OAuth: "+(j.error_description||j.error||r.status));googleCache={token:j.access_token,exp:Date.now()+(j.expires_in||3600)*1000};return j.access_token;
}
const sheetCache=new Map();
let sheetMemo=null;
async function activeSheet(env){if(sheetMemo&&Date.now()-sheetMemo.at<10000)return sheetMemo.id;const s=await settings(env),id=s.planilla?.activa?.id||env.SHEET_ID;sheetMemo={id,at:Date.now()};return id}
async function readTab(env,tab,sid){const id=sid||await activeSheet(env),key=id+"|"+tab,hit=sheetCache.get(key);if(hit&&Date.now()-hit.at<60000)return hit.rows;const tok=await googleToken(env),range=encodeURIComponent("'"+tab+"'");const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,{headers:{Authorization:"Bearer "+tok}}),j=await r.json();if(!r.ok){if(hit)return hit.rows;throw Error("Google Sheets: "+(j.error?.message||r.status))}const rows=(j.values||[]).slice(1);sheetCache.set(key,{at:Date.now(),rows});return rows}
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
let photoMem=null;
async function photoIndex(env){
 if(photoMem&&Date.now()-photoMem.at<5000)return photoMem.idx;
 let idx=await env.SETTINGS.get("photoindex","json");
 if(!idx){
  idx={};for(const x of await allCloudinaryAssets(env)){const k=x.public_id.split("/")[0];(idx[k]||=[]).push({id:x.public_id,url:x.secure_url})}
  for(const k in idx)idx[k].sort((a,b)=>a.id.localeCompare(b.id));
  await env.SETTINGS.put("photoindex",JSON.stringify(idx));
 }
 photoMem={at:Date.now(),idx};return idx;
}
async function savePhotoIndex(env,idx){await env.SETTINGS.put("photoindex",JSON.stringify(idx));photoMem={at:Date.now(),idx}}
async function addPhotos(env,key,items){if(!items.length)return;const idx=await photoIndex(env);idx[key]=[...(idx[key]||[]),...items].sort((a,b)=>a.id.localeCompare(b.id));await savePhotoIndex(env,idx)}
async function removePhoto(env,publicId){const idx=await photoIndex(env),k=publicId.split("/")[0];idx[k]=(idx[k]||[]).filter(x=>x.id!==publicId);if(!idx[k].length)delete idx[k];await savePhotoIndex(env,idx)}
async function cloudinaryAssets(env,key){return ((await photoIndex(env))[key]||[]).map(x=>({public_id:x.id,secure_url:x.url}))}
async function photos(env,key){return (await cloudinaryAssets(env,key)).map(x=>x.secure_url)}
async function loadAll(env){const [a,b,c]=await Promise.all([readTab(env,env.TAB_SEMI_1||"Stock Seminuevos 1"),readTab(env,env.TAB_SEMI_2||"Stock Seminuevos 2"),readTab(env,env.TAB_SELLADOS||"Stock Sellados").catch(()=>[])]);const semi=[...a,...b].filter(r=>r[0]&&!isTotal(r)).map(r=>({modelo:model(r[0]),gb:gb(r[1]),detalle:norm(r[2]),color:cap(r[3]),costo:num(r[4]),precio:num(r[5]),bateria:bat(r[6]),estado:"Seminuevo",moneda:env.CURRENCY_SEMI||"UYU"}));const sealed=c.filter(r=>r[0]&&!isTotal(r)).map(r=>({modelo:model(r[0]),gb:gb(r[1]),detalle:"",color:cap(r[2]),costo:num(r[3]),precio:num(r[4]),bateria:"",estado:"Sellado",moneda:env.CURRENCY_SELLADOS||"USD"}));return [...sealed,...semi].map(x=>({...x,photoKey:slug(`${x.modelo} ${x.gb} ${x.color}`)}))}
async function publicStock(env){const groups=new Map();for(const x of (await loadAll(env)).filter(x=>x.precio>0)){const k=[x.estado,x.modelo,x.gb,x.color,x.bateria,x.detalle,x.precio,x.moneda].join("|"),g=groups.get(k);if(g)g.cantidad++;else groups.set(k,{estado:x.estado,modelo:x.modelo,gb:x.gb,color:x.color,bateria:x.bateria,detalle:/^(nada|ninguno|-)?$/i.test(x.detalle)?"":x.detalle,precio:x.precio,moneda:x.moneda,cantidad:1,fotos:await photos(env,x.photoKey)})}return [...groups.values()]}
function parseDate(v){if(typeof v==="number")return new Date(Date.UTC(1899,11,30)+v*86400000);const m=String(v||"").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(Date.UTC(+m[3],+m[2]-1,+m[1])):null}
async function ventasRows(env){const s=await settings(env),ids=[...new Set([s.planilla?.activa?.id||env.SHEET_ID,...(s.planilla?.archivo||[]).map(a=>a.id)])],tab=env.TAB_VENTAS||"Ventas",out=[];for(const [i,id] of ids.entries()){try{out.push(...await readTab(env,tab,id))}catch(e){if(i===0)throw e}}return out}
const WEEKDAYS=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
async function salesStats(env,month){
 const FIN=/pr[eé]stamo|inter[eé]s/i,stripGb=t=>t.replace(/\s+(64|128|256|512|1024)\s*(gb)?$/i,"");
 const rows=(await ventasRows(env)).filter(r=>r[0]).map(r=>({nombre:norm(r[0]),costo:num(r[1])||0,venta:num(r[2])||0,fecha:parseDate(r[5]),ganancia:num(r[7])??((num(r[2])||0)-(num(r[1])||0))})).filter(x=>x.fecha);
 const ym=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
 const uy=new Date(Date.now()-3*3600*1000),nowKey=ym(uy); // hora de Uruguay
 const months=[...new Set(rows.map(x=>ym(x.fecha)))].sort();
 const sel=month&&months.includes(month)?month:months[months.length-1]||nowKey;
 const sum=(a,k)=>a.reduce((t,x)=>t+x[k],0),equiposDe=k=>rows.filter(x=>ym(x.fecha)===k&&!FIN.test(x.nombre));
 const r=rows.filter(x=>ym(x.fecha)===sel),equipos=equiposDe(sel),fin=r.filter(x=>FIN.test(x.nombre));
 const [y,m]=sel.split("-").map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();
 const current=sel===nowKey,dias=current?Math.min(Math.max(uy.getUTCDate(),1),last):last;
 const maxDay=Math.max(dias,...r.map(x=>x.fecha.getUTCDate()));
 const byDay=Array.from({length:maxDay},(_,i)=>({dia:i+1,unidades:0}));
 equipos.forEach(x=>byDay[x.fecha.getUTCDate()-1].unidades++);
 const revenue=sum(equipos,"venta"),profit=sum(equipos,"ganancia");

 // ---- por modelo
 const models=new Map();
 for(const x of equipos){const k=model(stripGb(x.nombre)),o=models.get(k)||{modelo:k,unidades:0,facturado:0,ganancia:0};o.unidades++;o.facturado+=x.venta;o.ganancia+=x.ganancia;models.set(k,o)}
 const all=[...models.values()].map(o=>({...o,margen:o.facturado?o.ganancia/o.facturado:0,gananciaUnidad:o.ganancia/o.unidades,pctUnidades:equipos.length?o.unidades/equipos.length:0,pctVentas:revenue?o.facturado/revenue:0,pctGanancia:profit?o.ganancia/profit:0}));
 const best=(k,min=1)=>[...all].filter(o=>o.unidades>=min).sort((p,q)=>q[k]-p[k]||q.unidades-p.unidades)[0]||null;

 // ---- día de la semana
 const wd=WEEKDAYS.map(dia=>({dia,unidades:0,ganancia:0}));
 equipos.forEach(x=>{const w=wd[x.fecha.getUTCDay()];w.unidades++;w.ganancia+=x.ganancia});
 const byWeekday=[1,2,3,4,5,6,0].map(i=>wd[i]),mejorDia=[...byWeekday].sort((p,q)=>q.unidades-p.unidades||q.ganancia-p.ganancia)[0];

 // ---- ritmo del mes y comparación con el mes anterior
 const proyeccion=current&&dias>=5&&dias<last?{dias,diasMes:last,unidades:Math.round(equipos.length*last/dias),facturado:Math.round(revenue*last/dias),ganancia:Math.round(profit*last/dias)}:null;
 const pi=months.indexOf(sel);let anterior=null;
 if(pi>0){const k=months[pi-1],pe=equiposDe(k),pr={unidades:pe.length,facturado:sum(pe,"venta"),ganancia:sum(pe,"ganancia")},base=proyeccion||{unidades:equipos.length,facturado:revenue,ganancia:profit},d=(a,b)=>b?a/b-1:null;
  anterior={month:k,...pr,vsUnidades:d(base.unidades,pr.unidades),vsFacturado:d(base.facturado,pr.facturado),vsGanancia:d(base.ganancia,pr.ganancia),proyectado:!!proyeccion}}

 // ---- stock vs ventas: qué reponer y qué plata está parada
 const stock=await loadAll(env),stockBy=new Map();
 for(const i of stock){const k=model(stripGb(i.modelo)),o=stockBy.get(k)||{modelo:k,equipos:0,capital:{}};o.equipos++;o.capital[i.moneda]=(o.capital[i.moneda]||0)+(i.costo||0);stockBy.set(k,o)}
 const reponer=all.filter(o=>o.unidades>=2&&!stockBy.has(o.modelo)).sort((p,q)=>q.ganancia-p.ganancia).slice(0,5).map(o=>({modelo:o.modelo,unidades:o.unidades,ganancia:o.ganancia,gananciaUnidad:o.gananciaUnidad}));
 const inmovilizado=[...stockBy.values()].filter(o=>!models.has(o.modelo)).map(o=>({modelo:o.modelo,equipos:o.equipos,capital:Object.entries(o.capital).map(([moneda,monto])=>({moneda,monto}))})).sort((p,q)=>q.capital.reduce((t,c)=>t+c.monto,0)-p.capital.reduce((t,c)=>t+c.monto,0)).slice(0,6);

 return {month:sel,months,dias,diasMes:last,current,
  kpis:{unidades:equipos.length,facturado:revenue,ganancia:profit,margen:revenue?profit/revenue:0,ticketMedio:equipos.length?revenue/equipos.length:0,promedioDiario:dias?equipos.length/dias:0,financieroGanancia:sum(fin,"ganancia"),financieroMovimientos:fin.length},
  byDay,byModel:[...all].sort((p,q)=>q.unidades-p.unidades||q.ganancia-p.ganancia).slice(0,10),
  highlights:{masVendido:best("unidades"),masVentas:best("facturado"),masGanancia:best("ganancia"),mejorMargen:best("margen",2),mejorPorUnidad:best("gananciaUnidad",2)},
  byWeekday,mejorDia:mejorDia&&mejorDia.unidades?mejorDia:null,proyeccion,anterior,reponer,inmovilizado}
}
async function stockValue(env){const a=await loadAll(env);return ["UYU","USD"].map(moneda=>{const x=a.filter(i=>i.moneda===moneda&&i.precio>0),costo=x.reduce((s,i)=>s+(i.costo||0),0),venta=x.reduce((s,i)=>s+i.precio,0);return {moneda,equipos:x.length,costo,venta,ganancia:venta-costo}}).filter(x=>x.equipos)}
async function debts(env){const rows=(await readTab(env,env.TAB_DEUDORES||"Deudores")).filter(r=>r[0]),list=rows.map(r=>{const detalle=norm(r[2]),grupo=/iphone|samsung|macbook/i.test(detalle)?"Equipos":/pr[eé]stamo|inversi/i.test(detalle)?"Préstamos e inversión":"Otros";return {nombre:norm(r[0]),monto:num(r[1])||0,detalle,grupo}}).sort((a,b)=>b.monto-a.monto),grupos={};list.forEach(x=>{grupos[x.grupo]||={total:0,cantidad:0};grupos[x.grupo].total+=x.monto;grupos[x.grupo].cantidad++});return {total:list.reduce((s,x)=>s+x.monto,0),grupos,list}}
async function cash(env){const rows=await readTab(env,env.TAB_CAJA||"Caja"),names=["Préstamos","Publicidad","Gastos P","Ganancias","Invertido","Facturación"];return names.map((concepto,i)=>({concepto,importe:num((rows[0]||[])[i])})).filter(x=>x.importe!==null)}
async function settings(env){return await env.SETTINGS.get("settings","json")||{}}
async function saveSettings(env,v){const next={...(await settings(env)),...v};await env.SETTINGS.put("settings",JSON.stringify(next));return next}
let rateCache=null;
async function getRate(env){const s=await settings(env);if(s.rateOverride>0)return {rate:s.rateOverride,source:"manual"};if(rateCache&&Date.now()-rateCache.at<1800000)return {rate:rateCache.rate,source:"mercado"};try{const r=await fetch("https://open.er-api.com/v6/latest/USD"),j=await r.json();if(j.rates?.UYU>0){rateCache={rate:Math.round(j.rates.UYU*100)/100,at:Date.now()};return {rate:rateCache.rate,source:"mercado"}}}catch{}return {rate:Number(env.RATE_FALLBACK)||40,source:"fallback"}}
async function photoSlots(env){const map=new Map();for(const x of await loadAll(env)){let s=map.get(x.photoKey);if(!s){s={key:x.photoKey,modelo:x.modelo,gb:x.gb,color:x.color,equipos:0,fotos:await cloudinaryAssets(env,x.photoKey).then(a=>a.map(z=>({url:z.secure_url,id:z.public_id})))};map.set(x.photoKey,s)}s.equipos++}return [...map.values()].sort((a,b)=>a.fotos.length-b.fotos.length||a.modelo.localeCompare(b.modelo))}
// ---------- Registrar venta: escribe en la planilla (Ventas + borra del stock) ----------
async function gfetch(env,url,init={}){const tok=await googleToken(env),r=await fetch(url,{...init,headers:{Authorization:"Bearer "+tok,"content-type":"application/json",...(init.headers||{})}}),j=await r.json().catch(()=>({}));if(!r.ok)throw Error("Google: "+(j.error?.message||r.status));return j}
async function sheetsCall(env,path,init={},sid){const id=sid||await activeSheet(env);try{return await gfetch(env,`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`+path,init)}catch(e){throw Error(String(e.message).replace(/^Google: /,"Google Sheets: "))}}
const stockTabs=env=>[{tab:env.TAB_SEMI_1||"Stock Seminuevos 1",sellado:false},{tab:env.TAB_SEMI_2||"Stock Seminuevos 2",sellado:false},{tab:env.TAB_SELLADOS||"Stock Sellados",sellado:true}];
function parseStockRow(env,t,r,fila){if(!r||!r[0]||isTotal(r))return null;return t.sellado?{tab:t.tab,fila,modelo:model(r[0]),gb:gb(r[1]),detalle:"",color:cap(r[2]),costo:num(r[3]),precio:num(r[4]),bateria:"",estado:"Sellado",moneda:env.CURRENCY_SELLADOS||"USD"}:{tab:t.tab,fila,modelo:model(r[0]),gb:gb(r[1]),detalle:norm(r[2]),color:cap(r[3]),costo:num(r[4]),precio:num(r[5]),bateria:bat(r[6]),estado:"Seminuevo",moneda:env.CURRENCY_SEMI||"UYU"}}
async function stockRows(env){const out=[];for(const t of stockTabs(env)){const rows=await readTab(env,t.tab).catch(()=>[]);rows.forEach((r,i)=>{const x=parseStockRow(env,t,r,i+2);if(x&&x.precio>0)out.push(x)})}return out}
async function liveRow(env,t,fila){const j=await sheetsCall(env,`/values/${encodeURIComponent(`'${t.tab}'!A${fila}:H${fila}`)}?valueRenderOption=UNFORMATTED_VALUE`);return parseStockRow(env,t,(j.values||[])[0],fila)}
const uyDate=()=>{const d=new Date(Date.now()-3*3600*1000);return `${d.getUTCDate()}/${d.getUTCMonth()+1}/${d.getUTCFullYear()}`};
async function registrarVenta(env,b){
 try{return await registrarVenta0(env,b)}catch(err){const msg=String(err&&err.message||err);console.error(err);
  return json({error:/permission|403/i.test(msg)?"La cuenta de servicio no tiene permiso de Editor en la planilla. Compartila de nuevo con permiso de Editor.":"No se pudo registrar la venta: "+msg},502)}}
async function registrarVenta0(env,b){
 const t=stockTabs(env).find(x=>x.tab===b.tab);if(!t)return json({error:"Pestaña inválida"},400);
 const fila=Number(b.fila);if(!Number.isInteger(fila)||fila<2||fila>5000)return json({error:"Fila inválida"},400);
 const pv=num(b.precioVenta);if(!(pv>0))return json({error:"Falta el precio de venta"},400);
 const rid=String(b.reqId||"");if(!/^[a-z0-9-]{8,64}$/.test(rid))return json({error:"Falta el identificador de la operación"},400);
 const prev=await env.SETTINGS.get("venta:"+rid,"json");if(prev)return json({...prev,duplicado:true});
 const x=await liveRow(env,t,fila),e=b.esperado||{};
 if(!x||model(e.modelo)!==x.modelo||cap(e.color)!==x.color||gb(e.gb)!==x.gb)return json({error:"La planilla cambió y esa fila ya no es el mismo equipo. Recargá la lista e intentá de nuevo."},409);
 const rate=x.moneda==="USD"?(await getRate(env)).rate:1,costo=Math.round((x.costo||0)*rate),venta=Math.round(pv);
 const fecha=/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(b.fecha||"")?b.fecha:uyDate();
 const gbn=parseInt(x.gb)||0,nombre=x.modelo+(gbn>=256?" "+gbn:"");
 const row=[nombre,costo,venta,x.bateria||"100%",x.detalle||"Nada",fecha,x.color,venta-costo];
 const ap=await sheetsCall(env,`/values/${encodeURIComponent(`'${env.TAB_VENTAS||"Ventas"}'!A:H`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:"POST",body:JSON.stringify({values:[row]})});
 let borrado=true,aviso=null;
 try{const meta=await sheetsCall(env,"?fields=sheets.properties(sheetId,title)"),sid=meta.sheets?.find(s=>s.properties.title===t.tab)?.properties.sheetId;
  if(sid==null)throw Error("no se encontró la pestaña");
  await sheetsCall(env,":batchUpdate",{method:"POST",body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:sid,dimension:"ROWS",startIndex:fila-1,endIndex:fila}}}]})})}
 catch(err){borrado=false;aviso="La venta se registró, pero no se pudo borrar el equipo del stock ("+err.message+"). Borralo a mano en la planilla."}
 sheetCache.clear();
 const res={ok:true,venta:{nombre,color:x.color,costo,precioVenta:venta,ganancia:venta-costo,fecha},stockBorrado:borrado,aviso,fila:ap.updates?.updatedRange||null};
 await env.SETTINGS.put("venta:"+rid,JSON.stringify(res),{expirationTtl:600});
 return json(res)}
// ---------- Mes nuevo: planilla nueva con la misma estructura ----------
const MESES_ES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const mesNombre=ym=>{const [y,m]=ym.split("-").map(Number),n=MESES_ES[m-1];return n[0].toUpperCase()+n.slice(1)+" "+y};
const sheetUrl=id=>`https://docs.google.com/spreadsheets/d/${id}/edit`;
const resetSheets=()=>{sheetMemo=null;sheetCache.clear()};
async function planillaInfo(env){const s=await settings(env),pl=s.planilla||{},id=pl.activa?.id||env.SHEET_ID;let nombre=pl.activa?.nombre||null;
 if(!nombre){try{nombre=(await sheetsCall(env,"?fields=properties.title",{},id)).properties?.title||null}catch{}}
 return {activa:{id,nombre,url:sheetUrl(id)},archivo:(pl.archivo||[]).map(a=>({...a,url:sheetUrl(a.id)})),email:s.ownerEmail||""}}
async function nuevoMes(env,b){
 const mes=/^\d{4}-(0[1-9]|1[0-2])$/.test(b.mes||"")?b.mes:null;if(!mes)return json({error:"Elegí el mes"},400);
 const email=String(b.email||"").trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"Poné el email de Google del dueño: ahí se comparte la planilla nueva."},400);
 const rid=String(b.reqId||"");if(!/^[a-z0-9-]{8,64}$/.test(rid))return json({error:"Falta el identificador de la operación"},400);
 const prev=await env.SETTINGS.get("mes:"+rid,"json");if(prev)return json({...prev,duplicado:true});
 const opt={stock:b.pasar?.stock!==false,deudores:b.pasar?.deudores!==false,caja:b.pasar?.caja===true};
 const src=await activeSheet(env),meta=await sheetsCall(env,"?fields=properties(title,locale,timeZone),sheets.properties(sheetId,title,index)",{},src);
 const title="CelsMarket · "+mesNombre(mes);
 const nuevo=await gfetch(env,"https://sheets.googleapis.com/v4/spreadsheets",{method:"POST",body:JSON.stringify({properties:{title,locale:meta.properties?.locale,timeZone:meta.properties?.timeZone}})});
 const dst=nuevo.spreadsheetId,blank=nuevo.sheets?.[0]?.properties?.sheetId;
 try{
  // primero compartir: si no se puede, no dejamos una planilla que el dueño no pueda abrir
  await gfetch(env,`https://www.googleapis.com/drive/v3/files/${dst}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,{method:"POST",body:JSON.stringify({type:"user",role:"writer",emailAddress:email})});
  const tabs=[...(meta.sheets||[])].map(s=>s.properties).sort((a,b)=>a.index-b.index),copies=[];
  for(const t of tabs){const c=await gfetch(env,`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(src)}/sheets/${t.sheetId}:copyTo`,{method:"POST",body:JSON.stringify({destinationSpreadsheetId:dst})});copies.push({sheetId:c.sheetId,title:t.title})}
  await gfetch(env,`https://sheets.googleapis.com/v4/spreadsheets/${dst}:batchUpdate`,{method:"POST",body:JSON.stringify({requests:[{deleteSheet:{sheetId:blank}},...copies.map(c=>({updateSheetProperties:{properties:{sheetId:c.sheetId,title:c.title},fields:"title"}}))]})});
  const has=n=>copies.some(c=>c.title===n),clear=[],add=(n,on)=>{if(!on&&has(n))clear.push(`'${n}'!A2:Z`)};
  add(env.TAB_VENTAS||"Ventas",false);add(env.TAB_SEMI_1||"Stock Seminuevos 1",opt.stock);add(env.TAB_SEMI_2||"Stock Seminuevos 2",opt.stock);add(env.TAB_SELLADOS||"Stock Sellados",opt.stock);add(env.TAB_DEUDORES||"Deudores",opt.deudores);add(env.TAB_CAJA||"Caja",opt.caja);
  if(clear.length)await gfetch(env,`https://sheets.googleapis.com/v4/spreadsheets/${dst}/values:batchClear`,{method:"POST",body:JSON.stringify({ranges:clear})});
 }catch(err){
  try{await gfetch(env,`https://www.googleapis.com/drive/v3/files/${dst}`,{method:"DELETE"})}catch{}  // no dejamos planillas a medio hacer
  throw err}
 const cur=await settings(env),pl=cur.planilla||{},oldName=pl.activa?.nombre||meta.properties?.title||"Planilla anterior";
 await saveSettings(env,{ownerEmail:email,planilla:{activa:{id:dst,nombre:title,creada:uyDate()},archivo:[{id:src,nombre:oldName},...(pl.archivo||[])].slice(0,36)}});
 resetSheets();
 const res={ok:true,planilla:{id:dst,nombre:title,url:sheetUrl(dst)},anterior:{id:src,nombre:oldName,url:sheetUrl(src)}};
 await env.SETTINGS.put("mes:"+rid,JSON.stringify(res),{expirationTtl:600});
 return json(res)}
async function activarPlanilla(env,b){
 const s=await settings(env),pl=s.planilla||{},arch=pl.archivo||[],t=arch.find(a=>a.id===b.id);if(!t)return json({error:"Esa planilla no está en la lista"},400);
 await sheetsCall(env,"?fields=properties.title",{},t.id); // comprueba que todavía hay acceso
 const curId=pl.activa?.id||env.SHEET_ID,curName=pl.activa?.nombre||"Planilla anterior";
 await saveSettings(env,{planilla:{activa:{id:t.id,nombre:t.nombre},archivo:[{id:curId,nombre:curName},...arch.filter(a=>a.id!==t.id)]}});resetSheets();
 return json({ok:true})}
const safe=(fn,what)=>async(env,b)=>{try{return await fn(env,b)}catch(err){const msg=String(err&&err.message||err);console.error(err);
 const hint=/Drive API|SERVICE_DISABLED|has not been used/i.test(msg)?"Falta activar la API de Google Drive en el proyecto de Google Cloud (la misma donde está la cuenta de servicio).":/permission|403/i.test(msg)?"La cuenta de servicio no tiene permiso para hacerlo. Revisá que sea Editor de la planilla.":"";
 return json({error:`${what}: ${msg}${hint?" "+hint:""}`},502)}};
const nuevoMesSafe=safe(nuevoMes,"No se pudo crear el mes nuevo"),activarSafe=safe(activarPlanilla,"No se pudo cambiar de planilla");
async function route(req,env){const u=new URL(req.url),p=u.pathname,m=req.method;
 if(p.startsWith("/api/admin/")&&p!=="/api/admin/login"&&!(await admin(req,env)))return json({error:"No autorizado"},401);
 if(p==="/api/admin/login"&&m==="POST"){const b=await req.json().catch(()=>({}));if(!env.ADMIN_PASSWORD||b.password!==env.ADMIN_PASSWORD)return json({error:"Contraseña incorrecta"},401);return json({ok:true},200,{"set-cookie":cookie(await token(env),SESSION,new URL(req.url).protocol==="https:")})}
 if(p==="/api/admin/logout"&&m==="POST")return json({ok:true},200,{"set-cookie":cookie("",0,new URL(req.url).protocol==="https:")});
 if(p==="/api/admin/me")return json({admin:await admin(req,env)});
 if(p==="/api/stock")return json({items:await publicStock(env),whatsapp:env.WHATSAPP||""},200,{"cache-control":"no-cache"});
 if(p==="/api/rate")return json(await getRate(env),200,{"cache-control":"public, max-age=300"});
 if(p==="/api/admin/stats"&&m==="GET"){const [sales,stock]=await Promise.all([salesStats(env,u.searchParams.get("month")),stockValue(env)]);return json({sales,stock})}
 if(p==="/api/admin/debts"&&m==="GET"){const [d,c]=await Promise.all([debts(env),cash(env)]);return json({debts:d,cash:c})}
 if(p==="/api/admin/photo-slots"&&m==="GET")return json(await photoSlots(env));
 const pm=p.match(/^\/api\/admin\/photos\/([a-z0-9-]{1,120})$/);
 if(pm&&m==="POST"){
  const key=pm[1],form=await req.formData(),files=form.getAll("photos").filter(x=>x&&typeof x.arrayBuffer==="function");
  if(!files.length)return json({error:"No llegó ninguna imagen"},400);
  const existing=await cloudinaryAssets(env,key);if(existing.length+files.length>MAX_PHOTOS)return json({error:`Máximo ${MAX_PHOTOS} fotos por modelo`},400);
  const saved=[],added=[];
  try{for(const f of files.slice(0,6)){
   if(!f.type.startsWith("image/"))continue;if(f.size>12*1024*1024)return json({error:"Máximo 12 MB por imagen"},400);
   const publicId=`${key}/${Date.now()}-${crypto.randomUUID().slice(0,8)}`,timestamp=Math.floor(Date.now()/1000),params={public_id:publicId,timestamp};
   const body=new FormData();body.set("file",f,f.name||"photo");body.set("public_id",publicId);body.set("timestamp",String(timestamp));body.set("api_key",env.CLOUDINARY_API_KEY);body.set("signature",await cloudinarySignature(params,env.CLOUDINARY_API_SECRET));
   const r=await cloudinaryRequest(env,"/image/upload",{method:"POST",body}),j=await r.json().catch(()=>({}));if(!r.ok)throw Error("Cloudinary: "+(j.error?.message||r.status));saved.push(j.secure_url);added.push({id:j.public_id,url:j.secure_url});
  }}finally{await addPhotos(env,key,added)}
  return json({saved,photos:(await photoIndex(env))[key]||[]});
 }
 if(p==="/api/admin/photos"&&m==="DELETE"){
  const publicId=u.searchParams.get("public_id")||"";if(!/^[a-z0-9-]{1,120}\/[a-zA-Z0-9_-]{1,80}$/.test(publicId))return json({error:"Foto inválida"},400);
  const timestamp=Math.floor(Date.now()/1000),params={public_id:publicId,timestamp,invalidate:"true"},body=new URLSearchParams({public_id:publicId,invalidate:"true",timestamp:String(timestamp),api_key:env.CLOUDINARY_API_KEY,signature:await cloudinarySignature(params,env.CLOUDINARY_API_SECRET)});
  const r=await cloudinaryRequest(env,"/image/destroy",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body}),j=await r.json().catch(()=>({}));if(!r.ok||j.result!=="ok"&&j.result!=="not found")throw Error("Cloudinary: "+(j.error?.message||j.result||r.status));await removePhoto(env,publicId);return json({ok:true,photos:(await photoIndex(env))[publicId.split("/")[0]]||[]});
 }
 if(p==="/api/admin/settings"&&m==="GET")return json(await settings(env));
 if(p==="/api/admin/settings"&&m==="PUT"){const b=await req.json().catch(()=>({})),v=Number(b.rateOverride);return json(await saveSettings(env,{rateOverride:v>0&&v<1000?v:null}))}
 if(p==="/api/admin/planilla"&&m==="GET")return json(await planillaInfo(env));
 if(p==="/api/admin/planilla/nuevo"&&m==="POST")return nuevoMesSafe(env,await req.json().catch(()=>({})));
 if(p==="/api/admin/planilla/activar"&&m==="POST")return activarSafe(env,await req.json().catch(()=>({})));
 if(p==="/api/admin/stock-rows"&&m==="GET")return json(await stockRows(env));
 if(p==="/api/admin/venta"&&m==="POST")return registrarVenta(env,await req.json().catch(()=>({})));
 if(p==="/api/admin/diagnostico"&&m==="GET"){
  sheetCache.clear();sheetMemo=null;googleCache=null;
  const tabs=[env.TAB_SEMI_1||"Stock Seminuevos 1",env.TAB_SEMI_2||"Stock Seminuevos 2",env.TAB_SELLADOS||"Stock Sellados",env.TAB_VENTAS||"Ventas",env.TAB_DEUDORES||"Deudores",env.TAB_CAJA||"Caja"];
  const out={secretos:Object.fromEntries(["SHEET_ID","GOOGLE_SERVICE_ACCOUNT_JSON","ADMIN_PASSWORD","SESSION_SECRET","CLOUDINARY_CLOUD_NAME","CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET"].map(k=>[k,!!env[k]])),cuenta:null,google:null,pestanas:[]};
  try{const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||"{}");out.cuenta=sa.client_email||null;await googleToken(env);out.google="ok";out.planilla=(await planillaInfo(env)).activa}catch(e){out.google=String(e&&e.message||e)}
  if(out.google==="ok")for(const t of tabs){try{out.pestanas.push({tab:t,filas:(await readTab(env,t)).length})}catch(e){out.pestanas.push({tab:t,error:String(e&&e.message||e)})}}
  return json(out)}
 return env.ASSETS.fetch(req)}
export default {async fetch(req,env){try{const res=await route(req,env);if(new URL(req.url).pathname.startsWith("/api/admin/")){const r2=new Response(res.body,res);r2.headers.set("cache-control","no-store");return r2}return res}catch(e){console.error(e);return json({error:"Error interno del servidor",detail:env.ENVIRONMENT==="development"?String(e.message):undefined},500)}}};
