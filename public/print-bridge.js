#!/usr/bin/env node
// Local EasyPOS print bridge. Requires Node.js 20+ and PowerShell on Windows or CUPS for local Unix printers.
import { execFile, spawn } from 'node:child_process';
import { createConnection, isIP } from 'node:net';
import { promisify } from 'node:util';
const exec=promisify(execFile),base=String(process.env.EASYPOS_URL||'').replace(/\/$/,''),token=process.env.EASYPOS_BRIDGE_TOKEN||'';
if(!/^https:\/\//i.test(base)||!token){console.error('Set EASYPOS_URL and EASYPOS_BRIDGE_TOKEN before starting the bridge.');process.exit(2)}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const windows = process.platform === 'win32';
// ESC B: two short beeps on compatible Ethernet thermal printers.
const printAlert = process.env.EASYPOS_PRINT_BEEP === '0'
  ? Buffer.alloc(0)
  : Buffer.from([0x1b, 0x42, 0x02, 0x02]);

async function printers() {
  try {
    if (windows) {
      const command = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Printer -ErrorAction Stop | ForEach-Object { $_.Name }';
      const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 5000, windowsHide: true });
      return stdout.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    }
    const { stdout } = await exec('lpstat', ['-p'], { timeout: 5000 });
    return [...stdout.matchAll(/printer\s+([^\s]+)\s+/g)].map(match => match[1]);
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

  const ticket = Buffer.concat([
    Buffer.from([0x1b, 0x40]), // ESC @: initialize
    Buffer.from(job.content, 'utf8'),
    printAlert,
  ]);
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

async function report(names){try{await fetch(base+'/api/print-bridge/heartbeat',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({printers:names})})}catch{}}
async function ack(id,ok,error=''){try{await fetch(base+'/api/print-queue',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id,ok,error})})}catch{}}
async function print(job){return new Promise((resolve,reject)=>{const child=spawn('lp',['-d',job.printer_name,'-o','raw'],{stdio:['pipe','ignore','pipe']});let error='';child.stderr.on('data',chunk=>error+=chunk.toString());child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error||'lp exited '+code)));child.stdin.end(job.content,'utf8')})}
console.log('EasyPOS Local Print Bridge started. Printer names and tokens are not logged.');
while (true) {
  const detected = await printers();
  await report(detected);
  try {
    const response = await fetch(base + '/api/print-queue', { headers: { Authorization: 'Bearer ' + token } });
    if (response.ok) {
      const { jobs = [] } = await response.json();
      for (const job of jobs) {
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
