const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const FILE = path.join(app.getPath('userData'), 'license.token');

function saveToken(token) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    fs.writeFileSync(FILE, encrypted);
  } else {
    // Fallback si el SO no soporta cifrado (raro, pero por si acaso)
    fs.writeFileSync(FILE, token, 'utf-8');
  }
}

function loadToken() {
  if (!fs.existsSync(FILE)) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buf = fs.readFileSync(FILE);
      return safeStorage.decryptString(buf);
    }
    return fs.readFileSync(FILE, 'utf-8');
  } catch (e) {
    return null;
  }
}

function clearToken() {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
}

module.exports = { saveToken, loadToken, clearToken };
