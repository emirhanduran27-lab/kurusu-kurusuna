'use strict';
/* İçgörüler ve aylık PDF rapor */

const MONTH_LOC = ["Ocak'ta", "Şubat'ta", "Mart'ta", "Nisan'da", "Mayıs'ta", "Haziran'da", "Temmuz'da", "Ağustos'ta", "Eylül'de", "Ekim'de", "Kasım'da", "Aralık'ta"];
const pct = (a, b) => b ? Math.round((a - b) / b * 100) : 0;

function catAverages(mk, months = 3) {
  const sum = {}; let n = 0;
  for (let i = 1; i <= months; i++) {
    const m = expenseByCat(shiftMonth(mk, -i));
    if (!Object.keys(m).length) continue;
    n++; for (const k in m) sum[k] = (sum[k] || 0) + m[k];
  }
  for (const k in sum) sum[k] /= n;
  return { avg: sum, n };
}
function median(a) { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

function insightsFor(mk) {
  const out = [], add = (w, tone, text) => out.push({ w, tone, text });
  const d = S.data, st = monthStats(mk), prev = monthStats(shiftMonth(mk, -1));
  const txs = txInMonth(mk), exps = txs.filter(t => t.type === 'expense');
  if (!txs.length) return [];
  const isCur = mk === monthOf(todayStr());
  const [y, m] = mk.split('-').map(Number);
  const when = isCur ? 'Bu ay' : MONTH_LOC[m - 1];
  const dim = lastDay(y, m - 1), day = new Date().getDate();

  // Gelir ve gider dengesi
  if (st.inc > 0 && st.exp > st.inc) add(90, 'bad', `${when} gelirinden ${money(st.exp - st.inc)} fazla harcadın.`);
  else if (st.inc > 0 && !isCur) {
    const r = Math.round((st.inc - st.exp) / st.inc * 100);
    if (r >= 20) add(55, 'good', `${when} gelirinin %${r} kadarını harcamadan kenarda tuttun.`);
    else if (r < 10) add(45, 'info', `${when} gelirinin sadece %${r} kadarı elinde kaldı.`);
  }
  // Geçen aya göre değişim (bitmiş aylar)
  if (!isCur && prev.exp > 0 && st.exp > 0) {
    const p = pct(st.exp, prev.exp);
    if (Math.abs(p) >= 10) add(70, p > 0 ? 'bad' : 'good', `Giderlerin bir önceki aya göre %${Math.abs(p)} ${p > 0 ? 'arttı' : 'azaldı'} (${money(prev.exp, { noDec: true })} yerine ${money(st.exp, { noDec: true })}).`);
  }
  // Ay sonu tahmini (içinde bulunulan ay)
  if (isCur && day >= 5 && day < dim) {
    const variable = round2(exps.filter(t => !t.recurringId && !t.inst).reduce((s, t) => s + t.amount, 0));
    const recLeft = round2(d.recurring.filter(r => r.active !== false && r.nextDate && r.type !== 'income').reduce((s, r) => s + r.amount * occurrencesUntilMonthEnd(r), 0));
    const forecast = round2(st.exp + variable / day * (dim - day) + recLeft);
    if (forecast > 0) {
      const tone = prev.exp && forecast > prev.exp * 1.1 ? 'bad' : 'info';
      add(80, tone, `Bu hızla ay sonunda giderin yaklaşık ${money(forecast, { noDec: true })} olur${prev.exp ? ` (geçen ay ${money(prev.exp, { noDec: true })})` : ''}.`);
    }
  }
  // Kategoriler ve son 3 ayın ortalaması
  const byCat = expenseByCat(mk), { avg, n } = catAverages(mk);
  if (n >= 2) {
    const totalAvg = Object.values(avg).reduce((s, v) => s + v, 0);
    const thr = Math.max(200, totalAvg * 0.05);
    const ups = Object.keys(byCat).filter(k => avg[k] > 0 && byCat[k] > avg[k] * 1.3 && byCat[k] - avg[k] > thr).sort((a, b) => (byCat[b] - avg[b]) - (byCat[a] - avg[a]));
    if (ups.length) { const k = ups[0]; add(75, 'bad', `${catById(k).name} harcaman son ${n} ayın ortalamasından %${pct(byCat[k], avg[k])} fazla (${money(byCat[k], { noDec: true })}, ortalama ${money(avg[k], { noDec: true })}).`); }
    if (!isCur) {
      const downs = Object.keys(avg).filter(k => avg[k] > thr && (byCat[k] || 0) < avg[k] * 0.7).sort((a, b) => (avg[b] - (byCat[b] || 0)) - (avg[a] - (byCat[a] || 0)));
      if (downs.length) { const k = downs[0]; add(50, 'good', `${catById(k).name} harcaman ortalamanın %${-pct(byCat[k] || 0, avg[k])} altında kaldı, ${money(avg[k] - (byCat[k] || 0), { noDec: true })} daha az harcadın.`); }
    }
  }
  // Bütçeler
  const over = [], near = [];
  for (const [id, lim] of Object.entries(d.budgets)) {
    const sp = byCat[id] || 0;
    if (sp > lim) over.push({ id, extra: sp - lim }); else if (sp >= lim * 0.8) near.push({ id, p: Math.round(sp / lim * 100) });
  }
  if (over.length) {
    const names = over.map(o => catById(o.id).name);
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' ve ' + names[names.length - 1] : names[0];
    add(85, 'bad', `${list} ${names.length > 1 ? 'bütçelerini' : 'bütçesini'} toplam ${money(over.reduce((s, o) => s + o.extra, 0), { noDec: true })} aştın.`);
  }
  if (isCur && near.length) { const x = near.sort((a, b) => b.p - a.p)[0]; add(60, 'info', `${catById(x.id).name} bütçenin %${x.p} kadarını kullandın, ayın bitmesine ${dim - day} gün var.`); }
  // Alışılmadık büyüklükte harcama
  const hist = {};
  for (let i = 1; i <= 6; i++) txInMonth(shiftMonth(mk, -i)).filter(t => t.type === 'expense').forEach(t => { (hist[t.categoryId] = hist[t.categoryId] || []).push(t.amount); });
  const odd = exps.filter(t => (hist[t.categoryId] || []).length >= 4 && t.amount > 500 && t.amount > 3 * median(hist[t.categoryId])).sort((a, b) => b.amount - a.amount)[0];
  if (odd) add(40, 'info', `${odd.note || catById(odd.categoryId).name} (${money(odd.amount, { noDec: true })}) ${catById(odd.categoryId).name} için her zamankinden yüksek bir harcama.`);
  // En büyük harcama
  const big = [...exps].sort((a, b) => b.amount - a.amount)[0];
  if (big && big !== odd) add(35, 'info', `Ayın en büyük harcaması ${big.note ? big.note + ', ' : ''}${catById(big.categoryId).name} kategorisinde ${money(big.amount, { noDec: true })} (${fmtDate(big.date)}).`);
  // En sık harcama yapılan yer
  const places = {};
  exps.forEach(t => { const k = t.note && typeof descKey === 'function' ? descKey(t.note) : ''; if (!k) return; const p = places[k] = places[k] || { n: 0, sum: 0, names: {} }; p.n++; p.sum += t.amount; p.names[t.note] = (p.names[t.note] || 0) + 1; });
  const top = Object.values(places).filter(p => p.n >= 3).sort((a, b) => b.n - a.n || b.sum - a.sum)[0];
  if (top) { const name = Object.entries(top.names).sort((a, b) => b[1] - a[1])[0][0].slice(0, 40); add(30, 'info', `En sık harcama yaptığın yer ${name}. ${top.n} kez, toplam ${money(top.sum, { noDec: true })}.`); }
  // Hafta sonu payı
  if (exps.length >= 8 && st.exp > 0) {
    const we = exps.filter(t => [0, 6].includes(parseDate(t.date).getDay())).reduce((s, t) => s + t.amount, 0);
    const p = Math.round(we / st.exp * 100);
    if (p >= 45) add(25, 'info', `Harcamalarının %${p} kadarı hafta sonu yapıldı.`);
  }
  // Düzenli ödeme yükü
  const monthlyOut = d.recurring.filter(r => r.active !== false && r.nextDate && r.type !== 'income').reduce((s, r) => s + r.amount * FREQ_PER_MONTH[r.frequency], 0);
  const incBase = st.inc || prev.inc;
  if (monthlyOut > 0 && incBase > 0) {
    const p = Math.round(monthlyOut / incBase * 100);
    add(p >= 40 ? 50 : 20, p >= 40 ? 'bad' : 'info', `Düzenli ödemelerin aylık ${money(monthlyOut, { noDec: true })}, gelirinin %${p} kadarı.`);
  }
  // Birikim hedefleri ne zaman tamamlanır
  const goalNotes = [];
  d.goals.forEach(g => {
    const rem = g.target - goalSaved(g); if (rem <= 0) return;
    let s = 0; for (let i = 0; i < 3; i++) { const mm = shiftMonth(monthOf(todayStr()), -i); g.contributions.forEach(c => { if (!c.initial && monthOf(c.date) === mm) s += c.amount; }); }
    const perMonth = s / 3; if (perMonth <= 0) return;
    const months = Math.ceil(rem / perMonth), eta = shiftMonth(monthOf(todayStr()), months);
    if (months > 240) return;
    if (g.deadline && eta > monthOf(g.deadline)) goalNotes.push({ w: 60, tone: 'bad', text: `"${g.name}" hedefine bu hızla ${monthLabel(eta)} ayında ulaşırsın, hedef tarihinden sonra. Ayda ${money(rem / Math.max(1, Math.ceil(daysUntil(g.deadline) / 30.44)), { noDec: true })} ayırman gerekiyor.` });
    else goalNotes.push({ w: 30, tone: 'good', text: `"${g.name}" hedefine bu hızla ${monthLabel(eta)} ayında ulaşırsın.` });
  });
  goalNotes.sort((a, b) => b.w - a.w).slice(0, 1).forEach(x => add(x.w, x.tone, x.text));

  return out.sort((a, b) => b.w - a.w);
}

// Tutarlar gizleme modunda bulanıklaşsın diye para değerleri ayrı işaretlenir
const insText = t => esc(t).replace(/-?[₺$€£]\s?[\d.,]+|[\d.,]+\s?[₺$€£]/g, m => `<b class="money">${m}</b>`);
function insightsCardHtml() {
  const list = insightsFor(S.month).slice(0, 4);
  if (!list.length) return '';
  return `<div class="card mt insights"><h2>İçgörüler<span class="spacer"></span><button class="btn btn-sm" data-action="report-pdf">PDF rapor</button></h2>
    <ul class="ins-list">${list.map(i => `<li class="ins ${i.tone}"><span class="ins-dot"></span><span>${insText(i.text)}</span></li>`).join('')}</ul></div>`;
}

/* ---------- PDF ---------- */
// Yazı tipinde olmayan karakterler (emoji vb.) PDF'te kutu olarak görünmesin
const PDF_OK = /[ -~ -ſ₺€•–—…·←-↓−‘’“”]/;
const pdfClean = s => [...String(s ?? '')].map(ch => PDF_OK.test(ch) ? ch : (/\s/.test(ch) ? ' ' : '')).join('').replace(/ /g, ' ');

async function buildReportPdf(mk) {
  const K = await loadVendor('pdf.js', 'KKPdf');
  const { PDFDocument, rgb } = K;
  const doc = await PDFDocument.create();
  doc.registerFontkit(K.fontkit);
  const R = await doc.embedFont(K.fonts.regular, { subset: false }), B = await doc.embedFont(K.fonts.bold, { subset: false });
  doc.setTitle(`Kuruşu Kuruşuna ${monthLabel(mk)} raporu`); doc.setCreator('Kuruşu Kuruşuna'); doc.setProducer('Kuruşu Kuruşuna'); doc.setLanguage('tr-TR');
  const hex = h => { const n = parseInt(String(h).replace('#', ''), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  const C = { ink: hex('#1d2433'), mute: hex('#6b7280'), line: hex('#e5e7eb'), soft: hex('#f4f6f8'), inc: hex('#1f8f68'), exp: hex('#d64541'), sav: hex('#2f7fc1'), brand: hex('#0f9d6b') };
  const W = 595.28, H = 841.89, M = 42, CW = W - 2 * M;
  let page, y;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const ensure = h => { if (y - h < M + 24) { newPage(); return true; } return false; };
  const tw = (s, size, f = R) => f.widthOfTextAtSize(pdfClean(s), size);
  const text = (s, x, yy, { size = 10, font = R, color = C.ink, align = 'left', maxW } = {}) => {
    let t = pdfClean(s);
    if (maxW) while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + '…';
    const w = font.widthOfTextAtSize(t, size);
    const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    page.drawText(t, { x: xx, y: yy, size, font, color });
    return w;
  };
  const wrap = (s, size, maxW, f = R) => {
    const words = pdfClean(s).split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (f.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  };
  const rect = (x, yy, w, h, color, border) => page.drawRectangle({ x, y: yy, width: w, height: h, color, borderColor: border, borderWidth: border ? 0.7 : 0 });
  const hr = () => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.line });
  const section = (title, need = 60) => { ensure(need + 36); y -= 26; text(title, M, y, { size: 13, font: B }); y -= 10; hr(); y -= 6; };
  const mny = (n, o) => money(n, o);

  const d = S.data, st = monthStats(mk), prev = monthStats(shiftMonth(mk, -1));
  newPage();
  // Başlık
  text('KURUŞU KURUŞUNA', M, y - 4, { size: 8.5, font: B, color: C.brand });
  text(`Oluşturuldu ${fmtDate(todayStr())}`, W - M, y - 4, { size: 8.5, color: C.mute, align: 'right' });
  y -= 30; text(`${monthLabel(mk)} raporu`, M, y, { size: 22, font: B });
  y -= 14; hr(); y -= 14;

  // Özet kutuları
  const rate = st.inc ? Math.round((st.inc - st.exp) / st.inc * 100) : null;
  const diff = (a, b) => b ? `geçen ay ${mny(b, { noDec: true })}` : 'geçen ay kayıt yok';
  const boxes = [
    ['Gelir', mny(st.inc), C.inc, diff(st.inc, prev.inc)],
    ['Gider', mny(st.exp), C.exp, diff(st.exp, prev.exp)],
    ['Birikime aktarılan', mny(st.saved), C.sav, `toplam birikim ${mny(totalSaved(), { noDec: true })}`],
    ['Kalan', mny(st.net), st.net < 0 ? C.exp : C.ink, rate == null ? 'gelir yok' : `gelirin %${rate} kadarı`]
  ];
  const bw = (CW - 3 * 10) / 4, bh = 64;
  boxes.forEach(([l, v, col, sub], i) => {
    const x = M + i * (bw + 10);
    rect(x, y - bh, bw, bh, C.soft);
    text(l, x + 10, y - 16, { size: 8.5, color: C.mute });
    let size = 14; while (tw(v, size, B) > bw - 20 && size > 9) size -= 0.5;
    text(v, x + 10, y - 36, { size, font: B, color: col });
    text(sub, x + 10, y - 53, { size: 7.5, color: C.mute, maxW: bw - 20 });
  });
  y -= bh;

  // İçgörüler
  const ins = insightsFor(mk).slice(0, 7);
  if (ins.length) {
    section('Öne çıkanlar');
    for (const i of ins) {
      const lines = wrap(i.text, 10, CW - 18);
      ensure(lines.length * 14 + 4);
      y -= 14;
      page.drawCircle({ x: M + 4, y: y + 3.5, size: 3, color: i.tone === 'bad' ? C.exp : i.tone === 'good' ? C.inc : C.sav });
      lines.forEach((ln, j) => { if (j) y -= 13; text(ln, M + 16, y, { size: 10 }); });
      y -= 4;
    }
  }

  // Kategoriler
  const byCat = Object.entries(expenseByCat(mk)).sort((a, b) => b[1] - a[1]);
  if (byCat.length) {
    section('Kategorilere göre giderler');
    const prevCat = expenseByCat(shiftMonth(mk, -1)), max = byCat[0][1];
    const xBar = M + 150, barW = 170, xAmt = M + 400, xPct = W - M;
    text('Kategori', M, y - 10, { size: 8, color: C.mute }); text('Tutar', xAmt, y - 10, { size: 8, color: C.mute, align: 'right' }); text('Pay', xPct, y - 10, { size: 8, color: C.mute, align: 'right' });
    y -= 14;
    for (const [id, v] of byCat) {
      const c = catById(id), lim = d.budgets[id], pv = prevCat[id] || 0;
      const subParts = [];
      if (lim) subParts.push(`bütçe ${mny(lim, { noDec: true })} · %${Math.round(v / lim * 100)}`);
      if (pv && pct(v, pv)) { const p = pct(v, pv); subParts.push(`geçen aya göre ${p >= 0 ? '+' : '−'}%${Math.abs(p)}`); }
      ensure(subParts.length ? 30 : 20);
      y -= 15;
      page.drawCircle({ x: M + 4, y: y + 3.5, size: 3.5, color: hex(c.color) });
      text(c.name, M + 14, y, { size: 10, maxW: 130 });
      rect(xBar, y - 1, barW, 7, C.soft);
      rect(xBar, y - 1, Math.max(2, barW * v / max), 7, lim && v > lim ? C.exp : hex(c.color));
      text(mny(v), xAmt, y, { size: 10, font: B, align: 'right' });
      text(`%${st.exp ? Math.round(v / st.exp * 100) : 0}`, xPct, y, { size: 9.5, color: C.mute, align: 'right' });
      if (subParts.length) { y -= 11; text(subParts.join('  ·  '), M + 14, y, { size: 7.5, color: lim && v > lim ? C.exp : C.mute }); }
      y -= 3;
    }
  }

  // Son 6 ay grafiği
  {
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(mk, i - 5)), ms = months.map(monthStats);
    const top = Math.max(1, ...ms.flatMap(s => [s.inc, s.exp]));
    const step = (() => { const raw = top / 4, p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= raw); })();
    const ymax = step * 4, ch = 130;
    section('Son 6 ay', ch + 40);
    const x0 = M + 46, x1 = W - M, base = y - ch - 8;
    for (let i = 0; i <= 4; i++) {
      const yy = base + ch * i / 4;
      page.drawLine({ start: { x: x0, y: yy }, end: { x: x1, y: yy }, thickness: 0.5, color: C.line });
      text(new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(step * i), x0 - 6, yy - 3, { size: 7.5, color: C.mute, align: 'right' });
    }
    const gw = (x1 - x0) / 6, bwid = Math.min(18, gw / 3.2);
    ms.forEach((s, i) => {
      const cx = x0 + gw * i + gw / 2;
      rect(cx - bwid - 1.5, base, bwid, ch * s.inc / ymax, C.inc);
      rect(cx + 1.5, base, bwid, ch * s.exp / ymax, C.exp);
      text(monthLabel(months[i], true), cx, base - 12, { size: 8, color: months[i] === mk ? C.ink : C.mute, font: months[i] === mk ? B : R, align: 'center' });
    });
    y = base - 24;
    page.drawRectangle({ x: x0, y: y + 1, width: 7, height: 7, color: C.inc }); text('Gelir', x0 + 11, y + 1.5, { size: 8, color: C.mute });
    page.drawRectangle({ x: x0 + 52, y: y + 1, width: 7, height: 7, color: C.exp }); text('Gider', x0 + 63, y + 1.5, { size: 8, color: C.mute });
  }

  // En büyük harcamalar
  const bigs = txInMonth(mk).filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 8);
  if (bigs.length) {
    section('En büyük harcamalar');
    for (const t of bigs) {
      ensure(18); y -= 15;
      text(fmtDate(t.date), M, y, { size: 9, color: C.mute });
      text(t.note || catById(t.categoryId).name, M + 78, y, { size: 10, maxW: 250 });
      text(catById(t.categoryId).name, M + 340, y, { size: 9, color: C.mute, maxW: 90 });
      text(mny(t.amount), W - M, y, { size: 10, font: B, align: 'right' });
    }
  }

  // Hesaplar ve net varlık
  {
    const accs = d.accounts.filter(a => !a.archived), dt = debtTotals(), saved = totalSaved(), bal = balance(), av = assetsValue();
    const net = round2(bal + saved + av + dt.lent - dt.owe);
    section('Hesaplar ve net varlık');
    text('Bakiyeler raporun oluşturulduğu günkü durumu gösterir.', M, y - 10, { size: 8, color: C.mute }); y -= 12;
    for (const a of accs) {
      ensure(18); y -= 15;
      const b = accountBalance(a);
      text(a.name, M, y, { size: 10, maxW: 260 }); if (nrm(a.name) !== nrm(ACC_TYPES[a.type])) text(ACC_TYPES[a.type], M + 280, y, { size: 9, color: C.mute });
      text(a.type === 'card' && b < 0 ? 'Borç ' + mny(-b) : mny(b), W - M, y, { size: 10, font: B, align: 'right', color: b < 0 ? C.exp : C.ink });
    }
    const rows = [['Birikimler', saved], ...(av ? [['Döviz ve altın', av]] : []), ['Alacaklar', dt.lent], ['Borçlar', -dt.owe]];
    y -= 6; ensure(rows.length * 15 + 30);
    for (const [l, v] of rows) { y -= 15; text(l, M, y, { size: 10, color: C.mute }); text(mny(v), W - M, y, { size: 10, align: 'right' }); }
    y -= 8; hr(); y -= 16;
    text('Net varlık', M, y, { size: 11, font: B }); text(mny(net), W - M, y, { size: 12, font: B, align: 'right', color: net < 0 ? C.exp : C.inc });
  }

  // Birikim hedefleri
  if (d.goals.length) {
    section('Birikim hedefleri');
    for (const g of d.goals) {
      ensure(30); y -= 15;
      const s = goalSaved(g), p = g.target ? Math.min(1, s / g.target) : 0;
      text(g.name, M, y, { size: 10, maxW: 200 });
      text(`${mny(s, { noDec: true })} / ${mny(g.target, { noDec: true })}  ·  %${Math.floor(p * 100)}`, W - M, y, { size: 9.5, align: 'right', color: C.mute });
      y -= 10; rect(M, y, CW, 5, C.soft); rect(M, y, Math.max(2, CW * p), 5, hex(g.color)); y -= 3;
    }
  }

  // Yaklaşan ödemeler
  const due = [...dueList(30).filter(r => r.type !== 'income').map(r => ({ date: r.nextDate, name: r.name, amount: r.amount })), ...extraDueItems(30).map(x => ({ date: x.date, name: x.name, amount: x.amount }))]
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
  if (due.length) {
    section('Önümüzdeki 30 günün ödemeleri');
    for (const x of due) { ensure(18); y -= 15; text(fmtDate(x.date), M, y, { size: 9, color: C.mute }); text(x.name, M + 78, y, { size: 10, maxW: 330 }); text(mny(x.amount), W - M, y, { size: 10, font: B, align: 'right' }); }
    y -= 8; hr(); y -= 15;
    text('Toplam', M + 78, y, { size: 10, font: B }); text(mny(due.reduce((s, x) => s + x.amount, 0)), W - M, y, { size: 10, font: B, align: 'right' });
  }

  // Sayfa altları
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = pdfClean(`Kuruşu Kuruşuna · ${monthLabel(mk)} raporu · ${i + 1}/${pages.length}`);
    p.drawText(t, { x: W / 2 - R.widthOfTextAtSize(t, 7.5) / 2, y: 24, size: 7.5, font: R, color: C.mute });
  });
  return doc.save();
}

function reportMonths() {
  const set = new Set([monthOf(todayStr()), S.month]);
  S.data.transactions.forEach(t => set.add(monthOf(t.date)));
  return [...set].sort().reverse().slice(0, 36);
}
function reportForm() {
  if (!api.saveFile) return toast('Bu sürümde PDF kaydedilemiyor');
  const months = reportMonths();
  openModal({
    title: 'Aylık rapor',
    body: `<label class="field"><span>Hangi ay</span><select class="input" name="m">${months.map(m => `<option value="${m}" ${m === S.month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label>
      <p class="muted" style="margin:0;font-size:13px">Gelir ve gider özeti, öne çıkanlar, kategoriler, son 6 ay, hesaplar ve birikimlerden oluşan bir PDF hazırlanır. Tutarları gizleme modu açık olsa da raporda tutarlar görünür.</p>`,
    submit: 'PDF oluştur',
    onSubmit: f => {
      const mk = val(f, 'm'), btn = $('#modalFoot button[type=submit]');
      btn.disabled = true; btn.textContent = 'Hazırlanıyor…';
      (async () => {
        try {
          const bytes = await buildReportPdf(mk);
          $('#modal').close();
          const ok = await api.saveFile(`Kurusu-Kurusuna-Rapor-${mk}.pdf`, bytes, 'Raporu kaydet');
          if (ok && !api.platform) toast('Rapor kaydedildi');
        } catch (e) { btn.disabled = false; btn.textContent = 'PDF oluştur'; toast('Rapor oluşturulamadı'); console.error(e); }
      })();
      return false;
    }
  });
}

Object.assign(ACTIONS, { 'report-pdf': () => reportForm() });
