#!/usr/bin/env node
// Local EasyPOS print bridge. Requires Node.js 20+ and PowerShell on Windows or CUPS for local Unix printers.
import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { createConnection, isIP } from 'node:net';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildCashierTicket, buildKitchenTicket } from './escpos-templates.js';

const exec = promisify(execFile);
const base = String(process.env.EASYPOS_URL || '').replace(/\/$/, '');
const token = process.env.EASYPOS_BRIDGE_TOKEN || '';
if (!/^https:\/\//i.test(base) || !token) {
  console.error('Set EASYPOS_URL and EASYPOS_BRIDGE_TOKEN before starting the bridge.');
  process.exit(2);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const windows = process.platform === 'win32';
const printAlert = process.env.EASYPOS_PRINT_BEEP === '0'
  ? Buffer.alloc(0)
  : Buffer.from([0x1b, 0x42, 0x02, 0x02]);
const archivePath = join(dirname(fileURLToPath(import.meta.url)), 'musteriler.json');
const LOCAL_PORT = Number(process.env.EASYPOS_CUSTOMER_PORT || 4789);
const approvedOrigin = 'https://easpos2.pizzalocaleyelki.workers.dev';
let archiveWrite = Promise.resolve();

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function archiveKey(customer) {
  const phone = String(customer.phone || '').replace(/\D/g, '').slice(0, 15);
  return phone.length >= 8 ? 'tel:' + phone : 'ad:' + normalizeText(customer.name) + '|adres:' + normalizeText(customer.address);
}

async function readCustomers() {
  try {
    const rows = JSON.parse(await readFile(archivePath, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('Local customer archive could not be read.');
    return [];
  }
}

async function saveCustomers(rows) {
  const temporary = archivePath + '.tmp';
  await writeFile(temporary, JSON.stringify(rows, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, archivePath);
}

async function upsertCustomer(input, orderId = '') {
  const customer = {
    name: String(input?.name ?? input?.customerName ?? '').trim().slice(0, 90),
    phone: String(input?.phone || '').replace(/[^\d+]/g, '').slice(0, 30),
    address: String(input?.address ?? input?.area ?? '').trim().slice(0, 240),
    platform: String(input?.platform || 'Restoran').trim().slice(0, 40),
  };
  if (!customer.name) return null;
  const key = archiveKey(customer);
  const when = Number(input?.lastOrderAt ?? input?.createdAt) || Date.now();
  archiveWrite = archiveWrite.catch(() => {}).then(async () => {
    const rows = await readCustomers();
    const existing = rows.find((row) => row.id === key || archiveKey(row) === key);
    const row = existing || { id: key, platforms: [], orderCount: 0, lastOrderAt: 0, _orderIds: [] };
    row.name = customer.name || row.name;
    row.phone = customer.phone || row.phone || '';
    row.address = customer.address || row.address || '';
    row.platforms = [...new Set([...(row.platforms || []), row.platform, customer.platform].filter(Boolean))];
    row.platform = customer.platform || row.platform || 'Restoran';
    row.updatedAt = Date.now();
    if (orderId) {
      row._orderIds = Array.isArray(row._orderIds) ? row._orderIds : [];
      if (!row._orderIds.includes(String(orderId))) {
        row._orderIds.push(String(orderId));
        if (row._orderIds.length > 1000) row._orderIds = row._orderIds.slice(-1000);
        row.orderCount = (Number(row.orderCount) || 0) + 1;
      }
      row.lastOrderAt = Math.max(Number(row.lastOrderAt) || 0, when);
    }
    if (!existing) rows.push(row);
    rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
    await saveCustomers(rows);
    return row;
  });
  await archiveWrite;
  return (await readCustomers()).find((row) => row.id === key) || null;
}

function sendJson(response, status, value, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });
  response.end(JSON.stringify(value));
}

function allowedOrigin(value) {
  if (!value) return '';
  if (value === approvedOrigin) return value;
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'localhost' ? value : '';
  } catch { return ''; }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const customerServer = createServer(async (request, response) => {
  const origin = allowedOrigin(request.headers.origin);
  if (request.headers.origin && !origin) return sendJson(response, 403, { error: 'Origin not allowed.' });
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
    response.setHeader('Access-Control-Max-Age', '600');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/customers' && request.method === 'GET') {
    const phone = String(url.searchParams.get('phone') || '').replace(/\D/g, '');
    const query = normalizeText(url.searchParams.get('q'));
    const customers = await readCustomers();
    const filtered = customers.filter((row) => (!phone || String(row.phone || '').replace(/\D/g, '').includes(phone)) && (!query || normalizeText([row.name, row.phone, row.address].join(' ')).includes(query)));
    return sendJson(response, 200, { customers: filtered }, origin);
  }
  if (url.pathname === '/customers/upsert' && request.method === 'POST') {
    try {
      const input = await readJson(request);
      const customer = await upsertCustomer(input, input?.orderId || '');
      if (!customer) return sendJson(response, 422, { error: 'Customer name is required.' }, origin);
      return sendJson(response, 200, { ok: true, customer }, origin);
    } catch (error) {
      return sendJson(response, error?.message === 'request_too_large' ? 413 : 400, { error: 'Invalid customer request.' }, origin);
    }
  }
  const remove = url.pathname.match(/^\/customers\/([^/]+)$/);
  if (remove && request.method === 'DELETE') {
    const id = decodeURIComponent(remove[1]);
    archiveWrite = archiveWrite.catch(() => {}).then(async () => saveCustomers((await readCustomers()).filter((row) => row.id !== id)));
    await archiveWrite;
    return sendJson(response, 200, { ok: true }, origin);
  }
  return sendJson(response, 404, { error: 'Not found.' }, origin);
});
customerServer.listen(LOCAL_PORT, '127.0.0.1', () => console.log('EasyPOS local customer archive listening on 127.0.0.1:' + LOCAL_PORT));

function buildTicketBuffer(job) {
  const raw = String(job.content || '');
  const marker = '\n__ESCPOS_JSON__:';
  const idx = raw.indexOf(marker);
  if (idx !== -1) {
    try {
      const payload = JSON.parse(raw.slice(idx + marker.length).trim());
      const bName = payload.brand === 'mixed'
        ? 'EASY WINGY x EASY MACARONI'
        : payload.brand === 'mac'
          ? 'EASY MACARONI'
          : 'EASY WINGY';
      const body = job.printer_type === 'Mutfak'
        ? buildKitchenTicket(payload, { name: bName })
        : buildCashierTicket(payload, { name: bName });
      return Buffer.concat([body, printAlert]);
    } catch {}
  }
  const fallbackText = idx !== -1 ? raw.slice(0, idx) : raw;
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from(fallbackText, 'utf8'),
    printAlert,
  ]);
}

async function archivePrintJob(job) {
  const content = String(job.content || '');
  const marker = '\n__ESCPOS_JSON__:';
  const index = content.indexOf(marker);
  if (index < 0) return;
  try {
    const payload = JSON.parse(content.slice(index + marker.length).trim());
    await upsertCustomer({
      name: payload.customerName,
      phone: payload.phone,
      address: payload.address,
      platform: payload.channel,
      lastOrderAt: payload.createdAt,
    }, payload.orderNo || job.order_id || '');
  } catch {
    console.error('A print job could not be added to the local customer archive.');
  }
}

async function printers() {
  try {
    if (windows) {
      const command = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Printer -ErrorAction Stop | ForEach-Object { $_.Name }';
      const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 5000, windowsHide: true });
      return stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    }
    const { stdout } = await exec('lpstat', ['-p'], { timeout: 5000 });
    return [...stdout.matchAll(/printer\s+([^\s]+)\s+/g)].map((match) => match[1]);
  } catch {
    return [];
  }
}

function printEthernet(job) {
  const address = job.printer_address.trim();
  const match = address.match(/^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/);
  const host = isIP(address) ? address : match?.[1] || match?.[2];
  const port = isIP(address) ? 9100 : Number(match?.[3] ?? 9100);
  if (!host || !isIP(host) || port < 1 || port > 65535) {
    throw new Error('Geçersiz Ethernet yazıcı adresi: ' + address);
  }
  const ticket = buildTicketBuffer(job);
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(5000, () => socket.destroy(new Error('Yazıcı bağlantısı zaman aşımına uğradı.')));
    socket.once('error', reject);
    socket.once('close', () => reject(new Error('Yazıcı bağlantısı erken kapandı.')));
    socket.once('connect', () => {
      socket.end(ticket, () => {
        if (socket.destroyed) return;
        resolve();
        socket.destroy();
      });
    });
  });
}

async function report(names) { try { await fetch(base + '/api/print-bridge/heartbeat', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ printers: names }) }); } catch {} }
async function ack(id, ok, error = '') { try { await fetch(base + '/api/print-queue', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ok, error }) }); } catch {} }
async function print(job) {
  const buf = buildTicketBuffer(job);
  return new Promise((resolve, reject) => {
    const child = spawn('lp', ['-d', job.printer_name, '-o', 'raw'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => (error += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(error || 'lp exited ' + code))));
    child.stdin.end(buf);
  });
}

console.log('EasyPOS Local Print Bridge started. Printer names and tokens are not logged.');
while (true) {
  const detected = await printers();
  await report(detected);
  try {
    const response = await fetch(base + '/api/print-queue', { headers: { Authorization: 'Bearer ' + token } });
    if (response.ok) {
      const { jobs = [] } = await response.json();
      for (const job of jobs) {
        await archivePrintJob(job);
        const ethernet = Boolean(job.printer_address?.trim());
        if (!ethernet && (windows || !detected.includes(job.printer_name))) continue;
        try {
          if (ethernet) await printEthernet(job);
          else await print(job);
          await ack(job.id, true);
        } catch (error) {
          await ack(job.id, false, String(error?.message || error).slice(0, 250));
        }
      }
    }
  } catch {}
  await delay(1500);
}
