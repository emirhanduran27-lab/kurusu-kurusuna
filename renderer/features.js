'use strict';
/* Kuruşu Kuruşuna — hesaplar, transferler, kredi kartı, taksit, bölüşme, borç ve alacak.
   app.js'teki yardımcıları (S, money, openModal...) kullanır; boot.js en son yüklenip uygulamayı başlatır. */

const ACC_TYPES = { cash: 'Nakit', bank: 'Banka hesabı', card: 'Kredi kartı', savings: 'Birikim hesabı', other: 'Diğer' };
const ACC_ICON = { cash: '💵', bank: '🏦', card: '💳', savings: '🐷', other: '👛' };
const MORE_VIEWS = ['birikim', 'varliklar', 'butce', 'borclar', 'ayarlar'];

const accById = id => S.data.accounts.find(a => a.id === id);
const accName = id => accById(id)?.name || 'Hesap yok';
const debtPaid = x => round2(x.payments.reduce((s, p) => s + p.amount, 0));
const debtLeft = x => Math.max(0, round2(x.amount - debtPaid(x)));

/* ---------- Bakiye hesapları ---------- */
// Bir hesabın belirli bir güne kadarki bakiyesi (ileri tarihli taksitler sayılmaz)
function accountBalance(acc, upto = todayStr()) {
  const id = acc.id, d = S.data;
  let b = acc.opening || 0;
  for (const t of d.transactions) if (t.accountId === id && t.date <= upto) b += t.type === 'income' ? t.amount : -t.amount;
  for (const t of d.transfers) if (t.date <= upto) { if (t.to === id) b += t.amount; if (t.from === id) b -= t.amount; }
  for (const g of d.goals) for (const c of g.contributions) if (!c.initial && c.accountId === id && c.date <= upto) b -= c.amount;
  for (const l of d.assets) if (l.accountId === id && l.date <= upto) b -= l.qty * l.price;
  for (const x of d.debts) {
    if (x.accountId === id && x.date <= upto) b += x.dir === 'lent' ? -x.amount : x.amount;
    for (const p of x.payments) if (p.accountId === id && p.date <= upto) b += x.dir === 'lent' ? p.amount : -p.amount;
  }
  return round2(b);
}
function dateWithDay(y, m0, day) { return ymd(new Date(y, m0, Math.min(day, lastDay(y, m0)))); }

// Kredi kartı: ekstre, asgari, son ödeme, kullanılabilir limit
function cardInfo(acc) {
  const today = todayStr(), now = parseDate(today);
  const debt = Math.max(0, -accountBalance(acc));
  const future = round2(S.data.transactions.filter(t => t.accountId === acc.id && t.type === 'expense' && t.date > today).reduce((s, t) => s + t.amount, 0));
  const info = { debt, future, available: acc.limit ? round2(acc.limit - debt - future) : null };
  if (!acc.statementDay || !acc.dueDay) return info;
  let stmt = dateWithDay(now.getFullYear(), now.getMonth(), acc.statementDay);
  if (stmt > today) stmt = dateWithDay(now.getFullYear(), now.getMonth() - 1, acc.statementDay);
  const sd = parseDate(stmt);
  const due = acc.dueDay > acc.statementDay
    ? dateWithDay(sd.getFullYear(), sd.getMonth(), acc.dueDay)
    : dateWithDay(sd.getFullYear(), sd.getMonth() + 1, acc.dueDay);
  const nextStmt = dateWithDay(sd.getFullYear(), sd.getMonth() + 1, acc.statementDay);
  const stmtDebt = Math.max(0, -accountBalance(acc, stmt));
  const paidSince = round2(S.data.transfers.filter(t => t.to === acc.id && t.date > stmt && t.date <= today).reduce((s, t) => s + t.amount, 0));
  const remaining = Math.max(0, round2(stmtDebt - paidSince));
  const minPay = remaining > 0 ? Math.max(0, round2(stmtDebt * (acc.minRate || 20) / 100 - paidSince)) : 0;
  const period = round2(S.data.transactions.filter(t => t.accountId === acc.id && t.type === 'expense' && t.date > stmt && t.date <= today).reduce((s, t) => s + t.amount, 0));
  return { ...info, stmt, nextStmt, due, stmtDebt, paidSince, remaining, minPay, period };
}

// Kart son ödemeleri ve vadesi gelen borçlar (hatırlatma ve Özet için)
function extraDueItems(daysAhead = 30) {
  const out = [];
  for (const a of S.data.accounts) {
    if (a.type !== 'card' || a.archived) continue;
    const c = cardInfo(a);
    if (c.remaining > 0 && c.due && daysUntil(c.due) <= daysAhead) out.push({ kind: 'card', id: a.id, name: `${a.name} ekstresi`, amount: c.remaining, date: c.due, color: a.color });
  }
  for (const x of S.data.debts) {
    if (x.dir !== 'owe' || !x.due) continue;
    const left = debtLeft(x);
    if (left > 0 && daysUntil(x.due) <= daysAhead) out.push({ kind: 'debt', id: x.id, name: `${x.person} borcu`, amount: left, date: x.due, color: '#f0b429' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function dateBadge(date) {
  const d = daysUntil(date);
  if (d < 0) return `<span class="badge late">${-d} gün gecikti</span>`;
  if (d === 0) return '<span class="badge late">Bugün</span>';
  if (d <= (S.data.settings.reminderDays || 3)) return `<span class="badge soon">${d} gün kaldı</span>`;
  return `<span class="badge">${d} gün kaldı</span>`;
}
function dueExtraRow(x) {
  return `<div class="row">
    <span class="dot" style="background:${x.color}"></span>
    <div class="main-col"><div class="title">${esc(x.name)}</div><div class="meta">${fmtDate(x.date)} · ${x.kind === 'card' ? 'Son ödeme' : 'Vade'}</div></div>
    ${dateBadge(x.date)}
    <div class="amt neg">${money(x.amount)}</div>
    <button class="btn btn-sm" data-action="${x.kind === 'card' ? 'card-pay' : 'debt-pay'}" data-id="${x.id}">Öde</button>
  </div>`;
}

function debtTotals() {
  let lent = 0, owe = 0;
  for (const x of S.data.debts) { const l = debtLeft(x); if (x.dir === 'lent') lent += l; else owe += l; }
  return { lent: round2(lent), owe: round2(owe) };
}

// Özet sayfasındaki hesaplar ve net varlık kartı
function accountsSummaryCard() {
  const accs = S.data.accounts.filter(a => !a.archived);
  const dt = debtTotals(), saved = totalSaved(), bal = balance(), av = assetsValue();
  const net = round2(bal + saved + av + dt.lent - dt.owe);
  return `<div class="grid g2 mt">
    <div class="card">
      <h2>Hesaplar<span class="spacer"></span><a data-goto="hesaplar">Tümü</a></h2>
      <div class="list">${accs.map(a => {
        const b = accountBalance(a), card = a.type === 'card';
        return `<div class="row">
          <span class="acc-ico">${ACC_ICON[a.type]}</span>
          <div class="main-col"><div class="title">${esc(a.name)}</div><div class="meta">${ACC_TYPES[a.type]}${card && a.limit ? ` · Limit ${money(a.limit, { noDec: true })}` : ''}</div></div>
          <div class="amt ${b < 0 ? 'neg' : ''}">${card && b < 0 ? 'Borç ' + money(-b) : money(b)}</div>
        </div>`;
      }).join('')}</div>
    </div>
    <div class="card">
      <h2>Net varlık</h2>
      <div class="networth">
        <div><span>Hesaplar</span><b class="money">${money(bal)}</b></div>
        <div><span>Birikimler</span><b class="sav money">${money(saved)}</b></div>
        ${av ? `<div><span>Döviz ve altın</span><b class="sav money">${money(av)}</b></div>` : ''}
        <div><span>Alacaklar</span><b class="pos money">${money(dt.lent)}</b></div>
        <div><span>Borçlar</span><b class="neg money">−${money(dt.owe)}</b></div>
        <div class="total"><span>Net varlık</span><b class="money">${money(net)}</b></div>
      </div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">Kredi kartı borçları hesaplar toplamının içinde eksi olarak yer alır.</p>
    </div>
  </div>`;
}

/* ---------- İşlemler listesinde transferler ---------- */
function filteredTransfers() {
  const f = S.tx, q = f.q.trim().toLocaleLowerCase('tr');
  if (f.type !== 'all' && f.type !== 'transfer') return [];
  if (f.cat !== 'all') return [];
  return S.data.transfers.filter(t =>
    (f.month === 'all' || monthOf(t.date) === f.month) &&
    (f.acc === 'all' || t.from === f.acc || t.to === f.acc) &&
    (!q || (t.note || '').toLocaleLowerCase('tr').includes(q) || accName(t.from).toLocaleLowerCase('tr').includes(q) || accName(t.to).toLocaleLowerCase('tr').includes(q))
  );
}
function transferRow(t) {
  return `<tr class="tr-row">
    <td class="c-date">${fmtDate(t.date)}<span class="m-only"> · Transfer</span></td>
    <td class="c-desc">${esc(t.note) || 'Transfer'} <span class="badge">⇄</span><div class="m-only muted" style="font-size:12px;font-weight:400">${esc(accName(t.from))} → ${esc(accName(t.to))}</div></td>
    <td class="col-hide-m muted">Transfer</td>
    <td class="col-hide-m muted">${esc(accName(t.from))} → ${esc(accName(t.to))}</td>
    <td class="num c-amt"><b>${money(t.amount)}</b></td>
    <td class="actions c-act"><button class="icon-btn" data-action="edit-tr" data-id="${t.id}" title="Düzenle">✎</button><button class="icon-btn danger" data-action="del-tr" data-id="${t.id}" title="Sil">🗑</button></td>
  </tr>`;
}

/* ---------- Yeni işlem formunda taksit ve bölüşme ---------- */
function txExtrasHtml() {
  return `<div class="extras" id="txExtras">
    <label class="field" id="instRow" hidden><span>Taksit</span>
      <select class="input" name="inst"><option value="1">Tek çekim</option>${[2, 3, 4, 5, 6, 8, 9, 10, 12, 18, 24].map(n => `<option value="${n}">${n} taksit</option>`).join('')}</select>
    </label>
    <div id="splitWrap">
      <label class="check"><input type="checkbox" name="split"> Başkalarıyla bölüş, payları alacak olarak kaydet</label>
      <div id="splitBox" hidden>
        <p class="muted" style="margin:0;font-size:12.5px">Tutar alanına toplam ödediğin tutarı yaz. Arkadaşlarının payı Borç ve Alacak'a eklenir, gidere sadece senin payın yazılır.</p>
        <div id="splitRows"></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button type="button" class="btn btn-sm" id="splitAdd">+ Kişi ekle</button>
          <button type="button" class="btn btn-sm btn-ghost" id="splitEven">Eşit böl</button>
          <span class="muted" id="splitMine" style="font-size:12.5px"></span>
        </div>
      </div>
    </div>
  </div>`;
}
function splitRowHtml() {
  return `<div class="split-row"><input class="input" name="sp_person" placeholder="Kişi" list="personList"><input class="input" name="sp_amount" inputmode="decimal" placeholder="Payı"><button type="button" class="icon-btn danger" data-sp-del>✕</button></div>`;
}
function bindTxExtras(f) {
  const persons = [...new Set(S.data.debts.map(x => x.person))];
  $('#txExtras', f).insertAdjacentHTML('beforeend', `<datalist id="personList">${persons.map(p => `<option value="${esc(p)}">`).join('')}</datalist>`);
  const box = $('#txExtras', f);
  const upd = () => {
    // Form başka bir içerikle yeniden kullanıldıysa dinleyiciyi bırak
    if (!box.isConnected) { f.removeEventListener('change', upd); f.removeEventListener('input', upd); return; }
    const exp = val(f, 'type') === 'expense';
    const card = accById(val(f, 'accountId'))?.type === 'card';
    $('#instRow', f).hidden = !(exp && card);
    $('#splitWrap', f).hidden = !exp;
    $('#splitBox', f).hidden = !(exp && f.elements.split.checked);
    if (!$('#splitBox', f).hidden && !$('#splitRows', f).children.length) $('#splitRows', f).insertAdjacentHTML('beforeend', splitRowHtml());
    const total = parseAmount(val(f, 'amount')) || 0;
    const shares = $$('[name=sp_amount]', f).reduce((s, i) => s + (parseAmount(i.value) || 0), 0);
    $('#splitMine', f).textContent = total ? `Senin payın: ${money(Math.max(0, total - shares))}` : '';
  };
  f.addEventListener('change', upd);
  f.addEventListener('input', upd);
  $('#splitAdd', f).addEventListener('click', () => { $('#splitRows', f).insertAdjacentHTML('beforeend', splitRowHtml()); upd(); });
  $('#splitEven', f).addEventListener('click', () => {
    const total = parseAmount(val(f, 'amount')) || 0, inputs = $$('[name=sp_amount]', f);
    if (!total || !inputs.length) return;
    const share = Math.floor(total / (inputs.length + 1) * 100) / 100;
    inputs.forEach(i => { i.value = amountToInput(share); }); upd();
  });
  $('#splitRows', f).addEventListener('click', e => { if (e.target.closest('[data-sp-del]')) { e.target.closest('.split-row').remove(); upd(); } });
  upd();
}
function saveTxWithExtras(f, rec) {
  const d = S.data, txId = uid();
  let mine = rec.amount;
  if (rec.type === 'expense' && f.elements.split?.checked) {
    const people = $$('.split-row', f).map(r => ({ person: $('[name=sp_person]', r).value.trim(), amount: parseAmount($('[name=sp_amount]', r).value) })).filter(p => p.person && p.amount > 0);
    const shares = round2(people.reduce((s, p) => s + p.amount, 0));
    if (shares > rec.amount) return fieldError(f, 'amount', 'Payların toplamı tutardan büyük olamaz');
    mine = round2(rec.amount - shares);
    const what = rec.note || catById(rec.categoryId).name;
    people.forEach(p => d.debts.push({ id: uid(), created: Date.now(), person: p.person, dir: 'lent', amount: p.amount, date: rec.date, due: '', accountId: rec.accountId, note: what, payments: [], fromTx: txId }));
    if (people.length) rec.splitTotal = rec.amount;
  }
  rec.amount = mine;
  if (mine <= 0) return true; // tamamı başkaları adına ödendiyse sadece alacak kaydı kalır
  const n = Number(f.elements.inst?.value || 1);
  if (rec.type === 'expense' && n > 1 && accById(rec.accountId)?.type === 'card') {
    const base = Math.floor(mine / n * 100) / 100, g = uid(), anchor = parseDate(rec.date).getDate();
    for (let i = 0; i < n; i++) {
      const amount = i === n - 1 ? round2(mine - base * (n - 1)) : base;
      d.transactions.push({ id: i === 0 ? txId : uid(), created: Date.now(), ...rec, amount, date: addMonths(rec.date, i, anchor), inst: { g, i: i + 1, n, total: mine } });
    }
  } else d.transactions.push({ id: txId, created: Date.now(), ...rec });
  return true;
}
async function deleteInstallments(t) {
  const all = S.data.transactions.filter(x => x.inst?.g === t.inst.g);
  if (await confirmBox('Taksitli alışverişi sil', `Bu kayıt ${t.inst.n} taksitli, toplam <b>${money(t.inst.total)}</b> tutarındaki bir alışverişin parçası. ${all.length} taksidin hepsi silinsin mi?`)) {
    S.data.transactions = S.data.transactions.filter(x => x.inst?.g !== t.inst.g); commit(); toast('Taksitler silindi');
  }
}

/* ---------- Hesaplar sayfası ---------- */
VIEWS.hesaplar = () => {
  const accs = S.data.accounts.filter(a => !a.archived), archived = S.data.accounts.filter(a => a.archived);
  const liquid = round2(accs.filter(a => a.type !== 'card').reduce((s, a) => s + accountBalance(a), 0));
  const cardDebt = round2(accs.filter(a => a.type === 'card').reduce((s, a) => s + Math.max(0, -accountBalance(a)), 0));
  return `<div class="page-head"><h1>Hesaplar</h1><div class="spacer"></div>
    <button class="btn" data-action="new-transfer">⇄ Transfer</button>
    <button class="btn btn-primary" data-action="new-account">+ Yeni hesap</button></div>
  <div class="grid g3">
    <div class="card stat"><div class="label">Nakit ve banka</div><div class="value">${money(liquid)}</div><div class="sub">Kartlar hariç</div></div>
    <div class="card stat"><div class="label">Kredi kartı borçları</div><div class="value neg">${money(cardDebt)}</div><div class="sub">Bugüne kadarki harcamalar</div></div>
    <div class="card stat"><div class="label">Toplam bakiye</div><div class="value ${balance() < 0 ? 'neg' : ''}">${money(balance())}</div><div class="sub">Kart borçları düşülmüş</div></div>
  </div>
  <div class="grid g3 mt">${accs.map(accountCard).join('')}</div>
  ${archived.length ? `<div class="card mt"><h2>Arşivlenen hesaplar</h2><div class="chips">${archived.map(a => `<span class="chip">${esc(a.name)} · ${money(accountBalance(a))}<button data-action="unarchive-account" data-id="${a.id}" title="Geri al">↺</button></span>`).join('')}</div></div>` : ''}`;
};
function accountCard(a) {
  const b = accountBalance(a);
  if (a.type !== 'card') {
    return `<div class="card goal acc-card">
      <div class="goal-top"><span class="acc-ico">${ACC_ICON[a.type]}</span><div class="name">${esc(a.name)}</div><span class="badge">${ACC_TYPES[a.type]}</span>
        <button class="icon-btn" data-action="edit-account" data-id="${a.id}" title="Düzenle">✎</button></div>
      <div class="goal-amt ${b < 0 ? 'neg' : ''}">${money(b)}</div>
      <div class="btns"><button class="btn btn-sm" data-action="acc-tx" data-id="${a.id}">İşlemler</button><button class="btn btn-sm" data-action="new-transfer" data-from="${a.id}">⇄ Transfer</button></div>
    </div>`;
  }
  const c = cardInfo(a);
  const used = a.limit ? Math.min(100, (c.debt + c.future) / a.limit * 100) : 0;
  return `<div class="card goal acc-card">
    <div class="goal-top"><span class="acc-ico">${ACC_ICON.card}</span><div class="name">${esc(a.name)}</div><span class="badge">Kredi kartı</span>
      <button class="icon-btn" data-action="edit-account" data-id="${a.id}" title="Düzenle">✎</button></div>
    <div class="goal-amt neg">${money(c.debt)} <small>borç</small></div>
    ${a.limit ? `<div class="bar ${used > 90 ? 'over' : used > 70 ? 'warn' : ''}"><i style="width:${used}%"></i></div>
      <div class="muted money" style="font-size:12px">Kullanılabilir limit ${money(c.available)} / ${money(a.limit)}</div>` : ''}
    <div class="facts">
      ${c.stmt ? `<div>Ekstre borcu<br><b>${money(c.stmtDebt)}</b></div>
      <div>Kalan ödeme<br><b class="${c.remaining > 0 ? 'neg' : 'pos'}">${c.remaining > 0 ? money(c.remaining) : 'Ödendi'}</b></div>
      <div>Son ödeme<br><b>${fmtDate(c.due)}</b> ${c.remaining > 0 ? dateBadge(c.due) : ''}</div>
      <div>Asgari ödeme<br><b>${money(c.minPay)}</b></div>
      <div>Bu dönem harcama<br><b>${money(c.period)}</b></div>
      <div>Sonraki kesim<br><b>${fmtDate(c.nextStmt)}</b></div>` : '<div style="grid-column:1/-1">Hesap kesim ve son ödeme günlerini girersen ekstre ve asgari ödeme hesaplanır.</div>'}
      ${c.future ? `<div style="grid-column:1/-1">Gelecek aylardaki taksitler<br><b>${money(c.future)}</b></div>` : ''}
    </div>
    <div class="btns"><button class="btn btn-sm btn-primary" data-action="card-pay" data-id="${a.id}">Kartı öde</button><button class="btn btn-sm" data-action="acc-tx" data-id="${a.id}">İşlemler</button></div>
  </div>`;
}

function accountForm(existing) {
  const a = existing || { name: '', type: 'bank', opening: 0, color: PALETTE[S.data.accounts.length % PALETTE.length], limit: 0, statementDay: '', dueDay: '', minRate: 20 };
  const openVal = a.type === 'card' ? -(a.opening || 0) : (a.opening || 0);
  openModal({
    title: existing ? 'Hesabı düzenle' : 'Yeni hesap',
    body: `<div class="fields-2">
        <label class="field"><span>Hesap adı</span><input class="input" name="name" value="${esc(a.name)}" placeholder="Örn. Ziraat vadesiz, Bonus kart" required autofocus></label>
        <label class="field"><span>Tür</span><select class="input" name="atype">${Object.entries(ACC_TYPES).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <div class="fields-2">
        <label class="field"><span id="openLbl">${a.type === 'card' ? 'Şu anki kart borcu' : 'Başlangıç bakiyesi'}</span><input class="input" name="opening" inputmode="decimal" placeholder="0,00" value="${openVal ? amountToInput(openVal) : ''}"></label>
        <label class="field"><span>Renk</span><input class="input" type="color" name="color" value="${a.color}" style="height:38px;padding:3px"></label>
      </div>
      <p class="muted" id="openHint" style="margin:0;font-size:12.5px">${a.type === 'card' ? 'Uygulamaya başlamadan önceki kart borcun.' : 'Uygulamaya başlamadan önce bu hesapta olan para.'}</p>
      <div id="cardFields" ${a.type === 'card' ? '' : 'hidden'} style="display:grid;gap:12px">
        <div class="fields-2">
          <label class="field"><span>Kart limiti</span><input class="input" name="limit" inputmode="decimal" placeholder="0,00" value="${a.limit ? amountToInput(a.limit) : ''}"></label>
          <label class="field"><span>Asgari ödeme oranı (%)</span><input class="input" name="minRate" type="number" min="1" max="100" value="${a.minRate || 20}"></label>
        </div>
        <div class="fields-2">
          <label class="field"><span>Hesap kesim günü</span><input class="input" name="statementDay" type="number" min="1" max="31" placeholder="Örn. 15" value="${a.statementDay || ''}"></label>
          <label class="field"><span>Son ödeme günü</span><input class="input" name="dueDay" type="number" min="1" max="31" placeholder="Örn. 25" value="${a.dueDay || ''}"></label>
        </div>
      </div>
      ${existing ? `<button type="button" class="btn btn-ghost neg" data-action="del-account" data-id="${a.id}" style="justify-self:start">Hesabı sil ya da arşivle</button>` : ''}`,
    onOpen: f => f.elements.atype.addEventListener('change', () => {
      const card = val(f, 'atype') === 'card';
      $('#cardFields', f).hidden = !card;
      $('#openLbl', f).textContent = card ? 'Şu anki kart borcu' : 'Başlangıç bakiyesi';
      $('#openHint', f).textContent = card ? 'Uygulamaya başlamadan önceki kart borcun.' : 'Uygulamaya başlamadan önce bu hesapta olan para.';
    }),
    onSubmit: f => {
      const type = val(f, 'atype'), op = parseAmount(val(f, 'opening'));
      const opening = isNaN(op) ? 0 : (type === 'card' ? -Math.abs(op) : op);
      const day = n => { const v = parseInt(val(f, n), 10); return v >= 1 && v <= 31 ? v : null; };
      const rec = { name: val(f, 'name').trim(), type, opening, color: val(f, 'color') };
      if (type === 'card') Object.assign(rec, { limit: parseAmount(val(f, 'limit')) || 0, statementDay: day('statementDay'), dueDay: day('dueDay'), minRate: Number(val(f, 'minRate')) || 20 });
      if (existing) Object.assign(existing, rec); else S.data.accounts.push({ id: 'a-' + uid(), ...rec });
      commit(); toast('Hesap kaydedildi');
    }
  });
}
function accountUsage(id) {
  const d = S.data;
  return d.transactions.filter(t => t.accountId === id).length + d.transfers.filter(t => t.from === id || t.to === id).length
    + d.recurring.filter(r => r.accountId === id).length + d.debts.filter(x => x.accountId === id || x.payments.some(p => p.accountId === id)).length
    + d.goals.reduce((s, g) => s + g.contributions.filter(c => c.accountId === id).length, 0)
    + d.assets.filter(l => l.accountId === id).length + d.templates.filter(t => t.accountId === id).length;
}

function transferForm(existing, preset = {}) {
  const t = existing || { from: preset.from || '', to: preset.to || '', amount: preset.amount || '', date: todayStr(), note: preset.note || '' };
  if (S.data.accounts.filter(a => !a.archived).length < 2) return toast('Transfer için en az iki hesap gerekir');
  const fromDef = t.from || accountSelectDefault();
  const toDef = t.to || S.data.accounts.find(a => !a.archived && a.id !== fromDef)?.id;
  openModal({
    title: existing ? 'Transferi düzenle' : 'Hesaplar arası transfer',
    body: `<div class="fields-2">
        <label class="field"><span>Nereden</span>${accountSelect(fromDef, 'from')}</label>
        <label class="field"><span>Nereye</span>${accountSelect(toDef, 'to')}</label>
      </div>
      <div class="fields-2">
        <label class="field"><span>Tutar</span><input class="input amount-input" name="amount" inputmode="decimal" placeholder="0,00" value="${amountToInput(t.amount)}" required autofocus></label>
        <label class="field"><span>Tarih</span><input class="input" type="date" name="date" value="${t.date}" required></label>
      </div>
      <label class="field"><span>Açıklama</span><input class="input" name="note" value="${esc(t.note)}" placeholder="Örn. Kart ödemesi, bankadan nakit çekim"></label>
      <p class="muted" style="margin:0;font-size:12.5px">Transferler gelir ya da gider sayılmaz, sadece hesap bakiyelerini değiştirir. Kredi kartı borcunu ödemek de bir transferdir.</p>`,
    onSubmit: f => {
      const amount = parseAmount(val(f, 'amount'));
      if (!(amount > 0)) return fieldError(f, 'amount', 'Geçerli bir tutar gir');
      if (val(f, 'from') === val(f, 'to')) return fieldError(f, 'to', 'İki farklı hesap seç');
      const rec = { from: val(f, 'from'), to: val(f, 'to'), amount, date: val(f, 'date'), note: val(f, 'note').trim() };
      if (existing) Object.assign(existing, rec); else S.data.transfers.push({ id: uid(), created: Date.now(), ...rec });
      commit(); toast('Transfer kaydedildi');
    }
  });
}
function accountSelectDefault() { return (S.data.accounts.find(a => !a.archived && a.type === 'bank') || S.data.accounts.find(a => !a.archived))?.id; }

function cardPayForm(acc) {
  const c = cardInfo(acc);
  const from = S.data.accounts.find(a => !a.archived && a.type === 'bank')?.id || S.data.accounts.find(a => !a.archived && a.id !== acc.id)?.id;
  const opts = [c.remaining > 0 && ['Kalan ekstre borcu', c.remaining], c.minPay > 0 && ['Asgari ödeme', c.minPay], c.debt > 0 && ['Tüm borç', c.debt]].filter(Boolean);
  openModal({
    title: `${acc.name} ödemesi`,
    body: `${opts.length ? `<div class="chips">${opts.map(([l, v]) => `<button type="button" class="chip pick-amt" data-v="${v}">${l}: ${money(v)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0">Bu kartta ödenecek borç görünmüyor.</p>'}
      <div class="fields-2">
        <label class="field"><span>Tutar</span><input class="input amount-input" name="amount" inputmode="decimal" value="${amountToInput(c.remaining || c.debt || '')}" required autofocus></label>
        <label class="field"><span>Tarih</span><input class="input" type="date" name="date" value="${todayStr()}" required></label>
      </div>
      <label class="field"><span>Hangi hesaptan</span>${accountSelect(from, 'from', acc.id)}</label>`,
    submit: 'Ödemeyi kaydet',
    onOpen: f => $$('.pick-amt', f).forEach(b => b.addEventListener('click', () => { f.elements.amount.value = amountToInput(Number(b.dataset.v)); })),
    onSubmit: f => {
      const amount = parseAmount(val(f, 'amount'));
      if (!(amount > 0)) return fieldError(f, 'amount', 'Geçerli bir tutar gir');
      S.data.transfers.push({ id: uid(), created: Date.now(), from: val(f, 'from'), to: acc.id, amount, date: val(f, 'date'), note: 'Kart ödemesi' });
      commit(); toast('Kart ödemesi kaydedildi');
    }
  });
}

/* ---------- Borç ve alacak ---------- */
VIEWS.borclar = () => {
  const dt = debtTotals();
  const open = S.data.debts.filter(x => debtLeft(x) > 0).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || b.date.localeCompare(a.date));
  const closed = S.data.debts.filter(x => debtLeft(x) === 0).sort((a, b) => b.date.localeCompare(a.date));
  const people = {};
  for (const x of S.data.debts) { const l = debtLeft(x); if (l) people[x.person] = round2((people[x.person] || 0) + (x.dir === 'lent' ? l : -l)); }
  return `<div class="page-head"><h1>Borç ve Alacak</h1><div class="spacer"></div><button class="btn btn-primary" data-action="new-debt">+ Yeni kayıt</button></div>
  <div class="grid g3">
    <div class="card stat"><div class="label">Bana borçlu olanlar</div><div class="value pos">${money(dt.lent)}</div><div class="sub">Alacaklarım</div></div>
    <div class="card stat"><div class="label">Benim borçlarım</div><div class="value neg">${money(dt.owe)}</div><div class="sub">Ödemem gerekenler</div></div>
    <div class="card stat"><div class="label">Net</div><div class="value ${dt.lent - dt.owe < 0 ? 'neg' : 'pos'}">${money(dt.lent - dt.owe)}</div><div class="sub">Alacak eksi borç</div></div>
  </div>
  ${Object.keys(people).length ? `<div class="card mt"><h2>Kişilere göre</h2><div class="chips">${Object.entries(people).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([p, v]) => `<span class="chip" style="padding-right:10px">${esc(p)} <b class="money ${v < 0 ? 'neg' : 'pos'}">${v < 0 ? 'borcum ' + money(-v) : 'alacağım ' + money(v)}</b></span>`).join('')}</div></div>` : ''}
  ${open.length ? `<div class="grid g3 mt">${open.map(debtCard).join('')}</div>`
    : `<div class="card empty mt">Arkadaşına verdiğin ya da birinden aldığın borcu, bölüştüğünüz hesapları buradan takip et.<br><button class="btn btn-primary" data-action="new-debt">+ Yeni kayıt</button></div>`}
  ${closed.length ? `<div class="card mt"><h2>Kapananlar</h2><div class="list">${closed.slice(0, 20).map(x => `<div class="row" style="opacity:.7">
      <div class="main-col"><div class="title">${esc(x.person)} · ${x.dir === 'lent' ? 'Alacak' : 'Borç'}</div><div class="meta">${fmtDate(x.date)}${x.note ? ' · ' + esc(x.note) : ''}</div></div>
      <div class="amt">${money(x.amount)}</div>
      <button class="icon-btn" data-action="debt-history" data-id="${x.id}" title="Geçmiş">☰</button>
      <button class="icon-btn danger" data-action="del-debt" data-id="${x.id}" title="Sil">🗑</button></div>`).join('')}</div></div>` : ''}`;
};
function debtCard(x) {
  const left = debtLeft(x), paid = debtPaid(x), lent = x.dir === 'lent';
  return `<div class="card goal">
    <div class="goal-top"><span class="badge ${lent ? 'ok' : 'late'}">${lent ? 'Alacak' : 'Borç'}</span><div class="name">${esc(x.person)}</div>
      <button class="icon-btn" data-action="edit-debt" data-id="${x.id}" title="Düzenle">✎</button>
      <button class="icon-btn danger" data-action="del-debt" data-id="${x.id}" title="Sil">🗑</button></div>
    <div class="goal-amt ${lent ? 'pos' : 'neg'}">${money(left)} <small>/ ${money(x.amount)}</small></div>
    <div class="bar"><i style="width:${x.amount ? paid / x.amount * 100 : 0}%;background:var(--${lent ? 'income' : 'expense'})"></i></div>
    <div class="facts">
      <div>Tarih<br><b>${fmtDate(x.date)}</b></div>
      <div>Vade<br><b>${x.due ? fmtDate(x.due) : 'Yok'}</b> ${x.due ? dateBadge(x.due) : ''}</div>
      ${x.note ? `<div style="grid-column:1/-1">Not<br><b>${esc(x.note)}</b></div>` : ''}
    </div>
    <div class="btns">
      <button class="btn btn-sm ${lent ? 'btn-income' : 'btn-expense'}" data-action="debt-pay" data-id="${x.id}">${lent ? 'Ödeme aldım' : 'Ödeme yaptım'}</button>
      <button class="btn btn-sm btn-ghost" data-action="debt-history" data-id="${x.id}">Geçmiş</button>
    </div>
  </div>`;
}
function debtForm(existing) {
  const x = existing || { dir: 'lent', person: '', amount: '', date: todayStr(), due: '', accountId: accountSelectDefault(), note: '' };
  const persons = [...new Set(S.data.debts.map(d => d.person))];
  openModal({
    title: existing ? 'Kaydı düzenle' : 'Yeni borç ya da alacak',
    body: `<div class="seg">
        <input type="radio" name="dir" id="dLent" value="lent" ${x.dir === 'lent' ? 'checked' : ''}><label class="i" for="dLent">Borç verdim</label>
        <input type="radio" name="dir" id="dOwe" value="owe" ${x.dir === 'owe' ? 'checked' : ''}><label class="e" for="dOwe">Borç aldım</label>
      </div>
      <div class="fields-2">
        <label class="field"><span>Kişi</span><input class="input" name="person" list="personList2" value="${esc(x.person)}" required autofocus></label>
        <label class="field"><span>Tutar</span><input class="input" name="amount" inputmode="decimal" value="${amountToInput(x.amount)}" placeholder="0,00" required></label>
      </div>
      <datalist id="personList2">${persons.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      <div class="fields-2">
        <label class="field"><span>Tarih</span><input class="input" type="date" name="date" value="${x.date}" required></label>
        <label class="field"><span>Vade (isteğe bağlı)</span><input class="input" type="date" name="due" value="${x.due || ''}"></label>
      </div>
      <div class="fields-2">
        <label class="field"><span>Para hangi hesaptan çıktı/girdi</span><select class="input" name="accountId"><option value="">Hesaplara yansımasın</option>${S.data.accounts.filter(a => !a.archived || a.id === x.accountId).map(a => `<option value="${a.id}" ${a.id === x.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Not</span><input class="input" name="note" value="${esc(x.note)}" placeholder="Örn. Konser bileti"></label>
      </div>
      <p class="muted" style="margin:0;font-size:12.5px">Borç vermek ve almak gelir ya da gider sayılmaz, sadece seçtiğin hesabın bakiyesini değiştirir.</p>`,
    onSubmit: f => {
      const amount = parseAmount(val(f, 'amount'));
      if (!(amount > 0)) return fieldError(f, 'amount', 'Geçerli bir tutar gir');
      if (existing && amount < debtPaid(existing)) return fieldError(f, 'amount', `Şimdiye kadar ${money(debtPaid(existing))} ödenmiş, daha az olamaz`);
      const rec = { dir: val(f, 'dir'), person: val(f, 'person').trim(), amount, date: val(f, 'date'), due: val(f, 'due'), accountId: val(f, 'accountId') || null, note: val(f, 'note').trim() };
      if (existing) Object.assign(existing, rec); else S.data.debts.push({ id: uid(), created: Date.now(), payments: [], ...rec });
      commit(); toast('Kaydedildi');
    }
  });
}
function debtPayForm(x) {
  const left = debtLeft(x), lent = x.dir === 'lent';
  openModal({
    title: lent ? `${x.person} ödeme yaptı` : `${x.person} kişisine ödeme`,
    body: `<div class="fields-2">
        <label class="field"><span>Tutar (kalan ${money(left)})</span><input class="input amount-input" name="amount" inputmode="decimal" value="${amountToInput(left)}" required autofocus></label>
        <label class="field"><span>Tarih</span><input class="input" type="date" name="date" value="${todayStr()}" required></label>
      </div>
      <label class="field"><span>${lent ? 'Para hangi hesaba girdi' : 'Hangi hesaptan ödedin'}</span><select class="input" name="accountId"><option value="">Hesaplara yansımasın</option>${S.data.accounts.filter(a => !a.archived).map(a => `<option value="${a.id}" ${a.id === (x.accountId || accountSelectDefault()) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>`,
    submit: 'Kaydet',
    onSubmit: f => {
      const amount = parseAmount(val(f, 'amount'));
      if (!(amount > 0)) return fieldError(f, 'amount', 'Geçerli bir tutar gir');
      if (amount > left + 0.001) return fieldError(f, 'amount', `En fazla ${money(left)} olabilir`);
      x.payments.push({ id: uid(), date: val(f, 'date'), amount, accountId: val(f, 'accountId') || null });
      commit(); toast(debtLeft(x) === 0 ? 'Kapandı 🎉' : 'Ödeme kaydedildi');
    }
  });
}
function debtHistory(x) {
  const list = [...x.payments].sort((a, b) => b.date.localeCompare(a.date));
  openModal({
    title: `${x.person} · geçmiş`, noFoot: true,
    body: `<div class="list"><div class="row"><div class="main-col"><div class="title">${x.dir === 'lent' ? 'Borç verildi' : 'Borç alındı'}</div><div class="meta">${fmtDate(x.date)}${x.accountId ? ' · ' + esc(accName(x.accountId)) : ''}</div></div><div class="amt">${money(x.amount)}</div></div>
      ${list.map(p => `<div class="row"><div class="main-col"><div class="title">Ödeme</div><div class="meta">${fmtDate(p.date)}${p.accountId ? ' · ' + esc(accName(p.accountId)) : ''}</div></div>
        <div class="amt pos">−${money(p.amount)}</div><button type="button" class="icon-btn danger" data-action="del-debt-pay" data-debt="${x.id}" data-id="${p.id}" title="Sil">🗑</button></div>`).join('')}</div>`
  });
}

/* ---------- Telefon: Diğer menüsü ---------- */
function moreMenu() {
  const item = (v, ico, t, sub) => `<button type="button" class="more-item ${S.view === v ? 'active' : ''}" data-view="${v}"><span>${ico}</span><div><b>${t}</b><small>${sub}</small></div></button>`;
  openModal({
    title: 'Diğer', noFoot: true,
    body: `<div class="more-list">
      ${item('birikim', '◎', 'Birikimler', 'Hedefler ve katkılar')}
      ${item('varliklar', '🥇', 'Döviz ve Altın', 'Güncel kurla değer, kâr ve zarar')}
      ${item('borclar', '⇆', 'Borç ve Alacak', 'Kime ne borçlusun, kim sana borçlu')}
      ${item('butce', '▤', 'Bütçe ve Raporlar', 'Limitler, grafikler, yıllık özet')}
      ${item('ayarlar', '⚙', 'Ayarlar', 'Güvenlik, yedek, kategoriler')}
    </div>`
  });
}

/* ---------- Eylemler ---------- */
Object.assign(ACTIONS, {
  'more-menu': () => moreMenu(),
  'new-account': () => accountForm(),
  'edit-account': el => accountForm(accById(el.dataset.id)),
  'del-account': async el => {
    const a = accById(el.dataset.id), used = accountUsage(a.id);
    if (S.data.accounts.filter(x => !x.archived).length <= 1 && !a.archived) return toast('En az bir hesap kalmalı');
    if (used) {
      if (await confirmBox('Hesabı arşivle', `<b>${esc(a.name)}</b> hesabında ${used} kayıt var, bu yüzden silinemez. Arşivlensin mi? Kayıtlar korunur, hesap listelerden kalkar.`, 'Arşivle')) { a.archived = true; commit(); toast('Arşivlendi'); }
    } else if (await confirmBox('Hesabı sil', `<b>${esc(a.name)}</b> silinsin mi?`)) {
      S.data.accounts = S.data.accounts.filter(x => x.id !== a.id); commit(); toast('Silindi');
    }
  },
  'unarchive-account': el => { accById(el.dataset.id).archived = false; commit(); },
  'acc-tx': el => { S.tx = { ...S.tx, acc: el.dataset.id, month: 'all', type: 'all', cat: 'all' }; S.view = 'islemler'; render(); },
  'new-transfer': el => transferForm(null, { from: el.dataset.from }),
  'edit-tr': el => transferForm(S.data.transfers.find(t => t.id === el.dataset.id)),
  'del-tr': async el => {
    const t = S.data.transfers.find(x => x.id === el.dataset.id);
    if (await confirmBox('Transferi sil', `${fmtDate(t.date)} tarihli <b>${money(t.amount)}</b> tutarındaki transfer silinsin mi?`)) {
      S.data.transfers = S.data.transfers.filter(x => x.id !== t.id); commit(); toast('Silindi');
    }
  },
  'card-pay': el => cardPayForm(accById(el.dataset.id)),
  'new-debt': () => debtForm(),
  'edit-debt': el => debtForm(S.data.debts.find(x => x.id === el.dataset.id)),
  'del-debt': async el => {
    const x = S.data.debts.find(d => d.id === el.dataset.id);
    if (await confirmBox('Kaydı sil', `<b>${esc(x.person)}</b> ile ilgili ${money(x.amount)} tutarındaki kayıt ve ödemeleri silinsin mi?`)) {
      S.data.debts = S.data.debts.filter(d => d.id !== x.id); commit(); toast('Silindi');
    }
  },
  'debt-pay': el => debtPayForm(S.data.debts.find(x => x.id === el.dataset.id)),
  'debt-history': el => debtHistory(S.data.debts.find(x => x.id === el.dataset.id)),
  'del-debt-pay': el => {
    const x = S.data.debts.find(d => d.id === el.dataset.debt);
    x.payments = x.payments.filter(p => p.id !== el.dataset.id);
    persist(); render(); debtHistory(x);
  }
});

/* ---------- Örnek veri eklentileri ---------- */
function sampleExtras(d, now, ex) {
  const card = d.accounts.find(a => a.id === 'a-card');
  if (card) Object.assign(card, { limit: 60000, statementDay: 15, dueDay: 25, minRate: 20 });
  const bank = d.accounts.find(a => a.id === 'a-bank'); if (bank) bank.opening = 25000;
  const cash = d.accounts.find(a => a.id === 'a-cash'); if (cash) cash.opening = 3000;
  // 6 taksitli dizüstü bilgisayar
  const start = ymd(new Date(now.getFullYear(), now.getMonth() - 2, 9)), g = uid();
  for (let i = 0; i < 6; i++) d.transactions.push({ id: uid(), created: Date.now(), sample: true, type: 'expense', amount: 4000, date: addMonths(start, i, 9), categoryId: ex('Teknoloji'), accountId: 'a-card', note: 'Dizüstü bilgisayar', inst: { g, i: i + 1, n: 6, total: 24000 } });
  // Geçmiş ekstrelerin ödenmesi
  for (let m = 5; m >= 1; m--) {
    const stmt = ymd(new Date(now.getFullYear(), now.getMonth() - m, 15));
    const debt = Math.max(0, -accountBalance(card, stmt));
    if (debt > 0) d.transfers.push({ id: uid(), created: Date.now(), sample: true, from: 'a-bank', to: 'a-card', amount: round2(debt), date: ymd(new Date(now.getFullYear(), now.getMonth() - m, 24)), note: 'Kart ödemesi' });
  }
  d.transfers.push({ id: uid(), created: Date.now(), sample: true, from: 'a-bank', to: 'a-cash', amount: 1000, date: ymd(new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 3))), note: 'ATM çekimi' });
  // Döviz, altın ve şablon örnekleri
  const ago = m => ymd(new Date(now.getFullYear(), now.getMonth() - m, 12));
  d.assets.push({ id: uid(), created: Date.now(), sample: true, type: 'USD', qty: 500, price: 41.2, date: ago(5), accountId: null });
  d.assets.push({ id: uid(), created: Date.now(), sample: true, type: 'GA', qty: 10, price: 4350, date: ago(3), accountId: 'a-bank' });
  d.assets.push({ id: uid(), created: Date.now(), sample: true, type: 'CEYREK', qty: 2, price: 7600, date: ago(1), accountId: null });
  [['Kahve', 85, 'Yeme İçme', 'a-card'], ['Otobüs', 27, 'Ulaşım', 'a-cash'], ['Simit', 20, 'Yeme İçme', 'a-cash']].forEach(([name, amount, cat, acc]) =>
    d.templates.push({ id: uid(), sample: true, name, type: 'expense', amount, categoryId: ex(cat), accountId: acc, note: name }));
  const due = new Date(now); due.setDate(due.getDate() + 10);
  d.debts.push({ id: uid(), created: Date.now(), sample: true, person: 'Zeynep', dir: 'lent', amount: 1200, date: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), due: '', accountId: 'a-bank', note: 'Konser bileti', payments: [{ id: uid(), date: todayStr(), amount: 400, accountId: 'a-bank' }] });
  d.debts.push({ id: uid(), created: Date.now(), sample: true, person: 'Mert', dir: 'owe', amount: 2500, date: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 20)), due: ymd(due), accountId: 'a-bank', note: 'Tatil masrafı', payments: [] });
}
