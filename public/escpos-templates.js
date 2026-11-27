const COLS = 48;
const CODEPAGE = 13;

const CP857 = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'ç': 0x87, 'ê': 0x88, 'î': 0x8C,
  'ı': 0x8D, 'ô': 0x93, 'ö': 0x94, 'û': 0x96, 'İ': 0x98, 'Ö': 0x99, 'Ü': 0x9A, '£': 0x9C,
  'Ş': 0x9E, 'ş': 0x9F, 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4,
  'Ğ': 0xA6, 'ğ': 0xA7,
};
const REPLACE = { '₺': 'TL', '—': '-', '–': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '×': 'x', '•': '*', '€': 'EUR' };

export function enc(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    for (const c of (REPLACE[ch] ?? ch)) {
      const code = c.codePointAt(0);
      if (code < 0x80) out.push(code);
      else if (CP857[c] !== undefined) out.push(CP857[c]);
      else out.push(0x3F);
    }
  }
  return Buffer.from(out);
}

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
const padL = (s, n) => ' '.repeat(Math.max(0, n - s.length)) + s;
const center = (s, n = COLS) => ' '.repeat(Math.max(0, Math.floor((n - s.length) / 2))) + s;
const up = (s) => String(s ?? '').toLocaleUpperCase('tr-TR');

function money(n) {
  const v = (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  const [i, d] = v.split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
}

function fmtDate(d) {
  const dt = d ? new Date(d) : new Date();
  if (isNaN(dt)) return String(d);
  return dt.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
const fmtTime = (d) => fmtDate(d).split(' ').pop();

function wrap(text, width) {
  const lines = [];
  let cur = '';
  for (let word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!cur) cur = word;
    else if ((cur + ' ' + word).length <= width) cur += ' ' + word;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function row(left, right, width = COLS) {
  right = String(right ?? '');
  left = String(left ?? '').slice(0, Math.max(0, width - right.length - 1));
  return pad(left, width - right.length) + right;
}

export function cleanAddress(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  s = s
    .replace(/\b(APT|APARTMAN|DAİRE|DAIRE|KAT|NO)\s*[:：]\s*TGO\s*YEMEK\b/gi, '')
    .replace(/\bTGO\s*YEMEK\b/gi, '')
    .replace(/\bTRENDYOL\s*(GO|YEMEK)\b/gi, '')
    .replace(/\b(APT|APARTMAN|DAİRE|DAIRE|KAT|NO)\s*[:：]\s*(?=[,;|]|$)/gi, '');
  const parts = s.split(/\s*[,;|]\s*/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const key = p.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '');
    if (key && !seen.has(key)) { seen.add(key); out.push(p); }
  }
  return out.join(', ');
}

export function fmtPhone(raw) {
  const main = String(raw ?? '').split('/')[0].trim();
  let d = main.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = '0' + d.slice(2);
  if (d.length === 10 && d.startsWith('5')) d = '0' + d;
  if (d.length === 11 && d.startsWith('0')) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  return main;
}

class Esc {
  constructor() { this.b = []; }
  raw(...a) { this.b.push(Buffer.from(a)); return this; }
  buf(x) { this.b.push(x); return this; }
  init() { return this.raw(0x1B, 0x40).raw(0x1C, 0x2E).raw(0x1B, 0x74, CODEPAGE); }
  align(a) { return this.raw(0x1B, 0x61, { left: 0, center: 1, right: 2 }[a]); }
  bold(on) { return this.raw(0x1B, 0x45, on ? 1 : 0); }
  size(w = 1, h = 1) { return this.raw(0x1D, 0x21, ((w - 1) << 4) | (h - 1)); }
  invert(on) { return this.raw(0x1D, 0x42, on ? 1 : 0); }
  text(s) { return this.buf(enc(s)); }
  ln(s = '') { return this.text(s).raw(0x0A); }
  feed(n) { return this.raw(0x1B, 0x64, n); }
  hr(ch = '-') { return this.ln(ch.repeat(COLS)); }
  cut() { return this.feed(3).raw(0x1D, 0x56, 0x42, 0x00); }
  out() { return Buffer.concat(this.b); }
}

function bigTitle(p, text) {
  const t = up(text);
  const w = t.length * 2 <= COLS ? 2 : 1;
  p.align('center').bold(true).size(w, 2).ln(t).size(1, 1).bold(false);
}

function kv(p, label, value, { bold = false, big = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return;
  const L = 14;
  const lines = wrap(value, COLS - L);
  p.align('left');
  lines.forEach((ln, i) => {
    p.bold(false).text(i === 0 ? pad(label, L - 2) + ': ' : ' '.repeat(L));
    p.bold(bold || big);
    if (big) p.size(1, 2);
    p.ln(ln);
    p.size(1, 1).bold(false);
  });
}

export function buildCashierTicket(order, brand = {}) {
  const o = order;
  const p = new Esc().init();

  bigTitle(p, brand.name || 'EASYPOS');
  p.hr('=');
  p.align('left');
  p.ln(row('Tarih', fmtDate(o.createdAt)));
  p.ln(row('Adisyon No', '#' + o.orderNo));
  p.ln(row('Kanal', up(o.channel)));

  p.hr('-');
  p.align('center').invert(true).bold(true).ln(center('TESLİMAT BİLGİLERİ').padEnd(COLS)).invert(false).bold(false);
  p.hr('-');
  kv(p, 'Ödeme Türü', o.paymentType, { bold: true });
  kv(p, 'Müşteri', o.customerName);
  kv(p, 'Telefon', o.phone ? fmtPhone(o.phone) : '', { bold: true });
  kv(p, 'Adres', cleanAddress(o.address));
  kv(p, 'Teslimat', o.deliveryTime);
  kv(p, 'Onay Kodu', o.approvalCode, { big: true });
  if (o.note) kv(p, 'Sipariş Notu', o.note, { bold: true });
  p.hr('-');

  const QW = 5, PW = 10, NW = COLS - QW - PW;
  p.bold(true).ln(pad('ADET', QW) + pad('ÜRÜN ADI', NW) + padL('TUTAR', PW)).bold(false);
  p.hr('-');
  let sum = 0;
  for (const it of o.items || []) {
    const qty = it.qty || 1;
    const lineTotal = it.total ?? (Number(it.price) || 0) * qty;
    sum += lineTotal;
    const nameLines = wrap(it.name, NW - 1);
    p.bold(true).ln(pad(qty + 'x', QW) + pad(nameLines[0], NW) + padL(money(lineTotal), PW)).bold(false);
    nameLines.slice(1).forEach((l) => p.ln(' '.repeat(QW) + l));
    if (it.note) wrap('NOT: ' + it.note, NW - 1).forEach((l) => p.bold(true).ln(' '.repeat(QW) + l).bold(false));
  }
  p.hr('-');

  const subtotal = o.subtotal ?? sum;
  const discount = Number(o.discount) || 0;
  const total = o.total ?? Math.max(0, subtotal - discount);
  p.ln(row('Ara Toplam', money(subtotal)));
  if (discount > 0) p.ln(row('Genel İndirim', '-' + money(discount)));
  p.hr('=');
  p.align('center').bold(true).ln('ÖDENECEK TOPLAM (TL)');
  p.size(2, 2).ln(money(total) + ' TL').size(1, 1).bold(false);
  p.hr('=');
  p.align('center').ln('Afiyet Olsun.');
  p.cut();
  return p.out();
}

export function buildKitchenTicket(order, brand = {}) {
  const o = order;
  const p = new Esc().init();

  bigTitle(p, brand.name || 'EASYPOS');
  p.align('left').bold(true).size(1, 2);
  p.ln(row('#' + o.orderNo + '  ' + up(o.channel), fmtTime(o.createdAt)));
  p.size(1, 1).bold(false).hr('-');

  for (const it of o.items || []) {
    const lines = wrap(`${it.qty || 1}x ${it.name}`, COLS);
    p.bold(true).size(1, 2);
    lines.forEach((l, i) => p.ln((i ? '   ' : '') + l));
    p.size(1, 1).bold(false);
    if (it.note) {
      p.bold(true).size(1, 2);
      wrap('NOT: ' + it.note, COLS - 3).forEach((l) => p.ln('   ' + l));
      p.size(1, 1).bold(false);
    }
  }
  if (o.note) {
    p.hr('-').bold(true).size(1, 2);
    wrap('SİPARİŞ NOTU: ' + o.note, COLS).forEach((l) => p.ln(l));
    p.size(1, 1).bold(false);
  }
  p.cut();
  return p.out();
}
