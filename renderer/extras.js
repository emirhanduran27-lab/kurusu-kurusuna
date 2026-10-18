'use strict';
/* Kuruşu Kuruşuna — döviz ve altın, hızlı şablonlar, bütçe aşımı uyarısı */

/* ---------- Döviz ve altın ---------- */
// Altın türleri: içerdiği saf (24 ayar) altın gramı. Çeyrek/yarım/tam piyasada işçilik farkıyla biraz daha pahalı olabilir, kur elle düzeltilebilir.
const ASSET_TYPES = {
  USD: { name: 'Dolar', unit: '$', icon: '💵', kind: 'fx' },
  EUR: { name: 'Euro', unit: '€', icon: '💶', kind: 'fx' },
  GBP: { name: 'Sterlin', unit: '£', icon: '💷', kind: 'fx' },
  CHF: { name: 'İsviçre frangı', unit: 'CHF', icon: '🇨🇭', kind: 'fx' },
  GA: { name: 'Gram altın (24 ayar)', unit: 'gr', icon: '🥇', kind: 'gold', pure: 1 },
  G22: { name: '22 ayar altın (bilezik)', unit: 'gr', icon: '📿', kind: 'gold', pure: 0.916 },
  CEYREK: { name: 'Çeyrek altın', unit: 'adet', icon: '🪙', kind: 'gold', pure: 1.6065 },
  YARIM: { name: 'Yarım altın', unit: 'adet', icon: '🪙', kind: 'gold', pure: 3.213 },
  TAM: { name: 'Tam altın', unit: 'adet', icon: '🪙', kind: 'gold', pure: 6.426 },
  CUMHURIYET: { name: 'Cumhuriyet altını', unit: 'adet', icon: '🏅', kind: 'gold', pure: 6.615 },
  GUMUS: { name: 'Gram gümüş', unit: 'gr', icon: '🥈', kind: 'silver' }
};
const OZ = 31.1034768;
const RATE_TTL = 30 * 60 * 1000;

// Uygulamanın para biriminde 1 birimin fiyatı
function assetRate(type) {
  const s = S.data.settings, r = s.rates, ov = s.rateOverride?.[type];
  if (ov > 0) return ov;
  if (!r?.TRY) return 0;
  const tryPer = cur => cur === 'TRY' ? 1 : cur === 'USD' ? r.TRY : r[cur] ? r.TRY / r[cur] : 0;
  const t = ASSET_TYPES[type];
  let inTry = 0;
  if (t.kind === 'fx') inTry = tryPer(type);
  else if (t.kind === 'gold' && r.XAU) inTry = r.XAU / OZ * r.TRY * t.pure;
  else if (t.kind === 'silver' && r.XAG) inTry = r.XAG / OZ * r.TRY;
  const div = tryPer(s.currency || 'TRY');
  return div ? round2(inTry / div * 100) / 100 : 0;
}
async function refreshRates(force = false) {
  const s = S.data.settings;
  if (!force && s.rates?.at && Date.now() - s.rates.at < RATE_TTL) return false;
  if (!api.httpGet) return false;
  try {
    const [fx, xau, xag] = await Promise.all([
      api.httpGet('https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY,EUR,GBP,CHF'),
      api.httpGet('https://api.gold-api.com/price/XAU').catch(() => null),
      api.httpGet('https://api.gold-api.com/price/XAG').catch(() => null)
    ]);
    const rates = { at: Date.now(), date: fx.date, ...fx.rates };
    if (xau?.price > 0) rates.XAU = xau.price;
    if (xag?.price > 0) rates.XAG = xag.price;
    if (!(rates.TRY > 0)) throw new Error('kur yok');
    s.rates = rates; persist();
    if (S.view === 'varliklar' || S.view === 'ozet') render();
    return true;
  } catch { if (force) toast('Kurlar alınamadı, internet bağlantını kontrol et'); return false; }
}
function holdings() {
  const h = {};
  for (const l of S.data.assets) {
    const x = h[l.type] ||= { type: l.type, qty: 0, cost: 0, buyQty: 0, lots: [] };
    x.qty = round2((x.qty + l.qty) * 1e4) / 1e4; x.lots.push(l);
    if (l.qty > 0) { x.cost += l.qty * l.price; x.buyQty += l.qty; }
  }
  return Object.values(h).map(x => {
    const avg = x.buyQty ? x.cost / x.buyQty : 0, rate = assetRate(x.type);
    return { ...x, avg, rate, value: round2(x.qty * rate), basis: round2(x.qty * avg), pl: round2(x.qty * (rate - avg)) };
  }).filter(x => x.qty > 0 || x.lots.length);
}
function assetsValue() { return round2(holdings().reduce((s, x) => s + x.value, 0)); }
const fmtQty = (q, type) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: ASSET_TYPES[type].kind === 'fx' ? 2 : 3 }).format(q) + ' ' + ASSET_TYPES[type].unit;

VIEWS.varliklar = () => {
  const r = S.data.settings.rates, hs = holdings().filter(x => x.qty > 0);
  const value = round2(hs.reduce((s, x) => s + x.value, 0)), basis = round2(hs.reduce((s, x) => s + x.basis, 0)), pl = round2(value - basis);
  const show = ['USD', 'EUR', 'GBP', 'GA', 'CEYREK', 'GUMUS'];
  return `<div class="page-head"><h1>Döviz ve Altın</h1><div class="spacer"></div>
    <button class="btn" data-action="rates-refresh">↻ Kurları yenile</button>
    <button class="btn btn-primary" data-action="asset-buy">+ Alış</button></div>
  <div class="card rates">
    ${show.map(t => `<button class="rate" data-action="rate-edit" data-type="${t}" title="Elle düzelt"><span>${ASSET_TYPES[t].icon} ${ASSET_TYPES[t].name.replace(' (24 ayar)', '')}</span><b class="money">${assetRate(t) ? money(assetRate(t)) : '—'}</b>${S.data.settings.rateOverride?.[t] ? '<small>elle</small>' : ''}</button>`).join('')}
    <div class="rate-src muted">${r?.at ? `Güncelleme ${new Date(r.at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · Döviz: ECB (${fmtDate(r.date)}), altın ve gümüş: gold-api.com` : 'Kurlar henüz alınmadı.'} Kura dokunarak elle düzeltebilirsin.</div>
  </div>
  <div class="grid g3 mt">
    <div class="card stat"><div class="label">Toplam değer</div><div class="value sav">${money(value)}</div><div class="sub">Güncel kurla</div></div>
    <div class="card stat"><div class="label">Toplam maliyet</div><div class="value">${money(basis)}</div><div class="sub">Ortalama alış fiyatıyla</div></div>
    <div class="card stat"><div class="label">Kâr / zarar</div><div class="value ${pl < 0 ? 'neg' : 'pos'}">${pl >= 0 ? '+' : ''}${money(pl)}</div><div class="sub">${basis ? `%${(pl / basis * 100).toFixed(1).replace('.', ',')}` : '—'}</div></div>
  </div>
  ${hs.length ? `<div class="grid g3 mt">${hs.map(x => `<div class="card goal">
      <div class="goal-top"><span class="acc-ico">${ASSET_TYPES[x.type].icon}</span><div class="name">${ASSET_TYPES[x.type].name}</div></div>
      <div class="goal-amt">${fmtQty(x.qty, x.type)}</div>
      <div class="facts">
        <div>Güncel değer<br><b>${money(x.value)}</b></div>
        <div>Kâr / zarar<br><b class="${x.pl < 0 ? 'neg' : 'pos'}">${x.pl >= 0 ? '+' : ''}${money(x.pl)}</b></div>
        <div>Ortalama alış<br><b>${money(x.avg)}</b></div>
        <div>Güncel kur<br><b>${x.rate ? money(x.rate) : '—'}</b></div>
      </div>
      <div class="btns">
        <button class="btn btn-sm btn-income" data-action="asset-buy" data-type="${x.type}">+ Alış</button>
        <button class="btn btn-sm" data-action="asset-sell" data-type="${x.type}">− Satış</button>
        <button class="btn btn-sm btn-ghost" data-action="asset-history" data-type="${x.type}">Geçmiş</button>
      </div></div>`).join('')}</div>`
    : `<div class="card empty mt">Elindeki dolar, euro, gram ya da çeyrek altını ekle, güncel kurla değerini ve kâr/zararını gör.<br>Önceden aldıkların için "Hesaplara yansımasın" seçebilirsin.<br><button class="btn btn-primary" data-action="asset-buy">+ Alış ekle</button></div>`}`;
};
AFTER.varliklar = () => { refreshRates(); };

function assetForm(sell, type) {
  const held = type ? (holdings().find(x => x.type === type)?.qty || 0) : 0;
  openModal({
    title: sell ? 'Satış' : 'Alış',
    body: `<label class="field"><span>Ne</span><select class="input" name="atype" ${sell ? 'disabled' : ''}>${Object.entries(ASSET_TYPES).map(([k, v]) => `<option value="${k}" ${k === (type || 'GA') ? 'selected' : ''}>${v.icon} ${v.name}</option>`).join('')}</select></label>
      <div class="fields-2">
        <label class="field"><span>Miktar ${sell ? `(elinde ${fmtQty(held, type)})` : ''}</span><input class="input amount-input" name="qty" inputmode="decimal" placeholder="0" required autofocus></label>
        <label class="field"><span>Birim fiyat</span><input class="input" name="price" inputmode="decimal" value="${amountToInput(assetRate(type || 'GA'))}" required></label>
      </div>
      <div class="fields-2">
        <label class="field"><span>Tarih</span><input class="input" type="date" name="date" value="${todayStr()}" required></label>
        <label class="field"><span>${sell ? 'Para hangi hesaba girdi' : 'Hangi hesaptan ödendi'}</span><select class="input" name="accountId"><option value="">Hesaplara yansımasın</option>${S.data.accounts.filter(a => !a.archived).map(a => `<option value="${a.id}" ${a.id === accountSelectDefault() ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      </div>
      <div class="muted" id="assetTotal" style="font-size:13px"></div>`,
    submit: sell ? 'Satışı kaydet' : 'Alışı kaydet',
    onOpen: f => {
      const upd = () => { const q = parseAmount(val(f, 'qty')), p = parseAmount(val(f, 'price')); $('#assetTotal', f).textContent = q > 0 && p > 0 ? `Toplam: ${money(q * p)}` : ''; };
      f.elements.atype.addEventListener('change', () => { f.elements.price.value = amountToInput(assetRate(val(f, 'atype'))); upd(); });
      f.elements.qty.addEventListener('input', upd); f.elements.price.addEventListener('input', upd);
    },
    onSubmit: f => {
      const t = type || val(f, 'atype'), qty = parseAmount(val(f, 'qty')), price = parseAmount(val(f, 'price'));
      if (!(qty > 0)) return fieldError(f, 'qty', 'Geçerli bir miktar gir');
      if (!(price > 0)) return fieldError(f, 'price', 'Geçerli bir fiyat gir');
      if (sell && qty > held + 1e-9) return fieldError(f, 'qty', `En fazla ${fmtQty(held, t)} satabilirsin`);
      S.data.assets.push({ id: uid(), created: Date.now(), type: t, qty: sell ? -qty : qty, price, date: val(f, 'date'), accountId: val(f, 'accountId') || null });
      commit(); toast(sell ? 'Satış kaydedildi' : 'Alış kaydedildi');
    }
  });
}
function assetHistory(type) {
  const list = S.data.assets.filter(l => l.type === type).sort((a, b) => b.date.localeCompare(a.date));
  openModal({
    title: `${ASSET_TYPES[type].name} · geçmiş`, noFoot: true,
    body: `<div class="list">${list.map(l => `<div class="row"><div class="main-col"><div class="title">${l.qty > 0 ? 'Alış' : 'Satış'} · ${fmtQty(Math.abs(l.qty), type)}</div>
      <div class="meta">${fmtDate(l.date)} · birim ${money(l.price)}${l.accountId ? ' · ' + esc(accName(l.accountId)) : ''}</div></div>
      <div class="amt ${l.qty > 0 ? 'neg' : 'pos'}">${money(Math.abs(l.qty) * l.price)}</div>
      <button type="button" class="icon-btn danger" data-action="asset-del" data-id="${l.id}" data-type="${type}" title="Sil">🗑</button></div>`).join('')}</div>`
  });
}
function rateEditForm(type) {
  const cur = S.data.settings.rateOverride?.[type];
  openModal({
    title: `${ASSET_TYPES[type].name} kuru`,
    body: `<p class="muted" style="margin:0;font-size:13px">Otomatik kur yerine kendi fiyatını kullanmak istersen yaz, örneğin kuyumcunun çeyrek fiyatı. Boş bırakırsan otomatik kur kullanılır.</p>
      <label class="field"><span>Birim fiyat</span><input class="input" name="v" inputmode="decimal" value="${cur ? amountToInput(cur) : ''}" placeholder="Otomatik" autofocus></label>`,
    onSubmit: f => {
      const v = parseAmount(val(f, 'v')), s = S.data.settings;
      s.rateOverride = { ...(s.rateOverride || {}) };
      if (v > 0) s.rateOverride[type] = v; else delete s.rateOverride[type];
      commit();
    }
  });
}

/* ---------- Hızlı şablonlar ---------- */
function templateChips() {
  const list = S.data.templates;
  if (!list.length) return '';
  return `<div class="tpl-row">${list.map(t => `<button class="tpl-chip ${t.type}" data-action="use-tpl" data-id="${t.id}" title="${esc(catById(t.categoryId).name)} · ${esc(accName(t.accountId))}">
    <span class="dot" style="background:${catById(t.categoryId).color}"></span>${esc(t.name)} <b class="money">${money(t.amount, { noDec: t.amount % 1 === 0 })}</b></button>`).join('')}
    <button class="tpl-chip ghost" data-goto="ayarlar" title="Şablonları düzenle">✎</button></div>`;
}
function useTemplate(t) {
  const tx = { id: uid(), created: Date.now(), type: t.type, amount: t.amount, date: todayStr(), categoryId: t.categoryId, accountId: t.accountId, note: t.note || t.name, fromTpl: t.id };
  S.data.transactions.push(tx); commit();
  toast(`${t.name} eklendi`, 'Geri al', () => { S.data.transactions = S.data.transactions.filter(x => x.id !== tx.id); commit(); toast('Geri alındı'); });
}
function templateForm(existing, seed) {
  const t = existing || seed || { name: '', type: 'expense', amount: '', categoryId: '', accountId: '', note: '' };
  openModal({
    title: existing ? 'Şablonu düzenle' : 'Yeni şablon',
    body: `${typeSeg(t.type)}
      <div class="fields-2">
        <label class="field"><span>Kısa ad</span><input class="input" name="name" value="${esc(t.name)}" placeholder="Örn. Kahve, Otobüs" maxlength="24" required autofocus></label>
        <label class="field"><span>Tutar</span><input class="input" name="amount" inputmode="decimal" value="${amountToInput(t.amount)}" required></label>
      </div>
      <div class="fields-2">
        <label class="field"><span>Kategori</span>${catSelect(t.type, t.categoryId)}</label>
        <label class="field"><span>Hesap</span>${accountSelect(t.accountId)}</label>
      </div>
      ${existing ? `<button type="button" class="btn btn-ghost neg" data-action="tpl-del" data-id="${t.id}" style="justify-self:start">Şablonu sil</button>` : ''}`,
    onOpen: bindTypeSwitch,
    onSubmit: f => {
      const amount = parseAmount(val(f, 'amount'));
      if (!(amount > 0)) return fieldError(f, 'amount', 'Geçerli bir tutar gir');
      const rec = { name: val(f, 'name').trim(), type: val(f, 'type'), amount, categoryId: val(f, 'categoryId'), accountId: val(f, 'accountId'), note: t.note || '' };
      if (existing) Object.assign(existing, rec); else S.data.templates.push({ id: uid(), ...rec });
      commit(); toast('Şablon kaydedildi');
    }
  });
}
function templatesCardHtml() {
  const s = S.data.settings;
  return `<div class="card mt"><h2>Hızlı şablonlar<span class="spacer"></span><button class="btn btn-sm" data-action="tpl-new">+ Ekle</button></h2>
    <p class="muted" style="margin:-4px 0 10px;font-size:12.5px">Sık girdiğin harcamalar Özet ve İşlemler sayfasının üstünde tek dokunuşla eklenir. Yeni gider girerken "Hızlı şablon olarak da kaydet" seçeneğiyle de oluşturabilirsin.</p>
    ${S.data.templates.length ? `<div class="chips">${S.data.templates.map(t => `<span class="chip"><span class="dot" style="background:${catById(t.categoryId).color}"></span>${esc(t.name)} · ${money(t.amount)}<button data-action="tpl-edit" data-id="${t.id}" title="Düzenle">✎</button></span>`).join('')}</div>` : '<div class="muted">Henüz şablon yok.</div>'}
  </div>
  <div class="card mt"><h2>Bütçe uyarıları</h2>
    <div class="set-row"><div class="main-col"><b>Limite yaklaşınca haber ver</b><div class="muted">Bir kategoride aylık limitin %80'ine ve %100'üne ulaşınca bildirim gelir.</div></div>
      <label class="switch"><input type="checkbox" id="sBudgetAlert" ${s.budgetAlerts !== false ? 'checked' : ''}><span></span></label></div>
  </div>`;
}

/* ---------- Bütçe aşımı uyarısı ---------- */
function checkBudgetAlerts() {
  const s = S.data.settings;
  if (s.budgetAlerts === false) return;
  const mk = monthOf(todayStr()), byCat = expenseByCat(mk);
  const done = (s.alerted && s.alerted.m === mk) ? s.alerted : { m: mk, c: {} };
  const msgs = [];
  for (const [cid, lim] of Object.entries(S.data.budgets)) {
    if (!(lim > 0)) continue;
    const p = (byCat[cid] || 0) / lim * 100, lvl = p >= 100 ? 100 : p >= 80 ? 80 : 0, prev = done.c[cid] || 0;
    if (lvl > prev) {
      const c = catById(cid);
      msgs.push(lvl === 100 ? `${c.name} bütçesi aşıldı (%${Math.round(p)})` : `${c.name} bütçesinin %${Math.round(p)}'i harcandı`);
      done.c[cid] = lvl;
    }
  }
  if (!msgs.length) { if (!s.alerted || s.alerted.m !== mk) { s.alerted = done; } return; }
  s.alerted = done;
  api.alert?.('Bütçe uyarısı', msgs.join('\n'))?.catch?.(() => {});
  toast('⚠ ' + msgs[0] + (msgs.length > 1 ? ` (+${msgs.length - 1})` : ''));
}

/* ---------- Eylemler ---------- */
Object.assign(ACTIONS, {
  'rates-refresh': () => refreshRates(true).then(ok => ok && toast('Kurlar güncellendi')),
  'rate-edit': el => rateEditForm(el.dataset.type),
  'asset-buy': el => assetForm(false, el.dataset.type),
  'asset-sell': el => assetForm(true, el.dataset.type),
  'asset-history': el => assetHistory(el.dataset.type),
  'asset-del': el => { S.data.assets = S.data.assets.filter(l => l.id !== el.dataset.id); persist(); render(); if (S.data.assets.some(l => l.type === el.dataset.type)) assetHistory(el.dataset.type); else $('#modal').close(); },
  'use-tpl': el => useTemplate(S.data.templates.find(t => t.id === el.dataset.id)),
  'tpl-new': () => templateForm(),
  'tpl-edit': el => templateForm(S.data.templates.find(t => t.id === el.dataset.id)),
  'tpl-del': async el => {
    const t = S.data.templates.find(x => x.id === el.dataset.id);
    if (await confirmBox('Şablonu sil', `<b>${esc(t.name)}</b> şablonu silinsin mi? Daha önce eklenen kayıtlar silinmez.`)) { S.data.templates = S.data.templates.filter(x => x.id !== t.id); commit(); }
  }
});
