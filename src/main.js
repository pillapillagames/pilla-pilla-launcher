const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

const { API_BASE_URL, DISCORD_INVITE_URL, LEGAL_VERSION } = require('./config');
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

// --- IPC: iniciar sesión con Google ---
// Abre el navegador del sistema en /auth/google del servidor, y levanta un
// mini-servidor local en un puerto libre para recibir el token cuando Google
// termine el login. El servidor debe redirigir a redirect_uri con ?token=...
ipcMain.handle('login-google', async () => {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { server.close(); } catch (e) { /* noop */ }
      resolve(result);
    };

    const server = http.createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url, 'http://127.0.0.1');
      } catch (e) {
        res.writeHead(400).end();
        return;
      }

      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const token = url.searchParams.get('token');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        token
          ? '<html><body style="font-family:sans-serif;text-align:center;padding-top:80px;"><h2>Sesión iniciada ✅</h2><p>Ya puedes cerrar esta pestaña y volver al launcher.</p></body></html>'
          : '<html><body style="font-family:sans-serif;text-align:center;padding-top:80px;"><h2>No se pudo iniciar sesión</h2><p>Cierra esta pestaña e inténtalo de nuevo desde el launcher.</p></body></html>'
      );

      if (token) {
        saveToken(token);
        finish({ ok: true });
      } else {
        finish({ ok: false, error: error || 'Login cancelado.' });
      }
    });

    const timeout = setTimeout(() => {
      finish({ ok: false, error: 'Tiempo de espera agotado. Inténtalo de nuevo.' });
    }, 5 * 60 * 1000);

    server.on('error', () => {
      finish({ ok: false, error: 'No se pudo abrir el puerto local para el login.' });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const authUrl = `${API_BASE_URL}/auth/google?redirect_uri=${encodeURIComponent(redirectUri)}`;
      shell.openExternal(authUrl);
    });
  });
});

// --- IPC: comprobar si hay sesión de Google guardada y si esa cuenta tiene licencia activa ---
ipcMain.handle('check-session', async () => {
  const token = loadToken();
  if (!token) return { ok: false, loggedIn: false };

  try {
    const res = await fetch(`${API_BASE_URL}/api/session/validate`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      clearToken();
      return { ok: false, loggedIn: false };
    }

    // Si el servidor reconoce que esta cuenta ya tiene licencia (aunque el
    // token guardado localmente fuera solo de sesión, sin licenseId), nos
    // manda un token de licencia fresco. Lo guardamos para que las próximas
    // llamadas (stats, manifest...) ya lo usen directamente, sin tener que
    // volver a canjear la key.
    if (data.token) {
      saveToken(data.token);
    }

    return { ok: true, loggedIn: true, hasLicense: !!data.hasLicense, user: data.user || null };
  } catch (err) {
    // Sin conexión: si el juego ya está instalado, dejamos entrar en modo offline básico
    return { ok: false, loggedIn: true, hasLicense: isGameInstalled(), offline: true };
  }
});

// --- IPC: canjear/activar una key en la cuenta ya logueada ---
ipcMain.handle('activate-key', async (_event, key) => {
  const token = loadToken();
  if (!token) {
    return { ok: false, error: 'Debes iniciar sesión con Google primero.' };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'No se pudo activar la key.' };
    }

    // El servidor devuelve, junto a { ok: true }, un token NUEVO que ya lleva
    // el licenseId dentro (el que sirve para que /api/session/validate
    // reconozca la licencia en futuros arranques). Si no lo guardamos aquí,
    // en disco se queda el token de sesión viejo (sin licenseId) y el
    // launcher volverá a pedir la key cada vez, aunque el servidor ya sepa
    // que esta cuenta tiene una licencia activa.
    if (data.token) {
      saveToken(data.token);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'No se pudo conectar con el servidor. ¿Tienes internet?' };
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
