'use strict';
/* Banka ekstresi içe aktarma: CSV, Excel (xlsx, xls, ods) ve bankaların Excel diye verdiği HTML dosyaları */

function loadVendor(file, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/' + file;
    s.onload = () => window[globalName] ? res(window[globalName]) : rej(new Error('Bileşen yüklenemedi'));
    s.onerror = () => rej(new Error('Bileşen yüklenemedi'));
    document.head.append(s);
  });
}

function pickBinaryFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    // Telefonda bazı dosya yöneticileri uzantı filtresini anlamıyor, orada her dosya seçilebilsin
    if (!api.platform) input.accept = accept;
    input.style.display = 'none';
    input.onchange = async () => {
      const f = input.files[0]; input.remove();
      if (!f) return resolve(null);
      try { resolve({ name: f.name, buf: await f.arrayBuffer() }); } catch { resolve(null); }
    };
    document.body.append(input);
    input.click();
  });
}

/* ---------- Dosyayı satırlara çevirme ---------- */
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1254').decode(buf); } // Türkçe Windows'ta kaydedilmiş CSV'ler
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 30);
  let delim = ';', best = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map(l => l.split(d).length - 1).filter(n => n > 0);
    if (!counts.length) continue;
    // En çok satırda aynı sayıda geçen ayraç seçilir
    const freq = {}; counts.forEach(n => { freq[n] = (freq[n] || 0) + 1; });
    const score = Math.max(...Object.values(freq)) * 10 + counts.length;
    if (score > best) { best = score; delim = d; }
  }
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') { q = true; cell = ''; }
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim()); if (row.some(c => c !== '')) rows.push(row);
  return rows;
}
async function fileToRows(file) {
  const b = new Uint8Array(file.buf);
  const isZip = b[0] === 0x50 && b[1] === 0x4b, isOle = b[0] === 0xd0 && b[1] === 0xcf;
  let text = null;
  if (!isZip && !isOle) {
    text = decodeText(file.buf);
    const head = text.slice(0, 2000).toLowerCase();
    if (!/<(html|table|\?xml)/.test(head)) return parseCSV(text);
  }
  const sheet = await loadVendor('sheet.js', 'KKSheet');
  const sheets = sheet.sheets(file.buf);
  // Birden fazla sayfa varsa tarih içeren satırı en çok olan seçilir
  let best = sheets[0]?.rows || [], bestScore = -1;
  for (const s of sheets) {
    const sc = s.rows.filter(r => r.some(c => parseAnyDate(c, 'dmy'))).length;
    if (sc > bestScore) { bestScore = sc; best = s.rows; }
  }
  return best;
}

/* ---------- Tarih ve tutar ---------- */
const TR_MONTHS = ['oca', 'sub', 'mar', 'nis', 'may', 'haz', 'tem', 'agu', 'eyl', 'eki', 'kas', 'ara'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function mkDate(y, m, d) {
  if (y < 100) y += 2000;
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m - 1))) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
function parseAnyDate(v, order) {
  if (v instanceof Date && !isNaN(v)) {
    // Excel kütüphanesi bazen tarihi UTC gece yarısı olarak verir
    return v.getUTCHours() === 0 && v.getUTCMinutes() === 0 ? mkDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) : mkDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === 'number') {
    if (v > 30000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000); return mkDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    return null;
  }
  const s = String(v ?? '').trim().toLocaleLowerCase('tr');
  if (!s || s.length > 40) return null;
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:$|[\sT])/);
  if (m) return mkDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4}|\d{2})(?:$|\s)/);
  if (m) return order === 'mdy' ? mkDate(+m[3], +m[1], +m[2]) : mkDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s.-]+([a-zçğıöşü]{3,})[\s.,-]+(\d{4})/);
  if (m) {
    const k = nrm(m[2]).slice(0, 3);
    let mi = TR_MONTHS.indexOf(k); if (mi < 0) mi = EN_MONTHS.indexOf(k);
    if (mi >= 0) return mkDate(+m[3], mi + 1, +m[1]);
  }
  return null;
}
function detectDateOrder(values) {
  for (const v of values) {
    const m = typeof v === 'string' && v.trim().match(/^(\d{1,2})[-./](\d{1,2})[-./]\d{2,4}/);
    if (m && +m[2] > 12 && +m[1] <= 12) return 'mdy';
  }
  return 'dmy';
}
function detectDecimal(values) {
  let comma = 0, dot = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const s = v.replace(/[^\d.,]/g, '');
    if (/,\d{1,2}$/.test(s)) comma++; else if (/\.\d{1,2}$/.test(s)) dot++;
    else if (/^\d{1,3}(,\d{3})+$/.test(s)) dot++; else if (/^\d{1,3}(\.\d{3})+$/.test(s)) comma++;
  }
  return dot > comma ? '.' : ',';
}
function parseBankAmount(v, dec) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v ?? '').trim();
  if (!s || !/\d/.test(s)) return NaN;
  const neg = /^\(.*\)$/.test(s) || /^[-−–]/.test(s) || /[-−–]\s*$/.test(s) || /\s(b|borç|borc)$/i.test(s);
  s = s.replace(/[^\d.,]/g, '');
  s = dec === '.' ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

/* ---------- Sütunları tanıma ---------- */
// Karşılaştırmalar Türkçe harflerden arındırılmış küçük harfle yapılır: "MIGROS", "Migros" ve "MİGROS" aynı olur
const FOLD = { 'ı': 'i', 'ç': 'c', 'ğ': 'g', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
const nrm = s => String(s ?? '').toLocaleLowerCase('tr').replace(/[ıçğöşüâîû]/g, c => FOLD[c]).replace(/\s+/g, ' ').trim();
const COL_KEYS = {
  date: ['islem tarihi', 'islem tarihi', 'tarih', 'date', 'tarihi'],
  desc: ['aciklama', 'aciklama', 'islem aciklamasi', 'description', 'detay', 'isyeri', 'isyeri', 'uye isyeri', 'merchant', 'islem', 'islem', 'karsi taraf', 'alici'],
  amount: ['islem tutari', 'islem tutari', 'tutar', 'tutari', 'amount', 'miktar', 'tl tutar'],
  debit: ['borc', 'borc', 'cikan', 'cikan', 'cekilen', 'giden', 'harcama', 'debit'],
  credit: ['alacak', 'giren', 'yatan', 'gelen', 'credit'],
  balance: ['bakiye', 'balance', 'kalan']
};
function headerScore(row) {
  let n = 0;
  for (const c of row) {
    const t = nrm(c);
    if (!t || t.length > 40 || parseAnyDate(c, 'dmy')) continue;
    if (Object.values(COL_KEYS).some(keys => keys.some(k => t.includes(k)))) n++;
  }
  return n;
}
function findHeader(rows) {
  let best = -1, bestScore = 1;
  rows.slice(0, 40).forEach((r, i) => { const s = headerScore(r); if (s > bestScore) { bestScore = s; best = i; } });
  return best;
}
function guessColumns(header, data) {
  const H = header.map(nrm), cols = Math.max(header.length, ...data.slice(0, 50).map(r => r.length), 0);
  const find = (keys, not = []) => {
    for (const k of keys) {
      const i = H.findIndex(h => h.includes(k) && !not.some(n => h.includes(n)));
      if (i >= 0) return i;
    }
    return -1;
  };
  const sample = i => data.slice(0, 60).map(r => r[i]).filter(v => v !== '' && v != null);
  let date = find(COL_KEYS.date, ['valör', 'valor']);
  if (date < 0) date = find(['valör', 'valor']);
  if (date < 0) {
    let bestN = 0;
    for (let i = 0; i < cols; i++) { const n = sample(i).filter(v => parseAnyDate(v, 'dmy')).length; if (n > bestN) { bestN = n; date = i; } }
  }
  const balance = find(COL_KEYS.balance);
  let amount = find(COL_KEYS.amount, ['bakiye', 'puan', 'bonus', 'döviz', 'doviz', 'usd', 'eur']);
  const debit = find(COL_KEYS.debit, ['bakiye', 'tarih']), credit = find(COL_KEYS.credit, ['bakiye', 'tarih']);
  const taken = new Set([date, balance, amount, debit, credit]);
  let desc = find(COL_KEYS.desc, ['tarih', 'tutar', 'no', 'numara', 'tipi', 'türü', 'kanal']);
  if (desc < 0 || taken.has(desc)) {
    let bestLen = 0; desc = -1;
    for (let i = 0; i < cols; i++) {
      if (taken.has(i)) continue;
      const vals = sample(i).filter(v => typeof v === 'string' && !parseAnyDate(v, 'dmy') && isNaN(parseBankAmount(v, ',')));
      const len = vals.reduce((s, v) => s + v.length, 0) / Math.max(1, sample(i).length);
      if (len > bestLen) { bestLen = len; desc = i; }
    }
  }
  const mode = amount < 0 && (debit >= 0 || credit >= 0) ? 'split' : 'single';
  if (mode === 'single' && amount < 0) {
    for (let i = 0; i < cols; i++) {
      if (i === date || i === balance || i === desc) continue;
      const s = sample(i); if (s.length && s.filter(v => !isNaN(parseBankAmount(v, ','))).length / s.length > 0.8) { amount = i; break; }
    }
  }
  return { date, desc, amount, debit, credit, mode };
}

/* ---------- Kategori tahmini ---------- */
const CAT_RULES = [
  ['expense', 'Market', /migros|a-?101|\bbim\b|\bsok\b|sok market|carrefour|file market|macrocenter|hakmar|metro gross|onur market|happy center|bizim toptan|tarim kredi|\bmarket/],
  ['expense', 'Yeme İçme', /yemeksepeti|getir ?yemek|trendyol ?yemek|trendyol go|restoran|restaurant|\bcafe|\bkafe|kahve|coffee|starbucks|burger|pizza|doner|kebap|simit|firin|firin|pastane|mcdonald|kfc|popeyes|domino|espresso lab|tavuk dunyasi|baklava|lokanta|kofte/],
  ['expense', 'Ulaşım', /\bshell\b|\bopet\b|petrol ofisi|\bbp\b|totalenergies|aytemiz|akaryakit|akaryakit|istanbulkart|belbim|metro istanbul|\buber\b|bitaksi|\btaksi\b|\bmarti\b|turk hava|turk hava|\bthy\b|pegasus|ajet|otopark|\bhgs\b|\bogs\b|otoyol|obilet|flixbus|tcdd|marmaray|izban|\bego\b/],
  ['expense', 'Faturalar', /enerjisa|ck enerji|aydem|baskent ed|igdas|igdas|iski|\baski\b|izsu|dogalgaz|dogalgaz|elektrik|su idaresi|turkcell|vodafone|turk telekom|turk telekom|superonline|turknet|turknet|millenicom|fatura|\bbedas|\bayedas/],
  ['expense', 'Abonelikler', /netflix|spotify|youtube|disney|amazon prime|prime video|blutv|\bexxen|\bgain\b|apple\.com|icloud|google one|google storage|chatgpt|openai|claude\.ai|anthropic|microsoft 365|office 365|adobe|tod tv|\bmubi\b|storytel|duolingo/],
  ['expense', 'Eğlence', /sinema|cinemaximum|cineverse|biletix|passo|bubilet|\bsteam|epic games|playstation|xbox|konser|tiyatro|muze|muze|bowling/],
  ['expense', 'Giyim', /lc ?waikiki|defacto|koton|\bzara\b|h&m|\bmavi\b|boyner|pull ?& ?bear|bershka|\bmango\b|\bflo\b|\bnike\b|adidas|colin'?s|lcw|beymen|network|ipekyol|derimod|in street|skechers/],
  ['expense', 'Teknoloji', /mediamarkt|media markt|teknosa|vatan bilgisayar|apple store|itopya|incehesap|samsung store|xiaomi/],
  ['expense', 'Ev Eşyası', /\bikea\b|koctas|koctas|bauhaus|english home|madame coco|karaca|tekzen|evidea|bellona|istikbal|mudo|pasabahce|pasabahce|jysk/],
  ['expense', 'Sağlık', /eczane|hastane|klinik|\bdis|optik|medical|acibadem|acibadem|medicana|memorial|liv hospital|medipol|laboratuvar/],
  ['expense', 'Kişisel Bakım', /kuafor|kuafor|berber|gratis|watsons|rossmann|\beve\b|sephora|flormar|guzellik|guzellik|golden rose/],
  ['expense', 'Eğitim', /kirtasiye|kirtasiye|kitap|\bd&r\b|idefix|kitapyurdu|udemy|coursera|\bokul|universite|universite|\bkurs\b|harc|harc/],
  ['expense', 'Kira', /\bkira\b|kira odeme|aidat/],
  ['expense', 'Kredi / Taksit', /kredi taksit|kredi odeme|kredi odeme|taksit tahsil|kredi geri odeme/],
  ['income', 'Maaş', /maas|maas|ucret odeme|ucret odeme|salary|bordro/],
  ['income', 'Burs', /\bburs|tubitak|tubitak|\bkyk\b|kredi ve yurtlar/],
  ['income', 'Kira Geliri', /kira/],
  ['income', 'Yatırım Getirisi', /faiz|temettu|temettu|getiri|\bnema\b|mevduat/]
];
const TRANSFER_RE = /kredi kart[ii]? ?(borc |borc )?ode|kart (borcu )?odeme|ekstre ode|virman|kendi hesab|hesaplar ?aras|kart borcu|odemeniz icin|odemeniz icin|odemeniz icin|odeme icin tesekkur|hesaptan odeme|otomatik odeme talimat/;
const SUMMARY_RE = /^(onceki|onceki|devreden|devir|toplam|donem borcu|donem borcu|asgari|hesap ozeti|bakiye)/;
const DESC_STOP = new Set(['pos', 'islem', 'islem', 'harcama', 'internet', 'sanal', 'odeme', 'odeme', 'tr', 'tur', 'istanbul', 'ist', 'ankara', 'izmir', 'ref', 'no', 'ile', 've', 'karti', 'kart', 'mobil', 'sube', 'sube', 'virtual', 'fast', 'eft', 'havale', 'gelen', 'giden', 'transfer', 'para', 'tl', 'try', 'www', 'com', 'san', 'tic', 'ltd', 'sti', 'sti', 'as', 'a.s']);
function descKey(s) {
  return nrm(s).replace(/[0-9*#:/\\.,_()\-]+/g, ' ').split(' ').filter(w => w.length > 2 && !DESC_STOP.has(w)).slice(0, 1).join(' ');
}
function catByName(type, name) {
  const t = nrm(name);
  return catsOf(type).find(c => nrm(c.name) === t)?.id || null;
}
function fallbackCat(type) {
  return catByName(type, type === 'income' ? 'Diğer Gelir' : 'Diğer Gider') || catsOf(type)[catsOf(type).length - 1]?.id;
}
function buildCatLearner() {
  const m = {};
  for (const t of S.data.transactions) {
    if (!t.note) continue;
    const k = t.type + '|' + descKey(t.note); if (k.endsWith('|')) continue;
    (m[k] = m[k] || {})[t.categoryId] = (m[k][t.categoryId] || 0) + 1;
  }
  return (desc, type) => {
    const hit = m[type + '|' + descKey(desc)];
    if (hit) { const id = Object.entries(hit).sort((a, b) => b[1] - a[1])[0][0]; if (catsOf(type).some(c => c.id === id)) return id; }
    const low = nrm(desc);
    for (const [ty, name, re] of CAT_RULES) if (ty === type && re.test(low)) { const id = catByName(type, name); if (id) return id; }
    return fallbackCat(type);
  };
}

/* ---------- Önizleme ---------- */
function impHash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

function buildItems(st) {
  const { rows, headerRow, map, sign, accountId } = st;
  const data = rows.slice(headerRow + 1);
  const order = detectDateOrder(data.map(r => r[map.date]));
  const amtCols = map.mode === 'split' ? [map.debit, map.credit] : [map.amount];
  const dec = detectDecimal(data.flatMap(r => amtCols.filter(i => i >= 0).map(i => r[i])));
  const guess = buildCatLearner();
  const existing = S.data.transactions;
  const impSet = new Set(existing.filter(t => t.imp).map(t => t.imp));
  const near = new Set();
  existing.filter(t => t.accountId === accountId).forEach(t => {
    const d = parseDate(t.date);
    for (const off of [-1, 0, 1]) { const x = new Date(d); x.setDate(d.getDate() + off); near.add(`${ymd(x)}|${t.amount}|${t.type}`); }
  });
  const items = [];
  data.forEach(r => {
    const date = parseAnyDate(r[map.date], order);
    if (!date) return;
    let amount, type;
    if (map.mode === 'split') {
      const dv = map.debit >= 0 ? Math.abs(parseBankAmount(r[map.debit], dec)) : NaN;
      const cv = map.credit >= 0 ? Math.abs(parseBankAmount(r[map.credit], dec)) : NaN;
      if (dv > 0) { amount = dv; type = 'expense'; } else if (cv > 0) { amount = cv; type = 'income'; } else return;
    } else {
      const v = parseBankAmount(r[map.amount], dec);
      if (!v) return;
      amount = Math.abs(v);
      type = (sign === 'pos-expense' ? v > 0 : v < 0) ? 'expense' : 'income';
    }
    amount = round2(amount);
    if (!(amount > 0)) return;
    const desc = String(map.desc >= 0 ? r[map.desc] ?? '' : '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const low = nrm(desc);
    const imp = impHash(`${date}|${amount}|${type}|${low}`);
    let hint = '', on = true;
    if (impSet.has(imp) || near.has(`${date}|${amount}|${type}`)) { hint = 'Zaten kayıtlı'; on = false; }
    else if (SUMMARY_RE.test(low)) { hint = 'Özet satırı'; on = false; }
    else if (TRANSFER_RE.test(low)) { hint = 'Transfer olabilir'; on = false; }
    items.push({ date, desc, amount, type, imp, hint, on, cat: guess(desc, type), key: descKey(desc) });
  });
  return items;
}

function openImport(file, rows) {
  const headerRow = findHeader(rows);
  const header = headerRow >= 0 ? rows[headerRow] : [];
  const sig = headerRow >= 0 ? header.map(nrm).join('|') : 'cols:' + (rows[0] || []).length;
  const prof = (S.data.settings.importProfiles || {})[sig];
  const accs = S.data.accounts.filter(a => !a.archived);
  const st = {
    rows, headerRow, header,
    map: prof?.map ? { ...prof.map } : guessColumns(header, rows.slice(headerRow + 1)),
    accountId: accs.some(a => a.id === prof?.accountId) ? prof.accountId : (accs.find(a => a.type === 'bank') || accs[0]).id,
    sign: prof?.sign || null, items: []
  };
  const accType = () => S.data.accounts.find(a => a.id === st.accountId)?.type;
  const autoSign = () => {
    st.sign = accType() === 'card' ? 'pos-expense' : 'neg-expense';
    const items = buildItems(st);
    // Seçilen yönle neredeyse her şey gelir çıkıyorsa ekstre ters işaretli demektir
    if (items.length >= 4 && items.filter(i => i.type === 'income').length / items.length > 0.85) st.sign = st.sign === 'pos-expense' ? 'neg-expense' : 'pos-expense';
  };
  if (!st.sign) autoSign();
  const cols = Math.max(header.length, ...rows.slice(headerRow + 1, headerRow + 60).map(r => r.length), 1);
  const sampleOf = i => { const r = rows.slice(headerRow + 1).find(x => x[i] !== '' && x[i] != null); const v = r ? r[i] : ''; return v instanceof Date ? (parseAnyDate(v) || '') : String(v).slice(0, 24); };
  const colLetter = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
  const colOpts = sel => `<option value="-1">Yok</option>` + Array.from({ length: cols }, (_, i) => {
    const name = String(header[i] ?? '').trim() || 'Sütun ' + colLetter(i), smp = sampleOf(i);
    return `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(name.slice(0, 28))}${smp ? ' · ' + esc(smp) : ''}</option>`;
  }).join('');

  const body = `
    <div class="imp-file muted">${esc(file.name)} · ${rows.length} satır okundu</div>
    <div class="fields-2">
      <label class="field"><span>Hangi hesaba eklensin</span>${accountSelect(st.accountId, 'impAcc')}</label>
      <label class="field" id="impSignWrap"><span>Tutarların yönü</span><select class="input" name="impSign">
        <option value="neg-expense">Eksi tutarlar gider (banka hesabı)</option>
        <option value="pos-expense">Artı tutarlar gider (kredi kartı)</option></select></label>
    </div>
    <details class="imp-map" ${st.map.date < 0 || (st.map.mode === 'single' ? st.map.amount < 0 : false) ? 'open' : ''}>
      <summary>Sütun eşleştirme</summary>
      <div class="fields-2">
        <label class="field"><span>Tarih</span><select class="input" name="mDate">${colOpts(st.map.date)}</select></label>
        <label class="field"><span>Açıklama</span><select class="input" name="mDesc">${colOpts(st.map.desc)}</select></label>
        <label class="field"><span>Tutar biçimi</span><select class="input" name="mMode"><option value="single">Tek tutar sütunu</option><option value="split">Ayrı borç ve alacak sütunları</option></select></label>
        <label class="field" data-m="single"><span>Tutar</span><select class="input" name="mAmount">${colOpts(st.map.amount)}</select></label>
        <label class="field" data-m="split"><span>Borç (gider)</span><select class="input" name="mDebit">${colOpts(st.map.debit)}</select></label>
        <label class="field" data-m="split"><span>Alacak (gelir)</span><select class="input" name="mCredit">${colOpts(st.map.credit)}</select></label>
      </div>
    </details>
    <div id="impSum" class="imp-sum"></div>
    <div id="impList" class="imp-list"></div>`;

  openModal({
    title: 'Ekstre içe aktar', body, submit: 'İçe aktar', wide: 'xl',
    onOpen: f => {
      f.elements.impSign.value = st.sign;
      f.elements.mMode.value = st.map.mode;
      const showMode = () => {
        $$('[data-m]', f).forEach(el => { el.hidden = el.dataset.m !== st.map.mode; });
        $('#impSignWrap').hidden = st.map.mode === 'split';
      };
      const refresh = () => { st.items = buildItems(st); showMode(); paintList(f, st); };
      f.elements.impAcc.addEventListener('change', e => { st.accountId = e.target.value; autoSign(); f.elements.impSign.value = st.sign; refresh(); });
      f.elements.impSign.addEventListener('change', e => { st.sign = e.target.value; refresh(); });
      const num = el => parseInt(el.value, 10);
      f.elements.mDate.addEventListener('change', e => { st.map.date = num(e.target); refresh(); });
      f.elements.mDesc.addEventListener('change', e => { st.map.desc = num(e.target); refresh(); });
      f.elements.mMode.addEventListener('change', e => { st.map.mode = e.target.value; refresh(); });
      f.elements.mAmount.addEventListener('change', e => { st.map.amount = num(e.target); refresh(); });
      f.elements.mDebit.addEventListener('change', e => { st.map.debit = num(e.target); refresh(); });
      f.elements.mCredit.addEventListener('change', e => { st.map.credit = num(e.target); refresh(); });
      $('#impList').addEventListener('change', e => {
        const row = e.target.closest('[data-i]'); if (!row) return;
        const it = st.items[+row.dataset.i];
        if (e.target.matches('input[type=checkbox]')) { it.on = e.target.checked; row.classList.toggle('off', !it.on); }
        if (e.target.matches('select')) {
          it.cat = e.target.value; it.manual = true;
          // Aynı yerden yapılan diğer harcamalar da aynı kategoriye geçer
          if (it.key) st.items.forEach((x, j) => { if (x !== it && !x.manual && x.key === it.key && x.type === it.type) { x.cat = it.cat; const s = $(`[data-i="${j}"] select`); if (s) s.value = it.cat; } });
        }
        paintSum(st);
      });
      $('#impSum').addEventListener('click', e => {
        const b = e.target.closest('[data-sel]'); if (!b) return;
        st.items.forEach(it => { it.on = b.dataset.sel === 'all' ? true : b.dataset.sel === 'none' ? false : !it.hint; });
        paintList(f, st);
      });
      refresh();
    },
    onSubmit: () => {
      const chosen = st.items.filter(i => i.on);
      if (!chosen.length) { toast('Eklenecek işlem seçilmedi'); return false; }
      const now = Date.now();
      const added = chosen.map((it, i) => ({ id: uid(), type: it.type, amount: it.amount, date: it.date, categoryId: it.cat, accountId: st.accountId, note: it.desc, imp: it.imp, created: now + i }));
      S.data.transactions.push(...added);
      const profs = S.data.settings.importProfiles = S.data.settings.importProfiles || {};
      profs[sig] = { map: st.map, sign: st.sign, accountId: st.accountId, used: now };
      const keys = Object.keys(profs).sort((a, b) => (profs[b].used || 0) - (profs[a].used || 0));
      keys.slice(10).forEach(k => delete profs[k]);
      const months = {}; added.forEach(t => { const m = monthOf(t.date); months[m] = (months[m] || 0) + 1; });
      S.tx = { month: Object.entries(months).sort((a, b) => b[1] - a[1])[0][0], type: 'all', cat: 'all', acc: st.accountId, q: '' };
      S.view = 'islemler';
      commit();
      const ids = new Set(added.map(t => t.id));
      toast(`${added.length} işlem eklendi`, 'Geri al', () => { S.data.transactions = S.data.transactions.filter(t => !ids.has(t.id)); commit(); toast('İçe aktarma geri alındı'); });
    }
  });
}
function paintList(f, st) {
  const opts = type => catsOf(type).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const optCache = { income: opts('income'), expense: opts('expense') };
  $('#impList').innerHTML = st.items.length ? st.items.map((it, i) => `
    <div class="imp-row ${it.on ? '' : 'off'}" data-i="${i}">
      <input type="checkbox" ${it.on ? 'checked' : ''} aria-label="Seç">
      <div class="imp-main"><div class="imp-desc">${esc(it.desc) || '<span class="muted">Açıklama yok</span>'}${it.hint ? ` <span class="badge ${it.hint === 'Zaten kayıtlı' ? 'paused' : 'soon'}">${it.hint}</span>` : ''}</div>
        <div class="imp-meta">${fmtDate(it.date)}</div></div>
      <select class="input imp-cat">${optCache[it.type]}</select>
      <div class="imp-amt ${it.type === 'income' ? 'pos' : 'neg'}">${it.type === 'income' ? '+' : '−'}${money(it.amount)}</div>
    </div>`).join('')
    : `<div class="empty">Bu sütunlarla tarih ve tutar içeren satır bulunamadı.<br>Yukarıdaki "Sütun eşleştirme" bölümünden doğru sütunları seç.</div>`;
  $$('#impList .imp-row').forEach(r => { $('select', r).value = st.items[+r.dataset.i].cat; });
  if (!st.items.length) $('.imp-map', f).open = true;
  paintSum(st);
}
function paintSum(st) {
  const on = st.items.filter(i => i.on);
  const exp = round2(on.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0));
  const inc = round2(on.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0));
  const flagged = st.items.filter(i => i.hint).length;
  $('#impSum').innerHTML = `<span><b>${on.length}</b> / ${st.items.length} işlem seçili</span>
    <span>Gider <b class="neg">${money(exp)}</b></span><span>Gelir <b class="pos">${money(inc)}</b></span>
    <span class="spacer"></span>
    ${flagged ? `<button type="button" class="btn btn-sm btn-ghost" data-sel="auto" title="Zaten kayıtlı, transfer ya da özet görünen satırlar hariç">Önerilenler</button>` : ''}
    <button type="button" class="btn btn-sm btn-ghost" data-sel="all">Tümü</button><button type="button" class="btn btn-sm btn-ghost" data-sel="none">Hiçbiri</button>`;
  const btn = $('#modalFoot button[type=submit]'); if (btn) { btn.textContent = on.length ? `${on.length} işlemi ekle` : 'İçe aktar'; btn.disabled = !on.length; }
}

async function startImport() {
  const file = await pickBinaryFile('.csv,.txt,.xls,.xlsx,.ods,.html,.htm');
  if (!file) return;
  if (file.buf.byteLength > 15 * 1024 * 1024) return toast('Dosya çok büyük');
  if (/\.pdf$/i.test(file.name)) return infoBox('PDF desteklenmiyor', 'PDF ekstreler okunamıyor. İnternet ya da mobil şubeden hesap hareketlerini <b>Excel</b> veya <b>CSV</b> olarak indirip onu seç.');
  let rows;
  try { rows = await fileToRows(file); } catch (e) { return infoBox('Dosya okunamadı', 'Bu dosya açılamadı. Bankanın verdiği Excel ya da CSV dosyasını seçtiğinden emin ol. Olmazsa dosyayı Excel\'de açıp "CSV (virgülle ayrılmış)" olarak kaydetmeyi dene.'); }
  rows = (rows || []).map(r => (Array.isArray(r) ? r : []).map(c => typeof c === 'string' ? c.trim() : c));
  if (rows.filter(r => r.some(c => c !== '' && c != null)).length < 2) return infoBox('Dosya boş görünüyor', 'Bu dosyada işlem satırı bulunamadı.');
  openImport(file, rows);
}

Object.assign(ACTIONS, { 'import-statement': () => startImport() });
