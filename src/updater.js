const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { API_BASE_URL, GAME_DIR, MANIFEST_FILE } = require('./config');

async function fetchRemoteManifest(token) {
  const res = await fetch(`${API_BASE_URL}/api/game/manifest`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error obteniendo el manifest (${res.status})`);
  }
  return res.json();
}

function loadLocalManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) return { version: null, files: [] };
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
  } catch (e) {
    return { version: null, files: [] };
  }
}

function saveLocalManifest(manifest) {
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), 'utf-8');
}

function sha256OfFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

// Compara manifest remoto vs local (por checksum) y devuelve la lista de archivos a descargar
function diffFiles(remoteFiles, localFiles) {
  const localByPath = Object.fromEntries(localFiles.map((f) => [f.path, f]));
  return remoteFiles.filter((rf) => {
    const local = localByPath[rf.path];
    if (!local || local.sha256 !== rf.sha256) return true;
    const fullPath = path.join(GAME_DIR, rf.path);
    if (!fs.existsSync(fullPath)) return true;
    return false;
  });
}

async function downloadFile(token, version, remoteFile, destPath, onProgress) {
  const url = `${API_BASE_URL}/api/game/download?version=${encodeURIComponent(
    version
  )}&file=${encodeURIComponent(remoteFile.path)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Error descargando ${remoteFile.path} (${res.status})`);

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmpPath = destPath + '.tmp';
  const fileStream = fs.createWriteStream(tmpPath);

  const reader = res.body.getReader();
  let downloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
    downloaded += value.length;
    onProgress(downloaded);
  }

  await new Promise((resolve, reject) => {
    fileStream.end((err) => (err ? reject(err) : resolve()));
  });

  // Verificación de integridad antes de dar el archivo por bueno
  const actualHash = sha256OfFile(tmpPath);
  if (actualHash !== remoteFile.sha256) {
    fs.unlinkSync(tmpPath);
    throw new Error(`Checksum inválido para ${remoteFile.path}, descarga corrupta.`);
  }

  fs.renameSync(tmpPath, destPath); // escritura atómica: no deja archivos a medias
}

/**
 * Comprueba actualizaciones y descarga lo necesario.
 * onProgress recibe { fileIndex, totalFiles, fileName, fileBytes, fileTotalBytes, overallPercent }
 */
async function checkAndUpdate(token, onProgress) {
  const remote = await fetchRemoteManifest(token);
  const local = loadLocalManifest();

  const toDownload = diffFiles(remote.files, local.files);
  const totalBytes = toDownload.reduce((sum, f) => sum + f.size, 0) || 1;
  let bytesDoneSoFar = 0;

  if (toDownload.length === 0) {
    return { updated: false, version: remote.version, executable: remote.executable };
  }

  for (let i = 0; i < toDownload.length; i++) {
    const remoteFile = toDownload[i];
    const destPath = path.join(GAME_DIR, remoteFile.path);

    await downloadFile(token, remote.version, remoteFile, destPath, (fileBytes) => {
      const overallBytes = bytesDoneSoFar + fileBytes;
      onProgress({
        fileIndex: i + 1,
        totalFiles: toDownload.length,
        fileName: remoteFile.path,
        fileBytes,
        fileTotalBytes: remoteFile.size,
        overallPercent: Math.min(100, Math.round((overallBytes / totalBytes) * 100)),
      });
    });

    bytesDoneSoFar += remoteFile.size;
  }

  saveLocalManifest({ version: remote.version, files: remote.files, executable: remote.executable });
  return { updated: true, version: remote.version, executable: remote.executable };
}

function getPlayExecutablePath() {
  const manifest = loadLocalManifest();
  if (!manifest.executable) return null;
  return path.join(GAME_DIR, manifest.executable);
}

function isGameInstalled() {
  const exe = getPlayExecutablePath();
  return exe ? fs.existsSync(exe) : false;
}

module.exports = { checkAndUpdate, getPlayExecutablePath, isGameInstalled, loadLocalManifest };
