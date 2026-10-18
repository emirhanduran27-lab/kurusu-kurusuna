/* Telefon köprüsü: Capacitor içinde çalışırken masaüstündeki window.api ile aynı arayüzü sağlar.
   Masaüstünde (Electron) hiçbir şey yapmaz. esbuild ile renderer/vendor/mobile-bridge.js olarak paketlenir. */
import { Capacitor, CapacitorHttp, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';

if (Capacitor.isNativePlatform()) {
  const FILE = 'veri.json';
  const REPO = 'emirhanduran27-lab/kurusu-kurusuna';
  const platform = Capacitor.getPlatform(); // 'android' | 'ios'
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  async function readText(path, directory = Directory.Data) {
    const r = await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : await r.data.text();
  }
  async function readJson(path) { try { return JSON.parse(await readText(path)); } catch { return null; } }
  function writeText(path, data, directory = Directory.Data) {
    return Filesystem.writeFile({ path, data, directory, encoding: Encoding.UTF8, recursive: true });
  }

  // Her gün bir otomatik kopya, son 14 gün saklanır
  async function dailyBackup(text) {
    try {
      await writeText(`yedekler/${today()}.json`, text);
      const { files } = await Filesystem.readdir({ path: 'yedekler', directory: Directory.Data });
      const names = files.map(f => f.name).filter(n => n.endsWith('.json')).sort();
      while (names.length > 14) await Filesystem.deleteFile({ path: `yedekler/${names.shift()}`, directory: Directory.Data });
    } catch { /* yedek alınamazsa sessizce geç */ }
  }

  async function shareFile(name, text, title) {
    await writeText(name, text, Directory.Cache);
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    try { await Share.share({ title, files: [uri], dialogTitle: title }); return true; } catch { return false; }
  }
  function pickFileText() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return resolve(null);
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => resolve(null);
        r.readAsText(f);
      };
      input.click();
    });
  }

  /* Bildirimler: ödeme hatırlatmaları önceden planlanır, uygulama kapalıyken de gelir */
  let notifAllowed = null, lastSig = '';
  async function notifPermission() {
    if (notifAllowed !== null) return notifAllowed;
    try {
      let p = await LocalNotifications.checkPermissions();
      if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await LocalNotifications.requestPermissions();
      notifAllowed = p.display === 'granted';
    } catch { notifAllowed = false; }
    return notifAllowed;
  }
  async function scheduleReminders(list) {
    const sig = JSON.stringify(list);
    if (sig === lastSig) return;
    lastSig = sig;
    if (!list.length) {
      const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
      if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
      return;
    }
    if (!(await notifPermission())) return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    await LocalNotifications.schedule({
      notifications: list.map((n, i) => ({ id: i + 1, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true } }))
    });
  }

  /* Güncelleme: Android'de GitHub'daki son sürüme bakılır, iPhone'da App Store yapar */
  let updateCb = null, updateState = { status: platform === 'ios' ? 'store' : 'idle' };
  const send = st => { updateState = st; updateCb?.(st); };
  const cmpVer = (a, b) => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
    return 0;
  };
  async function checkUpdate() {
    if (platform !== 'android') return send({ status: 'store' });
    send({ status: 'checking' });
    try {
      const [{ version }, res] = await Promise.all([App.getInfo(), fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })]);
      if (!res.ok) throw new Error(res.status);
      const rel = await res.json();
      const latest = String(rel.tag_name || '').replace(/^v/, '');
      const apk = (rel.assets || []).find(a => a.name.endsWith('.apk'));
      if (apk && latest && cmpVer(latest, version) > 0) send({ status: 'manual', version: latest, url: apk.browser_download_url, note: 'İndirip açman yeterli, verilerin korunur.' });
      else send({ status: 'latest' });
    } catch { send({ status: 'error' }); }
  }

  const bioLabel = t => ({
    [BiometryType.touchId]: 'Touch ID', [BiometryType.faceId]: 'Face ID',
    [BiometryType.fingerprintAuthentication]: 'Parmak izi', [BiometryType.faceAuthentication]: 'Yüz tanıma',
    [BiometryType.irisAuthentication]: 'İris'
  }[t] || 'Biyometrik doğrulama');

  window.api = {
    platform,
    load: async () => (await readJson(FILE)) || (await readJson(FILE + '.bak')),
    save: async data => {
      const text = JSON.stringify(data);
      try { await writeText(FILE + '.bak', await readText(FILE)); } catch { /* ilk kayıt */ }
      await writeText(FILE, text);
      dailyBackup(text);
      return true;
    },
    exportJson: data => shareFile(`kurusu-kurusuna-yedek-${today()}.json`, JSON.stringify(data, null, 2), 'Yedeği paylaş'),
    importJson: async () => {
      const t = await pickFileText();
      if (t == null) return null;
      try { return JSON.parse(t); } catch { return {}; }
    },
    exportCsv: (csv, name) => shareFile(name || 'islemler.csv', '﻿' + csv, 'CSV paylaş'),
    notify: async () => false, // telefonda hatırlatmalar önceden planlandığı için anlık bildirim gerekmez
    alert: async (title, body) => {
      if (!(await notifPermission())) return false;
      await LocalNotifications.schedule({ notifications: [{ id: 9000 + Math.floor(Math.random() * 900), title, body }] });
      return true;
    },
    httpGet: async url => {
      if (!/^https:\/\/(api\.frankfurter\.dev|api\.gold-api\.com)\//.test(url)) throw new Error('izin yok');
      const r = await CapacitorHttp.get({ url, headers: { Accept: 'application/json' } });
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    },
    scheduleReminders: list => scheduleReminders(list),
    openDataFolder: async () => false,
    info: async () => { const i = await App.getInfo(); return { version: i.version, dataPath: 'Telefonun uygulama hafızası' }; },
    checkUpdate: async () => { checkUpdate(); return true; },
    updateState: async () => updateState,
    installUpdate: async () => { if (updateState.url) await Browser.open({ url: updateState.url }); },
    openUrl: async url => { if (/^https:\/\/(github\.com|hfeptlxxphvccfjrtmkv\.supabase\.co)\//.test(url)) await Browser.open({ url }); },
    onDeepLink: cb => {
      App.addListener('appUrlOpen', ({ url }) => { if (url && url.startsWith('kurusukurusuna://')) { Browser.close().catch(() => {}); cb(url); } });
      App.getLaunchUrl().then(r => { if (r?.url?.startsWith('kurusukurusuna://')) cb(r.url); }).catch(() => {});
    },
    onUpdate: cb => { updateCb = cb; },
    bioAvailable: async () => {
      try { const r = await BiometricAuth.checkBiometry(); return r.isAvailable ? { available: true, label: bioLabel(r.biometryType) } : { available: false }; }
      catch { return { available: false }; }
    },
    bioPrompt: async reason => {
      try {
        await BiometricAuth.authenticate({ reason, cancelTitle: 'Vazgeç', allowDeviceCredential: false, iosFallbackTitle: 'PIN gir', androidTitle: 'Kuruşu Kuruşuna', androidSubtitle: reason });
        return true;
      } catch { return false; }
    },
    onResume: cb => {
      let hiddenAt = 0;
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) hiddenAt = Date.now();
        else if (hiddenAt) { cb(Date.now() - hiddenAt); hiddenAt = 0; }
      });
    }
  };

  document.documentElement.classList.add('native', `native-${platform}`);

  // Durum çubuğu yazılarının rengi temaya uysun
  const syncBars = () => {
    const light = document.documentElement.dataset.theme === 'light';
    SystemBars.setStyle({ style: light ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
  };
  new MutationObserver(syncBars).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  syncBars();

  // Android geri tuşu: önce açık formu kapatır, sonra Özet'e döner, en son uygulamadan çıkar
  App.addListener('backButton', () => {
    const ev = new CustomEvent('kk-back', { cancelable: true });
    if (window.dispatchEvent(ev)) App.exitApp();
  });
  if (platform === 'android') {
    setTimeout(checkUpdate, 5000);
    setInterval(checkUpdate, 6 * 60 * 60 * 1000);
  }
}
