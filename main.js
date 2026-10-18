'use strict';
const { app, BrowserWindow, ipcMain, dialog, Notification, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

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
// Mac'te kendiliğinden kurulum yalnızca Apple imzalı programlarda çalışır.
// Bu yüzden Mac'te yeni sürüm bulununca indirme sayfası gösterilir.
const IS_MAC = process.platform === 'darwin';
const RELEASES_URL = 'https://github.com/emirhanduran27-lab/kurusu-kurusuna/releases/latest';
function setupUpdater() {
  autoUpdater.autoDownload = !IS_MAC;
  autoUpdater.autoInstallOnAppQuit = !IS_MAC;
  autoUpdater.on('checking-for-update', () => sendUpdate({ status: 'checking' }));
  autoUpdater.on('update-available', i => {
    if (!IS_MAC) return sendUpdate({ status: 'downloading', version: i.version, percent: 0 });
    const first = updateState.status !== 'manual';
    sendUpdate({ status: 'manual', version: i.version });
    if (first && Notification.isSupported()) {
      const n = new Notification({ title: 'Kuruşu Kuruşuna', body: `${i.version} sürümü çıktı. İndirmek için tıkla.` });
      n.on('click', () => shell.openExternal(RELEASES_URL));
      n.show();
    }
  });
  autoUpdater.on('update-not-available', () => sendUpdate({ status: 'latest' }));
  autoUpdater.on('download-progress', p => sendUpdate({ status: 'downloading', version: updateState.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => {
    sendUpdate({ status: 'ready', version: i.version });
    if (Notification.isSupported()) {
      new Notification({ title: 'Kuruşu Kuruşuna güncellendi', body: `${i.version} sürümü hazır. Program kapanınca kurulacak.`, icon: path.join(__dirname, 'build', 'icon.png') }).show();
    }
  });
  autoUpdater.on('error', e => sendUpdate({ status: 'error', message: String(e?.message || e).split('\n')[0] }));
}
function checkForUpdates() {
  if (!app.isPackaged) { sendUpdate({ status: 'dev' }); return; }
  autoUpdater.checkForUpdates().catch(e => sendUpdate({ status: 'error', message: String(e?.message || e).split('\n')[0] }));
}

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
      sandbox: true
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.emirhan.gelirgider');
    if (IS_MAC) setMacMenu();
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
    ipcMain.handle('update:install', () => {
      if (IS_MAC) return shell.openExternal(RELEASES_URL);
      autoUpdater.quitAndInstall(false, true);
    });
    ipcMain.handle('open:url', (_e, url) => { if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url); });

    createWindow();
    // Açılıştan birkaç saniye sonra, sonra da 6 saatte bir kontrol et
    setTimeout(checkForUpdates, 4000);
    setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
