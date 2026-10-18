'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  exportJson: (data) => ipcRenderer.invoke('data:export', data),
  importJson: () => ipcRenderer.invoke('data:import'),
  exportCsv: (csv, name) => ipcRenderer.invoke('csv:export', csv, name),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
  openDataFolder: () => ipcRenderer.invoke('open:datafolder'),
  info: () => ipcRenderer.invoke('app:info'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  updateState: () => ipcRenderer.invoke('update:state'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openUrl: (url) => ipcRenderer.invoke('open:url', url),
  onUpdate: (cb) => ipcRenderer.on('update:state', (_e, st) => cb(st)),
  bioAvailable: () => ipcRenderer.invoke('bio:available'),
  bioPrompt: (reason) => ipcRenderer.invoke('bio:prompt', reason)
});
