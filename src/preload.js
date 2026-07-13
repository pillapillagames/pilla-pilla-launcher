const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pillaAPI', {
  activateKey: (key) => ipcRenderer.invoke('activate-key', key),
  checkExistingLicense: () => ipcRenderer.invoke('check-existing-license'),
  logout: () => ipcRenderer.invoke('logout'),
  startUpdateAndPlay: () => ipcRenderer.invoke('start-update-and-play'),
  getVersionInfo: () => ipcRenderer.invoke('get-version-info'),
  getPlayerStats: () => ipcRenderer.invoke('get-player-stats'),
  openDiscord: () => ipcRenderer.invoke('open-discord'),
  checkLegalAccepted: () => ipcRenderer.invoke('check-legal-accepted'),
  acceptLegal: () => ipcRenderer.invoke('accept-legal'),
  onDownloadProgress: (callback) =>
    ipcRenderer.on('download-progress', (_event, data) => callback(data)),
  onLaunchError: (callback) =>
    ipcRenderer.on('launch-error', (_event, message) => callback(message)),
});
