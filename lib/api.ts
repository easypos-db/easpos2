import { catalog, roster } from './catalog';
import { ensureCostSchema, handleCosts, saveManagerPin, buildOrderCostStatements } from './costs';
const hashToken=async(t:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))).map(v=>v.toString(16).padStart(2,'0')).join('');
async function pinHash(pin:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);return Array.from(new Uint8Array(bits)).map(v=>v.toString(16).padStart(2,'0')).join('')}
function equal(a:string,b:string){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
const OWNER_EMAIL='pizzalocaleyelki@gmail.com';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const schemaReady=new WeakMap<object,Promise<void>>();
const menuSchemaReady=new WeakMap<object,Promise<void>>();
const opsSchemaReady=new WeakMap<object,Promise<void>>();
async function ensureMenuSchema(db:any){let pending=menuSchemaReady.get(db);if(!pending){pending=(async()=>{await db.batch([db.prepare('CREATE TABLE IF NOT EXISTS menu_products (id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,ys_price INTEGER NOT NULL,brand TEXT NOT NULL DEFAULT \'wingy\',vat_rate INTEGER NOT NULL DEFAULT 10,active INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL)'),db.prepare('CREATE TABLE IF NOT EXISTS menu_categories (id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0)'),db.prepare('CREATE TABLE IF NOT EXISTS vat_rates (rate INTEGER PRIMARY KEY,active INTEGER NOT NULL DEFAULT 1)'),db.prepare('CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL UNIQUE,address TEXT NOT NULL DEFAULT \'\',balance INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)')]);const saved=(await db.prepare('SELECT product_id,ys_price FROM product_prices').all()).results||[],prices=new Map(saved.map((x:any)=>[x.product_id,x.ys_price])),now=Date.now();const categoryNames=[...new Set(catalog.map(p=>p.category))];const batch:any[]=[];for(const [index,name] of categoryNames.entries())batch.push(db.prepare('INSERT OR IGNORE INTO menu_categories (id,name,active,sort_order) VALUES (?,?,1,?)').bind('cat-'+index,name,index));for(const p of catalog)batch.push(db.prepare('INSERT OR IGNORE INTO menu_products (id,name,category,ys_price,brand,vat_rate,active,updated_at) VALUES (?,?,?,?,?,10,1,?)').bind(p.id,p.name,p.category,prices.get(p.id)??p.ysPrice,p.brand,now));for(const rate of [0,1,10,20])batch.push(db.prepare('INSERT OR IGNORE INTO vat_rates (rate,active) VALUES (?,1)').bind(rate));if(batch.length)await db.batch(batch)})();menuSchemaReady.set(db,pending)}await pending}
const safeNumber=(value:any)=>{const n=Number(value);return Number.isFinite(n)?n:0};
const phoneKey=(value:any)=>String(value||'').replace(/\D/g,'').slice(0,15);
async function saveOrderCustomer(db:any,name:string,phone:string,address:string){const key=phoneKey(phone);if(!key||key.length<8||!name)return;await db.prepare('INSERT INTO customers (id,name,phone,address,balance,updated_at) VALUES (?,?,?,?,0,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,address=CASE WHEN length(excluded.address)=0 THEN customers.address ELSE excluded.address END,updated_at=excluded.updated_at').bind(crypto.randomUUID(),name,key,address,Date.now()).run()}
async function ensureOrderSchema(db:any){let pending=schemaReady.get(db);if(!pending){pending=(async()=>{let columns=(await db.prepare('PRAGMA table_info(orders)').all()).results||[];for(const [name,definition] of [['service_type',"TEXT NOT NULL DEFAULT 'package'"],['table_no','INTEGER'],['phone',"TEXT NOT NULL DEFAULT ''"],['adjustments',"TEXT NOT NULL DEFAULT '[]'"],['subtotal','INTEGER NOT NULL DEFAULT 0'],['discount_type',"TEXT NOT NULL DEFAULT 'none'"],['discount_value','INTEGER NOT NULL DEFAULT 0'],['discount_amount','INTEGER NOT NULL DEFAULT 0'],['refund_total','INTEGER NOT NULL DEFAULT 0'],['payments',"TEXT NOT NULL DEFAULT '[]'"],['bill_requested','INTEGER NOT NULL DEFAULT 0'],['paid_item_total','INTEGER NOT NULL DEFAULT 0'],['merged_into','INTEGER'],['delivery_location','TEXT']] as const){if(columns.some((c:any)=>c.name===name))continue;try{await db.prepare(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`).run()}catch(e){columns=(await db.prepare('PRAGMA table_info(orders)').all()).results||[];if(!columns.some((c:any)=>c.name===name))throw e;}columns.push({name})}})().catch((e:any)=>{schemaReady.delete(db);throw e});schemaReady.set(db,pending)}await pending}
export const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const err=(message:string,status=400)=>{throw Object.assign(new Error(message),{status})};
const dailyReportSchema = new WeakMap<object,Promise<void>>();

async function ensureDailyReportSchema(db:any) {
 let pending=dailyReportSchema.get(db);
 if(!pending){
  pending=(async()=>{
   await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS daily_sales_reports (day TEXT PRIMARY KEY, orders_count INTEGER NOT NULL, net_sales INTEGER NOT NULL, net_received INTEGER NOT NULL, receivable INTEGER NOT NULL, refunds INTEGER NOT NULL, generated_at INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS orders_report_delivered ON orders(delivered DESC,id DESC) WHERE demo=0 AND stage=4 AND merged_into IS NULL'),
   ]);
  })().catch(error=>{dailyReportSchema.delete(db);throw error});
  dailyReportSchema.set(db,pending);
 }
 await pending;
}

function reportDayAt(time:number) {
 return new Date(time+3*3600000).toISOString().slice(0,10);
}

export async function archiveDailySales(db:any,time=Date.now()) {
 await ensureOrderSchema(db);
 await ensureDailyReportSchema(db);
 const date=reportDayAt(time-86400000);
 const start=Date.parse(date+'T00:00:00+03:00');
 await db.prepare(`
  WITH closed AS (
   SELECT total,paid_item_total,refund_total,payment,payments
   FROM orders WHERE demo=0 AND stage=4 AND merged_into IS NULL AND delivered>=? AND delivered<?
  ), ledger AS (
   SELECT
    CASE WHEN json_extract(p.value,'$.method') IN ('Açık Hesap','Açık Hesap (Cari)') AND COALESCE(json_extract(p.value,'$.status'),'paid')='paid' THEN 'receivable'
     ELSE COALESCE(json_extract(p.value,'$.status'),'paid') END AS status,
    CAST(json_extract(p.value,'$.amount') AS INTEGER) AS amount
   FROM closed,json_each(closed.payments) AS p
   UNION ALL
   SELECT CASE WHEN payment IN ('Açık Hesap','Açık Hesap (Cari)') THEN 'receivable' ELSE 'paid' END,total
   FROM closed WHERE json_array_length(payments)=0
  )
  INSERT OR IGNORE INTO daily_sales_reports(day,orders_count,net_sales,net_received,receivable,refunds,generated_at)
  SELECT ?, (SELECT COUNT(*) FROM closed), COALESCE((SELECT SUM(total+paid_item_total) FROM closed),0),
   COALESCE(SUM(CASE WHEN status='paid' THEN amount WHEN status='refund' THEN -ABS(amount) ELSE 0 END),0),
   COALESCE(SUM(CASE WHEN status IN ('receivable','receivable_adjustment') THEN amount ELSE 0 END),0),
   COALESCE((SELECT SUM(refund_total) FROM closed),0), ?
  FROM ledger
 `).bind(start,start+86400000,date,time).run();
}

function orderRow(o:any){const items=JSON.parse(o.items),adjustments=JSON.parse(o.adjustments||'[]'),productNotes=adjustments.filter((a:any)=>a.status==='product_note').map((a:any)=>({index:a.index,note:a.note,source:a.source||'manual',created:a.created})),savedPayments=JSON.parse(o.payments||'[]'),platform=o.platform||'Restoran',fallbackMethod=o.payment==='Online'||o.payment==='Online Ödeme'?(platform==='Trendyol'?'Trendyol Online':platform==='Yemeksepeti'?'YS Online':o.payment):o.payment;const payments=savedPayments.length?savedPayments.map((p:any)=>({...p,method:p.method||fallbackMethod,amount:safeNumber(p.amount)/100})):o.stage===4?[{method:fallbackMethod,amount:safeNumber(o.total)/100,status:o.payment==='Açık Hesap'?'receivable':'paid',created:o.delivered||o.created}]:[];return {id:o.id,brand:o.brand,platform,serviceType:o.service_type||'package',tableNo:o.table_no||null,billRequested:!!o.bill_requested,paidItemTotal:safeNumber(o.paid_item_total)/100,reportTotal:(safeNumber(o.total)+safeNumber(o.paid_item_total))/100,mergedInto:o.merged_into||null,phone:o.phone||'',customer:o.customer,area:o.area,items,adjustments,productNotes,subtotal:safeNumber(o.subtotal||o.total)/100,discountType:o.discount_type||'none',discountValue:safeNumber(o.discount_value)/100,discountAmount:safeNumber(o.discount_amount)/100,refundTotal:safeNumber(o.refund_total)/100,payments,note:o.note,total:safeNumber(o.total)/100,payment:o.payment,stage:safeNumber(o.stage),courierId:o.courier_id,version:safeNumber(o.version),created:safeNumber(o.created),departed:safeNumber(o.departed),delivered:safeNumber(o.delivered),demo:!!o.demo}}
function parseOrderItem(value:string){const m=String(value).match(/^(\d+) × (.+) · ₺([\d.,]+)$/);if(!m)return null;const unit=Math.round(Number(m[3].replace(/\./g,'').replace(',','.'))*100);if(!Number.isSafeInteger(unit)||unit<0)return null;return {quantity:Number(m[1]),name:m[2],unit}}
const formatOrderItem=(quantity:number,name:string,unit:number)=>quantity+' × '+name+' · ₺'+(unit/100).toFixed(2).replace('.',',');
function productNoteText(entry:any,fallback:any){const values=[entry?.productNote,entry?.product_note,entry?.itemNote,entry?.item_note,entry?.specialInstructions,entry?.special_instructions,entry?.comment,entry?.note,entry?.notes,fallback];for(const value of values){const text=typeof value==='string'?value:typeof value?.note==='string'?value.note:typeof value?.product_note==='string'?value.product_note:typeof value?.comment==='string'?value.comment:typeof value?.text==='string'?value.text:Array.isArray(value)?value.map((x:any)=>typeof x==='string'?x:typeof x?.note==='string'?x.note:typeof x?.text==='string'?x.text:'').filter(Boolean).join(' · '):'';if(text.trim())return text.trim().slice(0,320)}return ''}
function calculateBill(items:string[],adjustments:any[],discountType:string,discountValue:number){const subtotal=items.reduce((sum,item,index)=>{const rows=adjustments.filter((a:any)=>a.index===index),terminal=rows.some((a:any)=>['cancelled','refunded','comp','paid'].includes(a.status));if(terminal)return sum;const line=parseOrderItem(item);if(!line)return sum;const deductions=rows.filter((a:any)=>['item_discount','partial_paid'].includes(a.status)).reduce((n:number,a:any)=>n+Math.max(0,Number(a.amount)||0),0);return sum+Math.max(0,line.quantity*line.unit-deductions)},0);const discountAmount=discountType==='percent'?Math.min(subtotal,Math.round(subtotal*discountValue/10000)):discountType==='amount'?Math.min(subtotal,discountValue):0;return {subtotal,discountAmount,total:subtotal-discountAmount}}
async function ensureOpsSchema(db:any){let pending=opsSchemaReady.get(db);if(!pending){pending=(async()=>{await db.batch([db.prepare('CREATE TABLE IF NOT EXISTS printer_devices (id TEXT PRIMARY KEY,name TEXT NOT NULL,address TEXT NOT NULL DEFAULT \'\',types TEXT NOT NULL DEFAULT \'[]\',main_channel TEXT NOT NULL DEFAULT \'\',active INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL,last_seen INTEGER)'),db.prepare('CREATE TABLE IF NOT EXISTS printer_discovery (name TEXT PRIMARY KEY,last_seen INTEGER NOT NULL)'),db.prepare('CREATE TABLE IF NOT EXISTS print_queue (id TEXT PRIMARY KEY,order_id INTEGER,printer_type TEXT NOT NULL,printer_name TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL DEFAULT \'pending\',created_at INTEGER NOT NULL,claimed_at INTEGER,completed_at INTEGER,error TEXT)'),db.prepare('CREATE INDEX IF NOT EXISTS print_queue_status_created_idx ON print_queue(status,created_at)'),db.prepare('CREATE TABLE IF NOT EXISTS print_bridge_tokens (id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,created_at INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0)'),db.prepare('CREATE TABLE IF NOT EXISTS webhook_tokens (platform TEXT PRIMARY KEY,token_hash TEXT NOT NULL,updated_at INTEGER NOT NULL)'),db.prepare('CREATE TABLE IF NOT EXISTS external_orders (platform TEXT NOT NULL,external_id TEXT NOT NULL,order_id INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(platform,external_id))'),db.prepare('CREATE TABLE IF NOT EXISTS request_idempotency (request_id TEXT PRIMARY KEY,response_json TEXT NOT NULL,status INTEGER NOT NULL,created_at INTEGER NOT NULL)')])})();opsSchemaReady.set(db,pending)}await pending}
function safeTicketText(order:any,kitchen=false){const lines=['================================',order.brand==='mixed'?'EASY WINGY / EASY MACARONI':order.brand==='mac'?'EASY MACARONI':'EASY WINGY',(kitchen?'MUTFAK FİŞİ':'KASA / KURYE FİŞİ')+' · #'+order.id,'Tarih: '+new Date(order.created||Date.now()).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}),'Tür: '+(order.service_type==='table'?'Masa '+order.table_no:order.service_type==='pickup'?'Gel-Al':'Paket Servis'),...(order.platform&&order.platform!=='Restoran'?['Kanal: '+String(order.platform).toLocaleUpperCase('tr-TR')]:[]),'--------------------------------'];let items:any[]=[];try{items=JSON.parse(order.items||'[]')}catch{}let adjustments:any[]=[];try{adjustments=JSON.parse(order.adjustments||'[]')}catch{}for(const [index,item] of items.entries()){const line=parseOrderItem(item);if(!line)continue;lines.push(`${line.quantity} x ${line.name}${kitchen?'':' · '+(line.quantity*line.unit/100).toFixed(2)+' TL'}`);const note=adjustments.find((a:any)=>a.index===index&&a.status==='product_note')?.note;if(note)lines.push('  NOT: '+String(note).slice(0,180))}if(!kitchen){lines.push('--------------------------------','Ödeme: '+String(order.payment||'—'),'Ara Toplam: '+(safeNumber(order.subtotal||order.total)/100).toFixed(2)+' TL');if(safeNumber(order.discount_amount)>0)lines.push('İndirim: -'+(safeNumber(order.discount_amount)/100).toFixed(2)+' TL');lines.push('NET TOPLAM: '+(safeNumber(order.total)/100).toFixed(2)+' TL');if(order.service_type==='package')lines.push('Müşteri: '+String(order.customer||'').slice(0,80),'Telefon: '+String(order.phone||'').slice(0,30),'Adres: '+String(order.area||'').slice(0,180))}lines.push('================================','\n\n');
const structItems=items.map((item,index)=>{const line=parseOrderItem(item);if(!line)return null;const note=adjustments.find((a:any)=>a.index===index&&a.status==='product_note')?.note||'';return {qty:line.quantity,name:line.name,price:line.unit/100,total:(line.quantity*line.unit)/100,note};}).filter(Boolean);
const escposPayload={orderNo:order.id,brand:order.brand||'wingy',channel:(order.platform&&order.platform!=='Restoran'?order.platform:(order.service_type==='table'?'Masa '+order.table_no:order.service_type==='pickup'?'Gel Al':'Paket Servis')),createdAt:order.created||Date.now(),paymentType:String(order.payment||'—'),customerName:String(order.customer||''),phone:String(order.phone||''),address:String(order.area||''),note:String(order.note||''),items:structItems,subtotal:safeNumber(order.subtotal||order.total)/100,discount:safeNumber(order.discount_amount)/100,total:safeNumber(order.total)/100};
return lines.join('\n')+'\n__ESCPOS_JSON__:'+JSON.stringify(escposPayload);}
function findTicketPrinter(db:any,type:string){
 return db.prepare("SELECT name FROM printer_devices WHERE active=1 AND (instr(types,?)>0 OR (?='Kurye' AND instr(types,'\"Adisyon\"')>0)) ORDER BY CASE WHEN main_channel=? THEN 0 ELSE 1 END,updated_at DESC LIMIT 1").bind('"'+type+'"',type,type).first();
}
async function enqueuePrint(db:any,order:any,type:string){
 const printer=await findTicketPrinter(db,type);
 if(!printer)return;
 await db.prepare("INSERT INTO print_queue (id,order_id,printer_type,printer_name,content,status,created_at) VALUES (?,?,?,?,?,'pending',?)")
  .bind(crypto.randomUUID(),order.id,type,printer.name,safeTicketText(order,type==='Mutfak'),Date.now()).run();
}
const pilotSellerId='788216';
function ensureTrendyolMapping(db:any){
 return db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS trendyol_pilot (id INTEGER PRIMARY KEY CHECK(id=1), store_id TEXT NOT NULL)'),
  db.prepare("INSERT OR IGNORE INTO trendyol_pilot (id,store_id) VALUES (1,'201813')"),
  db.prepare("CREATE TABLE IF NOT EXISTS trendyol_products (store_id TEXT NOT NULL, external_id TEXT NOT NULL, external_name TEXT NOT NULL, product_id TEXT, PRIMARY KEY(store_id,external_id))")
 ]);
}
async function trendyolMapping(request:Request,db:any){
 await ensureTrendyolMapping(db);
 const pilot=await db.prepare('SELECT store_id FROM trendyol_pilot WHERE id=1').first();
 const storeId=String(pilot?.store_id||'');
 if(request.method==='GET'){
  const [external,menu]=await Promise.all([
   db.prepare('SELECT external_id,external_name,product_id FROM trendyol_products WHERE store_id=? ORDER BY external_name,external_id').bind(storeId).all(),
   db.prepare("SELECT id,name FROM menu_products WHERE active=1 AND brand='wingy' ORDER BY name").all()
  ]);
  return json({storeId,sellerId:pilotSellerId,external:external.results||[],menu:menu.results||[]});
 }
 if(request.method!=='POST')return json({error:'Yöntem desteklenmiyor.'},405);
 const body:any=await request.json();
 if(body.action==='store'){
  const id=String(body.storeId||'').trim();
  if(!/^\d{1,20}$/.test(id))err('Geçerli Trendyol restoran ID gir.');
  await db.prepare('INSERT INTO trendyol_pilot (id,store_id) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET store_id=excluded.store_id').bind(id).run();
  return json({ok:true});
 }
 if(body.action!=='map'||!storeId||body.storeId!==storeId)err('Easy Wingy restoran seçimini kontrol et.');
 const id=String(body.externalId||'').trim(),name=String(body.externalName||'').trim();
 const productId=String(body.productId||'').trim()||null;
 if(!id||id.length>120||!name||name.length>200)err('Trendyol ürün kodu ve adı gerekli.');
 if(productId&&!await db.prepare("SELECT id FROM menu_products WHERE brand='wingy' AND active=1 AND id=?").bind(productId).first())err('Easy Wingy menüsünden aktif bir ürün seç.');
 await db.prepare('INSERT INTO trendyol_products (store_id,external_id,external_name,product_id) VALUES (?,?,?,?) ON CONFLICT(store_id,external_id) DO UPDATE SET external_name=excluded.external_name,product_id=excluded.product_id').bind(storeId,id,name,productId).run();
 return json({ok:true});
}

const TY_DEFAULT_SUPPLIER = "788216";
const TY_DEFAULT_STORE = "201813";


async function ensureTrendyolConfig(db:any){
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS trendyol_config (id INTEGER PRIMARY KEY CHECK(id=1), supplier_id TEXT NOT NULL, store_id TEXT NOT NULL, basic_token TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_sync INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '')"),
    db.prepare("INSERT OR IGNORE INTO trendyol_config (id,supplier_id,store_id,basic_token,enabled,last_sync,last_error) VALUES (1,?,?,?,1,0,'')").bind(TY_DEFAULT_SUPPLIER, TY_DEFAULT_STORE, "")
  ]);
}

function mapTrendyolPackage(pkg:any){
  const lines = Array.isArray(pkg?.lines) ? pkg.lines : (Array.isArray(pkg?.items) ? pkg.items : []);
  function options(line:any):string[] {
    return [...(line.extraIngredients||[]).map((x:any)=>"+ "+x.name),
      ...(line.removedIngredients||[]).map((x:any)=>"Çıkar: "+x.name),
      ...(line.modifierProducts||[]).flatMap((x:any)=>[x.name,...options(x)])];
  }
  const items = lines.flatMap((line:any) => {
    const quantity = Array.isArray(line.items) ? line.items.filter((x:any)=>!x.isCancelled).length : Number(line.quantity ?? 1);
    if(!quantity)return [];
    return [{productId:line.productId,name:line.name,quantity,price:line.price ?? line.unitSellingPrice,
      note:[line.note,...options(line)].filter(Boolean).join(", ")}];
  });
  const addr = pkg?.address || pkg?.shipmentAddress || {};
  const fullAddr = [
    addr?.neighborhood || addr?.mahalle,
    addr?.street || addr?.address1 || addr?.fullAddress || addr?.openAddress,
    addr?.apartmentNumber ? "Apt:" + addr.apartmentNumber : "",
    addr?.floor ? "Kat:" + addr.floor : "",
    addr?.doorNumber ? "D:" + addr.doorNumber : "",
    addr?.addressDescription || addr?.description ? "(" + (addr.addressDescription || addr.description) + ")" : "",
    addr?.district || addr?.ilce
  ].filter(Boolean).join(" ");
  const custName = [pkg?.customer?.firstName || addr?.firstName, pkg?.customer?.lastName || addr?.lastName].filter(Boolean).join(" ") || pkg?.customerName || "Trendyol Müşteri";
  return {
    id:String(pkg.id||''), supplierId:pkg.supplierId, storeId:pkg.storeId, status:'approved',
    onDelivery:pkg.payment?.paymentType==='PAY_WITH_ON_DELIVERY',
    customer: {
      name: custName,
      phone: String(pkg?.customer?.phone || addr?.phone || pkg?.phone || ""),
      address: fullAddr || String(pkg?.deliveryAddress || "Trendyol Adres")
    },
    note: String(pkg?.customerNote || pkg?.orderNote || pkg?.note || ""),
    discount: (() => {
      const explicit = Number(pkg?.totalDiscount ?? pkg?.discountAmount ?? 0);
      if (explicit > 0) return explicit;
      let promoSum = 0;
      for (const line of lines) {
        const subLines = Array.isArray(line?.items) ? line.items.filter((item:any) => !item?.isCancelled) : [line];
        for (const subLine of subLines) {
          if (subLine?.coupon) {
            const amount = Number(subLine.coupon?.amount?.seller ?? subLine.coupon?.sellerAmount ?? subLine.coupon?.amount?.total ?? subLine.coupon?.amount ?? 0);
            if (amount > 0) promoSum += amount;
          }
          for (const promotion of subLine?.promotions || []) {
            const amount = Number(promotion?.amount?.seller ?? promotion?.sellerAmount ?? promotion?.amount?.total ?? promotion?.amount ?? 0);
            if (amount > 0) promoSum += amount;
          }
        }
        for (const promotion of line?.promotions || []) {
          const amount = Number(promotion?.amount?.seller ?? promotion?.sellerAmount ?? promotion?.amount?.total ?? promotion?.amount ?? 0);
          if (amount > 0) promoSum += amount;
        }
      }
      if (promoSum > 0) return Math.round(promoSum * 100) / 100;
      const seller = Number(pkg?.totalSellerDiscount ?? 0) + Number(pkg?.totalCouponAmount ?? 0) + Number(pkg?.totalTrendyolDiscount ?? 0);
      if (seller > 0) return seller;
      const gross = Number(pkg?.grossAmount ?? pkg?.totalGrossAmount ?? 0);
      const net = Number(pkg?.totalPrice ?? 0);
      return gross > net && net > 0 ? Math.round((gross - net) * 100) / 100 : 0;
    })(),
    total: Number(pkg?.totalPrice ?? pkg?.grossAmount ?? 0),
    items
  };
}

const tyOrderPath='/order/meal/suppliers/788216/packages';
const tyStoresPath='/store/meal/suppliers/788216/stores';

async function mealRequest(db:any, env:any, executor:string, path:string, body?:any, method?:string){
  await ensureTrendyolConfig(db);
  const cfg=await db.prepare('SELECT * FROM trendyol_config WHERE id=1').first();
  const token=env?.TRENDYOL_BASIC_TOKEN || cfg?.basic_token;
  if(!token)err('Cloudflare ayarlarına TRENDYOL_BASIC_TOKEN ekleyin.',503);
  if(!executor)err('Trendyol işlemleri için yetkili e-postasını girin.',422);
  const res=await fetch('https://api.tgoapis.com/integrator'+path,{
    method:method|| (body!==undefined?'PUT':'GET'),redirect:'manual',signal:AbortSignal.timeout(12000),
    headers:{Authorization:'Basic '+token,'User-Agent':'788216 - SelfIntegration',
      'x-agentname':env?.TRENDYOL_AGENT_NAME||'EasyPOS','x-executor-user':executor,'Content-Type':'application/json',Accept:'application/json'},
    body:body&&typeof body==='object'?JSON.stringify(body):undefined
  });
  const raw=await res.text();
  let data:any=null;try{data=JSON.parse(raw)}catch{}
  // Show pagination on successful reads without exposing customer details.
  const summary=res.ok ? JSON.stringify(Object.fromEntries(['totalCount','totalPages','page','size','totalElements'].filter(k=>typeof data?.[k]==='number').map(k=>[k,data[k]]))) :
    raw.split(token).join('[gizli]').replace(/[\w.+-]+@[\w.-]+/g,'[e-posta]').slice(0,350);
  return {ok:res.ok,status:res.status,summary,data};
}

export async function syncTrendyolOrders(db:any,env:any,executor:string){
  await ensureOpsSchema(db);
  await ensureOrderSchema(db);
  await ensureTrendyolMapping(db);
  const pilot=await db.prepare('SELECT store_id FROM trendyol_pilot WHERE id=1').first();
  if(pilot?.store_id!==TY_DEFAULT_STORE)err('Easy Wingy pilot şubesini seçin.',409);
  const end=Date.now(), packages:any[]=[];
  let page=0,result;
  do{
    const query=new URLSearchParams({storeId:TY_DEFAULT_STORE,packageStatuses:'Created,Picking',page:String(page),size:'50',
      packageModificationStartDate:String(end-86400000),packageModificationEndDate:String(end)});
    result=await mealRequest(db,env,executor,tyOrderPath+'?'+query);
    if(!result.ok||!Array.isArray(result.data?.content))return {ok:false,status:result.status,summary:result.summary,error:'Sipariş listesi alınamadı.'};
    packages.push(...result.data.content);
  }while(++page<result.data.totalPages);
  let imported=0;const failures:string[]=[];
  for(const pkg of packages){
    if(String(pkg.storeId)!==TY_DEFAULT_STORE||String(pkg.supplierId)!==TY_DEFAULT_SUPPLIER||!['Created','Picking'].includes(pkg.packageStatus))continue;
    try{
      const order=mapTrendyolPackage(pkg);
      if(!order.id||!order.items.length||order.items.length>75||order.items.some((i:any)=>!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>50))throw Error('Paket ürünleri geçersiz.');
      if(pkg.packageStatus==='Created'){
        const accept=await mealRequest(db,env,executor,tyOrderPath+'/picked',{packageId:order.id,preparationTime:Number(env?.TRENDYOL_PREPARATION_MINUTES||30)});
        if(!accept.ok)throw Error('Kabul HTTP '+accept.status+' '+accept.summary);
      }
      const saved=await saveWebhookOrder(db,'Trendyol',order);
      if(!saved.duplicate&&!saved.ignored)imported++;
    }catch(e:any){failures.push(String(e.message).slice(0,350))}
  }
  return {ok:!failures.length,fetched:packages.length,imported,status:result.status,summary:result.summary,scheduled:!!env?.TRENDYOL_EXECUTOR_EMAIL,error:failures.slice(0,3).join(' / ')};
}


async function resolveTrendyolExecutor(db:any,env:any,email:string){
  const configured=String(env?.TRENDYOL_EXECUTOR_EMAIL||'').trim()||String(email||'').trim();
  if(configured)return configured;
  try{
    const row=await db.prepare("SELECT email FROM members WHERE role='admin' AND active=1 AND email LIKE '%@%' ORDER BY created LIMIT 1").first();
    return String(row?.email||'').trim();
  }catch{return '';}
}

async function syncPlatformOrderStage(db:any, env:any, executor:string, orderId:number, targetStage:number){
  const result={ok:true,packageId:'',sent:[] as number[],alreadySent:[] as number[],error:'',skipped:''};
  const log=async(action:string,detail:string)=>db.prepare("INSERT INTO events (order_id,actor,action,created,detail) VALUES (?,?,?,?,?)")
    .bind(orderId,"integration:Trendyol",action,Date.now(),detail.slice(0,350)).run();
  let currentStep=targetStage;
  try{
    const ext=await db.prepare("SELECT platform,external_id FROM external_orders WHERE order_id=?").bind(orderId).first();
    if(!ext){
      const order=await db.prepare('SELECT platform FROM orders WHERE id=?').bind(orderId).first();
      if(order?.platform==='Trendyol'){result.ok=false;result.skipped='external_orders kaydı bulunamadı.';await log('platform_sync_skip','Trendyol eşlemesi yok: external_orders kaydı bulunamadı.')}
      return result;
    }
    if(ext.platform!=="Trendyol"||!ext.external_id){result.ok=false;result.skipped='Trendyol packageId eşlemesi geçersiz.';await log('platform_sync_skip',result.skipped);return result}
    const pkgId=String(ext.external_id);
    result.packageId=pkgId;
    const exec=await resolveTrendyolExecutor(db,env,executor);
    if(!exec){result.ok=false;result.skipped='Yetkili executor bulunamadı.';await log('platform_sync_skip','Trendyol durum bildirimi atlandı: yetkili executor bulunamadı.');return result}
    const steps:[number,string,any][]=[
      [2, tyOrderPath+"/invoiced", {packageId:pkgId}],
      [3, tyOrderPath+"/"+encodeURIComponent(pkgId)+"/manual-shipped", null],
      [4, tyOrderPath+"/"+encodeURIComponent(pkgId)+"/manual-delivered", null]
    ];
    for(const [st,path,body] of steps){
      currentStep=st;
      if(targetStage<st)continue;
      const done=await db.prepare("SELECT 1 FROM events WHERE order_id=? AND action=? LIMIT 1").bind(orderId,"platform_sync_"+st).first();
      if(done){result.alreadySent.push(st);continue}
      const res=await mealRequest(db,env,exec,path,body,'PUT');
      if(res.ok){
        result.sent.push(st);
        await log("platform_sync_"+st,"Trendyol HTTP "+res.status+"; aşama "+st+" bildirildi. Yanıt: "+(res.summary||'boş'));
      }else{
        result.ok=false;result.error='Aşama '+st+' HTTP '+res.status+' '+res.summary;
        await log("platform_sync_err","Trendyol aşama "+st+" HTTP "+res.status+" "+res.summary);
        break;
      }
    }
  }catch(e:any){
    result.ok=false;result.error='Aşama '+currentStep+' isteği başarısız: '+String(e?.message||e);
    try{await log('platform_sync_err','Trendyol '+result.error)}catch{}
    console.error("Platform stage sync error",e?.message||e);
  }
  return result;
}

async function platformStatus(db:any,env:any,executor:string,change:any){
  await db.prepare('CREATE TABLE IF NOT EXISTS meal_store_state (id TEXT PRIMARY KEY, state TEXT, restore_min INTEGER, restore_max INTEGER)').run();
  const row=await db.prepare('SELECT * FROM meal_store_state WHERE id=?').bind(TY_DEFAULT_STORE).first();
  const remote=await mealRequest(db,env,executor,tyStoresPath+'?page=0&size=50');
  const store=remote.data?.restaurants?.find((r:any)=>String(r.id)===TY_DEFAULT_STORE);
  if(!remote.ok||!store)return {ok:false,status:remote.status,summary:remote.summary,error:'Easy Wingy şube bilgisi alınamadı.'};
  const current=store.workingStatus==='OPEN'&&row?.state==='BUSY'?'BUSY':store.workingStatus;
  const state=change?.state||current;
  const base=tyStoresPath+'/'+TY_DEFAULT_STORE;
  if(change){
    if(change.storeId!==TY_DEFAULT_STORE||!['OPEN','CLOSED','BUSY'].includes(state))err('Geçersiz şube veya durum.',422);
    let min=row?.restore_min??null,max=row?.restore_max??null;
    const update=async(path:string,body:any)=>{
      const r=await mealRequest(db,env,executor,base+path,body);
      if(!r.ok)err('Trendyol HTTP '+r.status+' '+r.summary,502);
    };
    if(state==='BUSY'){
      if(store.workingStatus!=='OPEN'||store.deliveryType!=='STORE')err('Yoğun modu açık ve kendi kuryesiyle çalışan şubeler kullanabilir.',409);
      if(current!=='BUSY'){
        min=Number(change.min);max=Number(change.max);
        if(!Number.isInteger(min)||!Number.isInteger(max)||min%5||max%5||min<15||max<=min||max>80)err('Normal teslimat aralığını 5 dakikalık adımlarla girin (15–80 dk).',422);
        await update('/average-delivery-time',{min:min+10,max:max+10});
      }
    }else{
      if(row?.state==='BUSY')await update('/average-delivery-time',{min,max});
      if(store.workingStatus!==state)await update('/status',{status:state});
      min=null;max=null;
    }
    await db.prepare('INSERT OR REPLACE INTO meal_store_state VALUES (?,?,?,?)').bind(TY_DEFAULT_STORE,state,min,max).run();
  }
  return {ok:true,state,status:remote.status};
}

async function saveWebhookOrder(db:any,platform:string,payload:any){await ensureMenuSchema(db);const trendyol=platform==='Trendyol';let storeId='', mappings=new Map<string,string>();
if(trendyol){
 await ensureTrendyolMapping(db);
 const pilot=await db.prepare('SELECT store_id FROM trendyol_pilot WHERE id=1').first();
 storeId=String(payload?.storeId??'');
 if(!pilot||storeId!==pilot.store_id||String(payload?.supplierId??payload?.sellerId??'')!==pilotSellerId)return {ok:true,ignored:true,reason:'Pilot restoran dışında.'};
 const rows=(await db.prepare('SELECT external_id,product_id FROM trendyol_products WHERE store_id=?').bind(storeId).all()).results||[];
 mappings=new Map(rows.filter((row:any)=>row.product_id).map((row:any)=>[row.external_id,row.product_id]));
}
const externalId=String(payload?.id??payload?.orderId??payload?.order_id??'').trim().slice(0,120);if(!externalId)err('Platform sipariş numarası eksik.',422);const prior=await db.prepare('SELECT order_id FROM external_orders WHERE platform=? AND external_id=?').bind(platform,externalId).first();if(prior)return {ok:true,duplicate:true,id:prior.order_id};const status=String(payload?.status??payload?.state??payload?.orderStatus??(trendyol?'':'approved')).toLocaleLowerCase('tr-TR');if(!['approved','accepted','confirmed','preparing','hazirlaniyor','hazırlanıyor','created'].includes(status)||(trendyol&&status==='created'))return {ok:true,ignored:true,reason:'Sipariş onaylı değil.'};const entries=payload?.items??payload?.products??payload?.lines;if(!Array.isArray(entries)||!entries.length||entries.length>75)err('Sipariş ürünleri geçersiz.',422);const menu=(await db.prepare('SELECT id,name,ys_price,brand FROM menu_products WHERE active=1').all()).results||[];const norm=(v:any)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]+/g,' ').trim();const lines:string[]=[],notes:any[]=[],brands=new Set<string>(),now=Date.now();const observed=new Map<string,string>();
for(const [index,entry] of entries.entries()){
 const name=String(entry?.name??entry?.productName??entry?.product_name??entry?.title??'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,200);
 const code=String(entry?.productId??entry?.product_id??entry?.sku??'').trim().slice(0,120);
 const product=trendyol ? menu.find((p:any)=>p.brand==='wingy'&&p.id===mappings.get(code))
  : menu.find((p:any)=>code&&p.id===code)||menu.find((p:any)=>norm(p.name)===norm(name));
 const quantity=Number(entry?.quantity??entry?.qty??entry?.amount??1);
 if(!Number.isInteger(quantity)||quantity<1||quantity>50||(!trendyol&&!product))err('Platform siparişindeki ürün geçersiz: '+(name||'ürün'),422);
 const price=entry?.unitPrice??entry?.price;
 const unit=trendyol&&price!=null ? Math.max(0,Math.round(safeNumber(price)*100)) : safeNumber(product?.ys_price);
 lines.push(formatOrderItem(quantity,product?.name||name||'Trendyol ürün '+(code||String(index+1)),unit));
 if(product)brands.add(product.brand);
 if(trendyol&&code)observed.set(code,name||'Trendyol ürün '+code);
 const note=productNoteText(entry,null).replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ');
 if(note)notes.push({index,status:'product_note',note,source:'platform',created:now});
}
const brand=trendyol?'wingy':brands.size>1?'mixed':brands.values().next().value||'wingy' ,customer=String(payload?.customer?.name??payload?.customerName??payload?.customer_name??payload?.name??'Online Müşteri').trim().slice(0,90),phone=String(payload?.customer?.phone??payload?.phone??'').slice(0,30),address=String(payload?.customer?.address??payload?.address??payload?.deliveryAddress??payload?.delivery_address??'').slice(0,240),note=String(payload?.note??payload?.orderNote??payload?.order_note??'').slice(0,500),discount=Math.max(0,Math.round(safeNumber(payload?.discount??payload?.discountAmount??payload?.discount_amount)*100)),bill=calculateBill(lines,notes,'amount',Math.min(discount,calculateBill(lines,notes,'none',0).subtotal)),payment=trendyol&&payload.onDelivery?'Kapıda Ödeme':platform==='Trendyol'?'Trendyol Online':'YS Online',paymentAmount=bill.discountAmount>0?bill.total:(Math.round(safeNumber(payload?.total??payload?.totalPrice??payload?.total_price)*100)||bill.total);const insert=db.prepare("INSERT INTO orders (brand,platform,service_type,table_no,phone,customer,area,items,adjustments,note,subtotal,discount_type,discount_value,discount_amount,refund_total,payments,total,payment,stage,version,created,business_day,demo) VALUES (?,?, 'package',NULL,?,?,?,?,?,?,?,?,?,?,0,?,?,?,1,1,?,?,0)").bind(brand,platform,phone,customer,address,JSON.stringify(lines),JSON.stringify(notes),note,bill.subtotal,'amount',bill.discountAmount,bill.discountAmount,JSON.stringify(trendyol&&payload.onDelivery?[]:[{method:payment,amount:paymentAmount,status:'paid',created:now}]),Math.max(0,paymentAmount),payment,now,day());
const printTypes=['Mutfak',trendyol?'Adisyon':'Kurye'];
const printers=await Promise.all(printTypes.map(type=>findTicketPrinter(db,type)));
const printStatements=printTypes.flatMap((type,index)=>{
 const printer=printers[index];
 if(!printer)return [];
 const ticket=safeTicketText({id:'__ORDER_ID__',brand,service_type:'package',created:now,items:JSON.stringify(lines),
  adjustments:JSON.stringify(notes),payment,platform,subtotal:bill.subtotal,discount_amount:bill.discountAmount,total:paymentAmount,customer,phone,area:address},type==='Mutfak');
 const parts=ticket.split('__ORDER_ID__');
 const sqlExpr=parts.map(()=>'?').join(' || order_id || ');
 return [db.prepare(`INSERT INTO print_queue (id,order_id,printer_type,printer_name,content,status,created_at) SELECT ?,order_id,?,?,${sqlExpr},'pending',? FROM external_orders WHERE platform=? AND external_id=?`)
  .bind(crypto.randomUUID(),type,printer.name,...parts,now,platform,externalId)];
});
let id:number;
try{
 const result=await db.batch([insert,
  db.prepare('INSERT INTO external_orders (platform,external_id,order_id,created_at) VALUES (?,?,last_insert_rowid(),?)').bind(platform,externalId,now),
  db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT order_id,?,?,?,? FROM external_orders WHERE platform=? AND external_id=?')
   .bind('integration:'+platform,'external_order_created',now,'Onaylı '+platform+' siparişi doğrudan hazırlamaya alındı',platform,externalId),
  ...printStatements,
  ...[...observed].map(([code,name])=>db.prepare('INSERT INTO trendyol_products (store_id,external_id,external_name) VALUES (?,?,?) ON CONFLICT(store_id,external_id) DO UPDATE SET external_name=excluded.external_name').bind(storeId,code,name))
 ]);
 id=result[0].meta.last_row_id;
}catch(error){
 const duplicate=await db.prepare('SELECT order_id FROM external_orders WHERE platform=? AND external_id=?').bind(platform,externalId).first();
 if(duplicate)return {ok:true,duplicate:true,id:duplicate.order_id};
 throw error;
}
return {ok:true,id,stage:'Hazırlanıyor'}}
export async function handle(request:Request,db:any,env?:any){
 const key=request.headers.get('x-idempotency-key');
 const orderWrite=key&&/^[\w-]{16,80}$/.test(key)&&request.method==='POST'&&/^\/api\/orders\/(create|action)$/.test(new URL(request.url).pathname);
 if(!orderWrite||!db)return handleCore(request,db,env);
 try{
  await ensureOpsSchema(db);
  const cached=await db.prepare('SELECT response_json,status FROM request_idempotency WHERE request_id=? AND status BETWEEN 200 AND 299').bind(key).first();
  if(cached)return new Response(cached.response_json,{status:cached.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }catch{
  return json({error:'İşlem anahtarı doğrulanamadı. Tekrar dene.'},503);
 }
 const response=await handleCore(request,db,env);
 if(response.ok){
  try{
   const body=await response.clone().text();
   await db.prepare('INSERT INTO request_idempotency (request_id,response_json,status,created_at) VALUES (?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET response_json=excluded.response_json,status=excluded.status,created_at=excluded.created_at WHERE request_idempotency.status NOT BETWEEN 200 AND 299').bind(key,body,response.status,Date.now()).run();
  }catch(error){
   console.error('Could not retain order write result',error);
  }
 }
 return response;
}
async function handleCore(request:Request,db:any,env?:any){try{
 if(!db)return json({error:'Veritabanı henüz hazır değil.'},503);
 await ensureOpsSchema(db);
 await ensureOrderSchema(db);
 await ensureCostSchema(db);
 const uid=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();

 const path=new URL(request.url).pathname,method=request.method;
 if(method!=='GET'){
  if(!new URL(request.url).pathname.startsWith('/api/webhooks/')&&!['/api/print-queue','/api/print-bridge/heartbeat'].includes(new URL(request.url).pathname)&&request.headers.get('origin')!==new URL(request.url).origin) return json({error:'Geçersiz istek kaynağı.'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON bekleniyor.'},415);
  const bodyLimit=path==='/api/costs'?6_500_000:path.startsWith('/api/webhooks/')?128_000:16000;if(Number(request.headers.get('content-length')||0)>bodyLimit)return json({error:'İstek çok büyük.'},413);
 }
 if(path==='/api/webhooks/yemeksepeti'||path==='/api/webhooks/trendyol'){
  if(method!=='POST')return json({error:'Webhook için POST kullan.'},405);const platform=path.endsWith('trendyol')?'Trendyol':'Yemeksepeti';const auth=request.headers.get('authorization')||'',token=auth.startsWith('Bearer ')?auth.slice(7):'';if(!token)return json({error:'Webhook anahtarı gerekli.'},401);const key=await db.prepare('SELECT token_hash FROM webhook_tokens WHERE platform=?').bind(platform).first();if(!key||!equal(await hashToken(token),key.token_hash))return json({error:'Webhook anahtarı geçersiz.'},401);let payload:any;try{payload=await request.json()}catch{return json({error:'JSON gövdesi geçersiz.'},400)};try{return json(await saveWebhookOrder(db,platform,payload),200)}catch(e:any){if(e.status)return json({error:e.message},e.status);throw e}
 }
 if(path==='/api/print-bridge/heartbeat'){
  if(method!=='POST')return json({error:'POST bekleniyor.'},405);const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');const row=await db.prepare('SELECT token_hash FROM print_bridge_tokens WHERE revoked=0 ORDER BY created_at DESC LIMIT 1').first();if(!token||!row||!equal(await hashToken(token),row.token_hash))return json({error:'Köprü anahtarı geçersiz.'},401);let b:any;try{b=await request.json()}catch{return json({error:'Geçersiz JSON.'},400)}const detected=Array.isArray(b.printers)?b.printers.slice(0,100).map((x:any)=>String(x).slice(0,120)):[];if(detected.length){const now=Date.now();await db.batch([...detected.map((name:string)=>db.prepare('UPDATE printer_devices SET last_seen=? WHERE active=1 AND (name=? OR address=?)').bind(now,name,name)),...detected.map((name:string)=>db.prepare('INSERT INTO printer_discovery (name,last_seen) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET last_seen=excluded.last_seen').bind(name,now)),db.prepare('DELETE FROM printer_discovery WHERE last_seen<?').bind(now-300000)])}return json({ok:true})
 }
 if(path==='/api/print-queue'){
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return json({error:'Köprü anahtarı gerekli.'},401);const row=await db.prepare('SELECT id,token_hash FROM print_bridge_tokens WHERE revoked=0 ORDER BY created_at DESC LIMIT 1').first();if(!row||!equal(await hashToken(token),row.token_hash))return json({error:'Köprü anahtarı geçersiz.'},401);
  if(method==='GET'){const now=Date.now(),jobs=(await db.prepare("SELECT q.id,q.order_id,q.printer_type,q.printer_name,q.content,q.created_at,(SELECT NULLIF(TRIM(p.address),'') FROM printer_devices p WHERE p.active=1 AND p.name=q.printer_name ORDER BY p.updated_at DESC,p.id LIMIT 1) AS printer_address FROM print_queue q WHERE status='pending' OR (status='processing' AND claimed_at<?) ORDER BY created_at LIMIT 20").bind(now-120000).all()).results||[];if(jobs.length)await db.batch(jobs.map((j:any)=>db.prepare("UPDATE print_queue SET status='processing',claimed_at=? WHERE id=? AND (status='pending' OR (status='processing' AND claimed_at<?))").bind(now,j.id,now-120000)));return json({jobs})}
  if(method==='POST'){let b:any;try{b=await request.json()}catch{return json({error:'Geçersiz JSON.'},400)}if(typeof b.id!=='string'||typeof b.ok!=='boolean')return json({error:'Fiş sonucu geçersiz.'},400);await db.prepare("UPDATE print_queue SET status=?,completed_at=?,error=? WHERE id=? AND status='processing'").bind(b.ok?'printed':'failed',b.ok?Date.now():null,b.ok?null:String(b.error||'Yazdırma başarısız').slice(0,300),b.id).run();return json({ok:true})}return json({error:'İşlem bulunamadı.'},404)
 }
 if(method==='POST'&&path==='/api/login'){
  await db.prepare('CREATE TABLE IF NOT EXISTS admin_login (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL, pin_salt TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
  let b:any;try{b=JSON.parse(await request.text())}catch{return json({error:'Geçersiz istek.'},400)}
  const username=String(b.username||'').trim().toLowerCase();const pin=String(b.pin||'');if(!/^[a-z0-9_]{3,30}$/.test(username)||pin.length>100)return json({error:'Kullanıcı adı veya PIN hatalı.'},401);
  const ts=Date.now();await db.prepare('INSERT INTO login_limits (username,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(username) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END').bind(username,ts+900000,ts,ts,ts+900000).run();
  const limit=await db.prepare('SELECT attempts FROM login_limits WHERE username=?').bind(username).first();if(limit.attempts>5)return json({error:'Çok fazla deneme. 15 dakika sonra tekrar dene.'},429);
  const c=await db.prepare('SELECT id,pin_hash,pin_salt FROM courier_roster WHERE username=? AND active=1 UNION ALL SELECT id,pin_hash,pin_salt FROM admin_login WHERE username=? AND id IN (SELECT id FROM members WHERE active=1)').bind(username,username).first();const owner=await db.prepare('SELECT id,pin_hash,pin_salt FROM admin_login WHERE username=?').bind(username).first();const account=c||owner;
  const value=await pinHash(pin,account?.pin_salt||'unconfigured-login-salt');if(!account||!equal(value,account.pin_hash))return json({error:'Kullanıcı adı veya PIN hatalı.'},401);
  const token=crypto.randomUUID()+crypto.randomUUID();const expiry=ts+43200000;
  await db.batch([db.prepare('INSERT INTO courier_sessions (token_hash,courier_id,expires) VALUES (?,?,?)').bind(await hashToken(token),account.id,expiry),db.prepare('DELETE FROM login_limits WHERE username=?').bind(username),db.prepare('DELETE FROM courier_sessions WHERE expires<?').bind(ts)]);
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':'easy_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200'}});
 }
 const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)easy_session=([^;]+)/)?.[1];
 if(method==='POST'&&path==='/api/logout'){if(cookie)await db.prepare('DELETE FROM courier_sessions WHERE token_hash=?').bind(await hashToken(cookie)).run();return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':'easy_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}})}
 if(email===OWNER_EMAIL)await db.prepare('INSERT OR IGNORE INTO members (id,user_id,email,name,role,active,created) VALUES (?,?,?,?,?,?,?)').bind('owner',uid,email,'Melih','admin',1,Date.now()).run();
 let me=uid?await db.prepare('SELECT * FROM members WHERE user_id=?').bind(uid).first():null;
 if(!me&&cookie){const c=await db.prepare('SELECT r.* FROM courier_roster r JOIN courier_sessions s ON s.courier_id=r.id WHERE s.token_hash=? AND s.expires>? AND r.active=1').bind(await hashToken(cookie),Date.now()).first();if(c)me={...c,role:'courier'};else{const ownerSession=await db.prepare("SELECT m.* FROM members m JOIN courier_sessions s ON s.courier_id=m.id WHERE s.token_hash=? AND s.expires>? AND m.active=1").bind(await hashToken(cookie),Date.now()).first();if(ownerSession)me=ownerSession;}}
 if(!me&&uid&&email){let invited=await db.prepare('SELECT * FROM members WHERE email=? AND user_id IS NULL AND active=1').bind(email).first();if(invited){await db.prepare('UPDATE members SET user_id=? WHERE id=? AND user_id IS NULL AND active=1').bind(uid,invited.id).run();me=await db.prepare('SELECT * FROM members WHERE user_id=?').bind(uid).first()}}
 if(!me&&(!uid||!email))return json({error:'Kullanıcı adı ve PIN ile giriş yap.',signIn:'/signin-with-chatgpt?return_to=%2F'},401);
 if(!me||!me.active)return json({error:'Bu hesap için aktif çalışan yetkisi bulunmuyor. Yöneticinden e-posta adresini eklemesini iste.'},403);
 if(me.role==='kitchen'){
  if(method!=='GET'||path!=='/api/state')err('Mutfak hesabı yalnızca siparişleri görüntüleyebilir.',403);
  const rows=(await db.prepare("SELECT * FROM orders WHERE demo=0 AND merged_into IS NULL AND ((service_type='table' AND stage<4) OR (service_type IN ('package','pickup') AND (stage<2 OR business_day=?))) ORDER BY created,id").bind(day()).all()).results||[];
  const orders=rows.map((row:any)=>{
   const order=orderRow(row);
   const {id,brand,platform,serviceType,tableNo,stage,version,created,note,productNotes,adjustments}=order;
   const items=order.items.map((item:string)=>{
    const line=parseOrderItem(item);
    return line?formatOrderItem(line.quantity,line.name,0):item;
   });
   return {id,brand,platform,serviceType,tableNo,stage,version,created,note,productNotes,items,
    adjustments:adjustments.filter((entry:any)=>['cancelled','refunded','kitchen_ready'].includes(entry.status))
     .map(({index,status,quantity}:any)=>({index,status,quantity}))};
  });
  return json({me:{id:me.id,name:me.name,role:me.role},people:[],orders,day:day(),nativeIdentity:!!uid});
 }
 const admin=me.role==='admin';const waiter=me.role==='waiter';const canSell=admin||waiter;
 if(admin){await db.batch(roster.map(p=>db.prepare('INSERT OR IGNORE INTO courier_roster (id,name,username,active) VALUES (?,?,?,1)').bind(p.id,p.name,p.username)));await db.prepare('CREATE TABLE IF NOT EXISTS product_prices (product_id TEXT PRIMARY KEY, ys_price INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();await db.prepare('CREATE TABLE IF NOT EXISTS price_changes (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL, old_price INTEGER NOT NULL, new_price INTEGER NOT NULL, actor TEXT NOT NULL, created INTEGER NOT NULL)').run();await db.prepare('CREATE TABLE IF NOT EXISTS admin_login (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL, pin_salt TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();await ensureMenuSchema(db);}
 if(path==='/api/courier-deliveries'&&method==='GET'){
  if(!admin)err('Yönetici yetkisi gerekiyor.',403);
  const result=await db.prepare(`SELECT r.id,r.name,o.id AS orderId,o.delivered,o.delivery_location
   FROM (SELECT id,name,active FROM members WHERE role='courier'
         UNION ALL SELECT id,name,active FROM courier_roster WHERE id NOT IN (SELECT id FROM members)) r
   LEFT JOIN orders o ON o.id=(
    SELECT id FROM orders WHERE service_type='package' AND stage=4 AND courier_id=r.id AND demo=0
    ORDER BY delivered DESC,id DESC LIMIT 1)
   WHERE r.active=1 ORDER BY r.name`).all();
  return json({couriers:result.results.map(({delivery_location,...row}:any)=>({...row,location:delivery_location?JSON.parse(delivery_location):null}))});
 }
 if(['/api/integrations/trendyol/sync','/api/integrations/trendyol/status'].includes(path)){
   if(!admin)err('Yönetici yetkisi gerekiyor.',403);
   if(method!=='POST')err('POST bekleniyor.',405);
   const input:any=await request.json();
   const executor=String(env?.TRENDYOL_EXECUTOR_EMAIL||email||input.executor||'').trim();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(executor))err('Yetkili e-postasını girin.',422);
   return json(path.endsWith('/sync')?await syncTrendyolOrders(db,env,executor):await platformStatus(db,env,executor,input.change),200);
 }
 if(path==='/api/integrations/trendyol'){if(!admin)err('Yönetici yetkisi gerekiyor.',403);return trendyolMapping(request,db);}
 if(admin&&method==='GET'&&path==='/api/printers')return json({printers:(await db.prepare('SELECT * FROM printer_devices WHERE active=1 ORDER BY name').all()).results||[],discovered:(await db.prepare('SELECT name FROM printer_discovery WHERE last_seen>? ORDER BY name').bind(Date.now()-120000).all()).results?.map((x:any)=>x.name)||[],bridgeReady:!!(await db.prepare('SELECT id FROM print_bridge_tokens WHERE revoked=0 LIMIT 1').first()),printQueue:(await db.prepare("SELECT status,COUNT(*) AS count FROM print_queue WHERE status IN ('pending','processing','failed') GROUP BY status").all()).results||[],webhooks:(await db.prepare('SELECT platform,updated_at FROM webhook_tokens ORDER BY platform').all()).results||[]});
 if(admin&&method==='POST'&&path==='/api/printers/manage') {const b:any=JSON.parse(await request.text());if(b.action==='save'){const id=String(b.id||crypto.randomUUID()),name=String(b.name||'').trim().slice(0,120),address=String(b.address||'').trim().slice(0,160),types=Array.isArray(b.types)?[...new Set(b.types.filter((x:any)=>['Adisyon','Mutfak','Kurye'].includes(x)))]:[],main=types.includes(b.mainChannel)?b.mainChannel:types[0]||'';if(!name||!types.length)err('Yazıcı adı ve en az bir tür gerekli.');await db.prepare('INSERT INTO printer_devices (id,name,address,types,main_channel,active,updated_at) VALUES (?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,types=excluded.types,main_channel=excluded.main_channel,active=1,updated_at=excluded.updated_at').bind(id,name,address,JSON.stringify(types),main,Date.now()).run();return json({ok:true,id})}if(b.action==='delete'){await db.prepare('UPDATE printer_devices SET active=0,updated_at=? WHERE id=?').bind(Date.now(),String(b.id||'')).run();return json({ok:true})}if(b.action==='bridge_token'){const token='epb_'+crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');await db.batch([db.prepare('UPDATE print_bridge_tokens SET revoked=1'),db.prepare('INSERT INTO print_bridge_tokens (id,token_hash,created_at,revoked) VALUES (?,?,?,0)').bind(crypto.randomUUID(),await hashToken(token),Date.now())]);return json({ok:true,token})}if(b.action==='webhook_token'){const platform=String(b.platform||'');if(!['Yemeksepeti','Trendyol'].includes(platform))err('Platform seçimi geçersiz.');const token='epw_'+crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');await db.prepare('INSERT INTO webhook_tokens (platform,token_hash,updated_at) VALUES (?,?,?) ON CONFLICT(platform) DO UPDATE SET token_hash=excluded.token_hash,updated_at=excluded.updated_at').bind(platform,await hashToken(token),Date.now()).run();return json({ok:true,platform,token,url:'/api/webhooks/'+(platform==='Trendyol'?'trendyol':'yemeksepeti')})}if(b.action==='retry_print'){await db.prepare("UPDATE print_queue SET status='pending',claimed_at=NULL,error=NULL WHERE status='failed'").run();return json({ok:true})}if(b.action==='test_print'){const type=String(b.type||'Adisyon'),printer=await db.prepare('SELECT * FROM printer_devices WHERE id=? AND active=1').bind(String(b.id||'')).first();if(!printer)err('Yazıcı bulunamadı.',404);await db.prepare('INSERT INTO print_queue (id,printer_type,printer_name,content,status,created_at) VALUES (?,?,?,?,\'pending\',?)').bind(crypto.randomUUID(),type,printer.name,'EASY POS YAZICI TESTİ\\n'+printer.name+'\\n\\n\\n',Date.now()).run();return json({ok:true})}if(b.action==='queue_order'){const order=await db.prepare('SELECT * FROM orders WHERE id=?').bind(Number(b.id)).first();if(!order)err('Sipariş bulunamadı.',404);const type=String(b.type||'Adisyon');if(!['Adisyon','Mutfak','Kurye'].includes(type))err('Fiş türü geçersiz.');await enqueuePrint(db,order,type);return json({ok:true,queued:true})}if(b.action==='queue_lines'){const order=await db.prepare('SELECT * FROM orders WHERE id=?').bind(Number(b.id)).first();if(!order)err('Sipariş bulunamadı.',404);if(!Array.isArray(b.items)||!b.items.length||b.items.length>75)err('Fiş ürün listesi geçersiz.');await ensureMenuSchema(db);const menu=(await db.prepare('SELECT id,name,ys_price,brand FROM menu_products WHERE active=1').all()).results||[],items:string[]=[],adjustments:any[]=[],brands=new Set<string>();for(const [index,row] of b.items.entries()){const product=menu.find((p:any)=>p.id===row.id),quantity=Number(row.quantity);if(!product||!Number.isInteger(quantity)||quantity<1||quantity>50)err('Fiş için ürün veya adet geçersiz.');items.push(formatOrderItem(quantity,product.name,safeNumber(product.ys_price)));brands.add(product.brand);const note=String(row.productNote||'').trim().slice(0,320);if(note)adjustments.push({index,status:'product_note',note})}await enqueuePrint(db,{...order,items:JSON.stringify(items),adjustments:JSON.stringify(adjustments),brand:brands.size>1?'mixed':brands.values().next().value||order.brand},'Mutfak');return json({ok:true,queued:true})}if(b.action==='webhook_token_status'){return json({webhooks:(await db.prepare('SELECT platform,updated_at FROM webhook_tokens ORDER BY platform').all()).results||[]})}err('Yazıcı işlemi bulunamadı.',404)}
 if(method==='GET'&&path==='/api/menu'){if(!canSell)err('Sipariş menüsüne erişim yetkisi gerekiyor.',403);await ensureMenuSchema(db);const rows=(await db.prepare('SELECT * FROM menu_products ORDER BY category,name').all()).results||[],saved=(await db.prepare('SELECT product_id,ys_price FROM product_prices').all()).results||[],prices=new Map(saved.map((p:any)=>[p.product_id,p.ys_price])),categories=(await db.prepare('SELECT id,name,sort_order FROM menu_categories WHERE active=1 ORDER BY sort_order,name').all()).results||[],vatRates=(await db.prepare('SELECT rate FROM vat_rates WHERE active=1 ORDER BY rate').all()).results||[];return json({products:rows.map((p:any)=>({id:p.id,name:p.name,category:p.category,ysPrice:safeNumber(prices.get(p.id)??p.ys_price),brand:p.brand,vatRate:safeNumber(p.vat_rate),active:!!p.active})),categories,vatRates:vatRates.map((v:any)=>safeNumber(v.rate)),priceSource:'EasyPOS D1'});}
 if(method==='GET'&&path==='/api/customers'){if(!admin)err('Yönetici yetkisi gerekiyor.',403);await ensureMenuSchema(db);const phone=phoneKey(new URL(request.url).searchParams.get('phone'));if(phone){const customer=await db.prepare('SELECT * FROM customers WHERE phone=?').bind(phone).first();return json({customer:customer?{...customer,balance:safeNumber(customer.balance)/100}:null})}const rows=(await db.prepare('SELECT * FROM customers ORDER BY name COLLATE NOCASE LIMIT 2000').all()).results||[];return json({customers:rows.map((c:any)=>({...c,balance:safeNumber(c.balance)/100}))});}
 if(method==='GET'&&path==='/api/reports/daily'){
  if(!admin)err('Yönetici yetkisi gerekiyor.',403);
  await ensureDailyReportSchema(db);
  const now=Date.now(),yesterday=reportDayAt(now-86400000);
  const currentMidnight=Date.parse(reportDayAt(now)+'T00:00:00+03:00');
  if(now-currentMidnight>=600000&&!await db.prepare('SELECT 1 FROM daily_sales_reports WHERE day=?').bind(yesterday).first())await archiveDailySales(db,now);
  const reports=(await db.prepare('SELECT day,orders_count,net_sales,net_received,receivable,refunds,generated_at FROM daily_sales_reports ORDER BY day DESC').all()).results||[];
  return json({reports});
 }
 if(method==='GET'&&path==='/api/history'){
  if(!admin)err('Yönetici yetkisi gerekiyor.',403);
  const q=new URL(request.url).searchParams,from=q.get('from')||day(),to=q.get('to')||from,brandFilter=q.get('brand')||'all',platformFilter=q.get('platform')||'all',courierFilter=q.get('courier')||'all';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))err('Geçerli tarih aralığı seç.');
  const start=Date.parse(from+'T00:00:00+03:00'),end=Date.parse(to+'T00:00:00+03:00')+86400000;if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>366*86400000)err('Tarih aralığı 1–366 gün olmalı.');
  await ensureDailyReportSchema(db);
  const filters=['demo=0','stage=4','merged_into IS NULL','delivered>=?','delivered<?'];
  const values:(string|number)[]=[start,end];
  for(const [column,value] of [['brand',brandFilter],['platform',platformFilter],['courier_id',courierFilter],['service_type',q.get('service')||'all']]){
   if(value!=='all'){filters.push(column+'=?');values.push(value)}
  }
  const cursor=q.get('cursor');
  if(cursor){
   if(!/^\d+:\d+$/.test(cursor))err('Geçersiz rapor sayfası.');
   const [delivered,id]=cursor.split(':').map(Number);
   if(!Number.isSafeInteger(delivered)||!Number.isSafeInteger(id))err('Geçersiz rapor sayfası.');
   filters.push('(delivered,id)<(?,?)');values.push(delivered,id);
  }
  const size=250;
  const rows=(await db.prepare('SELECT * FROM orders WHERE '+filters.join(' AND ')+' ORDER BY delivered DESC,id DESC LIMIT ?').bind(...values,size+1).all()).results||[];
  const page=rows.slice(0,size),last=page.at(-1);
  return json({from,to,orders:page.map(orderRow),nextCursor:rows.length>size&&last?last.delivered+':'+last.id:null});
 }
 if(method==='GET'&&path==='/api/state'){
  const people=(await db.prepare("SELECT id,name,role,active FROM members WHERE active=1 UNION ALL SELECT id,name,'courier' AS role,active FROM courier_roster WHERE active=1 AND id NOT IN (SELECT id FROM members)").all()).results;
  const midnight=Date.parse(day()+'T00:00:00+03:00');
  const rows=admin?(await db.prepare('SELECT * FROM orders WHERE demo=0 AND merged_into IS NULL AND (stage<4 OR delivered>=?) ORDER BY created DESC,id DESC').bind(midnight).all()).results:(await db.prepare("SELECT * FROM orders WHERE demo=0 AND merged_into IS NULL AND service_type='package' AND (stage<4 OR delivered>=?) AND ((stage=2 AND courier_id IS NULL) OR courier_id=?) ORDER BY created DESC,id DESC").bind(midnight,me.id).all()).results;
  return json({me:{id:me.id,name:me.name,role:me.role},people,orders:rows.map(orderRow),serverTime:Date.now(),day:day(),nativeIdentity:!!uid});
 }
 if(method==='GET'&&path==='/api/team'){
  if(!admin)err('Yönetici yetkisi gerekiyor.',403);
  const members=(await db.prepare("SELECT m.id,m.name,m.email,m.role,m.active,m.user_id IS NOT NULL AS linked,a.username,CASE WHEN a.pin_hash IS NULL THEN 0 ELSE 1 END AS pin_ready FROM members m LEFT JOIN admin_login a ON a.id=m.id UNION ALL SELECT id,name,NULL AS email,'courier' AS role,active,pin_hash IS NOT NULL AS linked,username,pin_hash IS NOT NULL AS pin_ready FROM courier_roster WHERE id NOT IN (SELECT id FROM members)").all()).results,managerPin=await db.prepare('SELECT 1 AS ready FROM manager_pin WHERE id=1').first();return json({members,managerPinReady:!!managerPin});
 }
 if(method==='GET'&&path==='/api/events'){
  if(!admin)err('Yönetici yetkisi gerekiyor.',403);
  return json({events:(await db.prepare('SELECT e.*,m.name AS actor_name FROM events e LEFT JOIN members m ON e.actor=m.id ORDER BY e.id DESC LIMIT 60').all()).results});
 }
 if(method==='POST'&&path==='/api/costs')return await handleCosts(request,db,me,admin,env);
 if(method!=='POST')return json({error:'İşlem bulunamadı.'},404);
 const raw=await request.text();if(raw.length>16000)err('İstek çok büyük.',413);let b;try{b=JSON.parse(raw)}catch{err('Geçersiz JSON.')}
 if(path==='/api/team'||(path==='/api/members'&&b.action==='add_waiter')){
  if(!admin)err('Yönetici yetkisi gerekiyor.',403);
  if(b.action==='setup_emrullah'||b.action==='setup_kitchen'){
   if(me.id!=='owner'||!cookie)err('Kurulum için Melih’in PIN oturumuyla giriş yap.',403);
   const ownerSession=await db.prepare("SELECT 1 FROM courier_sessions WHERE token_hash=? AND courier_id='owner' AND expires>?").bind(await hashToken(cookie),Date.now()).first();
   if(!ownerSession)err('Kurulum için Melih’in PIN oturumuyla giriş yap.',403);
   const kitchen=b.action==='setup_kitchen',username=kitchen?'mutfak':'emrullah',role=kitchen?'kitchen':'admin',name=kitchen?'Mutfak':'Emrullah',id='easypos_'+username;
   const pin=String(b.pin||'');
   if(!/^\d{6,12}$/.test(pin))err('PIN 6–12 rakam olmalı.');
   const duplicate=await db.prepare('SELECT 1 FROM admin_login WHERE username=? OR id=? UNION ALL SELECT 1 FROM courier_roster WHERE username=? UNION ALL SELECT 1 FROM members WHERE id=?').bind(username,id,username,id).first();
   if(duplicate)err('Bu hesap zaten kayıtlı.',409);
   const salt=crypto.randomUUID(),hash=await pinHash(pin,salt),now=Date.now();
   await db.batch([
    db.prepare('INSERT INTO members (id,email,name,role,active,created) VALUES (?,?,?,?,1,?)').bind(id,id+'@easypos.local',name,role,now),
    db.prepare('INSERT INTO admin_login (id,username,pin_hash,pin_salt,updated_at) VALUES (?,?,?,?,?)').bind(id,username,hash,salt,now),
   ]);
   return json({ok:true});
  }
  if(b.action==='set_manager_pin')return await saveManagerPin(db,b.pin,me.id);
   if(b.action==='set_admin_login'){
   const username=String(b.username||'').trim().toLowerCase(),pin=String(b.pin||'');if(!/^[a-z0-9_]{3,30}$/.test(username)||!/^[0-9]{6,12}$/.test(pin))err('Kullanıcı adı 3–30 karakter; PIN 6–12 rakam olmalı.');
   if(await db.prepare('SELECT id FROM courier_roster WHERE username=?').bind(username).first())err('Bu kullanıcı adı bir kuryede kayıtlı.',409);
   const salt=crypto.randomUUID(),hash=await pinHash(pin,salt),now=Date.now();await db.batch([db.prepare('INSERT INTO admin_login (id,username,pin_hash,pin_salt,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,updated_at=excluded.updated_at').bind('owner',username,hash,salt,now),db.prepare("DELETE FROM courier_sessions WHERE courier_id='owner'")]);return json({ok:true});
  }
  if(b.action==='set_pin'){
   if(!/^[0-9]{6,12}$/.test(String(b.pin||'')))err('PIN 6–12 rakam olmalı.');
   const target=await db.prepare('SELECT id FROM courier_roster WHERE id=?').bind(String(b.id)).first();if(!target)err('Kurye bulunamadı.',404);
   const salt=crypto.randomUUID(),hash=await pinHash(String(b.pin),salt);
   await db.batch([db.prepare('UPDATE courier_roster SET pin_hash=?,pin_salt=? WHERE id=?').bind(hash,salt,target.id),db.prepare('DELETE FROM courier_sessions WHERE courier_id=?').bind(target.id)]);return json({ok:true});
  }
  if(b.action==='create_courier'){
   const username=String(b.username||'').trim().toLowerCase(),name=String(b.name||'').trim();if(!/^[a-z0-9_]{3,30}$/.test(username)||!name||name.length>70)err('Geçerli ad ve kullanıcı adı gerekli.');
   if(await db.prepare('SELECT id FROM courier_roster WHERE username=?').bind(username).first())err('Bu kullanıcı adı kayıtlı.',409);
   await db.prepare('INSERT INTO courier_roster (id,name,username,active) VALUES (?,?,?,1)').bind(crypto.randomUUID(),name,username).run();return json({ok:true});
  }
  if(b.action==='add_waiter'){
   const name=String(b.name||'').trim().slice(0,70), username=String(b.username||'').trim().toLowerCase(), pin=String(b.pin||'').trim();
   if(!name||name.length>70||!/^[a-z0-9_]{3,30}$/.test(username)||!/^[0-9]{6}$/.test(pin))err('Ad, 3–30 karakterlik kullanıcı adı ve 6 haneli rakam PIN gerekli.');
   const dup=await db.prepare('SELECT 1 FROM admin_login WHERE username=? UNION ALL SELECT 1 FROM courier_roster WHERE username=?').bind(username,username).first();
   if(dup)err('Bu kullanıcı adı zaten kayıtlı.',409);
   const wid='waiter_'+crypto.randomUUID().slice(0,8), salt=crypto.randomUUID(), hash=await pinHash(pin,salt), now=Date.now();
   await db.batch([
     db.prepare('INSERT INTO members (id,email,name,role,active,created) VALUES (?,?,?,?,1,?)').bind(wid, wid+'@easypos.local', name, 'waiter', now),
     db.prepare('INSERT INTO admin_login (id,username,pin_hash,pin_salt,updated_at) VALUES (?,?,?,?,?)').bind(wid, username, hash, salt, now)
   ]);
   return json({ok:true});
  }
  if(b.action==='toggle'){
   if(typeof b.id!=='string'||b.id==='owner'||b.id===me.id)err('Bu hesabın yetkisi değiştirilemez.');
   await db.batch([db.prepare('UPDATE members SET active=? WHERE id=?').bind(b.active?1:0,b.id),db.prepare('UPDATE courier_roster SET active=? WHERE id=?').bind(b.active?1:0,b.id)]);return json({ok:true});
  }
  const e=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)||e.length>254||!name||name.length>70)err('Geçerli ad ve e-posta gerekli.');
  if(!['courier','admin'].includes(b.role))err('Geçersiz rol.');
  if(await db.prepare('SELECT id FROM members WHERE email=?').bind(e).first())err('Bu e-posta zaten kayıtlı.',409);
  let memberId=crypto.randomUUID();
  if(b.rosterId){const existing=await db.prepare('SELECT * FROM courier_roster WHERE id=?').bind(String(b.rosterId)).first();if(!existing||!existing.active||b.role!=='courier')err('Geçersiz kurye kaydı.');if(await db.prepare('SELECT id FROM members WHERE id=?').bind(existing.id).first())err('Kurye zaten eşleşmiş.',409);memberId=existing.id;}
  await db.prepare('INSERT INTO members (id,email,name,role,active,created) VALUES (?,?,?,?,1,?)').bind(memberId,e,name,b.role,Date.now()).run();return json({ok:true});
 }
 if(path==='/api/menu/manage'){
  if(!admin)err('Yönetici yetkisi gerekiyor.',403);await ensureMenuSchema(db);const action=String(b.action||''),now=Date.now();
  if(action==='bulk_price_update'){
  const items=Array.isArray(b.items)?b.items:[];
  if(!items.length||items.length>500)err('Geçersiz ürün listesi.');
  const batch:any[]=[];
  for(const row of items){
    const pid=String(row?.id||'').trim(), price=Math.round(Number(row?.ysPrice));
    if(!pid||!Number.isSafeInteger(price)||price<100||price>100000000)err('Geçersiz fiyat');
    const old=await db.prepare('SELECT ys_price FROM menu_products WHERE id=?').bind(pid).first();
    if(!old)continue;
    const oldP=safeNumber(old.ys_price);
    if(oldP===price)continue;
    batch.push(db.prepare('UPDATE menu_products SET ys_price=?,updated_at=? WHERE id=?').bind(price,now,pid));
    batch.push(db.prepare('INSERT INTO product_prices (product_id,ys_price,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET ys_price=excluded.ys_price,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(pid,price,me.id,now));
    batch.push(db.prepare('INSERT INTO price_changes (product_id,old_price,new_price,actor,created) VALUES (?,?,?,?,?)').bind(pid,oldP,price,me.id,now));
  }
  if(batch.length)await db.batch(batch);
  return json({ok:true,changed:Math.floor(batch.length/3)});
}
if(action==='product_save'){const id=String(b.id||crypto.randomUUID()),name=String(b.name||'').trim().slice(0,100),category=String(b.category||'').trim().slice(0,60),price=Number(b.ysPrice),brand=String(b.brand||'wingy'),vat=Number(b.vatRate);const categoryExists=await db.prepare('SELECT id FROM menu_categories WHERE name=? AND active=1').bind(category).first();if(!categoryExists)err('Ürün için aktif bir kategori seç.');if(!name||!category||!Number.isSafeInteger(price)||price<1||price>100000000||!['wingy','mac'].includes(brand)||!Number.isInteger(vat)||vat<0||vat>100)err('Ürün adı, kategori, fiyat, marka ve KDV değerlerini kontrol et.');const rate=await db.prepare('SELECT rate FROM vat_rates WHERE rate=? AND active=1').bind(vat).first();if(!rate)err('Önce KDV oranını tanımla.');const old=await db.prepare('SELECT ys_price FROM menu_products WHERE id=?').bind(id).first();await db.batch([db.prepare('INSERT INTO menu_products (id,name,category,ys_price,brand,vat_rate,active,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,ys_price=excluded.ys_price,brand=excluded.brand,vat_rate=excluded.vat_rate,active=excluded.active,updated_at=excluded.updated_at').bind(id,name,category,price,brand,vat,b.active===false?0:1,now),db.prepare('INSERT INTO product_prices (product_id,ys_price,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET ys_price=excluded.ys_price,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(id,price,me.id,now),db.prepare('INSERT INTO price_changes (product_id,old_price,new_price,actor,created) VALUES (?,?,?,?,?)').bind(id,safeNumber(old?.ys_price??price),price,me.id,now)]);return json({ok:true,id})}
  if(action==='product_delete'){const id=String(b.id||'');if(!id)err('Ürün seç.');await db.prepare('UPDATE menu_products SET active=0,updated_at=? WHERE id=?').bind(now,id).run();return json({ok:true})}
  if(action==='category_save'){const name=String(b.name||'').trim().slice(0,60),id=String(b.id||crypto.randomUUID());if(!name)err('Kategori adı gerekli.');const prior=await db.prepare('SELECT name FROM menu_categories WHERE id=?').bind(id).first();await db.prepare('INSERT INTO menu_categories (id,name,active,sort_order) VALUES (?,?,1,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=1').bind(id,name,Number(b.sortOrder)||100).run();if(prior&&prior.name!==name)await db.prepare('UPDATE menu_products SET category=?,updated_at=? WHERE category=?').bind(name,now,prior.name).run();return json({ok:true,id})}
  if(action==='category_delete'){const id=String(b.id||''),row=await db.prepare('SELECT name FROM menu_categories WHERE id=?').bind(id).first();if(!row)err('Kategori bulunamadı.',404);const used=await db.prepare('SELECT id FROM menu_products WHERE category=? AND active=1 LIMIT 1').bind(row.name).first();if(used)err('Bu kategoride ürünler var; önce ürünleri başka kategoriye taşı.');await db.prepare('UPDATE menu_categories SET active=0 WHERE id=?').bind(id).run();return json({ok:true})}
  if(action==='vat_save'){const rate=Number(b.rate);if(!Number.isInteger(rate)||rate<0||rate>100)err('KDV oranı 0–100 arasında tam sayı olmalı.');await db.prepare('INSERT INTO vat_rates (rate,active) VALUES (?,1) ON CONFLICT(rate) DO UPDATE SET active=1').bind(rate).run();return json({ok:true})}
  if(action==='vat_update'){const oldRate=Number(b.oldRate),rate=Number(b.rate);if(!Number.isInteger(oldRate)||!Number.isInteger(rate)||rate<0||rate>100)err('KDV oranı 0–100 arasında tam sayı olmalı.');if(oldRate!==rate){await db.batch([db.prepare('UPDATE menu_products SET vat_rate=?,updated_at=? WHERE vat_rate=?').bind(rate,now,oldRate),db.prepare('UPDATE vat_rates SET active=0 WHERE rate=?').bind(oldRate),db.prepare('INSERT INTO vat_rates (rate,active) VALUES (?,1) ON CONFLICT(rate) DO UPDATE SET active=1').bind(rate)])}return json({ok:true})}
  if(action==='vat_delete'){const rate=Number(b.rate),used=await db.prepare('SELECT id FROM menu_products WHERE vat_rate=? AND active=1 LIMIT 1').bind(rate).first();if(used)err('Bu KDV oranını kullanan ürünler var. Önce ürün KDV oranını değiştir.');await db.prepare('UPDATE vat_rates SET active=0 WHERE rate=?').bind(rate).run();return json({ok:true})}
  err('Tanımlama işlemi bulunamadı.',404);
 }
 if(path==='/api/customers/manage'){
  if(!admin)err('Yönetici yetkisi gerekiyor.',403);await ensureMenuSchema(db);const action=String(b.action||'');if(action==='delete'){await db.prepare('DELETE FROM customers WHERE id=?').bind(String(b.id||'')).run();return json({ok:true})}if(action==='save'){const id=String(b.id||crypto.randomUUID()),name=String(b.name||'').trim().slice(0,90),phone=phoneKey(b.phone),address=String(b.address||'').trim().slice(0,240),balance=Math.round(Number(String(b.balance??0).replace(',','.'))*100);if(!name||phone.length<8||phone.length>15||!Number.isSafeInteger(balance)||Math.abs(balance)>1000000000)err('Ad, geçerli telefon ve bakiye gerekli.');await db.prepare('INSERT INTO customers (id,name,phone,address,balance,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,address=excluded.address,balance=excluded.balance,updated_at=excluded.updated_at').bind(id,name,phone,address,balance,Date.now()).run();return json({ok:true})}err('Müşteri işlemi bulunamadı.',404);
 }
 if(path==='/api/menu/prices'){
  if(!admin)err('Yönetici yetkisi gerekiyor.',403);
  if(!Array.isArray(b.prices)||b.prices.length<1||b.prices.length>catalog.length)err('Fiyat listesi geçersiz.');
  const ids=new Set<string>();const now=Date.now(),batch:any[]=[];
  for(const item of b.prices){const product=catalog.find(p=>p.id===item?.id);const price=item?.price;if(!product||ids.has(item.id)||!Number.isSafeInteger(price)||price<1||price>100000000)err('Ürün fiyatı geçersiz.');ids.add(item.id);const prev=await db.prepare('SELECT ys_price FROM product_prices WHERE product_id=?').bind(product.id).first();const oldPrice=prev?.ys_price??product.ysPrice;if(oldPrice===price)continue;batch.push(db.prepare('INSERT INTO product_prices (product_id,ys_price,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET ys_price=excluded.ys_price,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(product.id,price,me.id,now));batch.push(db.prepare('INSERT INTO price_changes (product_id,old_price,new_price,actor,created) VALUES (?,?,?,?,?)').bind(product.id,oldPrice,price,me.id,now));}
  if(batch.length)await db.batch(batch);return json({ok:true,changed:batch.length/2});
 }
 if(path==='/api/orders/create'){
  if(!canSell)err('Sipariş oluşturma yetkisi gerekiyor.',403);
  const serviceType=['package','pickup','table'].includes(b.serviceType)?b.serviceType:'package'; if(waiter&&!['table','pickup'].includes(serviceType))err('Garsonlar yalnızca Masa ve Gel Al siparişi açabilir.',403);
  const tableNo=serviceType==='table'?Number(b.tableNo):null;if(serviceType==='table'&&(!Number.isInteger(tableNo)||tableNo<1||tableNo>9))err('1–9 arasında masa seç.');
  const customer=String(b.customer||'').trim().slice(0,90),phone=String(b.phone||'').trim().slice(0,30),area=String(b.area||'').trim().slice(0,240),note=String(b.note??b.orderNote??b.order_note??b.customerNote??b.customer_note??'').trim().slice(0,500);
  if(serviceType==='package'&&(!customer||!area))err('Paket siparişi için müşteri adı ve teslimat adresi gerekli.');if(!customer&&serviceType!=='table')err('Müşteri adı gerekli.');
  if(!Array.isArray(b.items)||b.items.length<1||b.items.length>75)err('Sepete en az bir ürün ekle.');
  const payment=['Online','Online Ödeme','Nakit','Kapıda kart','Kredi Kartı','Sodexo/Multinet','Açık Hesap','Açık Hesap (Cari)'].includes(b.payment)?b.payment:'Nakit',platform=['Restoran','Yemeksepeti','Trendyol','Telefon','WhatsApp'].includes(b.platform)?b.platform:'Restoran';
  let discountType=String(b.discountType||'none');if(!['none','percent','amount'].includes(discountType))err('İndirim türü geçersiz.');let discountValue=Number(b.discountValue||0);if(!Number.isSafeInteger(discountValue)||discountValue<0||discountValue>100000000||(discountType==='percent'&&discountValue>10000))err('İndirim tutarı geçersiz.');
  await ensureMenuSchema(db);const menuRows=(await db.prepare('SELECT id,name,category,ys_price AS ysPrice,brand,vat_rate AS vatRate,active FROM menu_products WHERE active=1').all()).results||[],saved=(await db.prepare('SELECT product_id,ys_price FROM product_prices').all()).results||[],priceMap=new Map(saved.map((p:any)=>[p.product_id,p.ys_price]));const lines:string[]=[],productNoteAdjustments:any[]=[],selectedBrands=new Set<string>(),now=Date.now(),externalProductNotes=b.product_notes??b.productNotes;
  for(const [index,entry] of b.items.entries()){const product=menuRows.find((p:any)=>p.id===entry?.id),quantity=entry?.quantity;if(!product||!Number.isInteger(quantity)||quantity<1||quantity>50)err('Sepette geçersiz ürün veya adet var.');const unit=priceMap.get(product.id)??product.ysPrice;lines.push(formatOrderItem(quantity,product.name,unit));const fallback=Array.isArray(externalProductNotes)?externalProductNotes[index]:externalProductNotes?.[String(entry.id)];const productNote=productNoteText(entry,fallback);if(productNote)productNoteAdjustments.push({index,status:'product_note',note:productNote,source:platform==='Yemeksepeti'||platform==='Trendyol'?'platform':'manual',created:now,actor:me.id});if(product.brand==='wingy'||product.brand==='mac')selectedBrands.add(product.brand);}
  const brand=selectedBrands.size>1?'mixed':selectedBrands.values().next().value||'wingy';
  const bill=calculateBill(lines,productNoteAdjustments,discountType,discountValue);if(bill.subtotal<1)err('Sipariş tutarı geçersiz.');const tableCustomer=serviceType==='table'&&!customer?'Masa '+tableNo:customer;
  if(serviceType==='table'){
   const open=await db.prepare("SELECT * FROM orders WHERE service_type='table' AND table_no=? AND stage<4 AND merged_into IS NULL ORDER BY created DESC,id DESC LIMIT 1").bind(tableNo).first();
   if(open){const openItems=JSON.parse(open.items),merged=[...openItems,...lines],adjustments=[...JSON.parse(open.adjustments||'[]'),...productNoteAdjustments.map((a:any)=>({...a,index:a.index+openItems.length}))];discountType=waiter?String(open.discount_type||'none'):String(b.discountType??open.discount_type??'none');discountValue=waiter?Number(open.discount_value||0):Number(b.discountValue??open.discount_value??0);const updated=calculateBill(merged,adjustments,discountType,discountValue);if(discountType==='amount'&&discountValue>updated.subtotal)err('İndirim ürün toplamını aşamaz.');const noteText=[open.note,note].filter(Boolean).join(' · '),mergedBrand=open.brand==='mixed'||(selectedBrands.size>0&&open.brand!==brand)?'mixed':open.brand;const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,'add_items',now,'Masaya ürün eklendi',open.id,open.version),db.prepare('UPDATE orders SET brand=?,items=?,adjustments=?,subtotal=?,discount_type=?,discount_value=?,discount_amount=?,total=?,note=?,bill_requested=0,version=version+1 WHERE id=? AND version=?').bind(mergedBrand,JSON.stringify(merged),JSON.stringify(adjustments),updated.subtotal,discountType,discountValue,updated.discountAmount,updated.total,noteText,open.id,open.version)]);if(result[1].meta.changes!==1)err('Masa siparişi başka cihazda güncellendi. Yeniden dene.',409);const appended={...open,brand:mergedBrand,items:JSON.stringify(lines),adjustments:JSON.stringify(productNoteAdjustments),note,subtotal:bill.subtotal,total:bill.total,created:now};await enqueuePrint(db,appended,'Mutfak');return json({ok:true,id:open.id,appended:true});}
  } if(waiter&&(discountType!=='none'||discountValue!==0))err('İndirimi yalnızca yönetici uygulayabilir.',403); if(discountType==='amount'&&discountValue>bill.subtotal)err('İndirim ürün toplamını aşamaz.');
  const initialStage=serviceType==='table'?0:1;
  const result=await db.prepare("INSERT INTO orders (brand,platform,service_type,table_no,phone,customer,area,items,adjustments,note,subtotal,discount_type,discount_value,discount_amount,refund_total,payments,total,payment,stage,version,created,business_day,demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'[]',?,?,?,?,?,?,0)").bind(brand,platform,serviceType,tableNo,phone,tableCustomer,serviceType==='table'?'Masa '+tableNo:area,JSON.stringify(lines),JSON.stringify(productNoteAdjustments),note,bill.subtotal,discountType,discountValue,bill.discountAmount,bill.total,payment,initialStage,1,now,day()).run();await db.prepare('INSERT INTO events (order_id,actor,action,created,detail) VALUES (?,?,?,?,?)').bind(result.meta.last_row_id,me.id,'order_created',now,serviceType==='table'?'Masa '+tableNo+' siparişi oluşturuldu':serviceType==='pickup'?'Gel Al siparişi oluşturuldu':'Paket siparişi oluşturuldu').run();if(serviceType!=='table')await saveOrderCustomer(db,customer,phone,area);if(b.offlineState?.billRequested&&serviceType==='table')await db.prepare('UPDATE orders SET bill_requested=1 WHERE id=?').bind(result.meta.last_row_id).run();if(b.offlineState&&Array.isArray(b.offlineState.payments)){const pays=b.offlineState.payments.slice(0,40).filter((p:any)=>['Nakit','Kapıda kart','Kredi Kartı','Online','YS Online','Trendyol Online','Sodexo/Multinet','Açık Hesap (Cari)'].includes(p.method)&&Number.isSafeInteger(p.amount)&&p.amount>=0),paid=pays.reduce((n:number,p:any)=>n+p.amount,0);if(pays.length&&paid>=bill.total){const summary=[...new Set(pays.map((p:any)=>p.method))].join(' / ');await db.prepare('UPDATE orders SET payments=?,payment=?,stage=4,delivered=? WHERE id=?').bind(JSON.stringify(pays),summary,Date.now(),result.meta.last_row_id).run();const fresh=await db.prepare('SELECT * FROM orders WHERE id=?').bind(result.meta.last_row_id).first(),statements=await buildOrderCostStatements(db,fresh,me.id,Date.now());if(statements.length)await db.batch(statements)}}const savedOrder=await db.prepare('SELECT * FROM orders WHERE id=?').bind(result.meta.last_row_id).first();await enqueuePrint(db,savedOrder,'Mutfak');if(savedOrder.stage===4||savedOrder.service_type!=='table')await enqueuePrint(db,savedOrder,'Adisyon');return json({ok:true,id:result.meta.last_row_id,appended:false});
 }
 if(path==='/api/demo')err('Örnek sipariş özelliği kapatıldı. Yeni sipariş ekranını kullan.',410);
 if(path==='/api/orders/assign-bulk'){
  if(!admin)err('Toplu kurye ataması için yönetici yetkisi gerekiyor.',403);
  const target=typeof b.courierId==='string'?b.courierId:'';
  if(!target||!Array.isArray(b.orders)||!b.orders.length||b.orders.length>20)err('Kurye ve 1–20 hazır paket seç.');
  const selected=b.orders as {id:number;version:number}[];
  if(selected.some(item=>!Number.isSafeInteger(item?.id)||item.id<=0||!Number.isSafeInteger(item?.version)||item.version<=0)
   ||new Set(selected.map(item=>item.id)).size!==selected.length)err('Paket seçimi geçersiz.');
  const courier=await db.prepare("SELECT id FROM members WHERE id=? AND active=1 AND role='courier' UNION ALL SELECT id FROM courier_roster WHERE id=? AND active=1 AND id NOT IN (SELECT id FROM members)").bind(target,target).first();
  if(!courier)err('Aktif bir kurye seç.');
  const now=Date.now();
  const ready="id=? AND version=? AND service_type='package' AND stage=2 AND COALESCE(courier_id,'')='' AND demo=0 AND merged_into IS NULL";
  const results=await db.batch(selected.flatMap(item=>[
   db.prepare("INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,'assign',?,'Paket toplu atamayla kuryeye ayrıldı' FROM orders WHERE "+ready).bind(me.id,now,item.id,item.version),
   db.prepare('UPDATE orders SET courier_id=?,version=version+1 WHERE '+ready).bind(target,item.id,item.version),
  ]));
  const assigned=selected.filter((_,index)=>results[index*2+1].meta.changes===1).map(item=>item.id);
  return json({assigned,skipped:selected.filter(item=>!assigned.includes(item.id)).map(item=>item.id)});
 }
 if(path==='/api/orders/action'){
  if(!Number.isSafeInteger(b.id)||!Number.isSafeInteger(b.version))err('Geçersiz sipariş.');
  const o=await db.prepare('SELECT * FROM orders WHERE id=?').bind(b.id).first();if(!o)err('Sipariş bulunamadı.',404);
  if(o.version!==b.version)err('Bu paket başka bir cihazda güncellendi. Liste yenilendi; tekrar kontrol et.',409);
  const a=b.action,ts=Date.now();let set='',vals:any[]=[],detail='';
  if(a==='platform_resync'){
   if(!admin)err('Trendyol durumunu yeniden göndermek için yönetici yetkisi gerekir.',403);
   if(o.platform!=='Trendyol'||!['package','pickup'].includes(o.service_type))err('Yalnızca Trendyol paket veya Gel-Al siparişleri yeniden gönderilebilir.',409);
   if(o.stage<2)err('Sipariş henüz hazır aşamaya gelmedi.',409);
   await ensureOpsSchema(db);
   const executor=await resolveTrendyolExecutor(db,env,email||'');
   const sync=await syncPlatformOrderStage(db,env,executor,o.id,Number(o.stage));
   const summary=sync.ok
    ?`Trendyol durumları kontrol edildi. Gönderilen: ${sync.sent.length?sync.sent.join(', '):'yok'}; zaten kayıtlı: ${sync.alreadySent.length?sync.alreadySent.join(', '):'yok'}. Paket: ${sync.packageId||'bulunamadı'}.`
    :`Trendyol durumları tamamlanamadı. ${sync.skipped||sync.error||'Bilinmeyen hata'} Paket: ${sync.packageId||'bulunamadı'}.`;
   await db.prepare('INSERT INTO events (order_id,actor,action,created,detail) VALUES (?,?,?,?,?)').bind(o.id,me.id,'platform_resync',ts,summary.slice(0,350)).run();
   return json({ok:sync.ok,packageId:sync.packageId,sent:sync.sent,alreadySent:sync.alreadySent,error:sync.error,skipped:sync.skipped});
  }else if(a==='order_edit'){
   if(!admin)err('Sipariş düzenleme için yönetici yetkisi gerekir.',403);
   if(!['package','pickup'].includes(o.service_type)||o.stage>=4)err('Yalnızca açık Paket veya Gel-Al siparişleri düzenlenebilir.',409);
   if(!Array.isArray(b.items)||b.items.length<1||b.items.length>75)err('Sepete en az bir ürün ekle.');
   const priorAdjustments=JSON.parse(o.adjustments||'[]') as any[];
   if(priorAdjustments.some((x:any)=>!['product_note','kitchen_ready'].includes(x.status))||JSON.parse(o.payments||'[]').some((x:any)=>x.scope==='items'))err('Ürün bazlı ödeme veya düzeltme bulunan sipariş bu ekrandan düzenlenemez.');
   await ensureMenuSchema(db);const menuRows=(await db.prepare('SELECT id,name,category,ys_price AS ysPrice,brand,vat_rate AS vatRate,active FROM menu_products').all()).results||[],saved=(await db.prepare('SELECT product_id,ys_price FROM product_prices').all()).results||[],priceMap=new Map(saved.map((p:any)=>[p.product_id,p.ys_price]));
   const items:string[]=[],notes:any[]=[],selectedBrands=new Set<string>();
   const linkedExternal=await db.prepare("SELECT 1 FROM external_orders WHERE order_id=? AND platform='Trendyol'").bind(o.id).first();
   for(const [index,entry] of b.items.entries()){
    const product=menuRows.find((p:any)=>p.id===entry?.id),quantity=entry?.quantity;
    if(!Number.isInteger(quantity)||quantity<1||quantity>50)err('Sepette geçersiz ürün veya adet var.');
    let itemName:string,unit:number;
    if(product){itemName=product.name;unit=Number(priceMap.get(product.id)??product.ysPrice);selectedBrands.add(product.brand)}
    else if(linkedExternal&&entry?.customLine===true&&typeof entry?.name==='string'&&entry.name.trim()&&Number.isSafeInteger(entry.unitPrice)&&entry.unitPrice>=0&&entry.unitPrice<=100000000){
     itemName=entry.name.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,200);unit=entry.unitPrice;selectedBrands.add('wingy');
    }else err('Sepette geçersiz ürün veya adet var.');
    items.push(formatOrderItem(quantity,itemName,unit));
    const note=String(entry.productNote||'').trim().slice(0,320);if(note)notes.push({index,status:'product_note',note,source:'manual',created:ts,actor:me.id});
   }
   const customer=String(b.customer||'').trim().slice(0,90),phone=String(b.phone||'').trim().slice(0,30),area=String(b.area||'').trim().slice(0,240),note=String(b.note||'').trim().slice(0,500);
   if(!customer)err('Müşteri adı gerekli.');if(o.service_type==='package'&&!area)err('Paket siparişi için teslimat adresi gerekli.');
   const payment=['Online','Online Ödeme','Nakit','Kapıda kart','Kredi Kartı','Sodexo/Multinet','Açık Hesap','Açık Hesap (Cari)'].includes(b.payment)?b.payment:String(o.payment||'Nakit');
   const type=String(b.discountType||'none'),value=Number(b.discountValue||0);if(!['none','percent','amount'].includes(type)||!Number.isSafeInteger(value)||value<0||value>100000000||(type==='percent'&&value>10000))err('İndirim türü veya değeri geçersiz.');
   const bill=calculateBill(items,notes,type,value);if(bill.subtotal<1)err('Sipariş tutarı geçersiz.');if(type==='amount'&&value>bill.subtotal)err('İndirim ürün toplamını aşamaz.');
   const brand=selectedBrands.size>1?'mixed':selectedBrands.values().next().value||'wingy',platform=['Restoran','Yemeksepeti','Trendyol','Telefon','WhatsApp'].includes(b.platform)?b.platform:String(o.platform||'Restoran');const priorCounts=new Map<string,number>();for(const row of JSON.parse(o.items) as string[]){const parsed=parseOrderItem(row);if(parsed)priorCounts.set(parsed.name,(priorCounts.get(parsed.name)||0)+parsed.quantity)}const addedPrintLines:string[]=[],addedPrintAdjustments:any[]=[];for(const [index,row] of items.entries()){const parsed=parseOrderItem(row);if(!parsed)continue;const prior=Math.max(0,priorCounts.get(parsed.name)||0),added=Math.max(0,parsed.quantity-prior);priorCounts.set(parsed.name,Math.max(0,prior-parsed.quantity));if(added){const printIndex=addedPrintLines.length;addedPrintLines.push(formatOrderItem(added,parsed.name,parsed.unit));const note=notes.find((n:any)=>n.index===index)?.note;if(note)addedPrintAdjustments.push({index:printIndex,status:'product_note',note})}}
   const detail='Açık sipariş adisyonu düzenlendi';
   const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detail,o.id,b.version),db.prepare('UPDATE orders SET brand=?,platform=?,phone=?,customer=?,area=?,items=?,adjustments=?,note=?,subtotal=?,discount_type=?,discount_value=?,discount_amount=?,total=?,payment=?,version=version+1 WHERE id=? AND version=?').bind(brand,platform,phone,customer,area,JSON.stringify(items),JSON.stringify(notes),note,bill.subtotal,type,value,bill.discountAmount,bill.total,payment,o.id,b.version)]);
   if(result[1].meta.changes!==1)err('Sipariş başka bir cihazda güncellendi. Yeniden dene.',409);await saveOrderCustomer(db,customer,phone,area);if(addedPrintLines.length)await enqueuePrint(db,{...o,brand,items:JSON.stringify(addedPrintLines),adjustments:JSON.stringify(addedPrintAdjustments)},'Mutfak');return json({ok:true});
  }
  if(a==='table_bill_request'){
   if(!canSell)err('Masa durumunu değiştirme yetkisi gerekiyor.',403);if(o.service_type!=='table'||o.stage>=4)err('Açık masa adisyonu bulunamadı.',409);const requested=!!b.requested,detail=requested?'Masa hesap istedi olarak işaretlendi':'Masa hesap isteği kaldırıldı';const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detail,o.id,b.version),db.prepare('UPDATE orders SET bill_requested=?,version=version+1 WHERE id=? AND version=?').bind(requested?1:0,o.id,b.version)]);if(result[1].meta.changes!==1)err('Masa başka bir cihazda güncellendi. Yeniden dene.',409);if(requested){const latest=await db.prepare('SELECT * FROM orders WHERE id=?').bind(o.id).first();if(o.service_type==='table')await enqueuePrint(db,latest,'Adisyon')}return json({ok:true});
  }
  if(a==='table_transfer'){
   if(!admin)err('Masa taşıma işlemini yalnızca yönetici yapabilir.',403);if(o.service_type!=='table'||o.stage>=4)err('Açık masa adisyonu bulunamadı.',409);const toTable=Number(b.toTable);if(!Number.isInteger(toTable)||toTable<1||toTable>9||toTable===o.table_no)err('Geçerli bir hedef masa seç.');const target=await db.prepare("SELECT * FROM orders WHERE service_type='table' AND table_no=? AND stage<4 AND merged_into IS NULL ORDER BY created DESC,id DESC LIMIT 1").bind(toTable).first();
   if(!target){const detail='Masa '+o.table_no+' adisyonu Masa '+toTable+' konumuna taşındı';const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detail,o.id,b.version),db.prepare('UPDATE orders SET table_no=?,area=?,customer=?,version=version+1 WHERE id=? AND version=?').bind(toTable,'Masa '+toTable,'Masa '+toTable,o.id,b.version)]);if(result[1].meta.changes!==1)err('Masa başka bir cihazda güncellendi. Yeniden dene.',409);return json({ok:true,moved:true});}
   if(target.id===o.id)err('Aynı masaya taşıma yapılamaz.');const targetItems=JSON.parse(target.items) as string[],sourceItems=JSON.parse(o.items) as string[],targetAdjustments=JSON.parse(target.adjustments||'[]') as any[],sourceAdjustments=JSON.parse(o.adjustments||'[]') as any[],items=[...targetItems,...sourceItems],offset=targetItems.length,adjustments=[...targetAdjustments,...sourceAdjustments.map((x:any)=>({...x,index:x.index+offset}))],subtotal=calculateBill(items,adjustments,'none',0).subtotal,discountAmount=Math.min(subtotal,Number(target.discount_amount||0)+Number(o.discount_amount||0)),discountType=discountAmount?'amount':'none',discountValue=discountAmount,bill=calculateBill(items,adjustments,discountType,discountValue),payments=[...JSON.parse(target.payments||'[]'),...JSON.parse(o.payments||'[]')],paymentNames=[...new Set(payments.filter((p:any)=>['paid','receivable'].includes(p.status)).map((p:any)=>p.method))],payment=paymentNames.length>1?'Parçalı Ödeme':paymentNames[0]||target.payment,detailTarget='Masa '+o.table_no+' adisyonu Masa '+toTable+' ile birleştirildi',detailSource='Adisyon Masa '+toTable+' ile birleştirildi';
   const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detailTarget,target.id,target.version),db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detailSource,o.id,b.version),db.prepare('UPDATE orders SET items=?,adjustments=?,subtotal=?,discount_type=?,discount_value=?,discount_amount=?,refund_total=?,paid_item_total=?,payments=?,total=?,payment=?,stage=MAX(stage,?),bill_requested=MAX(bill_requested,?),created=MIN(created,?),version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(items),JSON.stringify(adjustments),bill.subtotal,discountType,discountValue,bill.discountAmount,Number(target.refund_total||0)+Number(o.refund_total||0),Number(target.paid_item_total||0)+Number(o.paid_item_total||0),JSON.stringify(payments),bill.total,payment,o.stage,Number(o.bill_requested||0),o.created,target.id,target.version),db.prepare('UPDATE orders SET merged_into=?,stage=4,delivered=?,version=version+1 WHERE id=? AND version=?').bind(target.id,ts,o.id,b.version)]);if(result[2].meta.changes!==1||result[3].meta.changes!==1)err('Masa başka bir cihazda güncellendi. Liste yenilendi; tekrar dene.',409);return json({ok:true,merged:true,targetId:target.id});
  }
  if(a==='product_note_set'){
   if(!canSell)err('Ürün notunu yalnızca yönetici düzenleyebilir.',403);if(o.stage>=4)err('Kapanmış siparişin ürün notu değiştirilemez.',409);
   const items=JSON.parse(o.items) as string[],adjustments=JSON.parse(o.adjustments||'[]') as any[],index=b.index;if(!Number.isInteger(index)||index<0||index>=items.length)err('Sipariş ürünü bulunamadı.',404);const line=parseOrderItem(items[index]);if(!line)err('Bu sipariş satırı okunamıyor.');if(adjustments.some((x:any)=>x.index===index&&['cancelled','refunded','comp','paid'].includes(x.status)))err('Kapatılmış ürünün notu değiştirilemez.',409);
   const noteText=String(b.note||'').trim().slice(0,320),next=adjustments.filter((x:any)=>!(x.index===index&&x.status==='product_note'));if(noteText)next.push({index,status:'product_note',note:noteText,source:'manual',created:ts,actor:me.id});const detail=noteText?'Ürün notu güncellendi: '+line.name:'Ürün notu kaldırıldı: '+line.name;
   const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detail,o.id,b.version),db.prepare('UPDATE orders SET adjustments=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(next),o.id,b.version)]);if(result[1].meta.changes!==1)err('Sipariş başka cihazda güncellendi. Yeniden dene.',409);return json({ok:true});
  }
  if(a==='line_discount_set'){
   if(!admin)err('Ürün indirimini yalnızca yönetici düzenleyebilir.',403);if(o.service_type!=='table'||o.stage>=4)err('Yalnızca açık masa adisyonunda ürün indirimi uygulanabilir.',409);
   const items=JSON.parse(o.items) as string[],adjustments=JSON.parse(o.adjustments||'[]') as any[],index=b.index;if(!Number.isInteger(index)||index<0||index>=items.length)err('Adisyon ürünü bulunamadı.',404);
   const line=parseOrderItem(items[index]);if(!line)err('Bu adisyon satırı okunamıyor.');if(adjustments.some((x:any)=>x.index===index&&['cancelled','refunded','comp','paid','partial_paid'].includes(x.status)))err('Tahsil edilmiş veya kapatılmış ürünün indirimi değiştirilemez.',409);
   const type=String(b.discountType||'none'),value=Number(b.discountValue||0);if(!['none','percent','amount'].includes(type)||!Number.isSafeInteger(value)||value<0||value>100000000||(type==='percent'&&value>10000))err('İndirim türü veya değeri geçersiz.');
   const current=adjustments.filter((x:any)=>x.index===index&&x.status==='item_discount').reduce((n:number,x:any)=>n+Number(x.amount||0),0),gross=line.quantity*line.unit,base=Math.max(0,gross-current);
   if(type==='amount'&&value>base)err('Ürün indirimi ürün tutarını aşamaz.');
   const amount=type==='percent'?Math.min(base,Math.round(base*value/10000)):type==='amount'?Math.min(base,value):0;
   const next=adjustments.filter((x:any)=>!(x.index===index&&x.status==='item_discount'));if(amount>0)next.push({index,status:'item_discount',amount,discountType:type,discountValue:value,created:ts,actor:me.id});
   const discountTypeOrder=o.discount_type||'none',discountValueOrder=Number(o.discount_value||0),bill=calculateBill(items,next,discountTypeOrder,discountValueOrder);if(discountTypeOrder==='amount'&&discountValueOrder>bill.subtotal)err('Adisyon indirimi ürün toplamını aşamaz.');
   const detail=amount?'Ürün bazlı indirim uygulandı: '+line.name+' · ₺'+(amount/100).toFixed(2).replace('.',','):'Ürün bazlı indirim kaldırıldı: '+line.name;
   const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detail,o.id,b.version),db.prepare('UPDATE orders SET adjustments=?,subtotal=?,discount_amount=?,total=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(next),bill.subtotal,bill.discountAmount,bill.total,o.id,b.version)]);if(result[1].meta.changes!==1)err('Adisyon başka bir cihazda güncellendi. Yeniden dene.',409);return json({ok:true});
  }
  if(['line_quantity','line_cancel','line_refund','line_comp'].includes(a)){
   if(!canSell)err('Adisyon ürünlerini yalnızca yönetici düzenleyebilir.',403);
   if(o.service_type!=='table')err('Ürün düzenleme yalnızca masa adisyonlarında kullanılabilir.',409);
   const items=JSON.parse(o.items) as string[],adjustments=JSON.parse(o.adjustments||'[]') as any[],payments=JSON.parse(o.payments||'[]') as any[];const index=b.index;
   if(!Number.isInteger(index)||index<0||index>=items.length)err('Adisyon ürünü bulunamadı.',404);
   const lineAdjustments=adjustments.filter((x:any)=>x.index===index),currentAdjustment=lineAdjustments.find((x:any)=>['cancelled','refunded','comp','paid','partial_paid'].includes(x.status)),hasItemDiscount=lineAdjustments.some((x:any)=>x.status==='item_discount'),parsed=parseOrderItem(items[index]);if(!parsed)err('Bu adisyon satırı düzenlenemiyor.');if(currentAdjustment)err('Bu ürün için işlem daha önce yapılmış.',409);if(hasItemDiscount&&a!=='line_refund')err('İndirimli ürünün adedi değiştirilemez, iptal veya ikram edilemez. İade/Zayi işlemi kullanılabilir.',409);
   let detail='',refundTotal=Number(o.refund_total||0);
   if(a==='line_quantity'){
    if(o.stage>=4)err('Kapanmış adisyonda ürün adedi değiştirilemez.',409);const quantity=b.quantity;if(!Number.isInteger(quantity)||quantity<1||quantity>50)err('Ürün adedi 1–50 arasında olmalı.');items[index]=formatOrderItem(quantity,parsed.name,parsed.unit);const prepared=lineAdjustments.find(x=>x.status==='kitchen_ready');if(prepared)prepared.quantity=Math.min(prepared.quantity,quantity);detail='Masa ürünü adedi değiştirildi: '+parsed.name+' × '+quantity;
   }else if(a==='line_cancel'){
    if(o.stage!==0)err('Mutfak öncesi iptal yalnızca yeni sipariş aşamasında kullanılabilir. Hazırlama başladıysa İade/Zayi işlemini seç.',409);items.splice(index,1);for(let i=adjustments.length-1;i>=0;i--)if(adjustments[i].index===index)adjustments.splice(i,1);for(const item of adjustments)if(item.index>index)item.index--;detail='Mutfak öncesi satır iptal edildi: '+parsed.name+' × '+parsed.quantity;
   }else{
    if(a==='line_refund'&&o.stage===0&&o.service_type!=='table')err('Sipariş mutfağa henüz gönderilmemiş. Ürünü İptal ile kaldır.',409);if(a==='line_comp'&&o.stage>=4)err('Kapanmış adisyonda ikram kaydı yapılamaz.',409);
    let amount=0;if(a==='line_refund'){const before=calculateBill(items,adjustments,o.discount_type||'none',Number(o.discount_value||0)),gross=Math.max(0,parsed.quantity*parsed.unit-adjustments.filter((x:any)=>x.index===index&&x.status==='item_discount').reduce((n:number,x:any)=>n+Number(x.amount||0),0)),discountShare=before.subtotal?Math.round(gross*before.discountAmount/before.subtotal):0;amount=Math.max(0,gross-discountShare);refundTotal+=amount;}
    const status=a==='line_refund'?'refunded':'comp';adjustments.push({index,status,amount,created:ts,actor:me.id});detail=(status==='refunded'?'Zayi/İade kaydı: ':'Ürün ikram edildi: ')+parsed.name+' × '+parsed.quantity+(amount?' · ₺'+(amount/100).toFixed(2).replace('.',','):'');
   }
   const discountType=o.discount_type||'none',discountValue=Number(o.discount_value||0),bill=calculateBill(items,adjustments,discountType,discountValue);
   if(a==='line_refund'&&bill.total<0)err('İade sonrası tutar geçersiz.');
   if(a==='line_refund'){
    const paid=payments.reduce((sum:number,p:any)=>sum+(p.scope==='items'?0:(p.status==='paid'?Number(p.amount):p.status==='refund'?Number(p.amount):0)),0),receivable=payments.reduce((sum:number,p:any)=>sum+(p.scope==='items'?0:(p.status==='receivable'?Number(p.amount):p.status==='receivable_adjustment'?Number(p.amount):0)),0),overpaid=Math.max(0,paid+receivable-bill.total);
    if(overpaid>0){let reduce=overpaid;for(let i=payments.length-1;i>=0&&reduce>0;i--)if(payments[i].status==='receivable'&&payments[i].amount>0){const cut=Math.min(reduce,payments[i].amount);payments[i].amount-=cut;reduce-=cut;}const cashRefund=Math.min(overpaid-reduce,Math.max(0,paid));if(cashRefund>0)payments.push({method:'İade',amount:-cashRefund,status:'refund',created:ts,actor:me.id});}
   }
   const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detail,o.id,b.version),db.prepare('UPDATE orders SET items=?,adjustments=?,subtotal=?,discount_amount=?,total=?,refund_total=?,payments=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(items),JSON.stringify(adjustments),bill.subtotal,bill.discountAmount,bill.total,refundTotal,JSON.stringify(payments),o.id,b.version)]);
   if(result[1].meta.changes!==1)err('Adisyon başka bir cihazda güncellendi. Yeniden dene.',409);return json({ok:true});
  }
  if(a==='discount_set'){
   if(!admin)err('İndirimi yalnızca yönetici düzenleyebilir.',403);if(o.service_type!=='table'||o.stage>=4)err('Yalnızca açık masa adisyonunda indirim değiştirilebilir.',409);
   const type=String(b.discountType||'none'),value=Number(b.discountValue||0);if(!['none','percent','amount'].includes(type)||!Number.isSafeInteger(value)||value<0||value>100000000||(type==='percent'&&value>10000))err('İndirim türü veya değeri geçersiz.');
   const items=JSON.parse(o.items),adjustments=JSON.parse(o.adjustments||'[]'),bill=calculateBill(items,adjustments,type,value);if(type==='amount'&&value>bill.subtotal)err('İndirim ürün toplamını aşamaz.');const detail=type==='none'?'Adisyon indirimi kaldırıldı':'Adisyona '+(type==='percent'?(value/100)+'%':('₺'+(value/100).toFixed(2)))+' indirim uygulandı';
   const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detail,o.id,b.version),db.prepare('UPDATE orders SET discount_type=?,discount_value=?,subtotal=?,discount_amount=?,total=?,version=version+1 WHERE id=? AND version=?').bind(type,value,bill.subtotal,bill.discountAmount,bill.total,o.id,b.version)]);if(result[1].meta.changes!==1)err('Adisyon başka bir cihazda güncellendi. Yeniden dene.',409);return json({ok:true});
  }
  if(a==='payment_items'){
   if(!canSell)err('Ürün tahsilatını yalnızca yönetici yapabilir.',403);if(o.service_type!=='table'||o.stage>=4)err('Yalnızca açık masa adisyonundan ürün tahsil edilebilir.',409);
   const method=String(b.paymentMethod||''),allowed=['Nakit','Kredi Kartı','Online Ödeme','Sodexo/Multinet','Açık Hesap (Cari)'];if(!allowed.includes(method))err('Geçerli bir ödeme yöntemi seç.');
   const indexes=Array.isArray(b.indexes)?[...new Set(b.indexes)]:[];if(!indexes.length||indexes.some((i:any)=>!Number.isInteger(i)))err('Ödenecek ürünleri seç.');
   const fractions=new Map<number,number>((Array.isArray(b.shares)?b.shares:[]).map((x:any)=>[Number(x.index),Number(x.denominator)]));for(const [index,n] of fractions)if(!indexes.includes(index)||!Number.isInteger(n)||n<2||n>20)err('Ürün payı 2 ile 20 arasında olmalı.');
   const items=JSON.parse(o.items) as string[],adjustments=JSON.parse(o.adjustments||'[]') as any[],payments=JSON.parse(o.payments||'[]') as any[],before=calculateBill(items,adjustments,o.discount_type||'none',Number(o.discount_value||0));
   const selected=indexes.map((index:number)=>{if(index<0||index>=items.length||adjustments.some((x:any)=>x.index===index&&['cancelled','refunded','comp','paid'].includes(x.status)))err('Seçilen ürünlerden biri artık ödenebilir durumda değil. Siparişi yenileyip tekrar dene.',409);const line=parseOrderItem(items[index]);if(!line)err('Seçilen ürün satırı okunamadı.');const rows=adjustments.filter((x:any)=>x.index===index),itemDiscount=rows.filter((x:any)=>x.status==='item_discount').reduce((n:number,x:any)=>n+Number(x.amount||0),0),partialPaid=rows.filter((x:any)=>x.status==='partial_paid').reduce((n:number,x:any)=>n+Number(x.amount||0),0),grossDue=Math.max(0,line.quantity*line.unit-itemDiscount-partialPaid);if(!grossDue)err('Seçilen ürünün tahsil edilecek tutarı kalmadı.');return {index,line,grossDue,denominator:fractions.get(index)||0}});
   const selectedGross=selected.reduce((n:number,x:any)=>n+(x.denominator?Math.max(1,Math.round(x.grossDue/x.denominator)):x.grossDue),0);if(selectedGross>before.subtotal)err('Seçili ürün tutarı geçersiz.');
   const discountShare=before.subtotal?Math.round(selectedGross*before.discountAmount/before.subtotal):0,nextDiscountType=o.discount_type||'none',nextDiscountValue=nextDiscountType==='amount'?Math.max(0,Number(o.discount_value||0)-discountShare):Number(o.discount_value||0);
   for(const row of selected){const reduction=row.denominator?Math.min(row.grossDue,Math.max(1,Math.round(row.grossDue/row.denominator))):row.grossDue,status=reduction>=row.grossDue?'paid':'partial_paid';adjustments.push({index:row.index,status,amount:reduction,created:ts,actor:me.id,method,denominator:row.denominator||null})}
   const bill=calculateBill(items,adjustments,nextDiscountType,nextDiscountValue),amount=Math.max(0,before.total-bill.total);if(amount<=0)err('Seçilen ürünler için tahsil edilecek tutar yok.');
   const lineIndexes=selected.map((x:any)=>x.index);payments.push({method,amount,status:method==='Açık Hesap (Cari)'?'receivable':'paid',scope:'items',lineIndexes,lineAmounts:selected.map((x:any)=>({index:x.index,denominator:x.denominator||null})),created:ts,actor:me.id});
   const paidItemTotal=Number(o.paid_item_total||0)+amount,complete=bill.total===0,paymentNames=[...new Set(payments.filter((p:any)=>['paid','receivable'].includes(p.status)).map((p:any)=>p.method))],summary=paymentNames.length>1?'Parçalı Ödeme':paymentNames[0]||method,detail='Seçili ürün tahsilatı: '+selected.map((x:any)=>x.line.name+(x.denominator?' · 1/'+x.denominator:'')+' · '+method).join(', ')+' · ₺'+(amount/100).toFixed(2).replace('.',',');
   const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detail,o.id,b.version),db.prepare('UPDATE orders SET adjustments=?,discount_type=?,discount_value=?,subtotal=?,discount_amount=?,total=?,payments=?,payment=?,paid_item_total=?,stage=?,delivered=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(adjustments),nextDiscountType,nextDiscountValue,bill.subtotal,bill.discountAmount,bill.total,JSON.stringify(payments),summary,paidItemTotal,complete?4:o.stage,complete?ts:o.delivered,o.id,b.version)]);if(result[1].meta.changes!==1)err('Adisyon başka bir cihazda güncellendi. Yeniden dene.',409);if(complete){const closed={...o,items:JSON.stringify(items),adjustments:JSON.stringify(adjustments),total:bill.total,paid_item_total:paidItemTotal,stage:4};const statements=await buildOrderCostStatements(db,closed,me.id,ts);if(statements.length)await db.batch(statements)}return json({ok:true,closed:complete,amount:amount/100});
  }
  if(a==='payment_add'){
   if(!canSell)err('Tahsilatı yalnızca yönetici alabilir.',403);if(o.service_type!=='table'||o.stage>=4)err('Yalnızca açık masa adisyonuna ödeme eklenebilir.',409);
   const method=String(b.paymentMethod||''),allowed=['Nakit','Kredi Kartı','Online Ödeme','Sodexo/Multinet','Açık Hesap (Cari)'];if(!allowed.includes(method))err('Geçerli bir ödeme yöntemi seç.');const amount=Number(b.amount),payments=JSON.parse(o.payments||'[]') as any[];if(!Number.isSafeInteger(amount)||amount<0)err('Ödeme tutarı geçersiz.');
   const allocated=payments.reduce((sum:number,p:any)=>sum+(p.scope==='items'?0:(['paid','receivable','refund','receivable_adjustment'].includes(p.status)?Number(p.amount):0)),0),remaining=Math.max(0,o.total-allocated);if(amount>remaining)err('Ödeme kalan tutardan fazla olamaz.');if(amount===0&&(o.total!==0||!b.fast))err('Ödeme tutarı sıfır olamaz.');
   if(amount>0)payments.push({method,amount,status:method==='Açık Hesap (Cari)'?'receivable':'paid',created:ts,actor:me.id});const nowCovered=allocated+amount,complete=nowCovered>=o.total,paymentNames=[...new Set(payments.filter((p:any)=>['paid','receivable'].includes(p.status)).map((p:any)=>p.method))],summary=paymentNames.length>1?'Parçalı Ödeme':paymentNames[0]||method,detail=(method==='Açık Hesap (Cari)'?'Açık hesap kaydı: ':'Ödeme alındı: ')+method+' · ₺'+(amount/100).toFixed(2).replace('.',',')+(complete?' · Adisyon kapandı':' · Kalan ₺'+(Math.max(0,o.total-nowCovered)/100).toFixed(2).replace('.',','));
   const result=await db.batch([db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detail,o.id,b.version),db.prepare('UPDATE orders SET payments=?,payment=?,stage=?,delivered=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(payments),summary,complete?4:o.stage,complete?ts:o.delivered,o.id,b.version)]);if(result[1].meta.changes!==1)err('Adisyon başka bir cihazda güncellendi. Yeniden dene.',409);if(complete){const statements=await buildOrderCostStatements(db,{...o,stage:4},me.id,ts);if(statements.length)await db.batch(statements)}if(complete||b.printRequested){const latest=await db.prepare('SELECT * FROM orders WHERE id=?').bind(o.id).first();await enqueuePrint(db,latest,'Adisyon')}return json({ok:true,closed:complete});
  }
  if(a==='kitchen_ready'){
   if(!admin)err('Mutfak işlemi için yönetici yetkisi gerekiyor.',403);
   const table=o.service_type==='table';
   if(o.merged_into||(table ? o.stage>=4 : !['package','pickup'].includes(o.service_type)||o.stage>=2))err('Sipariş artık hazırlıkta değil.',409);
   const items=JSON.parse(o.items) as string[];
   const adjustments=JSON.parse(o.adjustments||'[]') as any[];
   const selectedIndex=b.index;
   if((selectedIndex===undefined&&!table)||(selectedIndex!==undefined&&(!Number.isInteger(selectedIndex)||selectedIndex<0||selectedIndex>=items.length)))err('Geçerli bir ürün seç.');
   const prepared=items.flatMap((item,index)=>{
    if(selectedIndex!==undefined&&index!==selectedIndex)return [];
    const rows=adjustments.filter(x=>x.index===index);
    if(rows.some(x=>['cancelled','refunded'].includes(x.status)))return [];
    const quantity=parseOrderItem(item)?.quantity??1;
    return [{index,status:'kitchen_ready',quantity}];
   });
   if(!prepared.length)err('Hazırlanacak ürün bulunamadı.',409);
   const updated=[...adjustments.filter(x=>x.status!=='kitchen_ready'||(selectedIndex!==undefined&&x.index!==selectedIndex)),...prepared];
   set='adjustments=?';vals=[JSON.stringify(updated)];detail=selectedIndex===undefined?'Masa ürünleri mutfakta hazırlandı':'Ürün mutfakta hazırlandı';
  }else if(a==='prepare'||a==='ready'){
   if(!canSell)err('Yalnızca yönetici hazırlık durumunu değiştirebilir.',403);
   if(a==='prepare'){
    if(o.stage!==0)err('Sipariş bu işlem için uygun aşamada değil.',409);
    set='stage=?';vals=[1];detail='Hazırlama başladı';
   }else{
    if(o.stage!==0&&o.stage!==1)err('Sipariş bu işlem için uygun aşamada değil.',409);
    set='stage=?';vals=[2];detail=o.service_type==='pickup'?'Gel Al siparişi teslim almaya hazır':'Paket hazır, kurye bekliyor';
   }
  }else if(a==='assign'||a==='claim'){
   if(o.service_type!=='package')err('Yalnızca paket siparişine kurye atanabilir.',409);
   if(o.stage!==2||o.courier_id)err('Bu paket artık alınamaz.',409);
   if(a==='assign'&&!admin)err('Yönetici yetkisi gerekiyor.',403);
   const target=admin?String(b.courierId||''):me.id;
   const person=await db.prepare("SELECT id FROM members WHERE id=? AND active=1 AND role='courier' UNION ALL SELECT id FROM courier_roster WHERE id=? AND active=1 AND id NOT IN (SELECT id FROM members)").bind(target,target).first();if(!person)err('Aktif bir kurye seç.');
   set='courier_id=?';vals=[target];detail='Paket kuryeye ayrıldı';
  }else if(a==='settle'){
   if(!canSell)err('Masa adisyonunu yalnızca yönetici kapatabilir.',403);
   if(o.service_type!=='table'||o.stage===4)err('Açık bir masa adisyonu bulunamadı.',409);
   const payment=['Nakit','Kapıda kart'].includes(b.payment)?b.payment:null;if(!payment)err('Nakit veya kapıda kart seç.');
   set='stage=4,delivered=?,payment=?';vals=[ts,payment];detail='Masa adisyonu kapatıldı · '+payment;
  }else if(a==='depart'||a==='deliver'||a==='release'){
   if(a!=='deliver'&&o.service_type!=='package')err('Bu sipariş türü kurye teslimatı kullanmaz.',409);
   if(!admin&&o.courier_id!==me.id)err('Bu paket sana ait değil.',403);
   if(a==='release'){
    if(!o.courier_id||o.stage!==2)err('Sadece yola çıkmamış paket havuza bırakılabilir.',409);set='courier_id=NULL';detail='Paket havuza bırakıldı';
   }else if(a==='depart'){
    if(o.stage!==2||!o.courier_id)err('Paket önce kuryeye atanmalı.',409);set='stage=3,departed=?';vals=[ts];detail='Yola çıktı';
   }else{
    if(o.service_type==='package'){if(o.stage!==3||!o.courier_id)err('Paket teslimatta değil.');}
    else{if(!canSell)err('Yalnızca yönetici teslimatı kapatabilir.',403);if(o.stage!==2)err('Sipariş önce hazır olmalı.',409);}
    if(!['Online','Online Ödeme','YS Online','Trendyol Online','Açık Hesap','Açık Hesap (Cari)'].includes(o.payment)&&b.collected!==true)err('Tahsilatı onaylamalısın.');
    set='stage=4,delivered=?';vals=[ts];detail=o.payment==='Açık Hesap'||o.payment==='Açık Hesap (Cari)'?'Açık hesapla kapatıldı':['Online','Online Ödeme','YS Online','Trendyol Online'].includes(o.payment)?'Teslim edildi':'Tahsil edildi ve teslim edildi';
    const loc=b.deliveryLocation;
    if(me.role==='courier'&&o.service_type==='package'&&loc&&Number.isFinite(loc.lat)&&Math.abs(loc.lat)<=90&&Number.isFinite(loc.lon)&&Math.abs(loc.lon)<=180&&Number.isSafeInteger(loc.time)&&loc.time>0&&loc.time<=ts+60000){
     set+=',delivery_location=?';
     vals.push(JSON.stringify({lat:loc.lat,lon:loc.lon,time:loc.time}));
    }
   }
  }else err('Geçersiz işlem.');
  const results=await db.batch([
   db.prepare('INSERT INTO events (order_id,actor,action,created,detail) SELECT id,?,?,?,? FROM orders WHERE id=? AND version=?').bind(me.id,a,ts,detail,o.id,b.version),
   db.prepare(`UPDATE orders SET ${set},version=version+1 WHERE id=? AND version=?`).bind(...vals,o.id,b.version)
  ]);
  if(results[1].meta.changes!==1)err('Paket başka bir cihazda güncellendi. Yeniden dene.',409);if(a==='prepare'){const prepared=await db.prepare('SELECT * FROM orders WHERE id=?').bind(o.id).first();await enqueuePrint(db,prepared,'Mutfak')}
  const nextStage=a==='ready'?2:a==='depart'?3:a==='deliver'?4:0;
  if(nextStage)await syncPlatformOrderStage(db,env,email||"",o.id,nextStage);
  if(set.includes('stage=4')){const statements=await buildOrderCostStatements(db,{...o,stage:4,delivered:ts},me.id,ts);if(statements.length)await db.batch(statements);if(o.service_type==='table'){const latest=await db.prepare('SELECT * FROM orders WHERE id=?').bind(o.id).first();await enqueuePrint(db,latest,'Adisyon')}}
  return json({ok:true});
 }
 return json({error:'İşlem bulunamadı.'},404);
}catch(e:any){if(!e.status)console.error('API failure',e.message);return json({error:e.status?e.message:'İşlem tamamlanamadı. Tekrar dene.'},e.status||500)}}
