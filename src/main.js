const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const { API_BASE_URL, DISCORD_INVITE_URL, LEGAL_VERSION } = require('./config');
const { getDeviceId } = require('./deviceId');
const { saveToken, loadToken, clearToken } = require('./tokenStore');
const { checkAndUpdate, getPlayExecutablePath, isGameInstalled, loadLocalManifest } = require('./updater');
const { saveAcceptance, hasAccepted } = require('./legalStore');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 620,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC: activar una key nueva ---
ipcMain.handle('activate-key', async (_event, key) => {
  try {
    const deviceId = getDeviceId();
    const res = await fetch(`${API_BASE_URL}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, deviceId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'No se pudo activar la key.' };
    }
    saveToken(data.token);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'No se pudo conectar con el servidor. ¿Tienes internet?' };
  }
});

// --- IPC: comprobar si ya hay una licencia guardada y sigue siendo válida ---
ipcMain.handle('check-existing-license', async () => {
  const token = loadToken();
  if (!token) return { ok: false };

  try {
    const res = await fetch(`${API_BASE_URL}/api/license/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      clearToken();
      return { ok: false };
    }
    return { ok: true, gameInstalled: isGameInstalled() };
  } catch (err) {
    // Sin conexión: dejamos jugar si el juego ya está instalado (modo offline básico)
    return { ok: isGameInstalled(), offline: true };
  }
});

ipcMain.handle('logout', async () => {
  clearToken();
  return { ok: true };
});

// --- IPC: pedir al servidor las estadísticas actuales del jugador ---
// (monedas, nivel, XP, mejor supervivencia, pilladas totales, rango...)
ipcMain.handle('get-player-stats', async () => {
  const token = loadToken();
  if (!token) return { ok: false, error: 'No hay licencia activa.' };

  try {
    const res = await fetch(`${API_BASE_URL}/api/player/stats`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'No se pudieron cargar las estadísticas.' };
    }
    return data;
  } catch (err) {
    return { ok: false, error: 'No se pudo conectar con el servidor.' };
  }
});

// --- IPC: versión del launcher y del juego ---
// Consulta al servidor cuál es la última versión disponible (así el número
// siempre está actualizado, incluso antes de descargar el juego). Si no hay
// conexión, cae de vuelta a la versión instalada localmente.
ipcMain.handle('get-version-info', async () => {
  const launcherVersion = app.getVersion();

  try {
    const res = await fetch(`${API_BASE_URL}/api/game/version`);
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.gameVersion) {
        return {
          launcherVersion: data.launcherVersion || launcherVersion,
          gameVersion: data.gameVersion,
        };
      }
    }
  } catch (err) {
    // Sin conexión o servidor caído: seguimos con el manifest local
  }

  const manifest = loadLocalManifest();
  return {
    launcherVersion,
    gameVersion: manifest.version || null,
  };
});

// --- IPC: abrir el Discord de la comunidad en el navegador ---
ipcMain.handle('open-discord', async () => {
  await shell.openExternal(DISCORD_INVITE_URL);
  return { ok: true };
});

// --- IPC: comprobar si el usuario ya aceptó los términos/privacidad vigentes ---
ipcMain.handle('check-legal-accepted', async () => {
  return { accepted: hasAccepted(LEGAL_VERSION), version: LEGAL_VERSION };
});

// --- IPC: registrar la aceptación de términos/privacidad ---
ipcMain.handle('accept-legal', async () => {
  saveAcceptance(LEGAL_VERSION);
  return { ok: true };
});

// --- IPC: descargar actualizaciones (si las hay) y lanzar el juego ---
ipcMain.handle('start-update-and-play', async () => {
  const token = loadToken();
  if (!token) return { ok: false, error: 'No hay licencia activa.' };

  try {
    await checkAndUpdate(token, (progress) => {
      mainWindow.webContents.send('download-progress', progress);
    });

    const exePath = getPlayExecutablePath();
    if (!exePath || !fs.existsSync(exePath)) {
      return { ok: false, error: 'No se encontró el ejecutable del juego tras la descarga.' };
    }

    const child = spawn(exePath, [`--license-token=${token}`], { detached: true, stdio: 'ignore', cwd: path.dirname(exePath) });
    child.unref();

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
