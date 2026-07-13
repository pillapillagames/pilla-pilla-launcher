const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const FILE = path.join(app.getPath('userData'), 'device-id.txt');

function getDeviceId() {
  try {
    if (fs.existsSync(FILE)) {
      return fs.readFileSync(FILE, 'utf-8').trim();
    }
  } catch (e) {
    // sigue abajo y genera uno nuevo
  }
  const id = crypto.randomUUID();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, id, 'utf-8');
  return id;
}

module.exports = { getDeviceId };
