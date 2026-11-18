#!/usr/bin/env node
// Local EasyPOS print bridge. Requires Node.js 20+ and a CUPS-compatible `lp`/`lpstat` installation.
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec=promisify(execFile),base=String(process.env.EASYPOS_URL||'').replace(/\/$/,''),token=process.env.EASYPOS_BRIDGE_TOKEN||'';
if(!/^https:\/\//i.test(base)||!token){console.error('Set EASYPOS_URL and EASYPOS_BRIDGE_TOKEN before starting the bridge.');process.exit(2)}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function printers(){try{const {stdout}=await exec('lpstat',['-p'],{timeout:5000});return [...stdout.matchAll(/printer\s+([^\s]+)\s+/g)].map(x=>x[1])}catch{return []}}
async function report(names){try{await fetch(base+'/api/print-bridge/heartbeat',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({printers:names})})}catch{}}
async function ack(id,ok,error=''){try{await fetch(base+'/api/print-queue',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id,ok,error})})}catch{}}
async function print(job){return new Promise((resolve,reject)=>{const child=spawn('lp',['-d',job.printer_name,'-o','raw'],{stdio:['pipe','ignore','pipe']});let error='';child.stderr.on('data',chunk=>error+=chunk.toString());child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error||'lp exited '+code)));child.stdin.end(job.content,'utf8')})}
console.log('EasyPOS Local Print Bridge started. Printer names and tokens are not logged.');
while(true){const detected=await printers();await report(detected);try{const response=await fetch(base+'/api/print-queue',{headers:{Authorization:'Bearer '+token}});if(response.ok){const {jobs=[]}=await response.json();for(const job of jobs){if(!detected.includes(job.printer_name))continue;try{await print(job);await ack(job.id,true)}catch(error){await ack(job.id,false,String(error?.message||error).slice(0,250))}}}}catch{}await delay(1500)}
