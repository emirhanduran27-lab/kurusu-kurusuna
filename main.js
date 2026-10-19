'use strict';
const { app, BrowserWindow, ipcMain, dialog, Notification, shell, Menu, systemPreferences } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

// Ad Türkçe karakter içerdiği için veri klasörünü elle belirle
app.setPath('userData', path.join(app.getPath('appData'), 'Kuruşu Kuruşuna'));

const DATA_NAME = 'veri.json';
const KEEP_BACKUPS = 30;

function dataDir() { return app.getPath('userData'); }
function dataFile() { return path.join(dataDir(), DATA_NAME); }
function backupDir() { return path.join(dataDir(), 'yedekler'); }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function loadData() {
  return readJson(dataFile()) || readJson(dataFile() + '.bak');
}

function saveData(data) {
  const f = dataFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, f);
  dailyBackup(data);
  return true;
}

// Her gün için bir otomatik yedek tutar, en eski olanları siler
function dailyBackup(data) {
  try {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data), 'utf8');
    const files = fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort();
    while (files.length > KEEP_BACKUPS) fs.unlinkSync(path.join(dir, files.shift()));
  } catch { /* yedek alınamazsa sessizce geç */ }
}

let win;

// Mac'te menü olmadan Cmd+C, Cmd+V, Cmd+Q gibi kısayollar çalışmaz
function setMacMenu() {
  const name = 'Kuruşu Kuruşuna';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: name, submenu: [
      { role: 'about', label: `${name} Hakkında` },
      { type: 'separator' },
      { role: 'hide', label: `${name} Uygulamasını Gizle` },
      { role: 'hideOthers', label: 'Diğerlerini Gizle' },
      { role: 'unhide', label: 'Tümünü Göster' },
      { type: 'separator' },
      { role: 'quit', label: `${name} Uygulamasından Çık` }
    ] },
    { label: 'Düzen', submenu: [
      { role: 'undo', label: 'Geri Al' },
      { role: 'redo', label: 'Yinele' },
      { type: 'separator' },
      { role: 'cut', label: 'Kes' },
      { role: 'copy', label: 'Kopyala' },
      { role: 'paste', label: 'Yapıştır' },
      { role: 'selectAll', label: 'Tümünü Seç' }
    ] },
    { label: 'Görünüm', submenu: [
      { role: 'resetZoom', label: 'Gerçek Boyut' },
      { role: 'zoomIn', label: 'Yakınlaştır' },
      { role: 'zoomOut', label: 'Uzaklaştır' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Tam Ekran' }
    ] },
    { label: 'Pencere', submenu: [
      { role: 'minimize', label: 'Küçült' },
      { role: 'zoom', label: 'Büyüt' },
      { role: 'close', label: 'Kapat' }
    ] }
  ]));
}

// Program eskiden "Gelir Gider" adını taşıyordu. Eski klasörde veri varsa yeni klasöre kopyala.
function migrateOldData() {
  try {
    const oldDir = path.join(app.getPath('appData'), 'Gelir Gider');
    const newFile = dataFile();
    if (fs.existsSync(newFile) || !fs.existsSync(path.join(oldDir, DATA_NAME))) return;
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.copyFileSync(path.join(oldDir, DATA_NAME), newFile);
    const oldBackups = path.join(oldDir, 'yedekler');
    if (fs.existsSync(oldBackups)) {
      fs.mkdirSync(backupDir(), { recursive: true });
      for (const n of fs.readdirSync(oldBackups)) fs.copyFileSync(path.join(oldBackups, n), path.join(backupDir(), n));
    }
  } catch { /* taşınamazsa program boş veriyle açılır, eski klasör yerinde kalır */ }
}

/* ---------- Otomatik güncelleme (GitHub Releases) ---------- */
let updateState = { status: 'idle' };
function sendUpdate(state) {
  updateState = state;
  if (win && !win.isDestroyed()) win.webContents.send('update:state', state);
}
const IS_MAC = process.platform === 'darwin';
const REPO = 'emirhanduran27-lab/kurusu-kurusuna';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

function notifyReady(version) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: 'Kuruşu Kuruşuna güncellemesi hazır', body: `${version} sürümü indirildi. Program kapanınca kurulacak, istersen şimdi de kurabilirsin.`, icon: path.join(__dirname, 'build', 'icon.png') });
  n.on('click', () => { if (win) { win.show(); win.focus(); } });
  n.show();
}

function setupUpdater() {
  // Windows: electron-updater indirir ve sessizce kurar.
  // Mac: Apple imzası olmadan electron-updater kuramadığı için indirme ve kurulumu macUpdate yapar.
  autoUpdater.autoDownload = !IS_MAC;
  autoUpdater.autoInstallOnAppQuit = !IS_MAC;
  autoUpdater.on('checking-for-update', () => { if (!busyUpdating()) sendUpdate({ status: 'checking' }); });
  autoUpdater.on('update-available', i => {
    if (!IS_MAC) return sendUpdate({ status: 'downloading', version: i.version, percent: 0 });
    macUpdate.download(i).catch(err => {
      sendUpdate({ status: 'manual', version: i.version, message: String(err?.message || err) });
    });
  });
  autoUpdater.on('update-not-available', () => { if (!busyUpdating()) sendUpdate({ status: 'latest' }); });
  autoUpdater.on('download-progress', p => sendUpdate({ status: 'downloading', version: updateState.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => { sendUpdate({ status: 'ready', version: i.version }); notifyReady(i.version); });
  autoUpdater.on('error', e => { if (!busyUpdating()) sendUpdate({ status: 'error', message: String(e?.message || e).split('\n')[0] }); });
}
function busyUpdating() { return updateState.status === 'downloading' || updateState.status === 'ready'; }
function checkForUpdates() {
  if (!app.isPackaged) { sendUpdate({ status: 'dev' }); return; }
  if (busyUpdating()) { sendUpdate(updateState); return; }
  autoUpdater.checkForUpdates().catch(e => sendUpdate({ status: 'error', message: String(e?.message || e).split('\n')[0] }));
}
function installUpdate() {
  if (IS_MAC) {
    if (macUpdate.ready) return macUpdate.installAndRestart();
    return shell.openExternal(RELEASES_URL);
  }
  // Sessiz kurulum: sihirbaz açılmaz, kurulum bitince program yeniden açılır
  autoUpdater.quitAndInstall(true, true);
}

// Bir .app paketinin Apple geliştirici kimliği (Team ID). İmzasızsa ya da imza bozuksa null
function teamOf(appPath, strict = false) {
  return new Promise(resolve => {
    const check = () => execFile('/usr/bin/codesign', ['-dv', appPath], (e, _o, err) => {
      if (e) return resolve(null);
      const m = String(err).match(/TeamIdentifier=([A-Z0-9]{10})/);
      resolve(m ? m[1] : null);
    });
    if (!strict) return check();
    execFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], e => e ? resolve(null) : check());
  });
}

/* Mac için kendi güncelleyicimiz: zip'i indirir, doğrular, açar,
   program kapanırken eski .app'i yenisiyle değiştirip yeniden başlatır. */
const macUpdate = {
  ready: null, // { version, newApp }
  downloading: false,
  appPath() { return path.resolve(process.execPath, '..', '..', '..'); },
  canSelfUpdate() {
    const p = this.appPath();
    if (!p.endsWith('.app') || p.startsWith('/Volumes/') || p.includes('AppTranslocation')) return false;
    try { fs.accessSync(path.dirname(p), fs.constants.W_OK); return true; } catch { return false; }
  },
  async download(info) {
    if (this.downloading || (this.ready && this.ready.version === info.version)) return;
    if (!this.canSelfUpdate()) throw new Error('Program Uygulamalar klasöründe değil ya da yazılamıyor');
    const file = (info.files || []).find(f => f.url.endsWith('.zip'));
    if (!file) throw new Error('Mac zip dosyası bulunamadı');
    this.downloading = true;
    try {
      const url = `https://github.com/${REPO}/releases/download/v${info.version}/${file.url}`;
      const dir = path.join(app.getPath('temp'), 'kurusu-kurusuna-guncelleme');
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const zip = path.join(dir, 'update.zip');
      sendUpdate({ status: 'downloading', version: info.version, percent: 0 });
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error('İndirme başarısız: ' + res.status);
      const total = Number(res.headers.get('content-length')) || file.size || 0;
      const hash = crypto.createHash('sha512');
      const out = fs.createWriteStream(zip);
      let got = 0, lastPct = -1;
      for await (const chunk of res.body) {
        hash.update(chunk); got += chunk.length;
        if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
        const pct = total ? Math.floor(got / total * 100) : 0;
        if (pct !== lastPct) { lastPct = pct; sendUpdate({ status: 'downloading', version: info.version, percent: pct }); }
      }
      await new Promise((r, j) => out.end(e => e ? j(e) : r()));
      if (file.sha512 && hash.digest('base64') !== file.sha512) throw new Error('İndirilen dosya doğrulanamadı');
      const unpack = path.join(dir, 'app');
      fs.mkdirSync(unpack);
      await new Promise((r, j) => execFile('/usr/bin/ditto', ['-x', '-k', zip, unpack], e => e ? j(e) : r()));
      const name = fs.readdirSync(unpack).find(n => n.endsWith('.app'));
      if (!name) throw new Error('Zip içinde program bulunamadı');
      // Çalışan program Apple imzalıysa yeni sürüm de aynı geliştiricinin imzasını taşımalı
      const mine = await teamOf(this.appPath());
      if (mine) {
        const theirs = await teamOf(path.join(unpack, name), true);
        if (theirs !== mine) throw new Error('Yeni sürümün imzası doğrulanamadı');
      }
      this.ready = { version: info.version, newApp: path.join(unpack, name) };
      sendUpdate({ status: 'ready', version: info.version });
      notifyReady(info.version);
    } finally {
      this.downloading = false;
    }
  },
  // Program kapandıktan sonra çalışan küçük betik eski programı yenisiyle değiştirir
  spawnSwap(relaunch) {
    const target = this.appPath();
    const backup = target + '.eski';
    const q = s => "'" + s.replace(/'/g, "'\\''") + "'";
    const script = [
      '#!/bin/bash',
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
      `rm -rf ${q(backup)}`,
      `if mv ${q(target)} ${q(backup)} && /usr/bin/ditto ${q(this.ready.newApp)} ${q(target)}; then`,
      `  rm -rf ${q(backup)}`,
      'else',
      `  rm -rf ${q(target)}; mv ${q(backup)} ${q(target)}`,
      'fi',
      `/usr/bin/xattr -cr ${q(target)} 2>/dev/null`,
      relaunch ? `/usr/bin/open ${q(target)}` : ':',
      ''
    ].join('\n');
    const sh = path.join(app.getPath('temp'), 'kurusu-kurusuna-guncelle.sh');
    fs.writeFileSync(sh, script, { mode: 0o755 });
    spawn('/bin/bash', [sh], { detached: true, stdio: 'ignore' }).unref();
    this.ready = null;
  },
  installAndRestart() { this.spawnSwap(true); app.quit(); }
};
// Mac'te güncelleme indirildiyse program kapanırken sessizce kur
app.on('will-quit', () => { if (IS_MAC && macUpdate.ready) macUpdate.spawnSwap(false); });

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: 'Kuruşu Kuruşuna',
    backgroundColor: '#0f1419',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Pencere programın kendi sayfası dışında hiçbir yere gidemez
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'notifications'));
}

// Google ile giriş ve e-posta doğrulamasından sonra kurusukurusuna://auth?code=... ile uygulamaya dönülür
const SCHEME = 'kurusukurusuna';
if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient(SCHEME);
let pendingLink = (process.argv.find(a => a.startsWith(SCHEME + '://')) || null);
function deliverLink(url) {
  if (!url || !url.startsWith(SCHEME + '://')) return;
  if (win && !win.isDestroyed()) { win.webContents.send('deeplink', url); if (win.isMinimized()) win.restore(); win.focus(); }
  else pendingLink = url;
}
app.on('open-url', (e, url) => { e.preventDefault(); deliverLink(url); });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    deliverLink(argv.find(a => a.startsWith(SCHEME + '://')));
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.emirhan.gelirgider');
    // Windows'ta gizli menü (Alt) ve geliştirici araçları kısayolları kapatılır
    if (IS_MAC) setMacMenu(); else Menu.setApplicationMenu(null);
    migrateOldData();
    setupUpdater();

    ipcMain.handle('data:load', () => loadData());
    ipcMain.handle('data:save', (_e, data) => saveData(data));

    ipcMain.handle('data:export', async (_e, data) => {
      const d = new Date().toISOString().slice(0, 10);
      const r = await dialog.showSaveDialog(win, {
        title: 'Yedeği kaydet',
        defaultPath: `kurusu-kurusuna-yedek-${d}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (r.canceled || !r.filePath) return false;
      fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    });

    ipcMain.handle('data:import', async () => {
      const r = await dialog.showOpenDialog(win, {
        title: 'Yedek dosyasını seç',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (r.canceled || !r.filePaths[0]) return null;
      return readJson(r.filePaths[0]);
    });

    ipcMain.handle('csv:export', async (_e, csv, name) => {
      const r = await dialog.showSaveDialog(win, {
        title: 'CSV olarak kaydet',
        defaultPath: name || 'islemler.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });
      if (r.canceled || !r.filePath) return false;
      // Excel Türkçe karakterleri doğru okusun diye BOM ekleniyor
      fs.writeFileSync(r.filePath, '﻿' + csv, 'utf8');
      return true;
    });

    // PDF rapor gibi ikili dosyalar: kaydedilir ve varsayılan programla açılır
    ipcMain.handle('file:save', async (_e, name, bytes, title) => {
      const safe = String(name || 'dosya').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
      const ext = (safe.match(/\.([a-z0-9]{1,5})$/i) || [, 'pdf'])[1].toLowerCase();
      if (!['pdf'].includes(ext)) throw new Error('izin yok');
      const r = await dialog.showSaveDialog(win, {
        title: title || 'Kaydet',
        defaultPath: path.join(app.getPath('documents'), safe),
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      });
      if (r.canceled || !r.filePath) return false;
      fs.writeFileSync(r.filePath, Buffer.from(bytes));
      if (/\.pdf$/i.test(r.filePath)) shell.openPath(r.filePath);
      return true;
    });

    ipcMain.handle('notify', (_e, title, body) => {
      if (!Notification.isSupported()) return false;
      const n = new Notification({ title, body, icon: path.join(__dirname, 'build', 'icon.png') });
      n.on('click', () => { if (win) { win.show(); win.focus(); } });
      n.show();
      return true;
    });

    ipcMain.handle('open:datafolder', () => shell.openPath(dataDir()));
    ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataPath: dataFile() }));
    ipcMain.handle('update:check', () => { checkForUpdates(); return true; });
    ipcMain.handle('update:state', () => updateState);
    ipcMain.handle('update:install', () => installUpdate());
    // Mac'te Touch ID ile kilit açma
    ipcMain.handle('bio:available', () => {
      try { return IS_MAC && systemPreferences.canPromptTouchID() ? { available: true, label: 'Touch ID' } : { available: false }; }
      catch { return { available: false }; }
    });
    ipcMain.handle('bio:prompt', async (_e, reason) => {
      try { await systemPreferences.promptTouchID(String(reason || 'Kilidi aç')); return true; } catch { return false; }
    });
    ipcMain.handle('open:url', (_e, url) => { if (/^https:\/\/(github\.com|hfeptlxxphvccfjrtmkv\.supabase\.co)\//.test(url) || /^mailto:emirhanduran27@gmail\.com\?/.test(url)) shell.openExternal(url); });
    ipcMain.handle('http:get', async (_e, url) => {
      if (!/^https:\/\/(api\.frankfurter\.dev|api\.gold-api\.com)\//.test(url)) throw new Error('izin yok');
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
    ipcMain.handle('deeplink:pending', () => { const u = pendingLink; pendingLink = null; return u; });

    createWindow();
    // Açılıştan birkaç saniye sonra, sonra da 6 saatte bir kontrol et
    setTimeout(checkForUpdates, 4000);
    setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
