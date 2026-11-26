import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import ts from 'typescript';
const catalogSource=fs.readFileSync(new URL('../lib/catalog.ts',import.meta.url),'utf8').replaceAll('export const','const');
const source=catalogSource+fs.readFileSync(new URL('../lib/api.ts',import.meta.url),'utf8').replace("import { catalog, roster } from './catalog';",'');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {handle}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const migration=fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(p=>p.endsWith('.sql')).sort().map(p=>fs.readFileSync(new URL('../drizzle/'+p,import.meta.url),'utf8')).join('\n');
class DB{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(migration)}
 prepare(sql){const db=this.db;return {sql,values:[],bind(...v){this.values=v;return this},async first(){return db.prepare(sql).get(...this.values)||null},async all(){return {results:db.prepare(sql).all(...this.values)}},async run(){const r=db.prepare(sql).run(...this.values);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}}}
 async batch(stmts){this.db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of stmts)out.push(await s.run());this.db.exec('COMMIT');return out}catch(e){this.db.exec('ROLLBACK');throw e}}
}
const identities={owner:['owner-user','pizzalocaleyelki@gmail.com'],one:['user-one','one@example.test'],two:['user-two','two@example.test'],stranger:['stranger-user','stranger@example.test']};
async function request(db,path,body,user='owner',origin='https://easy.test'){const headers={};if(user){headers['oai-authenticated-user-id']=identities[user][0];headers['oai-authenticated-user-email']=identities[user][1]}if(body){headers.origin=origin;headers['Content-Type']='application/json'}const r=await handle(new Request('https://easy.test/api/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),db);return {status:r.status,...await r.json()}}
async function setup(){const db=new DB();assert.equal((await request(db,'state')).status,200);for(const k of ['one','two'])assert.equal((await request(db,'team',{name:k,email:identities[k][1],role:'courier'})).status,200);await request(db,'state',undefined,'one');await request(db,'state',undefined,'two');return db}
async function fresh(db,payment='Online'){const add=await request(db,'demo',{brand:'mac',payment});const get=async()=> (await request(db,'state')).orders.find(o=>o.id===add.id);let o=await get();await request(db,'orders/action',{id:o.id,version:o.version,action:'prepare'});o=await get();await request(db,'orders/action',{id:o.id,version:o.version,action:'ready'});return get()}
test('identity, origin and role boundaries are enforced',async()=>{const db=await setup();assert.equal((await request(db,'state',undefined,null)).status,401);assert.equal((await request(db,'state',undefined,'stranger')).status,403);assert.equal((await request(db,'demo',{},'owner','https://evil.test')).status,403);assert.equal((await request(db,'demo',{},'one')).status,403);assert.equal((await request(db,'team',undefined,'one')).status,403);assert.equal((await request(db,'events',undefined,'two')).status,403)});
test('two couriers cannot claim the same order and stale versions conflict',async()=>{const db=await setup();const o=await fresh(db);const first=await request(db,'orders/action',{id:o.id,version:o.version,action:'claim'},'one');const second=await request(db,'orders/action',{id:o.id,version:o.version,action:'claim'},'two');assert.equal(first.status,200);assert.equal(second.status,409);const owner=await request(db,'state');const one=owner.people.find(p=>p.name==='one');assert.equal(owner.orders[0].courierId,one.id);assert.equal((await request(db,'state',undefined,'two')).orders.length,0);assert.equal((await request(db,'events')).events.filter(e=>e.action==='claim').length,1)});
test('courier cannot spoof assignee, act on another courier order or alter preparation',async()=>{const db=await setup();let o=await fresh(db);const p=(await request(db,'state')).people.find(p=>p.name==='two');assert.equal((await request(db,'orders/action',{id:o.id,version:o.version,action:'claim',courierId:p.id},'one')).status,200);o=(await request(db,'state')).orders[0];assert.notEqual(o.courierId,p.id);assert.equal((await request(db,'orders/action',{id:o.id,version:o.version,action:'depart'},'two')).status,403);assert.equal((await request(db,'orders/action',{id:o.id,version:o.version,action:'prepare'},'one')).status,403)});
test('complete cash delivery requires confirmation and persists across clients with audit trail',async()=>{const db=await setup();let o=await fresh(db,'Nakit');const get=async()=> (await request(db,'state')).orders[0];assert.equal((await request(db,'orders/action',{id:o.id,version:o.version,action:'claim'},'one')).status,200);o=await get();assert.equal((await request(db,'orders/action',{id:o.id,version:o.version,action:'deliver',collected:true},'one')).status,409);assert.equal((await request(db,'orders/action',{id:o.id,version:o.version,action:'depart'},'one')).status,200);o=await get();assert.equal((await request(db,'orders/action',{id:o.id,version:o.version,action:'deliver'},'one')).status,400);assert.equal((await request(db,'orders/action',{id:o.id,version:o.version,action:'deliver',collected:true},'one')).status,200);o=await get();assert.equal(o.stage,4);assert.equal(o.total,674);assert.ok(o.delivered);assert.equal((await request(db,'state',undefined,'one')).orders[0].stage,4);assert.equal((await request(db,'events')).events.length,5)});
test('disabled courier loses access and cannot be assigned a new order',async()=>{const db=await setup();const one=(await request(db,'team')).members.find(p=>p.name==='one');await request(db,'team',{action:'toggle',id:one.id,active:false});assert.equal((await request(db,'state',undefined,'one')).status,403);const o=await fresh(db);assert.equal((await request(db,'orders/action',{id:o.id,version:o.version,action:'assign',courierId:one.id})).status,400);assert.equal((await request(db,'team',{action:'toggle',id:'owner',active:false})).status,400)});
test('older open orders remain visible and deliveries are counted by completion day',async()=>{const db=await setup();let o=await fresh(db);db.db.prepare('UPDATE orders SET business_day=?,created=? WHERE id=?').run('2020-01-01',Date.parse('2020-01-01'),o.id);let state=await request(db,'state');assert.equal(state.orders.length,1);const courier=state.people.find(p=>p.role==='courier');await request(db,'orders/action',{id:o.id,version:o.version,action:'assign',courierId:courier.id});o=(await request(db,'state')).orders[0];await request(db,'orders/action',{id:o.id,version:o.version,action:'depart'});o=(await request(db,'state')).orders[0];await request(db,'orders/action',{id:o.id,version:o.version,action:'deliver'});assert.equal((await request(db,'state')).orders[0].stage,4)});

test('menu preserves all 75 products, prices, Sprite and Soda correction',async()=>{const db=await setup();const menu=await request(db,'menu');assert.equal(menu.products.length,75);assert.equal(new Set(menu.products.map(p=>p.category)).size,10);assert.equal(menu.products.reduce((s,p)=>s+p.ysPrice,0),2280900);assert.equal(menu.products.find(p=>p.name==='Sprite').ysPrice,10000);assert.equal(menu.products.find(p=>p.name==='Soda').ysPrice,7000);assert.equal((await request(db,'menu',undefined,'one')).status,403)});
test('five couriers exist without fabricated emails; names and usernames are stable',async()=>{const db=await setup();const team=await request(db,'team');const pending=team.members.filter(p=>p.username);assert.equal(pending.length,5);assert.deepEqual(pending.map(p=>p.name),['Azat Taşdemir','Uğur Bilgin','Yusuf Atalay','Kaan Atalay','Hüseyin Toğran']);assert.ok(pending.every(p=>p.email===null&&!p.pin_ready));await request(db,'state');assert.equal((await request(db,'team')).members.filter(p=>p.username).length,5)});
test('username PIN authentication, reset revokes sessions, courier permissions remain enforced',async()=>{const db=await setup();assert.equal((await request(db,'login',{username:'azat',pin:'123456'},null)).status,401);await request(db,'team',{action:'set_pin',id:'courier-azat',pin:'123456'});const req=new Request('https://easy.test/api/login',{method:'POST',headers:{origin:'https://easy.test','content-type':'application/json'},body:JSON.stringify({username:'azat',pin:'123456'})});const login=await handle(req,db);assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.ok(login.headers.get('set-cookie').includes('HttpOnly; Secure; SameSite=Strict'));const state=await handle(new Request('https://easy.test/api/state',{headers:{cookie}}),db);assert.equal((await state.json()).me.id,'courier-azat');const denied=await handle(new Request('https://easy.test/api/team',{headers:{cookie}}),db);assert.equal(denied.status,403);await request(db,'team',{action:'set_pin',id:'courier-azat',pin:'654321'});assert.equal((await handle(new Request('https://easy.test/api/state',{headers:{cookie}}),db)).status,401)});
test('PIN login is throttled and cross-origin login is rejected',async()=>{const db=await setup();for(let i=0;i<5;i++)assert.equal((await request(db,'login',{username:'azat',pin:'000000'},null)).status,401);assert.equal((await request(db,'login',{username:'azat',pin:'000000'},null)).status,429);assert.equal((await request(db,'login',{username:'azat',pin:'000000'},null,'https://evil.test')).status,403)});

test('menu-based example orders use server prices and reject a fabricated total or Trendyol price inference',async()=>{const db=await setup();const menu=await request(db,'menu');const soda=menu.products.find(p=>p.name==='Soda');const created=await request(db,'demo',{brand:'wingy',productId:soda.id,quantity:2,total:1});assert.equal(created.status,200);const o=(await request(db,'state')).orders.find(p=>p.id===created.id);assert.equal(o.total,140);assert.deepEqual(o.items,['2 × Soda']);assert.equal((await request(db,'demo',{productId:soda.id,quantity:1,platform:'Trendyol'})).status,400)});

test('Easy Wingy accepts only pilot packages and queues each receipt once',async t=>{
  const db=await setup();
  const sync=()=>request(db,'integrations/trendyol/sync',{});
  await sync(); // Initialize the integration settings before supplying test credentials.
  db.db.prepare("UPDATE trendyol_config SET basic_token='test-token'").run();
  for(const type of ['Mutfak','Adisyon'])
    await request(db,'printers/manage',{action:'save',name:type,address:'test',types:[type],mainChannel:type});
  const pkg={id:'test-package',supplierId:788216,storeId:201813,packageStatus:'Created',totalPrice:24,
    lines:[{name:'Deneme ürünü',productId:72,unitSellingPrice:12,items:[{},{}]}]};
  let accepted=false,allow=false;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(new URL(url).hostname,'api.tgoapis.com');
    if(options.method==='PUT'){
      assert.equal(new URL(url).pathname,'/integrator/order/meal/suppliers/788216/packages/picked');
      assert.equal(JSON.parse(options.body).packageId,pkg.id);
      accepted=allow;
      return new Response('',{status:allow?200:403});
    }
    return Response.json({content:[{...pkg,id:'other',storeId:3},{...pkg,packageStatus:accepted?'Picking':'Created'}],totalPages:1});
  });
  assert.equal((await sync()).ok,false);
  assert.equal(db.db.prepare('SELECT count(*) AS n FROM print_queue').get().n,0);
  allow=true;
  assert.equal((await sync()).imported,1);
  assert.equal((await sync()).imported,0);
  assert.deepEqual(db.db.prepare('SELECT printer_type FROM print_queue ORDER BY printer_type').all().map(r=>r.printer_type),['Adisyon','Mutfak']);
  assert.equal(db.db.prepare('SELECT external_id FROM trendyol_products').get().external_id,'72');
});

test('Easy Wingy busy mode extends and restores the store delivery window',async t=>{
  const db=await setup();
  const status=(state,fields={})=>request(db,'integrations/trendyol/status',
    state?{change:{storeId:'201813',state,...fields}}:{});
  await status();
  db.db.prepare("UPDATE trendyol_config SET basic_token='test-token'").run();
  const writes=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(options.method==='GET')return Response.json({restaurants:[{id:201813,workingStatus:'OPEN',deliveryType:'STORE'}]});
    writes.push([new URL(url).pathname.split('/').pop(),JSON.parse(options.body)]);
    return Response.json({});
  });
  assert.equal((await status('BUSY',{min:25,max:35})).state,'BUSY');
  assert.equal((await status()).state,'BUSY');
  assert.equal((await status('OPEN')).state,'OPEN');
  assert.equal((await status('CLOSED')).state,'CLOSED');
  assert.deepEqual(writes,[['average-delivery-time',{min:35,max:45}],['average-delivery-time',{min:25,max:35}],['status',{status:'CLOSED'}]]);
});
