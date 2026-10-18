'use strict';
/* Kuruşu Kuruşuna — hesap sistemi ve uçtan uca şifreli eşitleme.
   Veriler cihazda AES-GCM ile şifrelenir; sunucu sadece okunamayan metin görür.
   Şifreleme anahtarı (DEK) rastgele üretilir, "veri parolası" ve "kurtarma anahtarı" ile kilitlenip saklanır. */

const CLOUD_CONF = { url: 'https://hfeptlxxphvccfjrtmkv.supabase.co', key: 'sb_publishable_8Z7K_QhldjJLLd4LC3z-Ug_J5G1f-Eo' };
const SYNC = { cloud: null, user: null, busy: false, again: false, timer: null, status: 'off', error: '', dek: null };
const ENC = new TextEncoder(), DEC = new TextDecoder();

/* ---------- Şifreleme yardımcıları ---------- */
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
async function kekFromSecret(secret, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', ENC.encode(secret.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function aesEnc(key, bytes, aad) {
  const iv = rnd(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, ...(aad ? { additionalData: ENC.encode(aad) } : {}) }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}
async function aesDec(key, str, aad) {
  const all = unb64(str);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12), ...(aad ? { additionalData: ENC.encode(aad) } : {}) }, key, all.slice(12)));
}
const importDek = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
// Kurtarma anahtarı: 25 karakter, okunması kolay harf ve rakamlar (I, O, 0, 1 yok)
const RC_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRecoveryKey() {
  const b = rnd(25); let s = '';
  for (let i = 0; i < 25; i++) s += RC_ALPHA[b[i] % 32];
  return s.match(/.{5}/g).join('-');
}
const normRecovery = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
// Kayıt içeriğinin parmak izi: neyin değiştiğini anlamak için
function fp(obj) {
  const str = JSON.stringify(obj);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

/* ---------- Veri ↔ kayıtlar ---------- */
// Cihaza özel ayarlar (tema, kilit, gizleme) eşitlenmez
function toRecords(d) {
  const r = {};
  const put = (kind, id, obj) => { r[kind + ':' + id] = obj; };
  d.transactions.forEach(x => put('tx', x.id, x));
  d.transfers.forEach(x => put('tr', x.id, x));
  d.recurring.forEach(x => put('rec', x.id, x));
  d.goals.forEach(x => put('goal', x.id, x));
  d.debts.forEach(x => put('debt', x.id, x));
  d.assets.forEach(x => put('asset', x.id, x));
  d.templates.forEach((x, i) => put('tpl', x.id, { ...x, _o: i }));
  d.accounts.forEach((x, i) => put('acc', x.id, { ...x, _o: i }));
  for (const t of ['income', 'expense']) d.categories[t].forEach((c, i) => put('cat', c.id, { ...c, _t: t, _o: i }));
  put('meta', 'budgets', d.budgets);
  put('meta', 'prefs', { currency: d.settings.currency, reminderDays: d.settings.reminderDays });
  return r;
}
function applyRecords(d, r) {
  const by = k => Object.keys(r).filter(key => key.startsWith(k + ':')).map(key => r[key]);
  const strip = ({ _o, _t, ...x }) => x;
  const ord = (a, b) => (a._o ?? 0) - (b._o ?? 0);
  d.transactions = by('tx'); d.transfers = by('tr'); d.recurring = by('rec'); d.goals = by('goal'); d.debts = by('debt');
  d.assets = by('asset'); d.templates = by('tpl').sort(ord).map(strip);
  const accs = by('acc').sort(ord).map(strip);
  if (accs.length) d.accounts = accs;
  const cats = by('cat');
  const inc = cats.filter(c => c._t === 'income').sort(ord).map(strip), exp = cats.filter(c => c._t === 'expense').sort(ord).map(strip);
  if (inc.length) d.categories.income = inc;
  if (exp.length) d.categories.expense = exp;
  d.budgets = r['meta:budgets'] || {};
  const p = r['meta:prefs'];
  if (p) { d.settings.currency = p.currency || d.settings.currency; d.settings.reminderDays = p.reminderDays || d.settings.reminderDays; }
}

/* ---------- Eşitleme motoru ---------- */
function syncState() { return S.data.sync || null; }
function markLocalEdit() { if (S.data.sync && !S.applyingRemote) S.data.sync.lastEdit = Date.now(); }
function scheduleSync(ms = 3000) {
  if (!syncState()?.key) return;
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(() => syncNow(), ms);
}
function setSyncStatus(st, err = '') { SYNC.status = st; SYNC.error = err; paintSyncUI(); }

async function syncNow() {
  const st = syncState();
  if (!st?.key || !SYNC.cloud) return;
  if (SYNC.busy) { SYNC.again = true; return; }
  SYNC.busy = true; setSyncStatus('syncing');
  try {
    if (!SYNC.dek) SYNC.dek = await importDek(unb64(st.key));
    const first = !st.cursor;
    // 1) Sunucudaki yenileri al
    let local = toRecords(S.data), changed = false, cursor = st.cursor;
    for (let guard = 0; guard < 200; guard++) {
      const rows = await SYNC.cloud.pull(st.userId, cursor, 500);
      let fresh = 0;
      for (const row of rows) {
        const key = row.id;
        if (row.updated_at > (st.cursor || '')) st.cursor = row.updated_at;
        const mine = local[key];
        const localDeleted = mine === undefined && st.snap[key] !== undefined;
        const localChanged = localDeleted || (mine !== undefined && fp(mine) !== st.snap[key]);
        // Sunucudaki sürüm en son gördüğümüzle aynıysa uzakta değişiklik yok
        if (st.snapMod?.[key] === row.modified && (row.deleted ? st.snap[key] === undefined : st.snap[key] !== undefined)) continue;
        if (row.deleted) {
          if (mine !== undefined && !localChanged) { delete local[key]; changed = true; }
          if (!localChanged) delete st.snap[key];
          fresh++; continue;
        }
        const obj = JSON.parse(DEC.decode(await aesDec(SYNC.dek, row.data, key)));
        const h = fp(obj);
        if (mine !== undefined && fp(mine) === h) { st.snap[key] = h; (st.snapMod ||= {})[key] = row.modified; continue; }
        // Çakışma: iki tarafta da değiştiyse ilk eşitlemede sunucu, sonra en son düzenlenen kazanır
        if (!localChanged || first || row.modified > (st.lastEdit || 0)) {
          local[key] = obj; st.snap[key] = h; (st.snapMod ||= {})[key] = row.modified; changed = true; fresh++;
        }
      }
      if (rows.length < 500 || cursor === st.cursor) break;
      cursor = st.cursor;
    }
    if (changed) {
      S.applyingRemote = true;
      applyRecords(S.data, local);
      S.data = normalize(S.data);
      S.applyingRemote = false;
    }
    // 2) Bizdeki değişiklikleri gönder
    local = toRecords(S.data);
    // Satırlara gönderim zamanı değil, son düzenleme zamanı yazılır; çakışmada en son düzenleyen kazanır
    const now = Math.max(st.lastEdit || 0, 1), out = [];
    for (const [key, obj] of Object.entries(local)) {
      const h = fp(obj);
      if (st.snap[key] === h) continue;
      out.push({ key, h, row: { user_id: st.userId, id: key, kind: key.split(':')[0], data: await aesEnc(SYNC.dek, ENC.encode(JSON.stringify(obj)), key), deleted: false, modified: now } });
    }
    for (const key of Object.keys(st.snap)) {
      if (!(key in local)) out.push({ key, h: null, row: { user_id: st.userId, id: key, kind: key.split(':')[0], data: null, deleted: true, modified: now } });
    }
    for (let i = 0; i < out.length; i += 400) {
      const part = out.slice(i, i + 400);
      await SYNC.cloud.push(part.map(x => x.row));
      for (const x of part) { if (x.h) { st.snap[x.key] = x.h; (st.snapMod ||= {})[x.key] = now; } else { delete st.snap[x.key]; if (st.snapMod) delete st.snapMod[x.key]; } }
    }
    st.lastSync = Date.now();
    S.applyingRemote = true; persist(); S.applyingRemote = false;
    if (changed) { render(); checkBudgetAlerts(); }
    setSyncStatus('ok');
  } catch (e) {
    S.applyingRemote = false;
    setSyncStatus('error', friendlyError(e));
  } finally {
    SYNC.busy = false;
    if (SYNC.again) { SYNC.again = false; scheduleSync(500); }
  }
}

function friendlyError(e) {
  const m = String(e?.message || e);
  if (/Invalid login credentials/i.test(m)) return 'E-posta ya da parola yanlış.';
  if (/Email not confirmed/i.test(m)) return 'E-posta adresini henüz doğrulamadın. Gelen kutuna bak.';
  if (/User already registered/i.test(m)) return 'Bu e-postayla zaten bir hesap var. Giriş yapmayı dene.';
  if (/Password should be/i.test(m)) return 'Parola en az 6 karakter olmalı.';
  if (/provider is not enabled|Unsupported provider/i.test(m)) return 'Bu giriş yöntemi henüz açılmadı.';
  if (/rate limit|too many/i.test(m)) return 'Çok fazla deneme yapıldı, biraz bekleyip tekrar dene.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'İnternet bağlantısı yok ya da sunucuya ulaşılamıyor.';
  if (/OperationError|decrypt/i.test(m)) return 'Veriler çözülemedi. Veri parolası ya da anahtar hatalı.';
  return m;
}

/* ---------- Kasa: anahtarın parola ve kurtarma anahtarıyla kilitlenmesi ---------- */
const VAULT_ITER = 310000;
async function createVault(userId, passphrase) {
  const dek = rnd(32), recovery = newRecoveryKey();
  const salt = b64(rnd(16)), recSalt = b64(rnd(16));
  const row = {
    user_id: userId, salt, iter: VAULT_ITER, rec_salt: recSalt,
    wrapped_pass: await aesEnc(await kekFromSecret(passphrase, salt, VAULT_ITER), dek, 'dek'),
    wrapped_recovery: await aesEnc(await kekFromSecret(normRecovery(recovery), recSalt, 100000), dek, 'dek')
  };
  await SYNC.cloud.putVault(row);
  return { dek, recovery };
}
async function openVault(vault, secret, useRecovery) {
  const kek = useRecovery ? await kekFromSecret(normRecovery(secret), vault.rec_salt, 100000) : await kekFromSecret(secret, vault.salt, vault.iter);
  return aesDec(kek, useRecovery ? vault.wrapped_recovery : vault.wrapped_pass, 'dek');
}
async function rewrapPassphrase(userId, vault, dek, passphrase) {
  const salt = b64(rnd(16));
  await SYNC.cloud.putVault({ ...vault, user_id: userId, salt, iter: VAULT_ITER, wrapped_pass: await aesEnc(await kekFromSecret(passphrase, salt, VAULT_ITER), dek, 'dek') });
}
function startSyncing(user, dekBytes) {
  S.data.sync = { userId: user.userId, email: user.email, key: b64(dekBytes), cursor: null, snap: {}, snapMod: {}, lastSync: 0, lastEdit: Date.now() };
  SYNC.dek = null; persist();
  return syncNow();
}

/* ---------- Arayüz ---------- */
function syncSummary() {
  const st = syncState();
  if (!st?.key) return SYNC.user ? 'Giriş yapıldı, veri parolası bekleniyor.' : 'Giriş yapılmadı. Veriler sadece bu cihazda.';
  if (SYNC.status === 'syncing') return 'Eşitleniyor…';
  if (SYNC.status === 'error') return `<span class="neg">${esc(SYNC.error)}</span>`;
  return st.lastSync ? `Son eşitleme ${new Date(st.lastSync).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : 'Henüz eşitlenmedi.';
}
function paintSyncUI() {
  const el = $('#syncStatus'); if (el) el.innerHTML = syncSummary();
  const st = syncState();
  $$('.sync-btn').forEach(b => {
    b.hidden = !st?.key;
    b.className = 'tool-btn sync-btn ' + (SYNC.status === 'error' ? 'err' : SYNC.status === 'syncing' ? 'spin' : '');
    b.title = SYNC.status === 'error' ? 'Eşitleme hatası: ' + SYNC.error : 'Eşitlendi';
  });
}
function syncCardHtml() {
  const st = syncState();
  const btns = !SYNC.cloud ? '<span class="muted">Bulut bağlantısı yüklenemedi.</span>'
    : st?.key ? `<button class="btn" data-action="sync-now">Şimdi eşitle</button><button class="btn" data-action="acct-menu">Hesap</button>`
    : SYNC.user ? `<button class="btn btn-primary" data-action="sync-unlock">Veri parolasını gir</button><button class="btn" data-action="sync-signout">Çıkış</button>`
    : `<button class="btn btn-primary" data-action="sync-login">Giriş yap</button><button class="btn" data-action="sync-signup">Hesap aç</button>`;
  return `<div class="card"><h2>Hesap ve eşitleme</h2>
    <div class="set-row"><div class="main-col"><b>${st?.email || SYNC.user?.email ? esc(st?.email || SYNC.user.email) : 'Hesap yok'}</b><div class="muted" id="syncStatus">${syncSummary()}</div></div>${btns}</div>
    <div class="set-row"><div class="main-col muted" style="font-size:12.5px">Aynı hesapla giriş yaptığın bilgisayar ve telefonlarda veriler aynı olur. Veriler cihazından çıkmadan önce veri parolanla şifrelenir, sunucuda kimse okuyamaz. İnternet yokken de çalışır, bağlantı gelince eşitlenir.</div></div>
  </div>`;
}

function authForm(mode) {
  const signup = mode === 'signup';
  openModal({
    title: signup ? 'Hesap aç' : 'Giriş yap',
    body: `<button type="button" class="btn oauth-btn" data-oauth="google"><span class="g-logo">G</span> Google ile devam et</button>
      <div class="or-line"><span>ya da e-posta ile</span></div>
      <label class="field"><span>E-posta</span><input class="input" name="email" type="email" autocomplete="email" required autofocus></label>
      <label class="field"><span>Parola</span><input class="input" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required></label>
      ${signup ? '<p class="muted" style="margin:0;font-size:12.5px">Bu, giriş parolan. Verilerini şifreleyecek "veri parolası"nı bir sonraki adımda ayrıca belirleyeceksin.</p>'
        : '<button type="button" class="link" data-forgot style="justify-self:start">Parolamı unuttum</button>'}
      <div class="form-msg" id="authMsg"></div>
      <p class="muted" style="margin:0;font-size:12.5px">${signup ? 'Hesabın var mı?' : 'Hesabın yok mu?'} <button type="button" class="link" data-switch>${signup ? 'Giriş yap' : 'Hesap aç'}</button></p>`,
    submit: signup ? 'Hesap aç' : 'Giriş yap',
    onOpen: f => {
      $('[data-switch]', f).addEventListener('click', () => authForm(signup ? 'login' : 'signup'));
      $('[data-oauth]', f).addEventListener('click', () => oauthStart('google'));
      $('[data-forgot]', f)?.addEventListener('click', async () => {
        const email = val(f, 'email').trim();
        if (!email) { $('#authMsg').textContent = 'Önce e-posta adresini yaz.'; return; }
        try { localStorage.setItem('kk-reset', '1'); } catch { }
        try { await SYNC.cloud.resetPassword(email); toast('Parola sıfırlama bağlantısı gönderildi'); } catch (e) { toast(friendlyError(e)); }
      });
    },
    onSubmit: f => {
      const email = val(f, 'email').trim(), pw = val(f, 'password');
      const btn = $('#modalFoot button[type=submit]'); btn.disabled = true; $('#authMsg').textContent = '';
      (async () => {
        try {
          if (signup) {
            const r = await SYNC.cloud.signUp(email, pw);
            if (r.needsConfirm) { $('#modal').close(); return infoBox('E-postanı doğrula', `<b>${esc(email)}</b> adresine bir doğrulama bağlantısı gönderdik. Bağlantıya bu cihazda tıklarsan uygulama açılır ve giriş tamamlanır. Başka cihazda tıkladıysan buradan giriş yapman yeterli.`); }
          } else await SYNC.cloud.signIn(email, pw);
          await afterSignIn();
        } catch (e) { btn.disabled = false; $('#authMsg').textContent = friendlyError(e); }
      })();
      return false;
    }
  });
}
function infoBox(title, html) { openModal({ title, noFoot: true, body: `<p style="margin:0">${html}</p>` }); }

async function oauthStart(provider) {
  try { const url = await SYNC.cloud.oauthUrl(provider); await api.openUrl(url); toast('Tarayıcıda girişi tamamla, sonra uygulamaya dönülecek'); }
  catch (e) { toast(friendlyError(e)); }
}
async function handleDeepLink(link) {
  if (!SYNC.cloud || !/^kurusukurusuna:\/\/auth/.test(link)) return;
  try {
    const r = await SYNC.cloud.handleCallback(link);
    if (!r) return;
    let reset = false; try { reset = localStorage.getItem('kk-reset') === '1'; localStorage.removeItem('kk-reset'); } catch { }
    if (r.recovery || reset) return newPasswordForm();
    await afterSignIn();
  } catch (e) { toast(friendlyError(e)); }
}
function newPasswordForm() {
  openModal({
    title: 'Yeni giriş parolası',
    body: '<label class="field"><span>Yeni parola</span><input class="input" name="pw" type="password" minlength="6" autocomplete="new-password" required autofocus></label>',
    onSubmit: f => { SYNC.cloud.updatePassword(val(f, 'pw')).then(() => { toast('Parola değişti'); afterSignIn(); }).catch(e => toast(friendlyError(e))); }
  });
}

// Girişten sonra: kasa yoksa veri parolası oluştur, varsa parolayı sor
async function afterSignIn() {
  SYNC.user = await SYNC.cloud.session();
  if (!SYNC.user) return;
  if ($('#modal').open) $('#modal').close();
  render();
  const vault = await SYNC.cloud.getVault(SYNC.user.userId);
  if (!vault) return passphraseSetupForm();
  return unlockVaultForm(vault);
}
function passphraseSetupForm() {
  openModal({
    title: 'Veri parolası belirle',
    body: `<p style="margin:0">Verilerin bu parolayla şifrelenip öyle gönderilir. Yeni bir cihazda giriş yaparken bir kez sorulur.</p>
      <label class="field"><span>Veri parolası (en az 8 karakter)</span><input class="input" name="p1" type="password" minlength="8" autocomplete="new-password" required autofocus></label>
      <label class="field"><span>Tekrar</span><input class="input" name="p2" type="password" autocomplete="new-password" required></label>
      <p class="muted" style="margin:0;font-size:12.5px">Bu parola sunucuya gönderilmez. Unutursan sana vereceğimiz kurtarma anahtarıyla verilerini açabilirsin.</p>`,
    submit: 'Devam',
    onSubmit: f => {
      const p1 = val(f, 'p1'), p2 = val(f, 'p2');
      if (p1.length < 8) return fieldError(f, 'p1', 'En az 8 karakter olmalı');
      if (p1 !== p2) return fieldError(f, 'p2', 'İkisi aynı değil');
      const btn = $('#modalFoot button[type=submit]'); btn.disabled = true; btn.textContent = 'Hazırlanıyor…';
      (async () => {
        try {
          const { dek, recovery } = await createVault(SYNC.user.userId, p1);
          showRecoveryKey(recovery, () => { startSyncing(SYNC.user, dek); toast('Eşitleme açıldı'); });
        } catch (e) { btn.disabled = false; btn.textContent = 'Devam'; fieldError(f, 'p1', friendlyError(e)); }
      })();
      return false;
    }
  });
}
function showRecoveryKey(recovery, done) {
  openModal({
    title: 'Kurtarma anahtarın',
    body: `<p style="margin:0">Veri parolanı unutursan verilerini <b>sadece</b> bu anahtarla açabilirsin. Bir yere yaz ya da parola yöneticine kaydet. Bir daha gösterilmeyecek.</p>
      <div class="recovery-key" id="rkey">${recovery}</div>
      <button type="button" class="btn btn-sm" id="rcopy" style="justify-self:start">Kopyala</button>
      <label class="check"><input type="checkbox" name="ok" required> Kurtarma anahtarını güvenli bir yere kaydettim</label>`,
    submit: 'Tamam', sticky: true,
    onOpen: f => $('#rcopy', f).addEventListener('click', () => { navigator.clipboard?.writeText(recovery).then(() => toast('Kopyalandı')).catch(() => {}); }),
    onSubmit: () => { setTimeout(done, 0); }
  });
}
function unlockVaultForm(vault, useRecovery = false) {
  openModal({
    title: useRecovery ? 'Kurtarma anahtarıyla aç' : 'Veri parolanı gir',
    body: `<p style="margin:0">${useRecovery ? 'Hesabı açarken sana verilen 25 karakterlik anahtarı yaz.' : 'Bu hesaptaki verileri açmak için veri parolanı gir. Bu cihazda bir kez sorulur.'}</p>
      <label class="field"><span>${useRecovery ? 'Kurtarma anahtarı' : 'Veri parolası'}</span><input class="input" name="s" type="${useRecovery ? 'text' : 'password'}" autocomplete="off" required autofocus></label>
      <button type="button" class="link" data-alt style="justify-self:start">${useRecovery ? 'Veri parolasıyla aç' : 'Veri parolamı unuttum'}</button>
      ${S.data.transactions.length ? '<p class="muted" style="margin:0;font-size:12.5px">Bu cihazdaki kayıtlar hesaptakilerle birleştirilir, hiçbiri silinmez.</p>' : ''}`,
    submit: 'Aç',
    onOpen: f => $('[data-alt]', f).addEventListener('click', () => unlockVaultForm(vault, !useRecovery)),
    onSubmit: f => {
      const btn = $('#modalFoot button[type=submit]'); btn.disabled = true;
      (async () => {
        let dek;
        try { dek = await openVault(vault, val(f, 's'), useRecovery); }
        catch { btn.disabled = false; return fieldError(f, 's', useRecovery ? 'Kurtarma anahtarı yanlış' : 'Veri parolası yanlış'); }
        if (useRecovery) { $('#modal').close(); return newPassphraseForm(vault, dek, true); }
        $('#modal').close();
        await startSyncing(SYNC.user, dek); toast('Eşitleme açıldı');
      })();
      return false;
    }
  });
}
function newPassphraseForm(vault, dek, thenStart) {
  openModal({
    title: 'Yeni veri parolası',
    body: `<label class="field"><span>Yeni veri parolası (en az 8 karakter)</span><input class="input" name="p1" type="password" minlength="8" autocomplete="new-password" required autofocus></label>
      <label class="field"><span>Tekrar</span><input class="input" name="p2" type="password" autocomplete="new-password" required></label>`,
    onSubmit: f => {
      const p1 = val(f, 'p1');
      if (p1.length < 8) return fieldError(f, 'p1', 'En az 8 karakter olmalı');
      if (p1 !== val(f, 'p2')) return fieldError(f, 'p2', 'İkisi aynı değil');
      (async () => {
        try {
          await rewrapPassphrase(SYNC.user.userId, vault, dek, p1);
          toast('Veri parolası değişti');
          if (thenStart) await startSyncing(SYNC.user, dek);
        } catch (e) { toast(friendlyError(e)); }
      })();
    }
  });
}
function accountMenu() {
  const st = syncState();
  openModal({
    title: st.email, noFoot: true,
    body: `<div class="more-list">
      <button type="button" class="more-item" data-action="sync-change-pass"><span>🔑</span><div><b>Veri parolasını değiştir</b><small>Kurtarma anahtarın aynı kalır</small></div></button>
      <button type="button" class="more-item" data-action="sync-signout"><span>⇥</span><div><b>Çıkış yap</b><small>Bu cihazdaki veriler kalır, eşitleme durur</small></div></button>
      <button type="button" class="more-item danger-item" data-action="sync-delete"><span>🗑</span><div><b>Hesabımı sil</b><small>Buluttaki tüm verilerin silinir, cihazdakiler kalır</small></div></button>
    </div>`
  });
}

Object.assign(ACTIONS, {
  'sync-login': () => authForm('login'),
  'sync-signup': () => authForm('signup'),
  'sync-now': () => syncNow(),
  'acct-menu': () => accountMenu(),
  'sync-unlock': () => afterSignIn().catch(e => toast(friendlyError(e))),
  'sync-signout': async () => {
    if ($('#modal').open) $('#modal').close();
    if (await confirmBox('Çıkış yap', 'Hesaptan çıkılsın mı? Bu cihazdaki veriler kalır ama artık eşitlenmez.', 'Çıkış yap')) {
      try { await SYNC.cloud.signOut(); } catch { }
      SYNC.user = null; SYNC.dek = null; delete S.data.sync; commit(); setSyncStatus('off'); toast('Çıkış yapıldı');
    }
  },
  'sync-change-pass': async () => {
    const vault = await SYNC.cloud.getVault(SYNC.user.userId).catch(() => null);
    if (!vault) return toast('Hesap bilgisi alınamadı');
    newPassphraseForm(vault, unb64(syncState().key), false);
  },
  'sync-delete': () => openModal({
    title: 'Hesabımı sil', submit: 'Hesabı ve buluttaki verileri sil', danger: true,
    body: '<p style="margin:0">Hesabın ve buluttaki tüm şifreli verilerin kalıcı olarak silinir. Bu cihazdaki veriler kalır. Onaylamak için <b>SİL</b> yaz.</p><input class="input" name="confirm" autocomplete="off" required>',
    onSubmit: f => {
      if (val(f, 'confirm').trim().toLocaleUpperCase('tr') !== 'SİL') return fieldError(f, 'confirm', 'Onay için SİL yaz');
      SYNC.cloud.deleteAccount().then(() => { SYNC.user = null; SYNC.dek = null; delete S.data.sync; commit(); setSyncStatus('off'); toast('Hesap silindi'); })
        .catch(e => toast(friendlyError(e)));
    }
  })
});

// boot'tan sonra çağrılır
async function initSync() {
  try { SYNC.cloud = window.__KK_TEST_CLOUD || window.KKCloud?.create(CLOUD_CONF.url, CLOUD_CONF.key) || null; } catch { SYNC.cloud = null; }
  if (!SYNC.cloud) return;
  try { SYNC.user = await SYNC.cloud.session(); } catch { SYNC.user = null; }
  SYNC.cloud.onAuth?.((ev, u) => { SYNC.user = u; if (ev === 'PASSWORD_RECOVERY') newPasswordForm(); });
  api.onDeepLink?.(handleDeepLink);
  // Oturum düşmüşse (başka cihazdan hesap silindi vb.) eşitlemeyi durdur
  if (syncState()?.key && SYNC.user && SYNC.user.userId !== syncState().userId) { delete S.data.sync; persist(); }
  paintSyncUI();
  setInterval(() => syncNow(), 3 * 60 * 1000);
  window.addEventListener('focus', () => scheduleSync(500));
  api.onResume?.(() => scheduleSync(500));
  if (syncState()?.key && SYNC.user) syncNow();
}
