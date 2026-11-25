import { catalog } from './catalog';

const sourceId = '1FzwL7yCvxnr4W1SPxIB3HETpR1edfiGpdiIa3JZa5aE';
type Cell = string | number | null;
type Source = { sourceId: string; capturedAt: string; costs: Cell[][]; recipes: Cell[][]; invoices: Cell[][] };
type ServiceAccount = { client_email: string; private_key: string };

const normalize = (value: unknown) => String(value ?? '').toLocaleLowerCase('tr').replace(/ı/g,'i')
 .normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]/g,'');
const cents = (value: unknown): number | null =>
 typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1_000_000
  ? Math.round((value + Number.EPSILON) * 100) : null;

const beverages = new Map<string, { name: RegExp; ambiguous?: RegExp }>([
 ['cocacola', {name:/^coca[- ]cola\s+kutu.*330\s*ml/i}],
 ['cocacolazero', {name:/^(?:cc|coca[- ]cola)\s+zero.*330\s*ml/i}],
 ['sprite', {name:/^(?:spr|sprite)\b.*(?:330|300)\s*ml/i}],
 ['fanta', {name:/^fanta\b.*(?:330|300)\s*ml/i}],
 ['fuseteaseftali', {name:/^ft\s+seft.*330\s*ml/i,ambiguous:/hibiskus/i}],
 ['fusetealimon', {name:/^ft\s+limon.*330\s*ml/i}],
 ['fuseteakarpuz', {name:/^ft\s+karpuz.*330\s*ml/i}],
 ['fuseteamango', {name:/^ft\s+man(?:-anns|go).*330\s*ml/i,ambiguous:/man-anns/i}],
 ['ayran', {name:/^ayran\s+300\s*ml/i}],
 ['soda', {name:/^damla\s+mn[.\s]*sade.*200\s*ml/i}],
 ['su', {name:/^damla\s+su\b.*330\s*ml/i}],
]);

export function summarizeProCosts(source: Source) {
 const costs = new Map(source.costs.filter(row => row[0]).map(row => [normalize(row[0]), cents(row[2])]));
 const recipes = new Map<string, {name:string; quantity:number|null; cost:number|null}[]>();
 for (const [product,,ingredient,quantity,cost] of source.recipes) {
  if (!product || typeof ingredient !== 'string' || !ingredient.trim()) continue;
  const key = normalize(product), lines = recipes.get(key) || [];
  lines.push({name:ingredient,quantity:typeof quantity === 'number' ? quantity : null,cost:cents(cost)});
  recipes.set(key,lines);
 }
 return catalog.map(product => {
  const key = normalize(product.name), beverage = beverages.get(key);
  if (!beverage) return {
   id:product.id, cost:costs.get(key) ?? null, lines:recipes.get(key) || [],
   source:'recipe', invoice:null, reason:costs.has(key) ? 'Pozitif ürün maliyeti bulunamadı.' : 'Ürün Maliyet sekmesinde eşleşme yok.',
  };
  const row = source.invoices.filter(row => typeof row[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row[0]) &&
   typeof row[3] === 'string' && beverage.name.test(row[3])).sort((a,b) => String(b[0]).localeCompare(String(a[0])))[0];
  if (!row) return {id:product.id,cost:null,lines:[],source:'invoice',invoice:null,reason:'Uygun fatura satırı bulunamadı.'};
  const [date,,,name,,unit,price] = row;
  const label=String(name);
  const packageSize = normalize(unit) === 'adet' ? 1 : Number(label.match(/\b1\s*[x×]\s*(\d{1,3})\b/i)?.[1] || 0);
  const reason = beverage.ambiguous?.test(label) ? 'Faturadaki çeşit menüdeki adla doğrulanmalı.'
   : !packageSize ? 'Koli içindeki adet faturada yazmıyor.'
   : cents(price) === null ? 'Geçerli alış fiyatı bulunamadı.' : '';
  return {id:product.id,cost:reason ? null : cents(Number(price)/packageSize),lines:[],source:'invoice',
   invoice:{date,name:label,price:cents(price),unit,packageSize},reason};
 });
}

const base64url = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const encode = (value: object) => base64url(new TextEncoder().encode(JSON.stringify(value)));

async function authorizeGoogle(account: ServiceAccount) {
 const now = Math.floor(Date.now()/1000);
 const endpoint = 'https://oauth2.googleapis.com/token';
 const claim = encode({alg:'RS256',typ:'JWT'}) + '.' + encode({
  iss:account.client_email, scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:endpoint,iat:now,exp:now+600,
 });
 const pem = account.private_key.replace(/-----[^-]+-----|\s/g,'');
 const key = await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),
  {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(claim));
 const response = await fetch(endpoint,{method:'POST',body:new URLSearchParams({
  grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:claim+'.'+base64url(new Uint8Array(signature)),
 }),signal:AbortSignal.timeout(6000)});
 if (!response.ok) throw new Error('Google erişim anahtarı doğrulanamadı.');
 const {access_token} = await response.json() as { access_token?: string };
 if (!access_token) throw new Error('Google erişim anahtarı alınamadı.');
 return access_token;
}

async function readGoogle(secret: string): Promise<Source> {
 const account = JSON.parse(secret) as ServiceAccount;
 const token = await authorizeGoogle(account);
 const url=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+sourceId+'/values:batchGet');
 for(const range of ["'Ürün Maliyet'!A2:C","'Reçeteler'!A2:E","'Alış Fiyat Geçmişi'!A2:G"])url.searchParams.append('ranges',range);
 url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
 url.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw new Error('Easy Group PRO okunamadı.');
 const data=await response.json() as {valueRanges?: {values?:Cell[][]}[]};
 const [costs,recipes,invoices]=(data.valueRanges || []).map(range=>range.values || []);
 return checkedSource({sourceId,capturedAt:new Date().toISOString(),costs,recipes,invoices});
}

function checkedSource(value: Source): Source {
 if (!value || value.sourceId !== sourceId || !Number.isFinite(Date.parse(value.capturedAt)) ||
  new Date(value.capturedAt).getTime() > Date.now()+300000 ||
  !Array.isArray(value.costs) || !Array.isArray(value.recipes) || !Array.isArray(value.invoices) ||
  !value.costs.length || !value.recipes.length ||
  value.costs.length > 5000 || value.recipes.length > 20000 || value.invoices.length > 20000 ||
  ![value.costs,value.recipes,value.invoices].every(rows=>rows.every(row=>Array.isArray(row) && row.length<=7 &&
    row.every(cell=>cell===null || typeof cell==='number' || (typeof cell==='string' && cell.length<=300))))) {
  throw new Error('Easy Group PRO aktarım dosyası geçersiz.');
 }
 return value;
}

export async function proCosts(db:any, action:string, secret?:string, file?:Source) {
 await db.prepare('CREATE TABLE IF NOT EXISTS pro_cost_snapshot (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL, captured_at TEXT NOT NULL, updated_at INTEGER NOT NULL, origin TEXT NOT NULL)').run();
 let saved=await db.prepare('SELECT payload,captured_at,updated_at,origin FROM pro_cost_snapshot WHERE id=1').first();
 let refreshError='';
 let source:Source|undefined;
 let origin='';
 if(action==='pro_import') {
  source=checkedSource(file as Source);
  origin='file';
 } else if(secret && (action==='pro_refresh' || !saved || Date.now()-saved.updated_at>15*60000)) {
  try { source=await readGoogle(secret);origin='google'; }
  catch { refreshError='Google’dan yenilenemedi. Tablo erişimi ve Cloudflare bağlantısını kontrol et.'; }
 }
 if(source) {
  const payload=JSON.stringify(summarizeProCosts(source));
  const snapshot={payload,captured_at:new Date(source.capturedAt).toISOString(),updated_at:Date.now(),origin};
  await db.prepare('INSERT INTO pro_cost_snapshot(id,payload,captured_at,updated_at,origin) VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,captured_at=excluded.captured_at,updated_at=excluded.updated_at,origin=excluded.origin WHERE excluded.captured_at>=pro_cost_snapshot.captured_at')
   .bind(snapshot.payload,snapshot.captured_at,snapshot.updated_at,snapshot.origin).run();
  saved=await db.prepare('SELECT payload,captured_at,updated_at,origin FROM pro_cost_snapshot WHERE id=1').first();
 }
 return {connected:!!secret,refreshError,capturedAt:saved?.captured_at??null,origin:saved?.origin??null,products:saved ? JSON.parse(saved.payload) : []};
}
