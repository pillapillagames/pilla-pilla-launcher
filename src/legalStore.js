const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE = path.join(app.getPath('userData'), 'legal-acceptance.json');

// Guarda que el usuario aceptó los Términos y la Política de Privacidad,
// junto con la versión del texto legal aceptada y la fecha.
function saveAcceptance(version) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(
    FILE,
    JSON.stringify({ accepted: true, version, acceptedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  );
}

function loadAcceptance() {
  if (!fs.existsSync(FILE)) return { accepted: false, version: null, acceptedAt: null };
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch (e) {
    return { accepted: false, version: null, acceptedAt: null };
  }
}

// El usuario debe volver a aceptar si nunca aceptó, o si el texto legal cambió de versión.
function hasAccepted(currentVersion) {
  const data = loadAcceptance();
  return data.accepted === true && data.version === currentVersion;
}

module.exports = { saveAcceptance, loadAcceptance, hasAccepted };
