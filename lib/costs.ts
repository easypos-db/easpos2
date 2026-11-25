import { proCosts } from './pro-costs';
import { catalog } from './catalog';
import { recipeSeed } from './recipe-seed';

const schemaReady=new WeakMap<object,Promise<void>>();
const json=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status})};
const normalize=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g,' ');
const validUnit=(unit:string)=>['kg','g','lt','ml','adet'].includes(unit);
const baseUnit=(unit:string)=>unit==='kg'||unit==='g'?'g':unit==='lt'||unit==='ml'?'ml':'adet';
const baseFactor=(unit:string)=>unit==='kg'||unit==='lt'?1000:1;
const parseLine=(value:string)=>{const m=String(value).match(/^(\d+) × (.+) · ₺([\d.,]+)$/);if(!m)return null;const amount=Math.round(Number(m[3].replace(/\./g,'').replace(',','.'))*100);return Number.isSafeInteger(amount)?{quantity:Number(m[1]),name:m[2],unitPrice:amount}:null};
async function hashPin(pin:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);return Array.from(new Uint8Array(bits)).map(v=>v.toString(16).padStart(2,'0')).join('')}
async function verifyManagerPin(db:any,pinValue:any){const pin=String(pinValue||'');if(!/^\d{4}$/.test(pin))fail('Müdür PIN kodu 4 rakam olmalı.',403);await db.prepare('CREATE TABLE IF NOT EXISTS login_limits (username TEXT PRIMARY KEY,attempts INTEGER NOT NULL,reset_at INTEGER NOT NULL)').run();const now=Date.now(),username='manager-approval';await db.prepare('INSERT INTO login_limits (username,attempts,reset_at) VALUES (?,0,?) ON CONFLICT(username) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 0 ELSE attempts END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END').bind(username,now+900000,now,now,now+900000).run();const limit=await db.prepare('SELECT attempts,reset_at FROM login_limits WHERE username=?').bind(username).first();if(limit?.attempts>=5&&limit.reset_at>now)fail('Çok fazla hatalı PIN denemesi. 15 dakika sonra tekrar dene.',429);const stored=await db.prepare('SELECT pin_hash,pin_salt FROM manager_pin WHERE id=1').first();if(!stored)fail('Müdür PIN’i henüz ayarlanmamış. Ekip ve erişim sayfasından belirle.',409);const candidate=await hashPin(pin,stored.pin_salt);if(candidate!==stored.pin_hash){await db.prepare('UPDATE login_limits SET attempts=attempts+1 WHERE username=?').bind(username).run();fail('Müdür PIN kodu hatalı.',403)}await db.prepare('DELETE FROM login_limits WHERE username=?').bind(username).run()}

async function ensureColumn(db:any,table:string,column:string,definition:string){const rows=(await db.prepare('PRAGMA table_info('+table+')').all()).results||[];if(!rows.some((x:any)=>x.name===column))await db.prepare('ALTER TABLE '+table+' ADD COLUMN '+column+' '+definition).run()}
async function seedRecipeData(db:any){
 const seeded=await db.prepare('SELECT seed_key FROM recipe_seed_state WHERE seed_key=?').bind('easy-group-recipe-import-2026-11').first();
 if(seeded)return;
 const counts=await db.prepare('SELECT (SELECT COUNT(*) FROM ingredients) AS ingredients,(SELECT COUNT(*) FROM recipes) AS recipes,(SELECT COUNT(*) FROM sub_recipes) AS sub_recipes').first();
 if(Number(counts?.ingredients||0)||Number(counts?.recipes||0)||Number(counts?.sub_recipes||0)){await db.prepare('INSERT OR IGNORE INTO recipe_seed_state (seed_key,seeded_at,source) VALUES (?,?,?)').bind('easy-group-recipe-import-2026-11',Date.now(),'existing D1 data preserved').run();return}
 const now=Date.now(),statements:any[]=[];
 for(const i of recipeSeed.ingredients)statements.push(db.prepare('INSERT OR IGNORE INTO ingredients (id,name,purchase_unit,base_unit,base_quantity,unit_price_minor,stock_base,critical_base,supplier,active,updated_at,ingredient_type,linked_product_id) VALUES (?,?,?,?,?,?,0,0,?,1,?,?,?)').bind(i.id,i.name,i.purchaseUnit,i.baseUnit,i.baseQuantity,i.unitPriceMinor,i.supplier,now,i.ingredientType,i.linkedProductId));
 for(const s of recipeSeed.subRecipes)statements.push(db.prepare('INSERT OR IGNORE INTO sub_recipes (id,name,source_name,ingredient_id,yield_milli,yield_unit,updated_at) VALUES (?,?,?,?,?,?,?)').bind(s.id,s.name,s.sourceName,s.ingredientId,s.yieldMilli,s.yieldUnit,now));
 for(const s of recipeSeed.subRecipes)for(const line of s.lines)statements.push(db.prepare('INSERT OR IGNORE INTO sub_recipe_lines (sub_recipe_id,ingredient_id,quantity_milli,base_unit) VALUES (?,?,?,?)').bind(s.id,line.ingredientId,line.quantityMilli,line.baseUnit));
 for(const p of recipeSeed.products)for(const line of p.lines)statements.push(db.prepare('INSERT OR IGNORE INTO recipes (product_id,ingredient_id,quantity_base,quantity_milli,base_unit,created_at) VALUES (?,?,?,?,?,?)').bind(p.productId,line.ingredientId,Math.max(1,Math.round(line.quantityBase)),line.quantityMilli,line.baseUnit,now));
 for(let i=0;i<statements.length;i+=90)await db.batch(statements.slice(i,i+90));
 await db.prepare('INSERT OR IGNORE INTO recipe_seed_state (seed_key,seeded_at,source) VALUES (?,?,?)').bind('easy-group-recipe-import-2026-11',Date.now(),'Easy Group: Easy Hammadde, Yarı Mamül, Reçeteler').run();
}

export async function ensureCostSchema(db:any){let pending=schemaReady.get(db);if(!pending){pending=(async()=>{const statements=[
"CREATE TABLE IF NOT EXISTS manager_pin (id INTEGER PRIMARY KEY CHECK(id=1),pin_hash TEXT NOT NULL,pin_salt TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at INTEGER NOT NULL)",
"CREATE TABLE IF NOT EXISTS ingredients (id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,purchase_unit TEXT NOT NULL CHECK(purchase_unit IN ('kg','g','lt','ml','adet')),base_unit TEXT NOT NULL CHECK(base_unit IN ('g','ml','adet')),base_quantity INTEGER NOT NULL CHECK(base_quantity>0),unit_price_minor INTEGER NOT NULL DEFAULT 0,stock_base INTEGER NOT NULL DEFAULT 0,critical_base INTEGER NOT NULL DEFAULT 0,supplier TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL,ingredient_type TEXT NOT NULL DEFAULT 'raw',linked_product_id TEXT)",
"CREATE TABLE IF NOT EXISTS recipes (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id TEXT NOT NULL,ingredient_id TEXT NOT NULL REFERENCES ingredients(id),quantity_base INTEGER NOT NULL,quantity_milli INTEGER NOT NULL DEFAULT 0,base_unit TEXT NOT NULL CHECK(base_unit IN ('g','ml','adet')),created_at INTEGER NOT NULL,UNIQUE(product_id,ingredient_id))",
"CREATE INDEX IF NOT EXISTS recipes_product_idx ON recipes(product_id)",
"CREATE TABLE IF NOT EXISTS sub_recipes (id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,source_name TEXT NOT NULL,ingredient_id TEXT NOT NULL UNIQUE REFERENCES ingredients(id),yield_milli INTEGER NOT NULL CHECK(yield_milli>0),yield_unit TEXT NOT NULL CHECK(yield_unit IN ('g','ml','adet')),updated_at INTEGER NOT NULL)",
"CREATE TABLE IF NOT EXISTS sub_recipe_lines (id INTEGER PRIMARY KEY AUTOINCREMENT,sub_recipe_id TEXT NOT NULL REFERENCES sub_recipes(id),ingredient_id TEXT NOT NULL REFERENCES ingredients(id),quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),base_unit TEXT NOT NULL CHECK(base_unit IN ('g','ml','adet')),UNIQUE(sub_recipe_id,ingredient_id))",
"CREATE INDEX IF NOT EXISTS sub_recipe_lines_recipe_idx ON sub_recipe_lines(sub_recipe_id)",
"CREATE TABLE IF NOT EXISTS recipe_seed_state (seed_key TEXT PRIMARY KEY,seeded_at INTEGER NOT NULL,source TEXT NOT NULL)",







"CREATE TABLE IF NOT EXISTS order_costs (order_id INTEGER PRIMARY KEY,revenue_minor INTEGER NOT NULL,cost_minor INTEGER NOT NULL,profit_minor INTEGER NOT NULL,has_missing_recipe INTEGER NOT NULL DEFAULT 0,calculated_at INTEGER NOT NULL)",
"CREATE TABLE IF NOT EXISTS order_cost_lines (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL REFERENCES order_costs(order_id),line_index INTEGER NOT NULL,product_id TEXT NOT NULL,product_name TEXT NOT NULL,quantity INTEGER NOT NULL,revenue_minor INTEGER NOT NULL,cost_minor INTEGER NOT NULL,missing_recipe INTEGER NOT NULL DEFAULT 0,UNIQUE(order_id,line_index))"];for(const sql of statements)await db.prepare(sql).run();await ensureColumn(db,'ingredients','ingredient_type',"TEXT NOT NULL DEFAULT 'raw'");await ensureColumn(db,'ingredients','linked_product_id','TEXT');await ensureColumn(db,'recipes','quantity_milli','INTEGER NOT NULL DEFAULT 0');await seedRecipeData(db)})().catch((e:any)=>{schemaReady.delete(db);throw e});schemaReady.set(db,pending)}await pending}

export async function saveManagerPin(db:any,pinValue:any,actor:string){const pin=String(pinValue||'');if(!/^\d{4}$/.test(pin))fail('Müdür PIN’i 4 rakam olmalı.');const salt=crypto.randomUUID(),pinHash=await hashPin(pin,salt);await db.prepare('INSERT INTO manager_pin (id,pin_hash,pin_salt,updated_by,updated_at) VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(pinHash,salt,actor,Date.now()).run();return json({ok:true})}

type Graph={ingredients:Map<string,any>;recipesByProduct:Map<string,any[]>;subRecipesByIngredient:Map<string,any>;subLinesByRecipe:Map<string,any[]>;missingPrices:Set<string>};
async function loadGraph(db:any):Promise<Graph>{const [ir,rr,sr,sl]=await Promise.all([db.prepare('SELECT * FROM ingredients WHERE active=1').all(),db.prepare('SELECT * FROM recipes ORDER BY product_id,id').all(),db.prepare('SELECT * FROM sub_recipes').all(),db.prepare('SELECT * FROM sub_recipe_lines ORDER BY sub_recipe_id,id').all()]);const ingredients=new Map<string,any>((ir.results||[]).map((x:any)=>[x.id,x])),recipesByProduct=new Map<string,any[]>();for(const r of rr.results||[]){const a=recipesByProduct.get(r.product_id)||[];a.push(r);recipesByProduct.set(r.product_id,a)}const subRecipesByIngredient=new Map<string,any>((sr.results||[]).map((x:any)=>[x.ingredient_id,x])),subLinesByRecipe=new Map<string,any[]>();for(const l of sl.results||[]){const a=subLinesByRecipe.get(l.sub_recipe_id)||[];a.push(l);subLinesByRecipe.set(l.sub_recipe_id,a)}return {ingredients,recipesByProduct,subRecipesByIngredient,subLinesByRecipe,missingPrices:new Set<string>()}}
function lineMilli(line:any){const milli=Number(line.quantity_milli||0);return milli>0?milli:Number(line.quantity_base||0)*1000}
function expandIngredient(ingredientId:string,quantityMilli:number,g:Graph,stack:Set<string>,consumption?:Map<string,number>):{costMinor:number;missing:boolean}{const ing=g.ingredients.get(ingredientId);if(!ing)return {costMinor:0,missing:true};const type=String(ing.ingredient_type||'raw');if(type==='raw'){const price=Number(ing.unit_price_minor||0),denom=1000*Math.max(1,Number(ing.base_quantity||1));if(price<=0)g.missingPrices.add(ingredientId);if(consumption)consumption.set(ingredientId,(consumption.get(ingredientId)||0)+quantityMilli);return {costMinor:Math.round(quantityMilli*price/denom),missing:price<=0}}if(type==='semi'){const semi=g.subRecipesByIngredient.get(ingredientId);if(!semi||Number(semi.yield_milli)<=0)return {costMinor:0,missing:true};const key='semi:'+semi.id;if(stack.has(key))return {costMinor:0,missing:true};const next=new Set(stack);next.add(key);let cost=0,missing=false;for(const l of g.subLinesByRecipe.get(semi.id)||[]){const childQuantity=Math.round(Number(l.quantity_milli)*quantityMilli/Number(semi.yield_milli));const part=expandIngredient(l.ingredient_id,childQuantity,g,next,consumption);cost+=part.costMinor;missing=missing||part.missing}return {costMinor:cost,missing}}if(type==='product'){const productId=String(ing.linked_product_id||''),key='product:'+productId;if(!productId||stack.has(key))return {costMinor:0,missing:true};const rows=g.recipesByProduct.get(productId)||[];if(!rows.length)return {costMinor:0,missing:true};const next=new Set(stack);next.add(key);let cost=0,missing=false;for(const l of rows){const childQuantity=Math.round(lineMilli(l)*quantityMilli/1000);const part=expandIngredient(l.ingredient_id,childQuantity,g,next,consumption);cost+=part.costMinor;missing=missing||part.missing}return {costMinor:cost,missing}}return {costMinor:0,missing:true}}
function recipeCost(productId:string,g:Graph,consumption?:Map<string,number>){const rows=g.recipesByProduct.get(productId)||[];if(!rows.length)return {costMinor:0,missing:true,recipeCount:0};let cost=0,missing=false;for(const r of rows){const part=expandIngredient(r.ingredient_id,lineMilli(r),g,new Set(['product:'+productId]),consumption);cost+=part.costMinor;missing=missing||part.missing}return {costMinor:cost,missing,recipeCount:rows.length}}

async function readSnapshot(db:any,filters:any={}){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const currentPeriod=today.slice(0,7);
 const defaultFrom=/^\d{4}-(0[1-9]|1[0-2])$/.test(String(filters.period||''))?`${filters.period}-01`:`${currentPeriod}-01`;
 const periodEnd=/^\d{4}-(0[1-9]|1[0-2])$/.test(String(filters.period||''))?(()=>{const [y,m]=String(filters.period).split('-').map(Number);return `${y+(m===12?1:0)}-${String(m===12?1:m+1).padStart(2,'0')}-01`})():today;
 let fromDate=/^\d{4}-\d{2}-\d{2}$/.test(String(filters.fromDate||''))?String(filters.fromDate):defaultFrom;
 let toDate=/^\d{4}-\d{2}-\d{2}$/.test(String(filters.toDate||''))?String(filters.toDate):(/^\d{4}-(0[1-9]|1[0-2])$/.test(String(filters.period||''))?new Date(Date.parse(`${periodEnd}T00:00:00+03:00`)-86400000).toLocaleDateString('en-CA',{timeZone:'Europe/Istanbul'}):today);
 if(fromDate>toDate)fail('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
 const start=Date.parse(`${fromDate}T00:00:00+03:00`);
 const end=Date.parse(`${toDate}T00:00:00+03:00`)+86400000;
 const [graph,closedOrders]=await Promise.all([
  loadGraph(db),
  db.prepare("SELECT id,items,adjustments,delivered FROM orders WHERE demo=0 AND stage=4 AND merged_into IS NULL AND delivered>=? AND delivered<? ORDER BY delivered,id").bind(start,end).all()
 ]);
 const productByName=new Map<string,any>(catalog.map((p:any)=>[normalize(p.name),p]));
 const sales=new Map<string,any>(),consumption=new Map<string,number>(),missingRecipes=new Set<string>();
 let soldUnits=0;
 for(const order of closedOrders.results||[]){
  let items:any[]=[],adjustments:any[]=[];
  try{items=Array.isArray(order.items)?order.items:JSON.parse(order.items||'[]')}catch{}
  try{adjustments=Array.isArray(order.adjustments)?order.adjustments:JSON.parse(order.adjustments||'[]')}catch{}
  for(let index=0;index<items.length;index++){
   const parsed=parseLine(items[index]);if(!parsed)continue;
   if(adjustments.some((a:any)=>a.index===index&&a.status==='cancelled'))continue;
   const product=productByName.get(normalize(parsed.name));
   const key=product?.id||normalize(parsed.name);
   const row=sales.get(key)||{productId:product?.id||'',name:product?.name||parsed.name,brand:product?.brand||'unknown',quantity:0};
   row.quantity+=parsed.quantity;sales.set(key,row);soldUnits+=parsed.quantity;
   if(!product)continue;
   const unitConsumption=new Map<string,number>(),recipe=recipeCost(product.id,graph,unitConsumption);
   if(recipe.missing)missingRecipes.add(product.name);
   for(const [ingredientId,milli] of unitConsumption)consumption.set(ingredientId,(consumption.get(ingredientId)||0)+milli*parsed.quantity);
  }
 }
 const productSales=[...sales.values()].sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name,'tr'));
 const ingredientConsumption=[...consumption.entries()].map(([id,milli])=>{const ingredient=graph.ingredients.get(id);return ingredient?{id,name:ingredient.name,unit:ingredient.base_unit,quantity:Number((milli/1000).toFixed(3))}:null}).filter(Boolean).sort((a:any,b:any)=>b.quantity-a.quantity||a.name.localeCompare(b.name,'tr'));
 const recipes=catalog.map((product:any)=>({id:product.id,name:product.name,brand:product.brand,category:product.category,lines:(graph.recipesByProduct.get(product.id)||[]).map((line:any)=>{const ingredient=graph.ingredients.get(line.ingredient_id);return {ingredientId:line.ingredient_id,name:ingredient?.name||'Tanımsız bileşen',type:ingredient?.ingredient_type||'raw',quantity:Number((lineMilli(line)/1000).toFixed(3)),unit:line.base_unit}})}));
 const semiRows=(await db.prepare('SELECT s.*,i.name AS ingredient_name FROM sub_recipes s JOIN ingredients i ON i.id=s.ingredient_id ORDER BY s.name COLLATE NOCASE').all()).results||[];
 const subRecipes=semiRows.map((semi:any)=>({id:semi.id,name:semi.name,ingredientId:semi.ingredient_id,yield:Number(semi.yield_milli)/1000,unit:semi.yield_unit,lines:(graph.subLinesByRecipe.get(semi.id)||[]).map((line:any)=>({ingredientId:line.ingredient_id,name:graph.ingredients.get(line.ingredient_id)?.name||'Tanımsız bileşen',type:graph.ingredients.get(line.ingredient_id)?.ingredient_type||'raw',quantity:Number((Number(line.quantity_milli)/1000).toFixed(3)),unit:line.base_unit}))}));
 const ingredients=[...graph.ingredients.values()].filter((item:any)=>item.ingredient_type==='raw').map((item:any)=>({id:item.id,name:item.name,purchaseUnit:item.purchase_unit,baseUnit:item.base_unit,baseQuantity:Number(item.base_quantity||1),type:item.ingredient_type})).sort((a:any,b:any)=>a.name.localeCompare(b.name,'tr'));
 const components=[...graph.ingredients.values()].filter((item:any)=>item.ingredient_type!=='product').map((item:any)=>({id:item.id,name:item.name,type:item.ingredient_type,unit:item.base_unit,purchaseUnit:item.purchase_unit})).sort((a:any,b:any)=>a.name.localeCompare(b.name,'tr'));
 return {fromDate,toDate,period:fromDate.slice(0,7),orderCount:(closedOrders.results||[]).length,soldUnits,productSales,ingredientConsumption,recipes,subRecipes,ingredients,components,missingRecipes:[...missingRecipes].sort((a,b)=>a.localeCompare(b,'tr'))};
}
export async function handleCosts(request:Request,db:any,_me:any,admin:boolean,env?:any){
 if(new URL(request.url).pathname!=='/api/costs')return null;
 if(!admin)fail('Reçete ve tüketim raporu için yönetici oturumu gerekli.',403);
 let body:any;try{body=JSON.parse(await request.text())}catch{return json({error:'Geçersiz JSON.'},400)}
 if(!body||typeof body!=='object'||Array.isArray(body))fail('Geçersiz istek.');
 await verifyManagerPin(db,body.managerPin);
 const action=String(body.action||'snapshot'),now=Date.now();
 if(action==='snapshot')return json(await readSnapshot(db,body));
 if(['pro_costs','pro_refresh','pro_import'].includes(action)){
  try{return json(await proCosts(db,action,env?.EASYPOS_PRO_SERVICE_ACCOUNT,body.source))}
  catch(error:any){
   if(action==='pro_import'&&error.message==='Easy Group PRO aktarım dosyası geçersiz.')fail(error.message);
   throw error;
  }
 }
 if(action==='ingredient_save'){
  const id=String(body.id||crypto.randomUUID()),name=String(body.name||'').trim().slice(0,100),purchaseUnit=String(body.purchaseUnit||'');
  if(name.length<2||!validUnit(purchaseUnit))fail('Hammadde adı ve birimi geçerli olmalı.');
  const existing=await db.prepare('SELECT * FROM ingredients WHERE id=?').bind(id).first(),nextBase=baseUnit(purchaseUnit),nextFactor=baseFactor(purchaseUnit);
  if(existing&&existing.ingredient_type!=='raw')fail('Yalnızca hammadde kartları bu sekmeden düzenlenebilir.');
  if(existing&&(existing.base_unit!==nextBase||Number(existing.base_quantity)!==nextFactor)){
   const used=await db.prepare('SELECT (SELECT COUNT(*) FROM recipes WHERE ingredient_id=?) + (SELECT COUNT(*) FROM sub_recipe_lines WHERE ingredient_id=?) AS count').bind(id,id).first();
   if(Number(used?.count||0)>0)fail('Kullanılan hammaddenin ölçü ailesi değiştirilemez. Aynı ölçü ailesindeki birimi seç.');
  }
  if(existing)await db.prepare('UPDATE ingredients SET name=?,purchase_unit=?,base_unit=?,base_quantity=?,updated_at=? WHERE id=?').bind(name,purchaseUnit,nextBase,nextFactor,now,id).run();
  else await db.prepare("INSERT INTO ingredients (id,name,purchase_unit,base_unit,base_quantity,unit_price_minor,stock_base,critical_base,supplier,active,updated_at,ingredient_type) VALUES (?,?,?,?,?,0,0,0,'',1,?,'raw')").bind(id,name,purchaseUnit,nextBase,nextFactor,now).run();
  return json({ok:true,id});
 }
 if(action==='recipe_save'){
  const productId=String(body.productId||''),product=catalog.find((item:any)=>item.id===productId),lines=Array.isArray(body.lines)?body.lines:[];
  if(!product)fail('Menü ürünü bulunamadı.');if(lines.length>100)fail('Bir reçetede en fazla 100 bileşen olabilir.');
  const prepared:any[]=[];
  for(const row of lines){const ingredientId=String(row.ingredientId||''),ingredient=await db.prepare('SELECT id,base_unit FROM ingredients WHERE id=? AND active=1').bind(ingredientId).first(),quantity=Number(row.quantityBase),quantityMilli=Math.round(quantity*1000);if(!ingredient||!Number.isSafeInteger(quantityMilli)||quantityMilli<=0||quantityMilli>10000000000)fail('Reçete satırındaki hammadde veya miktar geçersiz.');if(prepared.some(item=>item.ingredientId===ingredientId))fail('Aynı bileşen reçetede iki kez seçilemez.');prepared.push({ingredientId,baseUnit:ingredient.base_unit,quantityMilli,quantityBase:Math.max(1,Math.round(quantity))})}
  await db.batch([db.prepare('DELETE FROM recipes WHERE product_id=?').bind(productId),...prepared.map(item=>db.prepare('INSERT INTO recipes (product_id,ingredient_id,quantity_base,quantity_milli,base_unit,created_at) VALUES (?,?,?,?,?,?)').bind(productId,item.ingredientId,item.quantityBase,item.quantityMilli,item.baseUnit,now))]);
  return json({ok:true,lines:prepared.length});
 }
 if(action==='sub_recipe_save'){
  const id=String(body.id||''),yieldQuantity=Number(body.yieldQuantity),yieldMilli=Math.round(yieldQuantity*1000),lines=Array.isArray(body.lines)?body.lines:[],semi=await db.prepare('SELECT * FROM sub_recipes WHERE id=?').bind(id).first();
  if(!semi)fail('Yarı mamul bulunamadı.');if(!Number.isSafeInteger(yieldMilli)||yieldMilli<=0||yieldMilli>100000000000)fail('Yarı mamul verimi geçerli olmalı.');if(lines.length>100)fail('Bir yarı mamulde en fazla 100 bileşen olabilir.');
  const prepared:any[]=[];
  for(const row of lines){const ingredientId=String(row.ingredientId||''),ingredient=await db.prepare("SELECT id,base_unit FROM ingredients WHERE id=? AND active=1 AND ingredient_type='raw'").bind(ingredientId).first(),quantityMilli=Math.round(Number(row.quantityBase)*1000);if(!ingredient||!Number.isSafeInteger(quantityMilli)||quantityMilli<=0)fail('Yarı mamul bileşeni veya miktar geçersiz.');if(prepared.some(item=>item.ingredientId===ingredientId))fail('Aynı bileşen iki kez seçilemez.');prepared.push({ingredientId,baseUnit:ingredient.base_unit,quantityMilli})}
  await db.batch([db.prepare('UPDATE sub_recipes SET yield_milli=?,updated_at=? WHERE id=?').bind(yieldMilli,now,id),db.prepare('DELETE FROM sub_recipe_lines WHERE sub_recipe_id=?').bind(id),...prepared.map(item=>db.prepare('INSERT INTO sub_recipe_lines (sub_recipe_id,ingredient_id,quantity_milli,base_unit) VALUES (?,?,?,?)').bind(id,item.ingredientId,item.quantityMilli,item.baseUnit))]);
  return json({ok:true,lines:prepared.length});
 }
 return json({error:'Geçersiz reçete işlemi.'},404);
}
export async function buildOrderCostStatements(db:any,order:any,_actor:string,at=Date.now()){if(!order||Number(order.stage)!==4)return[];if(await db.prepare('SELECT order_id FROM order_costs WHERE order_id=?').bind(order.id).first())return[];const items=typeof order.items==='string'?JSON.parse(order.items):order.items||[],adjustments=typeof order.adjustments==='string'?JSON.parse(order.adjustments||'[]'):order.adjustments||[],g=await loadGraph(db),sales:any[]=[];let totalCost=0,missing=false;for(let index=0;index<items.length;index++){const parsed=parseLine(items[index]);if(!parsed)continue;const product=catalog.find((p:any)=>normalize(p.name)===normalize(parsed.name));if(!product)continue;if(adjustments.some((a:any)=>a.index===index&&a.status==='cancelled'))continue;const r=recipeCost(product.id,g),lineCost=r.costMinor;missing=missing||r.missing;const revenue=parsed.unitPrice*parsed.quantity;totalCost+=lineCost*parsed.quantity;sales.push({index,product,quantity:parsed.quantity,revenue,cost:lineCost*parsed.quantity,missing:r.missing})}
const costRevenue=Math.max(0,Number(order.total||0)+Number(order.paid_item_total||0)),costProfit=costRevenue-totalCost,ts=at;const statements:any[]=[db.prepare('INSERT OR IGNORE INTO order_costs (order_id,revenue_minor,cost_minor,profit_minor,has_missing_recipe,calculated_at) VALUES (?,?,?,?,?,?)').bind(order.id,costRevenue,totalCost,costProfit,missing?1:0,ts)];for(const row of sales)statements.push(db.prepare('INSERT OR IGNORE INTO order_cost_lines (order_id,line_index,product_id,product_name,quantity,revenue_minor,cost_minor,missing_recipe) VALUES (?,?,?,?,?,?,?,?)').bind(order.id,row.index,row.product.id,row.product.name,row.quantity,row.revenue,row.cost,row.missing?1:0));return statements}
