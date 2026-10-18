'use strict';
/* Kuruşu Kuruşuna — arayüz mantığı */
const REPO_URL = 'https://github.com/emirhanduran27-lab/kurusu-kurusuna';

// window.api preload tarafından tanımlanıyor (global 'api')

/* ---------- Yardımcılar ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const monthOf = s => s.slice(0, 7);
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

function shiftMonth(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function monthLabel(mk, short = false) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('tr-TR', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
}
function fmtDate(s) {
  if (!s) return '';
  return parseDate(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysUntil(s) {
  const a = parseDate(todayStr()), b = parseDate(s);
  return Math.round((b - a) / 86400000);
}
function lastDay(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }
function addMonths(s, n, anchorDay) {
  const d = parseDate(s);
  const day = anchorDay || d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, lastDay(t.getFullYear(), t.getMonth())));
  return ymd(t);
}
function nextDate(s, freq, anchorDay) {
  if (freq === 'weekly') { const d = parseDate(s); d.setDate(d.getDate() + 7); return ymd(d); }
  if (freq === 'monthly') return addMonths(s, 1, anchorDay);
  if (freq === 'quarterly') return addMonths(s, 3, anchorDay);
  if (freq === 'yearly') return addMonths(s, 12, anchorDay);
  return null;
}
const FREQ = { weekly: 'Haftalık', monthly: 'Aylık', quarterly: '3 ayda bir', yearly: 'Yıllık', once: 'Tek seferlik' };
const FREQ_PER_MONTH = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, once: 0 };

function money(n, opts = {}) {
  const cur = S.data?.settings?.currency || 'TRY';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur, maximumFractionDigits: opts.noDec ? 0 : 2, minimumFractionDigits: opts.noDec ? 0 : 2 }).format(n || 0);
}
function parseAmount(v) {
  let s = String(v ?? '').trim().replace(/\s|₺|TL/gi, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return round2(parseFloat(s));
}
function amountToInput(n) { return n ? String(n).replace('.', ',') : ''; }

/* ---------- Veri ---------- */
const PALETTE = ['#3fb68b', '#5aa9e6', '#f0b429', '#ef6461', '#a78bfa', '#f472b6', '#22c3c3', '#fb923c', '#94a3b8', '#84cc16', '#e879f9', '#38bdf8', '#facc15', '#f87171', '#4ade80'];

function defaultData() {
  const mk = (names, prefix) => names.map((n, i) => ({ id: prefix + (i + 1), name: n, color: PALETTE[(i + (prefix === 'e' ? 3 : 0)) % PALETTE.length] }));
  return {
    version: 1,
    settings: { currency: 'TRY', theme: 'dark', reminderDays: 3, lastNotified: '', lock: null, hideAmounts: false },
    categories: {
      income: mk(['Maaş', 'Burs', 'Ek Gelir / Serbest', 'Kira Geliri', 'Yatırım Getirisi', 'Hediye', 'Diğer Gelir'], 'i'),
      expense: mk(['Kira', 'Market', 'Faturalar', 'Ulaşım', 'Yeme İçme', 'Sağlık', 'Eğitim', 'Giyim', 'Eğlence', 'Abonelikler', 'Kredi / Taksit', 'Kişisel Bakım', 'Teknoloji', 'Ev Eşyası', 'Diğer Gider'], 'e')
    },
    methods: ['Nakit', 'Banka Kartı', 'Kredi Kartı', 'Havale / EFT'],
    transactions: [],
    recurring: [],
    goals: [],
    budgets: {}
  };
}
function normalize(d) {
  const def = defaultData();
  if (!d || typeof d !== 'object') return def;
  d.settings = Object.assign({}, def.settings, d.settings);
  d.categories = d.categories || def.categories;
  d.categories.income = d.categories.income || def.categories.income;
  d.categories.expense = d.categories.expense || def.categories.expense;
  d.methods = Array.isArray(d.methods) && d.methods.length ? d.methods : def.methods;
  for (const k of ['transactions', 'recurring', 'goals']) if (!Array.isArray(d[k])) d[k] = [];
  d.budgets = d.budgets && typeof d.budgets === 'object' ? d.budgets : {};
  // Yedekten ya da eski sürümden gelen kayıtları güvenli hale getir
  const safeId = v => String(v ?? '').replace(/[^\w-]/g, '') || uid();
  const safeColor = v => /^#[0-9a-f]{6}$/i.test(String(v)) ? v : '#94a3b8';
  const num = v => { const n = Number(v); return Number.isFinite(n) ? round2(n) : NaN; };
  const okDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v));
  for (const t of ['income', 'expense']) d.categories[t].forEach(c => { c.id = safeId(c.id); c.color = safeColor(c.color); c.name = String(c.name || 'Kategori'); });
  d.transactions = d.transactions.filter(t => okDate(t.date) && num(t.amount) > 0).map(t => ({ ...t, id: safeId(t.id), amount: num(t.amount), type: t.type === 'income' ? 'income' : 'expense', categoryId: safeId(t.categoryId) }));
  d.recurring = d.recurring.filter(r => num(r.amount) > 0).map(r => ({ ...r, id: safeId(r.id), amount: num(r.amount), categoryId: safeId(r.categoryId), nextDate: okDate(r.nextDate) ? r.nextDate : null, frequency: FREQ[r.frequency] ? r.frequency : 'monthly' }));
  d.goals = d.goals.filter(g => num(g.target) > 0).map(g => ({ ...g, id: safeId(g.id), target: num(g.target), color: safeColor(g.color),
    contributions: (Array.isArray(g.contributions) ? g.contributions : []).filter(c => okDate(c.date) && Number.isFinite(num(c.amount))).map(c => ({ ...c, id: safeId(c.id), amount: num(c.amount) })) }));
  for (const k of Object.keys(d.budgets)) { const v = num(d.budgets[k]); if (!(v > 0)) delete d.budgets[k]; else d.budgets[k] = v; }
  return d;
}

const S = {
  data: null,
  view: 'ozet',
  month: monthOf(todayStr()),
  tx: { month: monthOf(todayStr()), type: 'all', cat: 'all', method: 'all', q: '' },
  year: new Date().getFullYear(),
  charts: [],
  last: {},
  update: { status: 'idle' },
  version: ''
};

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.save(S.data).catch(() => toast('Kaydedilemedi!'));
    // Telefonda uygulama kapalıyken de hatırlatma gelsin diye bildirimler önceden planlanır
    if (api.scheduleReminders) api.scheduleReminders(upcomingReminders()).catch(() => {});
  }, 150);
}
function upcomingReminders() {
  const s = S.data.settings, out = [];
  const at = (dateStr, hour) => { const d = parseDate(dateStr); d.setHours(hour, 0, 0, 0); return d; };
  S.data.recurring.filter(r => r.active !== false && r.nextDate && r.type !== 'income' && daysUntil(r.nextDate) <= 60).forEach(r => {
    const before = parseDate(r.nextDate); before.setDate(before.getDate() - (s.reminderDays || 3));
    const amount = s.hideAmounts || s.lock ? '' : ` (${money(r.amount)})`;
    out.push({ at: at(ymd(before), 10).getTime(), title: 'Yaklaşan ödeme', body: `${r.name}${amount} ${fmtDate(r.nextDate)} tarihinde.` });
    out.push({ at: at(r.nextDate, 10).getTime(), title: 'Bugün ödeme günü', body: `${r.name}${amount} bugün ödenecek.` });
  });
  return out.filter(n => n.at > Date.now()).sort((a, b) => a.at - b.at).slice(0, 60);
}
function commit() { persist(); render(); }

const allCats = () => [...S.data.categories.income, ...S.data.categories.expense];
const catById = id => allCats().find(c => c.id === id) || { name: 'Kategorisiz', color: '#94a3b8' };
const catsOf = type => S.data.categories[type === 'income' ? 'income' : 'expense'];

/* ---------- Hesaplamalar ---------- */
function txInMonth(mk) { return S.data.transactions.filter(t => monthOf(t.date) === mk); }
function contribsInMonth(mk) {
  let s = 0;
  // "Başlangıç birikimi" uygulamadan önce biriktirilmiş paradır, bu ayın bakiyesinden çıkmaz
  S.data.goals.forEach(g => g.contributions.forEach(c => { if (!c.initial && monthOf(c.date) === mk) s += c.amount; }));
  return round2(s);
}
function monthStats(mk) {
  let inc = 0, exp = 0;
  txInMonth(mk).forEach(t => { if (t.type === 'income') inc += t.amount; else exp += t.amount; });
  const saved = contribsInMonth(mk);
  return { inc: round2(inc), exp: round2(exp), saved, net: round2(inc - exp), left: round2(inc - exp - saved) };
}
function expenseByCat(mk) {
  const m = {};
  txInMonth(mk).filter(t => t.type === 'expense').forEach(t => { m[t.categoryId] = (m[t.categoryId] || 0) + t.amount; });
  return m;
}
function goalSaved(g) { return round2(g.contributions.reduce((s, c) => s + c.amount, 0)); }
function totalSaved() { return round2(S.data.goals.reduce((s, g) => s + goalSaved(g), 0)); }
function savedFromBalance() { return round2(S.data.goals.reduce((s, g) => s + g.contributions.reduce((a, c) => a + (c.initial ? 0 : c.amount), 0), 0)); }
function balance() {
  let b = 0;
  S.data.transactions.forEach(t => { b += t.type === 'income' ? t.amount : -t.amount; });
  return round2(b - savedFromBalance());
}
function dueList(daysAhead = 30) {
  return S.data.recurring
    .filter(r => r.active !== false && r.nextDate && daysUntil(r.nextDate) <= daysAhead)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}
function dueBadge(r) {
  if (r.active === false) return '<span class="badge paused">Durduruldu</span>';
  if (!r.nextDate) return '<span class="badge ok">Tamamlandı</span>';
  const d = daysUntil(r.nextDate);
  if (d < 0) return `<span class="badge late">${-d} gün gecikti</span>`;
  if (d === 0) return '<span class="badge late">Bugün</span>';
  if (d <= (S.data.settings.reminderDays || 3)) return `<span class="badge soon">${d} gün kaldı</span>`;
  return `<span class="badge">${d} gün kaldı</span>`;
}

/* ---------- Genel arayüz ---------- */
/* Güncelleme durumu */
function updateText() {
  const u = S.update;
  switch (u.status) {
    case 'checking': return 'Yeni sürüm aranıyor…';
    case 'downloading': return `${u.version} sürümü indiriliyor… %${u.percent || 0}`;
    case 'ready': return `<span class="sav">${esc(u.version)} sürümü indirildi. Program kapanınca kendiliğinden kurulacak.</span>`;
    case 'manual': return `<span class="sav">${esc(u.version)} sürümü çıktı. ${esc(u.note || 'Kendiliğinden kurulamadı, indirip eskisinin yerine kurman yeterli. Verilerin korunur.')}</span>`;
    case 'store': return 'Güncellemeler App Store üzerinden gelir.';
    case 'latest': return '<span class="pos">En güncel sürümü kullanıyorsun.</span>';
    case 'error': return `<span class="neg">Kontrol edilemedi. İnternet bağlantını kontrol et.</span>`;
    case 'dev': return 'Geliştirme modunda güncelleme kontrolü yapılmaz.';
    default: return 'Henüz kontrol edilmedi.';
  }
}
function updateButton() {
  if (S.update.status === 'ready') return '<button class="btn btn-primary" data-action="install-update">Şimdi kur ve yeniden başlat</button>';
  if (S.update.status === 'manual') return '<button class="btn btn-primary" data-action="install-update">Yeni sürümü indir</button>';
  if (S.update.status === 'store') return '';
  const busy = S.update.status === 'checking' || S.update.status === 'downloading';
  return `<button class="btn" data-action="check-update" ${busy ? 'disabled' : ''}>Güncellemeleri denetle</button>`;
}
function refreshUpdateUI() {
  const st = $('#updStatus'); if (st) st.innerHTML = updateText();
  const bw = $('#updBtnWrap'); if (bw) bw.innerHTML = updateButton();
  for (const b of $$('.upd-banner')) paintBanner(b, S.update);
}
function paintBanner(b, u) {
  b.className = 'upd-banner ' + u.status + (b.id === 'mUpdBanner' ? ' m-upd' : '');
  if (u.status === 'downloading') {
    b.hidden = false;
    b.innerHTML = `<span class="upd-ico">⬇</span><div class="upd-txt"><b>Güncelleme geldi · ${esc(u.version || '')}</b>İndiriliyor, %${u.percent || 0}<div class="upd-bar"><i style="width:${u.percent || 0}%"></i></div></div>`;
  } else if (u.status === 'ready') {
    b.hidden = false;
    b.innerHTML = `<span class="upd-ico">✓</span><div class="upd-txt"><b>${esc(u.version)} sürümü hazır</b>Kapatınca kurulur. Şimdi kurmak için tıkla.</div>`;
  } else if (u.status === 'manual') {
    b.hidden = false;
    b.innerHTML = `<span class="upd-ico">!</span><div class="upd-txt"><b>${esc(u.version)} sürümü çıktı</b>${api.platform === 'android' ? 'İndirmek için dokun.' : 'İndirme sayfasını açmak için tıkla.'}</div>`;
  } else b.hidden = true;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}

function destroyCharts() { S.charts.forEach(c => c.destroy()); S.charts = []; }
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function chartDefaults() {
  if (!window.Chart) return;
  Chart.defaults.color = cssVar('--muted');
  Chart.defaults.borderColor = cssVar('--chart-grid');
  Chart.defaults.font.family = '"Segoe UI", system-ui, sans-serif';
}
function makeChart(canvas, cfg) {
  if (!window.Chart || !canvas) return;
  S.charts.push(new Chart(canvas, cfg));
}
const moneyTick = v => new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

function render() {
  destroyCharts();
  document.documentElement.dataset.theme = S.data.settings.theme;
  chartDefaults();
  $$('#nav button, .tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  const due = dueList(S.data.settings.reminderDays || 3).filter(r => r.type !== 'income').length;
  for (const id of ['#dueBadge', '#mDueBadge']) { const badge = $(id); badge.hidden = !due; badge.textContent = due; }
  $('#brandBalance').textContent = 'Bakiye: ' + money(balance());
  $('#mBalance').textContent = money(balance());
  applySecurityUI();
  const main = $('#main');
  const scroll = main.scrollTop;
  main.innerHTML = VIEWS[S.view]();
  main.scrollTop = scroll;
  AFTER[S.view]?.();
}

function monthNav(key) {
  const mk = key === 'tx' ? S.tx.month : S.month;
  return `<div class="month-nav">
    <button class="icon-btn" data-action="month-prev" data-key="${key}" title="Önceki ay">‹</button>
    <span>${monthLabel(mk)}</span>
    <button class="icon-btn" data-action="month-next" data-key="${key}" title="Sonraki ay">›</button>
  </div>
  ${mk !== monthOf(todayStr()) ? `<button class="btn btn-sm btn-ghost" data-action="month-today" data-key="${key}">Bu ay</button>` : ''}`;
}

/* ---------- Görünümler ---------- */
const VIEWS = {};
const AFTER = {};

VIEWS.ozet = () => {
  const d = S.data;
  if (!d.transactions.length && !d.recurring.length && !d.goals.length) {
    return `<div class="page-head"><h1>Özet</h1></div>
    <div class="card welcome">
      <h2>Hoş geldin 👋</h2>
      <p>Gelir ve giderlerini, düzenli ödemelerini ve birikim hedeflerini tek yerden takip et.<br>İlk kaydını ekleyerek başlayabilir ya da uygulamayı örnek verilerle deneyebilirsin.</p>
      <div class="btns">
        <button class="btn btn-income" data-action="new-income">+ İlk gelirini ekle</button>
        <button class="btn btn-expense" data-action="new-expense">+ İlk giderini ekle</button>
        <button class="btn" data-action="load-sample">Örnek verilerle dene</button>
      </div>
    </div>`;
  }
  const st = monthStats(S.month);
  const prev = monthStats(shiftMonth(S.month, -1));
  const expDiff = prev.exp ? Math.round((st.exp - prev.exp) / prev.exp * 100) : null;
  const rate = st.inc ? Math.round((st.saved + Math.max(st.left, 0)) / st.inc * 100) : 0;
  const due = dueList(30);
  const byCat = expenseByCat(S.month);
  const budgetRows = Object.entries(d.budgets).filter(([, v]) => v > 0)
    .map(([id, lim]) => ({ c: catById(id), lim, spent: byCat[id] || 0 }))
    .sort((a, b) => b.spent / b.lim - a.spent / a.lim).slice(0, 5);
  const recent = [...d.transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0)).slice(0, 7);

  return `<div class="page-head"><h1>Özet</h1>${monthNav('ozet')}<div class="spacer"></div></div>
  <div class="grid g4">
    <div class="card stat"><div class="label"><span class="dot" style="background:var(--income)"></span>Gelir</div><div class="value pos">${money(st.inc)}</div><div class="sub">Geçen ay ${money(prev.inc)}</div></div>
    <div class="card stat"><div class="label"><span class="dot" style="background:var(--expense)"></span>Gider</div><div class="value neg">${money(st.exp)}</div><div class="sub">${expDiff === null ? 'Geçen ay kayıt yok' : (expDiff >= 0 ? `Geçen aya göre %${expDiff} fazla` : `Geçen aya göre %${-expDiff} az`)}</div></div>
    <div class="card stat"><div class="label"><span class="dot" style="background:var(--saving)"></span>Birikime aktarılan</div><div class="value sav">${money(st.saved)}</div><div class="sub">Toplam birikim ${money(totalSaved())}</div></div>
    <div class="card stat"><div class="label"><span class="dot" style="background:var(--muted)"></span>Ay sonu kalan</div><div class="value ${st.left < 0 ? 'neg' : ''}">${money(st.left)}</div><div class="sub">Tasarruf oranı %${rate}</div></div>
  </div>

  <div class="grid g2 mt">
    <div class="card">
      <h2>Yaklaşan ödemeler<span class="spacer"></span><a data-goto="duzenli">Tümü</a></h2>
      ${due.length ? `<div class="list">${due.slice(0, 6).map(r => `
        <div class="row">
          <span class="dot" style="background:${catById(r.categoryId).color}"></span>
          <div class="main-col"><div class="title">${esc(r.name)}</div><div class="meta">${fmtDate(r.nextDate)} · ${FREQ[r.frequency]}</div></div>
          ${dueBadge(r)}
          <div class="amt ${r.type === 'income' ? 'pos' : 'neg'}">${money(r.amount)}</div>
          <button class="btn btn-sm" data-action="pay" data-id="${r.id}">${r.type === 'income' ? 'Alındı' : 'Öde'}</button>
        </div>`).join('')}</div>` : '<div class="empty">Önümüzdeki 30 günde düzenli ödeme yok.</div>'}
    </div>
    <div class="card">
      <h2>Bütçe durumu<span class="spacer"></span><a data-goto="butce">Düzenle</a></h2>
      ${budgetRows.length ? budgetRows.map(b => budgetLine(b.c, b.spent, b.lim)).join('') : '<div class="empty">Henüz bütçe limiti yok.<br><button class="btn btn-sm" data-goto="butce">Bütçe belirle</button></div>'}
    </div>
  </div>

  <div class="grid g-21 mt">
    <div class="card"><h2>Son 6 ay</h2><div class="chart-box"><canvas id="chTrend"></canvas></div></div>
    <div class="card"><h2>${monthLabel(S.month)} gider dağılımı</h2>${Object.keys(byCat).length ? '<div class="chart-box"><canvas id="chCats"></canvas></div>' : '<div class="empty">Bu ay gider kaydı yok.</div>'}</div>
  </div>

  <div class="grid g2 mt">
    <div class="card">
      <h2>Birikim hedefleri<span class="spacer"></span><a data-goto="birikim">Tümü</a></h2>
      ${d.goals.length ? d.goals.slice(0, 4).map(g => {
        const s = goalSaved(g), p = g.target ? Math.min(100, s / g.target * 100) : 0;
        return `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:5px"><b>${esc(g.name)}</b><span class="muted money">${money(s, { noDec: true })} / ${money(g.target, { noDec: true })}</span></div><div class="bar"><i style="width:${p}%;background:${g.color}"></i></div></div>`;
      }).join('') : '<div class="empty">Henüz birikim hedefi yok.<br><button class="btn btn-sm" data-action="new-goal">Hedef oluştur</button></div>'}
    </div>
    <div class="card">
      <h2>Son işlemler<span class="spacer"></span><a data-goto="islemler">Tümü</a></h2>
      ${recent.length ? `<div class="list">${recent.map(txRow).join('')}</div>` : '<div class="empty">Kayıt yok.</div>'}
    </div>
  </div>`;
};

function txRow(t) {
  const c = catById(t.categoryId);
  return `<div class="row">
    <span class="dot" style="background:${c.color}"></span>
    <div class="main-col"><div class="title">${esc(t.note || c.name)}</div><div class="meta">${fmtDate(t.date)} · ${esc(c.name)}${t.method ? ' · ' + esc(t.method) : ''}</div></div>
    <div class="amt ${t.type === 'income' ? 'pos' : 'neg'}">${t.type === 'income' ? '+' : '−'}${money(t.amount)}</div>
  </div>`;
}
function budgetLine(c, spent, lim) {
  const p = lim ? spent / lim * 100 : 0;
  const cls = p > 100 ? 'over' : p >= 80 ? 'warn' : '';
  return `<div style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;margin-bottom:5px;gap:10px">
      <span class="cat"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span>
      <span class="money ${p > 100 ? 'neg' : 'muted'}">${money(spent, { noDec: true })} / ${money(lim, { noDec: true })}</span>
    </div>
    <div class="bar ${cls}"><i style="width:${Math.min(100, p)}%"></i></div>
  </div>`;
}

AFTER.ozet = () => {
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(S.month, i - 5));
  const stats = months.map(monthStats);
  makeChart($('#chTrend'), {
    type: 'bar',
    data: {
      labels: months.map(m => monthLabel(m, true)),
      datasets: [
        { label: 'Gelir', data: stats.map(s => s.inc), backgroundColor: cssVar('--income'), borderRadius: 5, maxBarThickness: 28 },
        { label: 'Gider', data: stats.map(s => s.exp), backgroundColor: cssVar('--expense'), borderRadius: 5, maxBarThickness: 28 },
        { label: 'Birikim', data: stats.map(s => s.saved), backgroundColor: cssVar('--saving'), borderRadius: 5, maxBarThickness: 28 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.raw)}` } } },
      scales: { y: { ticks: { callback: moneyTick } }, x: { grid: { display: false } } }
    }
  });
  const byCat = Object.entries(expenseByCat(S.month)).sort((a, b) => b[1] - a[1]);
  if (byCat.length) {
    makeChart($('#chCats'), {
      type: 'doughnut',
      data: { labels: byCat.map(([id]) => catById(id).name), datasets: [{ data: byCat.map(x => round2(x[1])), backgroundColor: byCat.map(([id]) => catById(id).color), borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { callbacks: { label: c => `${c.label}: ${money(c.raw)}` } } }
      }
    });
  }
};

/* İşlemler */
function filteredTx() {
  const f = S.tx, q = f.q.trim().toLocaleLowerCase('tr');
  return S.data.transactions.filter(t =>
    (f.month === 'all' || monthOf(t.date) === f.month) &&
    (f.type === 'all' || t.type === f.type) &&
    (f.cat === 'all' || t.categoryId === f.cat) &&
    (f.method === 'all' || t.method === f.method) &&
    (!q || (t.note || '').toLocaleLowerCase('tr').includes(q) || catById(t.categoryId).name.toLocaleLowerCase('tr').includes(q))
  ).sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
}

VIEWS.islemler = () => {
  const f = S.tx, list = filteredTx();
  let inc = 0, exp = 0;
  list.forEach(t => { if (t.type === 'income') inc += t.amount; else exp += t.amount; });
  const catOpts = (type) => catsOf(type).map(c => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `<div class="page-head"><h1>İşlemler</h1>${f.month === 'all' ? '' : monthNav('tx')}<div class="spacer"></div>
    <button class="btn" data-action="export-csv">CSV dışa aktar</button>
    <button class="btn btn-income" data-action="new-income">+ Gelir</button>
    <button class="btn btn-expense" data-action="new-expense">+ Gider</button></div>
  <div class="toolbar">
    <input class="input" id="fQ" placeholder="Not veya kategoride ara…" value="${esc(f.q)}" style="width:230px">
    <select class="input" id="fMonth">
      <option value="${f.month === 'all' ? monthOf(todayStr()) : f.month}" ${f.month !== 'all' ? 'selected' : ''}>Seçili ay</option>
      <option value="all" ${f.month === 'all' ? 'selected' : ''}>Tüm zamanlar</option>
    </select>
    <select class="input" id="fType">
      <option value="all">Tüm türler</option>
      <option value="income" ${f.type === 'income' ? 'selected' : ''}>Gelirler</option>
      <option value="expense" ${f.type === 'expense' ? 'selected' : ''}>Giderler</option>
    </select>
    <select class="input" id="fCat">
      <option value="all">Tüm kategoriler</option>
      ${f.type !== 'expense' ? `<optgroup label="Gelir">${catOpts('income')}</optgroup>` : ''}
      ${f.type !== 'income' ? `<optgroup label="Gider">${catOpts('expense')}</optgroup>` : ''}
    </select>
    <select class="input" id="fMethod">
      <option value="all">Tüm ödeme yöntemleri</option>
      ${S.data.methods.map(m => `<option ${f.method === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
    </select>
    ${(f.q || f.type !== 'all' || f.cat !== 'all' || f.method !== 'all') ? '<button class="btn btn-sm btn-ghost" data-action="clear-filters">Filtreleri temizle</button>' : ''}
  </div>
  <div class="summary-line"><span><b>${list.length}</b> kayıt</span><span>Gelir <b class="pos">${money(inc)}</b></span><span>Gider <b class="neg">${money(exp)}</b></span><span>Fark <b>${money(inc - exp)}</b></span></div>
  ${list.length ? `<div class="table-wrap"><table class="m-cards tx-table">
    <thead><tr><th>Tarih</th><th>Açıklama</th><th class="col-hide-m">Kategori</th><th class="col-hide-m">Yöntem</th><th class="num">Tutar</th><th></th></tr></thead>
    <tbody>${list.map(t => { const c = catById(t.categoryId); return `<tr>
      <td class="c-date">${fmtDate(t.date)}<span class="m-only"> · ${esc(c.name)}</span></td>
      <td class="c-desc">${esc(t.note) || `<span class="muted d-only">—</span><span class="m-only">${esc(c.name)}</span>`}${t.recurringId ? ' <span class="badge" title="Düzenli ödemeden">↻</span>' : ''}</td>
      <td class="col-hide-m"><span class="cat"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span></td>
      <td class="muted col-hide-m">${esc(t.method || '')}</td>
      <td class="num c-amt ${t.type === 'income' ? 'pos' : 'neg'}"><b>${t.type === 'income' ? '+' : '−'}${money(t.amount)}</b></td>
      <td class="actions c-act"><button class="icon-btn" data-action="edit-tx" data-id="${t.id}" title="Düzenle">✎</button><button class="icon-btn danger" data-action="del-tx" data-id="${t.id}" title="Sil">🗑</button></td>
    </tr>`; }).join('')}</tbody></table></div>` : '<div class="card empty">Bu filtrelere uyan işlem yok.</div>'}`;
};
AFTER.islemler = () => {
  const q = $('#fQ');
  q.addEventListener('input', () => { S.tx.q = q.value; const pos = q.selectionStart; render(); const n = $('#fQ'); n.focus(); n.setSelectionRange(pos, pos); });
  $('#fMonth').addEventListener('change', e => { S.tx.month = e.target.value; render(); });
  $('#fType').addEventListener('change', e => { S.tx.type = e.target.value; S.tx.cat = 'all'; render(); });
  $('#fCat').addEventListener('change', e => { S.tx.cat = e.target.value; render(); });
  $('#fMethod').addEventListener('change', e => { S.tx.method = e.target.value; render(); });
};

/* Düzenli ödemeler */
VIEWS.duzenli = () => {
  const list = [...S.data.recurring].sort((a, b) => {
    const ka = a.active === false || !a.nextDate ? '9' : a.nextDate, kb = b.active === false || !b.nextDate ? '9' : b.nextDate;
    return ka.localeCompare(kb);
  });
  const active = list.filter(r => r.active !== false && r.nextDate);
  const monthlyOut = round2(active.filter(r => r.type !== 'income').reduce((s, r) => s + r.amount * FREQ_PER_MONTH[r.frequency], 0));
  const monthlyIn = round2(active.filter(r => r.type === 'income').reduce((s, r) => s + r.amount * FREQ_PER_MONTH[r.frequency], 0));
  const late = active.filter(r => daysUntil(r.nextDate) < 0);
  const thisMonthLeft = round2(active.filter(r => r.type !== 'income').reduce((s, r) => s + r.amount * occurrencesUntilMonthEnd(r), 0));

  return `<div class="page-head"><h1>Düzenli Ödemeler</h1><div class="spacer"></div><button class="btn btn-primary" data-action="new-rec">+ Yeni düzenli ödeme</button></div>
  <div class="grid g4">
    <div class="card stat"><div class="label">Aylık sabit gider yükü</div><div class="value neg">${money(monthlyOut)}</div><div class="sub">Haftalık ve yıllıklar aya çevrildi</div></div>
    <div class="card stat"><div class="label">Aylık düzenli gelir</div><div class="value pos">${money(monthlyIn)}</div><div class="sub">Maaş, burs, kira geliri vb.</div></div>
    <div class="card stat"><div class="label">Bu ay ödenecek kalan</div><div class="value">${money(thisMonthLeft)}</div><div class="sub">Gecikenler dahil</div></div>
    <div class="card stat"><div class="label">Geciken</div><div class="value ${late.length ? 'neg' : ''}">${late.length}</div><div class="sub">${late.length ? money(late.reduce((s, r) => s + r.amount, 0)) : 'Her şey yolunda'}</div></div>
  </div>
  <div class="mt">
  ${list.length ? `<div class="table-wrap"><table class="m-cards rec-table">
    <thead><tr><th>Ad</th><th class="col-hide-m">Kategori</th><th class="col-hide-m">Sıklık</th><th>Sonraki tarih</th><th>Durum</th><th class="num">Tutar</th><th></th></tr></thead>
    <tbody>${list.map(r => { const c = catById(r.categoryId); return `<tr style="${r.active === false || !r.nextDate ? 'opacity:.55' : ''}">
      <td class="c-name"><b>${esc(r.name)}</b>${r.remaining != null ? `<div class="muted" style="font-size:12px">Kalan taksit: ${r.remaining}</div>` : ''}</td>
      <td class="col-hide-m"><span class="cat"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span></td>
      <td class="muted col-hide-m">${FREQ[r.frequency]}</td>
      <td class="c-date">${r.nextDate ? fmtDate(r.nextDate) : '—'}<span class="m-only muted"> · ${FREQ[r.frequency]}</span></td>
      <td class="c-status">${dueBadge(r)}</td>
      <td class="num c-amt ${r.type === 'income' ? 'pos' : 'neg'}"><b>${money(r.amount)}</b></td>
      <td class="actions c-act">
        ${r.active !== false && r.nextDate ? `<button class="btn btn-sm" data-action="pay" data-id="${r.id}">${r.type === 'income' ? 'Alındı' : 'Ödendi'}</button>
        <button class="icon-btn" data-action="skip-rec" data-id="${r.id}" title="Bu dönemi atla">⤼</button>` : ''}
        <button class="icon-btn" data-action="toggle-rec" data-id="${r.id}" title="${r.active === false ? 'Devam ettir' : 'Durdur'}">${r.active === false ? '▶' : '⏸'}</button>
        <button class="icon-btn" data-action="edit-rec" data-id="${r.id}" title="Düzenle">✎</button>
        <button class="icon-btn danger" data-action="del-rec" data-id="${r.id}" title="Sil">🗑</button>
      </td></tr>`; }).join('')}</tbody></table></div>`
    : `<div class="card empty">Kira, faturalar, abonelikler, kredi taksitleri ya da maaş gibi tekrarlayan kalemleri buraya ekle.<br>Zamanı gelince hatırlatılır, "Ödendi" deyince işlemlere otomatik eklenir.<br><button class="btn btn-primary" data-action="new-rec">+ Yeni düzenli ödeme</button></div>`}
  </div>`;
};

/* Birikimler */
VIEWS.birikim = () => {
  const goals = S.data.goals;
  const total = totalSaved(), target = round2(goals.reduce((s, g) => s + (g.target || 0), 0));
  const thisMonth = contribsInMonth(monthOf(todayStr()));
  return `<div class="page-head"><h1>Birikimler</h1><div class="spacer"></div><button class="btn btn-primary" data-action="new-goal">+ Yeni hedef</button></div>
  <div class="grid g3">
    <div class="card stat"><div class="label">Toplam birikim</div><div class="value sav">${money(total)}</div><div class="sub">${goals.length} hedef</div></div>
    <div class="card stat"><div class="label">Hedeflerin toplamı</div><div class="value">${money(target)}</div><div class="sub">${target ? `%${Math.round(total / target * 100)} tamamlandı` : '—'}</div></div>
    <div class="card stat"><div class="label">Bu ay biriktirilen</div><div class="value">${money(thisMonth)}</div><div class="sub">${monthLabel(monthOf(todayStr()))}</div></div>
  </div>
  ${goals.length ? `<div class="grid g3 mt">${goals.map(goalCard).join('')}</div>`
    : `<div class="card empty mt">Tatil, acil durum fonu, bilgisayar, ev peşinatı… Bir hedef koy, katkılarını ekledikçe ilerlemeyi gör.<br><button class="btn btn-primary" data-action="new-goal">+ Yeni hedef</button></div>`}`;
};
function goalCard(g) {
  const s = goalSaved(g), rem = Math.max(0, round2(g.target - s));
  const p = g.target ? Math.min(100, s / g.target * 100) : 0;
  let monthly = '', dl = '';
  if (g.deadline) {
    const days = daysUntil(g.deadline);
    dl = days < 0 ? `<span class="neg">${-days} gün geçti</span>` : `${days} gün`;
    const months = Math.max(1, Math.ceil(days / 30.44));
    monthly = rem > 0 ? money(rem / months) : '—';
  }
  return `<div class="card goal ${rem === 0 && g.target ? 'done' : ''}">
    <div class="goal-top"><span class="dot" style="background:${g.color};width:12px;height:12px"></span><div class="name">${esc(g.name)}</div>
      ${rem === 0 && g.target ? '<span class="badge ok">Tamamlandı 🎉</span>' : `<span class="badge">%${Math.floor(p)}</span>`}
      <button class="icon-btn" data-action="edit-goal" data-id="${g.id}" title="Düzenle">✎</button>
      <button class="icon-btn danger" data-action="del-goal" data-id="${g.id}" title="Sil">🗑</button></div>
    <div class="goal-amt">${money(s)} <small>/ ${money(g.target)}</small></div>
    <div class="bar"><i style="width:${p}%;background:${g.color}"></i></div>
    <div class="facts">
      <div>Kalan<br><b>${money(rem)}</b></div>
      <div>Hedef tarih<br><b>${g.deadline ? fmtDate(g.deadline) : 'Belirtilmedi'}</b></div>
      ${g.deadline ? `<div>Kalan süre<br><b>${dl}</b></div><div>Aylık gereken<br><b>${monthly}</b></div>` : ''}
    </div>
    <div class="btns">
      <button class="btn btn-sm btn-income" data-action="contrib" data-id="${g.id}">+ Para ekle</button>
      <button class="btn btn-sm" data-action="withdraw" data-id="${g.id}">− Çek</button>
      <button class="btn btn-sm btn-ghost" data-action="goal-history" data-id="${g.id}">Geçmiş</button>
    </div>
  </div>`;
}

/* Bütçe ve raporlar */
VIEWS.butce = () => {
  const byCat = expenseByCat(S.month);
  const cats = S.data.categories.expense;
  const totLim = cats.reduce((s, c) => s + (S.data.budgets[c.id] || 0), 0);
  const totSpent = cats.reduce((s, c) => s + (S.data.budgets[c.id] ? (byCat[c.id] || 0) : 0), 0);
  const prevByCat = expenseByCat(shiftMonth(S.month, -1));
  const avg = {};
  let dataMonths = 0;
  for (let i = 1; i <= 6; i++) {
    const m = expenseByCat(shiftMonth(S.month, -i));
    if (Object.keys(m).length) dataMonths++;
    for (const k in m) avg[k] = (avg[k] || 0) + m[k];
  }
  for (const k in avg) avg[k] /= Math.max(1, dataMonths);

  const yearMonths = Array.from({ length: 12 }, (_, i) => `${S.year}-${pad(i + 1)}`);
  const ys = yearMonths.map(monthStats);
  const yInc = ys.reduce((s, x) => s + x.inc, 0), yExp = ys.reduce((s, x) => s + x.exp, 0), ySav = ys.reduce((s, x) => s + x.saved, 0);
  const activeMonths = ys.filter(x => x.inc || x.exp).length || 1;

  return `<div class="page-head"><h1>Bütçe ve Raporlar</h1>${monthNav('butce')}<div class="spacer"></div></div>
  <div class="card">
    <h2>${monthLabel(S.month)} bütçesi<span class="spacer"></span><span class="muted" style="font-weight:500">Limitli kategoriler: <b class="${totLim && totSpent > totLim ? 'neg' : ''}">${money(totSpent)}</b> / ${money(totLim)}</span></h2>
    <p class="muted" style="margin:-4px 0 12px;font-size:12.5px">Limit kutusuna aylık üst sınırı yaz. Limitler her ay için geçerlidir. Boş bırakılan kategoriler takip edilmez.</p>
    <div class="table-wrap"><table class="m-cards bud-table">
      <thead><tr><th>Kategori</th><th style="width:150px">Aylık limit</th><th class="num">Harcanan</th><th class="num">Kalan</th><th style="width:28%">Durum</th><th class="num col-hide-m">Geçen ay</th><th class="num col-hide-m">6 ay ort.</th></tr></thead>
      <tbody>${cats.map(c => {
        const lim = S.data.budgets[c.id] || 0, sp = byCat[c.id] || 0, p = lim ? sp / lim * 100 : 0;
        const cls = p > 100 ? 'over' : p >= 80 ? 'warn' : '';
        return `<tr>
          <td class="c-cat"><span class="cat"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span></td>
          <td class="c-lim"><input class="input budget-in" data-cat="${c.id}" inputmode="decimal" placeholder="Limit yok" value="${amountToInput(lim)}" style="width:130px"></td>
          <td class="num c-spent">${money(sp)}</td>
          <td class="num c-rem ${lim && lim - sp < 0 ? 'neg' : ''}">${lim ? money(lim - sp) : '<span class="muted">—</span>'}</td>
          <td class="c-bar">${lim ? `<div class="bar ${cls}"><i style="width:${Math.min(100, p)}%"></i></div><div class="muted" style="font-size:11.5px;margin-top:3px">%${Math.round(p)}</div>` : ''}</td>
          <td class="num muted col-hide-m">${money(prevByCat[c.id] || 0, { noDec: true })}</td>
          <td class="num muted col-hide-m">${money(avg[c.id] || 0, { noDec: true })}</td>
        </tr>`;
      }).join('')}</tbody></table></div>
  </div>

  <div class="card mt">
    <h2>${S.year} yılı
      <button class="icon-btn" data-action="year-prev">‹</button><button class="icon-btn" data-action="year-next">›</button>
      <span class="spacer"></span>
      <span class="muted" style="font-weight:500">Gelir <b class="pos">${money(yInc, { noDec: true })}</b> · Gider <b class="neg">${money(yExp, { noDec: true })}</b> · Birikim <b class="sav">${money(ySav, { noDec: true })}</b> · Aylık ort. gider <b>${money(yExp / activeMonths, { noDec: true })}</b></span>
    </h2>
    <div class="chart-box tall"><canvas id="chYear"></canvas></div>
  </div>

  <div class="grid g2 mt">
    <div class="card"><h2>${S.year} kategori bazında giderler</h2><div class="chart-box tall"><canvas id="chYearCats"></canvas></div></div>
    <div class="card"><h2>Ödeme yöntemlerine göre (${monthLabel(S.month)})</h2><div class="chart-box tall"><canvas id="chMethods"></canvas></div></div>
  </div>`;
};
AFTER.butce = () => {
  $$('.budget-in').forEach(inp => inp.addEventListener('change', () => {
    const v = parseAmount(inp.value);
    if (isNaN(v) || v <= 0) delete S.data.budgets[inp.dataset.cat]; else S.data.budgets[inp.dataset.cat] = v;
    persist();
    setTimeout(() => {
      const next = document.activeElement?.classList.contains('budget-in') ? document.activeElement.dataset.cat : null;
      render();
      if (next) { const el = $(`.budget-in[data-cat="${next}"]`); el?.focus(); el?.select(); }
    }, 0);
  }));
  const yearMonths = Array.from({ length: 12 }, (_, i) => `${S.year}-${pad(i + 1)}`);
  const ys = yearMonths.map(monthStats);
  makeChart($('#chYear'), {
    data: {
      labels: yearMonths.map(m => monthLabel(m, true)),
      datasets: [
        { type: 'bar', label: 'Gelir', data: ys.map(s => s.inc), backgroundColor: cssVar('--income'), borderRadius: 4, maxBarThickness: 22 },
        { type: 'bar', label: 'Gider', data: ys.map(s => s.exp), backgroundColor: cssVar('--expense'), borderRadius: 4, maxBarThickness: 22 },
        { type: 'line', label: 'Net', data: ys.map(s => s.net), borderColor: cssVar('--saving'), backgroundColor: cssVar('--saving'), tension: .3, pointRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.raw)}` } } },
      scales: { y: { ticks: { callback: moneyTick } }, x: { grid: { display: false } } }
    }
  });
  const yc = {};
  S.data.transactions.filter(t => t.type === 'expense' && t.date.startsWith(S.year + '-')).forEach(t => { yc[t.categoryId] = (yc[t.categoryId] || 0) + t.amount; });
  const ycs = Object.entries(yc).sort((a, b) => b[1] - a[1]);
  makeChart($('#chYearCats'), {
    type: 'bar',
    data: { labels: ycs.map(([id]) => catById(id).name), datasets: [{ data: ycs.map(x => round2(x[1])), backgroundColor: ycs.map(([id]) => catById(id).color), borderRadius: 4 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => money(c.raw) } } }, scales: { x: { ticks: { callback: moneyTick } }, y: { grid: { display: false } } } }
  });
  const mm = {};
  txInMonth(S.month).filter(t => t.type === 'expense').forEach(t => { const k = t.method || 'Belirtilmedi'; mm[k] = (mm[k] || 0) + t.amount; });
  const mms = Object.entries(mm).sort((a, b) => b[1] - a[1]);
  makeChart($('#chMethods'), {
    type: 'doughnut',
    data: { labels: mms.map(x => x[0]), datasets: [{ data: mms.map(x => round2(x[1])), backgroundColor: mms.map((_, i) => PALETTE[(i + 1) % PALETTE.length]), borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { callbacks: { label: c => `${c.label}: ${money(c.raw)}` } } } }
  });
};

/* Ayarlar */
VIEWS.ayarlar = () => {
  const d = S.data, s = d.settings;
  const catChips = type => d.categories[type].map(c => `<span class="chip">
      <input type="color" value="${c.color}" data-color-cat="${c.id}" title="Renk">
      ${esc(c.name)}
      <button data-action="rename-cat" data-id="${c.id}" title="Yeniden adlandır">✎</button>
      <button data-action="del-cat" data-id="${c.id}" data-type="${type}" title="Sil">✕</button>
    </span>`).join('');
  const hasSample = d.transactions.some(t => t.sample) || d.goals.some(g => g.sample) || d.recurring.some(r => r.sample);
  return `<div class="page-head"><h1>Ayarlar</h1></div>
  <div class="grid g2">
    <div class="card">
      <h2>Genel</h2>
      <div class="set-row"><div class="main-col"><b>Tema</b><div class="muted">Koyu ya da açık görünüm</div></div>
        <select class="input" id="sTheme"><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Koyu</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Açık</option></select></div>
      <div class="set-row"><div class="main-col"><b>Para birimi</b><div class="muted">Tüm tutarlar bu birimle gösterilir</div></div>
        <select class="input" id="sCur">${['TRY', 'USD', 'EUR', 'GBP'].map(c => `<option ${s.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="set-row"><div class="main-col"><b>Hatırlatma</b><div class="muted">Düzenli ödemeden kaç gün önce bildirim gelsin</div></div>
        <select class="input" id="sRem">${[1, 2, 3, 5, 7].map(n => `<option value="${n}" ${s.reminderDays === n ? 'selected' : ''}>${n} gün önce</option>`).join('')}</select></div>
    </div>
    <div class="card">
      <h2>Veriler</h2>
      <div class="set-row"><div class="main-col"><b>Yedek al</b><div class="muted">${api.platform ? 'Yedek dosyasını Drive, e-posta ya da mesajla gönder. Bilgisayara aktarmak için de bunu kullan.' : 'Tüm verileri tek bir JSON dosyasına kaydet. Telefona aktarmak için de bunu kullan.'}</div></div><button class="btn" data-action="backup">${api.platform ? 'Paylaş' : 'Yedek al'}</button></div>
      <div class="set-row"><div class="main-col"><b>Yedekten geri yükle</b><div class="muted">Mevcut verilerin yerine yedek dosyası yüklenir</div></div><button class="btn" data-action="restore">Geri yükle</button></div>
      <div class="set-row"><div class="main-col"><b>Excel için dışa aktar</b><div class="muted">Tüm işlemleri CSV olarak ${api.platform ? 'paylaş' : 'kaydet'}</div></div><button class="btn" data-action="export-csv-all">CSV</button></div>
      ${api.platform ? '' : '<div class="set-row"><div class="main-col"><b>Veri klasörü</b><div class="muted">Otomatik günlük yedekler burada tutulur (son 30 gün)</div></div><button class="btn" data-action="open-folder">Klasörü aç</button></div>'}
      ${hasSample ? '<div class="set-row"><div class="main-col"><b>Örnek veriler</b><div class="muted">Denemek için yüklenen örnek kayıtları kaldır</div></div><button class="btn" data-action="clear-sample">Örnekleri sil</button></div>' : ''}
      <div class="set-row"><div class="main-col"><b class="neg">Tüm verileri sil</b><div class="muted">Geri alınamaz, önce yedek almanı öneririm</div></div><button class="btn btn-danger" data-action="wipe">Sıfırla</button></div>
    </div>
  </div>
  <div class="card mt"><h2>Güvenlik ve gizlilik</h2>
    <div class="set-row"><div class="main-col"><b>Uygulama kilidi</b><div class="muted">${s.lock ? (s.lock.type === 'pin' ? 'Açık, PIN ile' : 'Açık, parola ile') + (s.lock.bio && SEC.bio ? `, ${esc(SEC.bio)} de kullanılabilir` : '') : 'Kapalı. İstersen program açılırken PIN ya da parola sorulur.'}</div></div>
      ${s.lock ? '<button class="btn" data-action="lock-change">Değiştir</button><button class="btn" data-action="lock-remove">Kaldır</button>' : '<button class="btn btn-primary" data-action="lock-setup">Kilit kur</button>'}</div>
    <div class="set-row"><div class="main-col"><b>Tutarları gizle</b><div class="muted">Yanında biri varken tüm rakamları bulanıklaştırır. Kısayol H ya da göz simgesi.</div></div>
      <label class="switch"><input type="checkbox" id="sHide" ${s.hideAmounts ? 'checked' : ''}><span></span></label></div>
    <div class="set-row"><div class="main-col muted" style="font-size:12.5px">Kilit, programı açan başka birinin kayıtlarını görmesini engeller. Kilit ve gizleme ayarı her cihazın kendine aittir, yedek dosyalarına geçmez.</div></div>
  </div>
  <div class="card mt"><h2>Gider kategorileri<span class="spacer"></span><button class="btn btn-sm" data-action="add-cat" data-type="expense">+ Ekle</button></h2><div class="chips">${catChips('expense')}</div></div>
  <div class="card mt"><h2>Gelir kategorileri<span class="spacer"></span><button class="btn btn-sm" data-action="add-cat" data-type="income">+ Ekle</button></h2><div class="chips">${catChips('income')}</div></div>
  <div class="card mt"><h2>Ödeme yöntemleri<span class="spacer"></span><button class="btn btn-sm" data-action="add-method">+ Ekle</button></h2>
    <div class="chips">${d.methods.map((m, i) => `<span class="chip">${esc(m)}<button data-action="del-method" data-i="${i}" title="Sil">✕</button></span>`).join('')}</div></div>
  <div class="card mt"><h2>Güncellemeler</h2>
    <div class="set-row"><div class="main-col"><b>Sürüm <span id="verText">${esc(S.version)}</span></b><div class="muted upd-status" id="updStatus">${updateText()}</div></div>
      <button class="btn" data-action="open-repo">GitHub sayfası</button>
      <span id="updBtnWrap">${updateButton()}</span></div>
    <div class="set-row"><div class="main-col muted" style="font-size:12.5px">${api.platform === 'ios' ? 'Yeni sürümler App Store üzerinden gelir.' : api.platform === 'android' ? 'Uygulama açılırken yeni sürüm olup olmadığına bakar. Yeni sürüm çıkınca haber verir, dokununca indirilir. Verilerin güncellemeden etkilenmez.' : 'Program açılırken ve açık kaldığı sürece 6 saatte bir yeni sürüm olup olmadığına bakar. Yeni sürüm arka planda iner, program kapanınca kendiliğinden kurulur. Verilerin güncellemeden etkilenmez.'}</div></div>
  </div>
  <p class="muted mt" id="appInfo" style="font-size:12px"></p>`;
};
AFTER.ayarlar = () => {
  $('#sTheme').addEventListener('change', e => { S.data.settings.theme = e.target.value; commit(); });
  $('#sCur').addEventListener('change', e => { S.data.settings.currency = e.target.value; commit(); });
  $('#sRem').addEventListener('change', e => { S.data.settings.reminderDays = Number(e.target.value); commit(); });
  $('#sHide').addEventListener('change', () => toggleHide());
  $$('[data-color-cat]').forEach(inp => inp.addEventListener('change', () => {
    const c = allCats().find(x => x.id === inp.dataset.colorCat); if (c) { c.color = inp.value; persist(); }
  }));
  api.info().then(i => { const el = $('#appInfo'); if (el) el.textContent = `Veri dosyası: ${i.dataPath}`; }).catch(() => {});
};

/* ---------- Modal ---------- */
function openModal({ title, body, submit = 'Kaydet', danger = false, onSubmit, onOpen, wide = false, noFoot = false }) {
  const dlg = $('#modal');
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalFoot').innerHTML = noFoot ? '<button type="button" class="btn" data-close>Kapat</button>'
    : `<button type="button" class="btn btn-ghost" data-close>Vazgeç</button><button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${submit}</button>`;
  dlg.style.width = wide ? 'min(680px, 94vw)' : '';
  const form = $('#modalForm');
  form.onsubmit = e => {
    e.preventDefault();
    if (!onSubmit) return dlg.close();
    const res = onSubmit(form);
    if (res !== false) dlg.close();
  };
  if (!dlg.open) dlg.showModal();
  onOpen?.(form);
  const first = $('[autofocus]', form) || $('input:not([type=hidden]):not([type=radio]), select', form);
  first?.focus(); first?.select?.();
}
$('#modal').addEventListener('click', e => {
  if (e.target.closest('[data-close]') || e.target === e.currentTarget) $('#modal').close();
});
function confirmBox(title, text, submit = 'Sil') {
  return new Promise(res => {
    let ok = false;
    openModal({ title, body: `<p style="margin:0">${text}</p>`, submit, danger: true, onSubmit: () => { ok = true; } });
    $('#modal').addEventListener('close', () => res(ok), { once: true });
  });
}
const val = (f, n) => f.elements[n]?.value ?? '';
function fieldError(f, n, msg) { const el = f.elements[n]; el.setCustomValidity(msg); el.reportValidity(); el.addEventListener('input', () => el.setCustomValidity(''), { once: true }); return false; }

function catSelect(type, sel, name = 'categoryId') {
  return `<select class="input" name="${name}">${catsOf(type).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
}
function methodSelect(sel) {
  return `<select class="input" name="method"><option value="">Belirtilmedi</option>${S.data.methods.map(m => `<option ${m === sel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`;
}
function typeSeg(type) {
  return `<div class="seg">
    <input type="radio" name="type" id="tyI" value="income" ${type === 'income' ? 'checked' : ''}><label class="i" for="tyI">Gelir</label>
    <input type="radio" name="type" id="tyE" value="expense" ${type !== 'income' ? 'checked' : ''}><label class="e" for="tyE">Gider</label>
  </div>`;
}
function bindTypeSwitch(f) {
  $$('input[name=type]', f).forEach(r => r.addEventListener('change', () => {
    const t = val(f, 'type');
    f.elements.categoryId.outerHTML = catSelect(t);
  }));
}

/* İşlem formu */
function txForm(existing, presetType) {
  const pt = presetType || 'expense';
  const t = existing || { type: pt, amount: '', date: todayStr(), categoryId: S.last[pt] || '', method: S.last.method || '', note: '' };
  const usualDate = t.date || todayStr();
  openModal({
    title: existing ? 'İşlemi düzenle' : (t.type === 'income' ? 'Yeni gelir' : 'Yeni gider'),
    body: `${typeSeg(t.type)}
      <label class="field"><span>Tutar</span><input class="input amount-input" name="amount" inputmode="decimal" placeholder="0,00" value="${amountToInput(t.amount)}" autofocus required></label>
      <div class="fields-2">
        <label class="field"><span>Kategori</span>${catSelect(t.type, t.categoryId)}</label>
        <label class="field"><span>Tarih</span><input class="input" type="date" name="date" value="${usualDate}" required></label>
      </div>
      <div class="fields-2">
        <label class="field"><span>Ödeme yöntemi</span>${methodSelect(t.method)}</label>
        <label class="field"><span>Açıklama</span><input class="input" name="note" placeholder="Örn. Migros alışverişi" value="${esc(t.note)}"></label>
      </div>
      ${existing ? '' : '<label class="check"><input type="checkbox" name="again"> Kaydettikten sonra yeni kayıt aç</label>'}`,
    onOpen: bindTypeSwitch,
    onSubmit: f => {
      const amount = parseAmount(val(f, 'amount'));
      if (!(amount > 0)) return fieldError(f, 'amount', 'Geçerli bir tutar gir');
      const rec = { type: val(f, 'type'), amount, date: val(f, 'date'), categoryId: val(f, 'categoryId'), method: val(f, 'method'), note: val(f, 'note').trim() };
      if (existing) Object.assign(existing, rec);
      else S.data.transactions.push({ id: uid(), created: Date.now(), ...rec });
      S.last[rec.type] = rec.categoryId; S.last.method = rec.method;
      const again = !existing && f.elements.again?.checked;
      commit();
      toast(existing ? 'İşlem güncellendi' : (rec.type === 'income' ? 'Gelir eklendi' : 'Gider eklendi'));
      if (again) setTimeout(() => txForm(null, rec.type), 50);
    }
  });
}

/* Düzenli ödeme formu */
function recForm(existing) {
  const r = existing || { type: 'expense', name: '', amount: '', categoryId: '', frequency: 'monthly', nextDate: todayStr(), remaining: null, method: '', note: '' };
  openModal({
    title: existing ? 'Düzenli ödemeyi düzenle' : 'Yeni düzenli ödeme',
    body: `${typeSeg(r.type)}
      <label class="field"><span>Ad</span><input class="input" name="name" placeholder="Örn. Ev kirası, Netflix, Kredi kartı" value="${esc(r.name)}" required autofocus></label>
      <div class="fields-2">
        <label class="field"><span>Tutar</span><input class="input" name="amount" inputmode="decimal" placeholder="0,00" value="${amountToInput(r.amount)}" required></label>
        <label class="field"><span>Kategori</span>${catSelect(r.type, r.categoryId)}</label>
      </div>
      <div class="fields-2">
        <label class="field"><span>Sıklık</span><select class="input" name="frequency">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}" ${r.frequency === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>${existing ? 'Sonraki ödeme tarihi' : 'İlk ödeme tarihi'}</span><input class="input" type="date" name="nextDate" value="${r.nextDate || todayStr()}" required></label>
      </div>
      <div class="fields-2">
        <label class="field"><span>Kalan taksit sayısı (isteğe bağlı)</span><input class="input" name="remaining" type="number" min="1" step="1" placeholder="Sınırsız" value="${r.remaining ?? ''}"></label>
        <label class="field"><span>Ödeme yöntemi</span>${methodSelect(r.method)}</label>
      </div>`,
    onOpen: bindTypeSwitch,
    onSubmit: f => {
      const amount = parseAmount(val(f, 'amount'));
      if (!(amount > 0)) return fieldError(f, 'amount', 'Geçerli bir tutar gir');
      const remRaw = val(f, 'remaining').trim();
      const nd = val(f, 'nextDate');
      const rec = {
        type: val(f, 'type'), name: val(f, 'name').trim(), amount, categoryId: val(f, 'categoryId'),
        frequency: val(f, 'frequency'), nextDate: nd, anchorDay: parseDate(nd).getDate(),
        remaining: remRaw ? Math.max(1, parseInt(remRaw, 10)) : null, method: val(f, 'method')
      };
      if (existing) Object.assign(existing, rec);
      else S.data.recurring.push({ id: uid(), active: true, ...rec });
      commit();
      toast('Düzenli ödeme kaydedildi');
    }
  });
}
// Bu ayın sonuna kadar (gecikenler dahil) kaç ödeme düşüyor
function occurrencesUntilMonthEnd(r) {
  const end = monthOf(todayStr());
  let d = r.nextDate, n = 0, left = r.remaining;
  while (d && monthOf(d) <= end && n < 60 && (left == null || left > 0)) {
    n++; if (left != null) left--;
    if (r.frequency === 'once') break;
    d = nextDate(d, r.frequency, r.anchorDay);
  }
  return n;
}
function advanceRec(r) {
  if (r.remaining != null) r.remaining -= 1;
  if (r.frequency === 'once' || (r.remaining != null && r.remaining <= 0)) { r.nextDate = null; r.remaining = r.remaining != null ? 0 : null; return; }
  r.nextDate = nextDate(r.nextDate, r.frequency, r.anchorDay);
}
function payRec(r) {
  const inc = r.type === 'income';
  openModal({
    title: inc ? `${r.name} alındı` : `${r.name} ödendi`,
    body: `<p class="muted" style="margin:0">Bu ödeme ${inc ? 'gelir' : 'gider'} olarak işlemlere eklenecek ve sonraki tarih ${r.frequency === 'once' ? 'kapatılacak' : 'ileri alınacak'}.</p>
      <div class="fields-2">
        <label class="field"><span>Tutar</span><input class="input amount-input" name="amount" inputmode="decimal" value="${amountToInput(r.amount)}" required autofocus></label>
        <label class="field"><span>İşlem tarihi</span><input class="input" type="date" name="date" value="${daysUntil(r.nextDate) > 0 ? todayStr() : r.nextDate}" required></label>
      </div>
      <label class="field"><span>Ödeme yöntemi</span>${methodSelect(r.method)}</label>`,
    submit: inc ? 'Alındı olarak işaretle' : 'Ödendi olarak işaretle',
    onSubmit: f => {
      const amount = parseAmount(val(f, 'amount'));
      if (!(amount > 0)) return fieldError(f, 'amount', 'Geçerli bir tutar gir');
      const txId = uid();
      S.data.transactions.push({ id: txId, created: Date.now(), type: r.type || 'expense', amount, date: val(f, 'date'), categoryId: r.categoryId, method: val(f, 'method'), note: r.name, recurringId: r.id,
        recPrev: { nextDate: r.nextDate, remaining: r.remaining } });
      advanceRec(r);
      r.lastPayTx = txId;
      commit();
      toast(r.nextDate ? `Kaydedildi. Sonraki: ${fmtDate(r.nextDate)}` : 'Kaydedildi. Ödeme tamamlandı');
    }
  });
}

/* Birikim formları */
function goalForm(existing) {
  const g = existing || { name: '', target: '', deadline: '', color: PALETTE[S.data.goals.length % PALETTE.length], initial: '' };
  openModal({
    title: existing ? 'Hedefi düzenle' : 'Yeni birikim hedefi',
    body: `<label class="field"><span>Hedef adı</span><input class="input" name="name" placeholder="Örn. Acil durum fonu" value="${esc(g.name)}" required autofocus></label>
      <div class="fields-2">
        <label class="field"><span>Hedef tutar</span><input class="input" name="target" inputmode="decimal" placeholder="0,00" value="${amountToInput(g.target)}" required></label>
        <label class="field"><span>Hedef tarih (isteğe bağlı)</span><input class="input" type="date" name="deadline" value="${g.deadline || ''}"></label>
      </div>
      <div class="fields-2">
        ${existing ? '' : '<label class="field"><span>Şu an biriken (isteğe bağlı)</span><input class="input" name="initial" inputmode="decimal" placeholder="0,00"></label>'}
        <label class="field"><span>Renk</span><input class="input" type="color" name="color" value="${g.color}" style="height:38px;padding:3px"></label>
      </div>`,
    onSubmit: f => {
      const target = parseAmount(val(f, 'target'));
      if (!(target > 0)) return fieldError(f, 'target', 'Geçerli bir tutar gir');
      const rec = { name: val(f, 'name').trim(), target, deadline: val(f, 'deadline'), color: val(f, 'color') };
      if (existing) Object.assign(existing, rec);
      else {
        const init = parseAmount(val(f, 'initial'));
        S.data.goals.push({ id: uid(), created: Date.now(), ...rec, contributions: init > 0 ? [{ id: uid(), date: todayStr(), amount: init, note: 'Başlangıç birikimi', initial: true }] : [] });
      }
      commit();
      toast('Hedef kaydedildi');
    }
  });
}
function contribForm(g, sign) {
  const s = goalSaved(g);
  openModal({
    title: sign > 0 ? `${g.name} · para ekle` : `${g.name} · para çek`,
    body: `<div class="fields-2">
        <label class="field"><span>Tutar</span><input class="input amount-input" name="amount" inputmode="decimal" placeholder="0,00" required autofocus></label>
        <label class="field"><span>Tarih</span><input class="input" type="date" name="date" value="${todayStr()}" required></label>
      </div>
      <label class="field"><span>Not</span><input class="input" name="note" placeholder="${sign > 0 ? 'Örn. Ekim birikimi' : 'Örn. Tatil için kullanıldı'}"></label>
      <p class="muted" style="margin:0;font-size:12.5px">${sign > 0 ? 'Eklenen tutar bakiyeden düşülür, aylık özetteki "Birikime aktarılan" kısmında görünür.' : `Çekilebilir tutar: ${money(s)}. Çekilen tutar bakiyeye geri döner.`}</p>`,
    submit: sign > 0 ? 'Ekle' : 'Çek',
    onSubmit: f => {
      const amount = parseAmount(val(f, 'amount'));
      if (!(amount > 0)) return fieldError(f, 'amount', 'Geçerli bir tutar gir');
      if (sign < 0 && amount > s) return fieldError(f, 'amount', `En fazla ${money(s)} çekebilirsin`);
      g.contributions.push({ id: uid(), date: val(f, 'date'), amount: sign * amount, note: val(f, 'note').trim() });
      commit();
      const done = sign > 0 && goalSaved(g) >= g.target;
      toast(done ? `Tebrikler, "${g.name}" hedefine ulaştın! 🎉` : 'Kaydedildi');
    }
  });
}
function goalHistory(g) {
  const list = [...g.contributions].sort((a, b) => b.date.localeCompare(a.date));
  openModal({
    title: `${g.name} · geçmiş`, noFoot: true,
    body: list.length ? `<div class="list">${list.map(c => `<div class="row">
      <div class="main-col"><div class="title">${esc(c.note) || (c.amount > 0 ? 'Katkı' : 'Çekim')}</div><div class="meta">${fmtDate(c.date)}</div></div>
      <div class="amt ${c.amount > 0 ? 'pos' : 'neg'}">${c.amount > 0 ? '+' : '−'}${money(Math.abs(c.amount))}</div>
      <button type="button" class="icon-btn danger" data-action="del-contrib" data-goal="${g.id}" data-id="${c.id}" title="Sil">🗑</button></div>`).join('')}</div>` : '<div class="empty">Henüz hareket yok.</div>'
  });
}

/* CSV */
function toCsv(list) {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const txt = s => /^[=+\-@\t\r]/.test(String(s ?? '')) ? "'" + s : (s ?? ''); // Excel'in metni formül sanmaması için
  const rows = [['Tarih', 'Tür', 'Kategori', 'Açıklama', 'Ödeme yöntemi', 'Tutar']];
  list.forEach(t => rows.push([t.date, t.type === 'income' ? 'Gelir' : 'Gider', txt(catById(t.categoryId).name), txt(t.note), txt(t.method), (t.type === 'income' ? t.amount : -t.amount).toFixed(2).replace('.', ',')]));
  return rows.map(r => r.map(q).join(';')).join('\r\n');
}

/* Örnek veri */
function loadSample() {
  const d = S.data, now = new Date();
  const ex = n => d.categories.expense.find(c => c.name === n)?.id || d.categories.expense[0].id;
  const inc = n => d.categories.income.find(c => c.name === n)?.id || d.categories.income[0].id;
  const add = (type, amount, date, cat, method, note) => d.transactions.push({ id: uid(), created: Date.now(), type, amount, date, categoryId: cat, method, note, sample: true });
  for (let m = 5; m >= 0; m--) {
    const base = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const day = n => { const x = new Date(base); x.setDate(Math.min(n, lastDay(x.getFullYear(), x.getMonth()))); return ymd(x); };
    const lim = m === 0 ? now.getDate() : 31;
    const j = () => 0.85 + Math.random() * 0.3;
    if (1 <= lim) add('income', 42000, day(1), inc('Maaş'), 'Havale / EFT', 'Maaş');
    if (5 <= lim) add('income', 14500, day(5), inc('Burs'), 'Havale / EFT', 'Burs ödemesi');
    if (m % 2 === 0 && 18 <= lim) add('income', round2(3500 * j()), day(18), inc('Ek Gelir / Serbest'), 'Havale / EFT', 'Çeviri işi');
    if (2 <= lim) add('expense', 17000, day(2), ex('Kira'), 'Havale / EFT', 'Ev kirası');
    [4, 11, 19, 26].forEach(n => { if (n <= lim) add('expense', round2(1900 * j()), day(n), ex('Market'), 'Banka Kartı', 'Market alışverişi'); });
    if (8 <= lim) add('expense', round2(1250 * j()), day(8), ex('Faturalar'), 'Banka Kartı', 'Elektrik');
    if (12 <= lim) add('expense', round2(620 * j()), day(12), ex('Faturalar'), 'Banka Kartı', 'Doğalgaz');
    if (15 <= lim) add('expense', 450, day(15), ex('Faturalar'), 'Kredi Kartı', 'İnternet');
    if (3 <= lim) add('expense', 1600, day(3), ex('Ulaşım'), 'Banka Kartı', 'İstanbulkart dolum');
    [6, 13, 21].forEach(n => { if (n <= lim) add('expense', round2(780 * j()), day(n), ex('Yeme İçme'), 'Kredi Kartı', 'Dışarıda yemek'); });
    if (10 <= lim) add('expense', 230, day(10), ex('Abonelikler'), 'Kredi Kartı', 'Spotify');
    if (14 <= lim) add('expense', 350, day(14), ex('Abonelikler'), 'Kredi Kartı', 'Netflix');
    if (m % 3 === 1 && 22 <= lim) add('expense', round2(2400 * j()), day(22), ex('Giyim'), 'Kredi Kartı', 'Mont');
    if (m % 2 === 1 && 17 <= lim) add('expense', round2(900 * j()), day(17), ex('Eğlence'), 'Nakit', 'Konser');
    if (20 <= lim) add('expense', 3200, day(20), ex('Kredi / Taksit'), 'Havale / EFT', 'Telefon taksiti');
  }
  const nextOn = n => { const x = new Date(now.getFullYear(), now.getMonth(), n); if (x < new Date(now.getFullYear(), now.getMonth(), now.getDate())) x.setMonth(x.getMonth() + 1); return ymd(x); };
  const rec = (name, type, amount, cat, day, method, remaining = null) => d.recurring.push({ id: uid(), active: true, sample: true, type, name, amount, categoryId: cat, frequency: 'monthly', nextDate: nextOn(day), anchorDay: day, remaining, method });
  rec('Ev kirası', 'expense', 17000, ex('Kira'), 2, 'Havale / EFT');
  rec('İnternet', 'expense', 450, ex('Faturalar'), 15, 'Kredi Kartı');
  rec('Netflix', 'expense', 350, ex('Abonelikler'), 14, 'Kredi Kartı');
  rec('Spotify', 'expense', 230, ex('Abonelikler'), 10, 'Kredi Kartı');
  rec('Telefon taksiti', 'expense', 3200, ex('Kredi / Taksit'), 20, 'Havale / EFT', 7);
  rec('Maaş', 'income', 42000, inc('Maaş'), 1, 'Havale / EFT');
  const due = new Date(now); due.setDate(due.getDate() + 2);
  d.recurring.push({ id: uid(), active: true, sample: true, type: 'expense', name: 'Araç sigortası', amount: 8600, categoryId: ex('Diğer Gider'), frequency: 'yearly', nextDate: ymd(due), anchorDay: due.getDate(), remaining: null, method: 'Kredi Kartı' });
  const goal = (name, target, monthsAhead, color, monthly) => {
    const dl = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1);
    const contributions = [];
    for (let m = 5; m >= 0; m--) contributions.push({ id: uid(), date: ymd(new Date(now.getFullYear(), now.getMonth() - m, Math.min(25, m === 0 ? now.getDate() : 25))), amount: monthly, note: 'Aylık birikim' });
    d.goals.push({ id: uid(), created: Date.now(), sample: true, name, target, deadline: ymd(dl), color, contributions });
  };
  goal('Acil durum fonu', 120000, 10, '#5aa9e6', 6000);
  goal('Yaz tatili', 45000, 8, '#f0b429', 2500);
  goal('Yeni bilgisayar', 60000, 5, '#a78bfa', 3000);
  d.budgets[ex('Market')] = 8000; d.budgets[ex('Yeme İçme')] = 2500; d.budgets[ex('Eğlence')] = 1500; d.budgets[ex('Giyim')] = 2000; d.budgets[ex('Faturalar')] = 2500;
  commit();
  toast('Örnek veriler yüklendi');
}

/* ---------- Güvenlik: isteğe bağlı kilit ve tutar gizleme ---------- */
const ICON = {
  eye: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1"/><path d="M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
};
const LOCK_ITER = 210000;
const SEC = { fails: 0, until: 0, bio: null };
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const lockWord = t => t === 'pin' ? 'PIN' : 'parola';

// PIN ya da parola düz metin olarak saklanmaz; PBKDF2 ile türetilmiş özeti tutulur
async function deriveHash(secret, saltB64, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, key, 256);
  return b64(bits);
}
async function makeLock(type, secret, bio) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return { type, salt, iter: LOCK_ITER, hash: await deriveHash(secret, salt, LOCK_ITER), bio: !!bio };
}
function sameStr(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function checkSecret(secret) {
  const l = S.data.settings.lock;
  if (!l) return true;
  return sameStr(await deriveHash(secret, l.salt, l.iter), l.hash);
}
function validSecret(type, v) { return type === 'pin' ? /^\d{4,8}$/.test(v) : v.length >= 6; }

function applySecurityUI() {
  const s = S.data.settings;
  document.body.classList.toggle('hide-amounts', !!s.hideAmounts);
  $$('[data-action=toggle-hide]').forEach(b => {
    b.innerHTML = s.hideAmounts ? ICON.eyeOff : ICON.eye;
    b.classList.toggle('on', !!s.hideAmounts);
    b.title = s.hideAmounts ? 'Tutarları göster (H)' : 'Tutarları gizle (H)';
  });
  $$('.lock-btn').forEach(b => { b.innerHTML = ICON.lock; b.hidden = !s.lock; });
}
function toggleHide() {
  S.data.settings.hideAmounts = !S.data.settings.hideAmounts;
  persist(); applySecurityUI();
  toast(S.data.settings.hideAmounts ? 'Tutarlar gizlendi' : 'Tutarlar gösteriliyor');
}

function lockApp() {
  const l = S.data.settings.lock;
  if (!l) return;
  S.locked = true;
  if ($('#modal').open) $('#modal').close();
  document.body.classList.add('locked');
  $('#lock').hidden = false;
  $('#lockHint').textContent = l.type === 'pin' ? 'Devam etmek için PIN\'ini gir' : 'Devam etmek için parolanı gir';
  const inp = $('#lockInput');
  inp.value = '';
  inp.inputMode = l.type === 'pin' ? 'numeric' : 'text';
  inp.placeholder = l.type === 'pin' ? 'PIN' : 'Parola';
  inp.maxLength = l.type === 'pin' ? 8 : 200;
  $('#lockMsg').textContent = '';
  $('#lockForgot').textContent = l.type === 'pin' ? 'PIN\'imi unuttum' : 'Parolamı unuttum';
  const bioBtn = $('#lockBio');
  bioBtn.hidden = !(l.bio && SEC.bio);
  if (SEC.bio) bioBtn.textContent = `${SEC.bio} ile aç`;
  setTimeout(() => inp.focus(), 60);
  if (l.bio && SEC.bio) setTimeout(tryBio, 350);
}
function unlockApp() {
  S.locked = false; SEC.fails = 0;
  document.body.classList.remove('locked');
  $('#lock').hidden = true;
  const cb = S.onUnlock; S.onUnlock = null; cb?.();
}
async function tryBio() {
  if (!S.locked) return;
  try { if (await api.bioPrompt?.('Kuruşu Kuruşuna kilidini aç')) unlockApp(); } catch { /* kullanıcı vazgeçti */ }
}
$('#lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#lockMsg'), inp = $('#lockInput');
  const wait = SEC.until - Date.now();
  if (wait > 0) { msg.textContent = `Çok fazla yanlış deneme. ${Math.ceil(wait / 1000)} saniye bekle.`; return; }
  const v = inp.value;
  if (!v) return;
  if (await checkSecret(v)) return unlockApp();
  SEC.fails++;
  inp.value = '';
  const box = $('.lock-box'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
  const word = lockWord(S.data.settings.lock.type);
  if (SEC.fails >= 5) {
    const secs = 30 * Math.pow(2, Math.min(SEC.fails - 5, 5));
    SEC.until = Date.now() + secs * 1000;
    msg.textContent = `Çok fazla yanlış deneme. ${secs} saniye bekle.`;
  } else msg.textContent = `Yanlış ${word}. ${5 - SEC.fails} deneme hakkın kaldı.`;
});
$('#lockBio').addEventListener('click', tryBio);
$('#lockForgot').addEventListener('click', () => {
  const word = lockWord(S.data.settings.lock?.type);
  openModal({
    title: `${word[0].toLocaleUpperCase('tr') + word.slice(1)} unutuldu`, submit: 'Verileri sil ve kilidi kaldır', danger: true,
    body: `<p style="margin:0">Güvenlik gereği ${word} sıfırlanamaz. Kilidi kaldırmanın tek yolu bu cihazdaki verileri silmek.</p>
      <p class="muted" style="margin:0">Daha önce aldığın bir yedek dosyan varsa, sildikten sonra Ayarlar'dan geri yükleyebilirsin. Yedekler kilit bilgisi taşımaz.</p>
      <p style="margin:0">Onaylamak için kutuya <b>SİL</b> yaz.</p><input class="input" name="confirm" autocomplete="off" required>`,
    onSubmit: f => {
      if (val(f, 'confirm').trim().toLocaleUpperCase('tr') !== 'SİL') return fieldError(f, 'confirm', 'Onay için SİL yaz');
      S.data = defaultData(); S.view = 'ozet'; persist(); unlockApp(); render(); toast('Veriler silindi, kilit kaldırıldı');
    }
  });
});

// Kilit kurma ve değiştirme formu
function lockSetupForm() {
  const bioRow = SEC.bio ? `<label class="check"><input type="checkbox" name="bio" checked> ${esc(SEC.bio)} ile de açılabilsin</label>` : '';
  openModal({
    title: 'Uygulama kilidi',
    body: `<div class="seg seg-neutral">
        <input type="radio" name="ltype" id="ltPin" value="pin" checked><label for="ltPin">PIN</label>
        <input type="radio" name="ltype" id="ltPass" value="password"><label for="ltPass">Parola</label>
      </div>
      <p class="muted" id="lockRule" style="margin:0;font-size:12.5px">4 ile 8 haneli bir sayı.</p>
      <label class="field"><span id="lockL1">Yeni PIN</span><input class="input" name="s1" type="password" inputmode="numeric" autocomplete="new-password" required autofocus></label>
      <label class="field"><span id="lockL2">Yeni PIN (tekrar)</span><input class="input" name="s2" type="password" inputmode="numeric" autocomplete="new-password" required></label>
      ${bioRow}
      <p class="muted" style="margin:0;font-size:12.5px">Unutursan kilidi açmanın tek yolu bu cihazdaki verileri silmek. Kurmadan önce Ayarlar'dan yedek almanı öneririm.</p>`,
    submit: 'Kilidi kur',
    onOpen: f => {
      const upd = () => {
        const pin = val(f, 'ltype') === 'pin';
        $('#lockRule').textContent = pin ? '4 ile 8 haneli bir sayı.' : 'En az 6 karakter.';
        $('#lockL1').textContent = pin ? 'Yeni PIN' : 'Yeni parola';
        $('#lockL2').textContent = pin ? 'Yeni PIN (tekrar)' : 'Yeni parola (tekrar)';
        f.elements.s1.inputMode = f.elements.s2.inputMode = pin ? 'numeric' : 'text';
      };
      $$('input[name=ltype]', f).forEach(r => r.addEventListener('change', upd));
    },
    onSubmit: f => {
      const type = val(f, 'ltype'), s1 = val(f, 's1'), s2 = val(f, 's2');
      if (!validSecret(type, s1)) return fieldError(f, 's1', type === 'pin' ? 'PIN 4 ile 8 haneli bir sayı olmalı' : 'Parola en az 6 karakter olmalı');
      if (s1 !== s2) return fieldError(f, 's2', 'İkisi aynı değil');
      const bio = !!f.elements.bio?.checked;
      makeLock(type, s1, bio).then(l => { S.data.settings.lock = l; commit(); toast(type === 'pin' ? 'PIN kilidi kuruldu' : 'Parola kilidi kuruldu'); });
    }
  });
}
// Değiştirme ya da kaldırma için önce mevcut PIN/parola sorulur
function verifyThen(title, next) {
  const l = S.data.settings.lock;
  openModal({
    title, submit: 'Devam',
    body: `<label class="field"><span>Mevcut ${lockWord(l.type)}</span><input class="input" name="cur" type="password" inputmode="${l.type === 'pin' ? 'numeric' : 'text'}" autocomplete="current-password" required autofocus></label>`,
    onSubmit: f => {
      checkSecret(val(f, 'cur')).then(ok => {
        if (!ok) return fieldError(f, 'cur', `Yanlış ${lockWord(l.type)}`);
        next();
      });
      return false;
    }
  });
}

// Yedeklerde kilit bilgisi taşınmaz; kilit her cihazın kendine ait
function exportable() {
  const c = JSON.parse(JSON.stringify(S.data));
  delete c.settings.lock; delete c.settings.lastNotified;
  return c;
}

/* ---------- Olaylar ---------- */
document.addEventListener('click', async e => {
  const goto = e.target.closest('[data-goto]');
  if (goto) { S.view = goto.dataset.goto; render(); return; }
  if (S.locked) return;
  const nav = e.target.closest('[data-view]');
  if (nav) { S.view = nav.dataset.view; $('#main').scrollTop = 0; window.scrollTo(0, 0); render(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action, id = el.dataset.id, d = S.data;
  const findTx = () => d.transactions.find(t => t.id === id);
  const findRec = () => d.recurring.find(r => r.id === id);
  const findGoal = () => d.goals.find(g => g.id === id);

  switch (a) {
    case 'new-income': return txForm(null, 'income');
    case 'quick-add': return txForm(null, 'expense');
    case 'toggle-hide': return toggleHide();
    case 'lock-now': return lockApp();
    case 'lock-setup': return lockSetupForm();
    case 'lock-change': return verifyThen('Kilidi değiştir', lockSetupForm);
    case 'lock-remove': return verifyThen('Kilidi kaldır', () => { S.data.settings.lock = null; $('#modal').close(); commit(); toast('Kilit kaldırıldı'); });
    case 'new-expense': return txForm(null, 'expense');
    case 'edit-tx': return txForm(findTx());
    case 'del-tx': {
      const t = findTx();
      // Düzenli ödemeden gelen son kayıt silinirse ödemenin tarihi de eski haline döner
      const rec = t.recurringId && t.recPrev ? d.recurring.find(r => r.id === t.recurringId && r.lastPayTx === t.id) : null;
      const extra = rec ? `<br><span class="muted">"${esc(rec.name)}" düzenli ödemesi de ödenmemiş sayılır, tarihi ${fmtDate(t.recPrev.nextDate)} olarak geri alınır.</span>` : '';
      if (await confirmBox('İşlemi sil', `${fmtDate(t.date)} tarihli <b>${money(t.amount)}</b> tutarındaki kayıt silinsin mi?${extra}`)) {
        if (rec) { rec.nextDate = t.recPrev.nextDate; rec.remaining = t.recPrev.remaining; rec.lastPayTx = null; }
        d.transactions = d.transactions.filter(x => x.id !== id); commit(); toast(rec ? 'Silindi, ödeme geri alındı' : 'Silindi');
      }
      return;
    }
    case 'month-prev': case 'month-next': case 'month-today': {
      const k = el.dataset.key === 'tx' ? 'tx' : null;
      const cur = k ? S.tx.month : S.month;
      const nv = a === 'month-today' ? monthOf(todayStr()) : shiftMonth(cur, a === 'month-prev' ? -1 : 1);
      if (k) S.tx.month = nv; else S.month = nv;
      return render();
    }
    case 'year-prev': S.year--; return render();
    case 'year-next': S.year++; return render();
    case 'clear-filters': S.tx = { ...S.tx, type: 'all', cat: 'all', method: 'all', q: '' }; return render();
    case 'export-csv': case 'export-csv-all': {
      const list = a === 'export-csv' ? filteredTx() : [...d.transactions].sort((x, y) => x.date.localeCompare(y.date));
      if (!list.length) return toast('Dışa aktarılacak işlem yok');
      const name = a === 'export-csv' && S.tx.month !== 'all' ? `islemler-${S.tx.month}.csv` : 'islemler-tumu.csv';
      if (await api.exportCsv(toCsv(list), name)) toast('CSV kaydedildi');
      return;
    }

    case 'new-rec': return recForm();
    case 'edit-rec': return recForm(findRec());
    case 'pay': return payRec(findRec());
    case 'skip-rec': { const r = findRec(); advanceRec(r); r.lastPayTx = null; commit(); return toast(r.nextDate ? `Atlandı. Sonraki: ${fmtDate(r.nextDate)}` : 'Atlandı'); }
    case 'toggle-rec': { const r = findRec(); r.active = r.active === false; return commit(); }
    case 'del-rec': {
      const r = findRec();
      if (await confirmBox('Düzenli ödemeyi sil', `<b>${esc(r.name)}</b> silinsin mi? Daha önce kaydedilmiş işlemler silinmez.`)) {
        d.recurring = d.recurring.filter(x => x.id !== id); commit();
      }
      return;
    }

    case 'new-goal': return goalForm();
    case 'edit-goal': return goalForm(findGoal());
    case 'contrib': return contribForm(findGoal(), 1);
    case 'withdraw': return contribForm(findGoal(), -1);
    case 'goal-history': return goalHistory(findGoal());
    case 'del-contrib': {
      const g = d.goals.find(x => x.id === el.dataset.goal);
      g.contributions = g.contributions.filter(c => c.id !== id);
      persist(); render(); goalHistory(g);
      return;
    }
    case 'del-goal': {
      const g = findGoal();
      if (await confirmBox('Hedefi sil', `<b>${esc(g.name)}</b> hedefi ve içindeki ${money(goalSaved(g))} tutarındaki birikim kaydı silinsin mi? Bu tutar bakiyeye geri döner.`)) {
        d.goals = d.goals.filter(x => x.id !== id); commit();
      }
      return;
    }

    case 'add-cat': {
      const type = el.dataset.type;
      return openModal({
        title: type === 'income' ? 'Yeni gelir kategorisi' : 'Yeni gider kategorisi',
        body: '<label class="field"><span>Ad</span><input class="input" name="name" required autofocus></label>',
        onSubmit: f => {
          const name = val(f, 'name').trim();
          if (allCats().some(c => c.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) return fieldError(f, 'name', 'Bu adda bir kategori zaten var');
          d.categories[type].push({ id: uid(), name, color: PALETTE[d.categories[type].length % PALETTE.length] }); commit();
        }
      });
    }
    case 'rename-cat': {
      const c = allCats().find(x => x.id === id);
      return openModal({
        title: 'Kategoriyi yeniden adlandır',
        body: `<label class="field"><span>Ad</span><input class="input" name="name" value="${esc(c.name)}" required autofocus></label>`,
        onSubmit: f => {
          const name = val(f, 'name').trim();
          if (allCats().some(x => x.id !== c.id && x.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) return fieldError(f, 'name', 'Bu adda bir kategori zaten var');
          c.name = name; commit();
        }
      });
    }
    case 'del-cat': {
      const type = el.dataset.type, list = d.categories[type];
      if (list.length <= 1) return toast('En az bir kategori kalmalı');
      const c = list.find(x => x.id === id);
      const used = d.transactions.filter(t => t.categoryId === id).length + d.recurring.filter(r => r.categoryId === id).length;
      const others = list.filter(x => x.id !== id);
      if (!used) {
        if (await confirmBox('Kategoriyi sil', `<b>${esc(c.name)}</b> silinsin mi?`)) { d.categories[type] = others; delete d.budgets[id]; commit(); }
        return;
      }
      return openModal({
        title: 'Kategoriyi sil', submit: 'Taşı ve sil', danger: true,
        body: `<p style="margin:0"><b>${esc(c.name)}</b> kategorisinde ${used} kayıt var. Bu kayıtlar hangi kategoriye taşınsın?</p>
          <label class="field"><span>Hedef kategori</span><select class="input" name="to">${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></label>`,
        onSubmit: f => {
          const to = val(f, 'to');
          d.transactions.forEach(t => { if (t.categoryId === id) t.categoryId = to; });
          d.recurring.forEach(r => { if (r.categoryId === id) r.categoryId = to; });
          d.categories[type] = others; delete d.budgets[id]; commit();
        }
      });
    }
    case 'add-method':
      return openModal({
        title: 'Yeni ödeme yöntemi',
        body: '<label class="field"><span>Ad</span><input class="input" name="name" placeholder="Örn. Yemek kartı" required autofocus></label>',
        onSubmit: f => { const n = val(f, 'name').trim(); if (!d.methods.includes(n)) d.methods.push(n); commit(); }
      });
    case 'del-method': d.methods.splice(Number(el.dataset.i), 1); return commit();

    case 'backup': if (await api.exportJson(exportable())) toast('Yedek kaydedildi'); return;
    case 'restore': {
      const imported = await api.importJson();
      if (!imported) return;
      if (!imported.transactions || !imported.categories) return toast('Bu dosya geçerli bir yedek değil');
      if (await confirmBox('Yedekten geri yükle', `Yedekte ${imported.transactions.length} işlem var. Mevcut verilerin yerine yüklensin mi?`, 'Geri yükle')) {
        const keep = { lock: S.data.settings.lock, hideAmounts: S.data.settings.hideAmounts };
        S.data = normalize(imported); Object.assign(S.data.settings, keep); commit(); toast('Yedek yüklendi');
      }
      return;
    }
    case 'open-folder': return api.openDataFolder();
    case 'open-repo': return api.openUrl(REPO_URL);
    case 'check-update': S.update = { status: 'checking' }; refreshUpdateUI(); return api.checkUpdate();
    case 'install-update':
      if (S.update.status === 'downloading') return toast('Güncelleme hâlâ iniyor, bitince kurabilirsin');
      if (S.update.status === 'ready') toast('Kuruluyor, program birazdan yeniden açılacak');
      return api.installUpdate();
    case 'load-sample': return loadSample();
    case 'clear-sample':
      d.transactions = d.transactions.filter(t => !t.sample);
      d.recurring = d.recurring.filter(r => !r.sample);
      d.goals = d.goals.filter(g => !g.sample);
      commit(); return toast('Örnek veriler silindi');
    case 'wipe':
      return openModal({
        title: 'Tüm verileri sil', submit: 'Her şeyi sil', danger: true,
        body: '<p style="margin:0">Tüm işlemler, düzenli ödemeler, hedefler ve ayarlar silinecek. Onaylamak için kutuya <b>SİL</b> yaz.</p><input class="input" name="confirm" autocomplete="off" required>',
        onSubmit: f => {
          if (val(f, 'confirm').trim().toLocaleUpperCase('tr') !== 'SİL') return fieldError(f, 'confirm', 'Onay için SİL yaz');
          S.data = defaultData(); S.view = 'ozet'; commit(); toast('Tüm veriler silindi');
        }
      });
  }
});

window.addEventListener('kk-back', e => {
  if (S.locked) return;
  if ($('#modal').open) { $('#modal').close(); e.preventDefault(); return; }
  if (S.view !== 'ozet') { S.view = 'ozet'; render(); e.preventDefault(); }
});

document.addEventListener('keydown', e => {
  if (S.locked || $('#modal').open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
  const k = e.key.toLocaleLowerCase('tr');
  if (k === 'g') { e.preventDefault(); txForm(null, 'income'); }
  else if (k === 'n') { e.preventDefault(); txForm(null, 'expense'); }
  else if (k === 'h') { e.preventDefault(); toggleHide(); }
});

/* ---------- Başlangıç ---------- */
function startupReminder() {
  const s = S.data.settings, t = todayStr();
  if (s.lastNotified === t) return;
  const due = dueList(s.reminderDays || 3).filter(r => r.type !== 'income');
  if (!due.length) return;
  const late = due.filter(r => daysUntil(r.nextDate) < 0).length;
  const showAmt = !s.hideAmounts && !s.lock;
  const body = due.slice(0, 4).map(r => `${r.name}${showAmt ? ': ' + money(r.amount) : ''} (${daysUntil(r.nextDate) < 0 ? 'gecikti' : daysUntil(r.nextDate) === 0 ? 'bugün' : fmtDate(r.nextDate)})`).join('\n');
  api.notify(late ? `${late} gecikmiş ödemen var` : `${due.length} ödeme yaklaşıyor`, body).catch(() => {});
  s.lastNotified = t;
  persist();
}

(async function init() {
  let loaded = null;
  try { loaded = await api.load(); } catch { /* ilk açılış */ }
  S.data = normalize(loaded);
  if (!loaded) persist();
  try { S.version = (await api.info()).version; } catch { }
  try { const b = await api.bioAvailable?.(); SEC.bio = b && b.available ? b.label : null; } catch { }
  render();
  if (S.data.settings.lock) lockApp();
  // Telefonda uygulama bir dakikadan uzun arka planda kalırsa yeniden kilitlenir
  api.onResume?.(away => { if (away > 60000 && S.data.settings.lock && !S.locked) lockApp(); });
  api.onUpdate?.(st => {
    const was = S.update.status;
    S.update = st; refreshUpdateUI();
    if (st.status === 'ready' && was !== 'ready') toast(`${st.version} sürümü hazır`);
  });
  api.updateState?.().then(st => { if (st) { S.update = st; refreshUpdateUI(); } }).catch(() => {});
  if (S.locked) S.onUnlock = () => setTimeout(startupReminder, 800);
  else setTimeout(startupReminder, 1200);
  // Uygulama gün boyu açık kalırsa gün değişiminde ekranı ve hatırlatmayı yenile
  let curDay = todayStr();
  setInterval(() => { if (todayStr() !== curDay) { curDay = todayStr(); render(); startupReminder(); } }, 60000);
})();
