const screenLegalGate = document.getElementById('screen-legal-gate');
const screenLogin = document.getElementById('screen-login');
const screenKey = document.getElementById('screen-key');
const screenMain = document.getElementById('screen-main');
const logoutBtn = document.getElementById('logoutBtn');

const googleLoginBtn = document.getElementById('googleLoginBtn');
const googleBtnLabel = document.getElementById('googleBtnLabel');
const loginError = document.getElementById('loginError');

const keyInput = document.getElementById('keyInput');
const activateBtn = document.getElementById('activateBtn');
const keyError = document.getElementById('keyError');

const playBtn = document.getElementById('playBtn');
const playError = document.getElementById('playError');
const statusText = document.getElementById('statusText');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');

const discordBtn = document.getElementById('discordBtn');
const versionText = document.getElementById('versionText');

const playerStatsBox = document.getElementById('playerStatsBox');
const statCoins = document.getElementById('statCoins');
const statSurvival = document.getElementById('statSurvival');
const statCatches = document.getElementById('statCatches');
const statLevel = document.getElementById('statLevel');
const statRank = document.getElementById('statRank');

const legalCheckbox = document.getElementById('legalCheckbox');
const acceptLegalBtn = document.getElementById('acceptLegalBtn');

const legalModal = document.getElementById('legalModal');
const closeLegalModal = document.getElementById('closeLegalModal');
const modalTabs = document.querySelectorAll('.modal-tab');
const modalPanels = document.querySelectorAll('.modal-panel');

// Guarda a qué pantalla volver una vez el usuario cierre el modal legal
// (por defecto, no cambia nada; el modal es una capa encima de la pantalla actual).
let pendingScreen = null;

function showScreen(name) {
  screenLegalGate.classList.add('hidden');
  screenLogin.classList.add('hidden');
  screenKey.classList.add('hidden');
  screenMain.classList.add('hidden');
  logoutBtn.classList.add('hidden');

  if (name === 'legal-gate') screenLegalGate.classList.remove('hidden');
  if (name === 'login') screenLogin.classList.remove('hidden');
  if (name === 'key') {
    screenKey.classList.remove('hidden');
    logoutBtn.classList.remove('hidden'); // ya hay sesión de Google iniciada
  }
  if (name === 'main') {
    screenMain.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    loadPlayerStats();
  }
}

// --- Pide al servidor las estadísticas del jugador y las muestra ---
async function loadPlayerStats() {
  const stats = await window.pillaAPI.getPlayerStats();
  if (!stats || !stats.ok) {
    playerStatsBox.classList.add('hidden');
    return;
  }

  statCoins.textContent = `Monedas: ${stats.coins}`;
  statSurvival.textContent = `Mejor supervivencia: ${Math.round(stats.bestSurvivalSeconds || 0)}s`;
  statCatches.textContent = `Pilladas totales: ${stats.totalCatches || 0}`;
  statLevel.textContent = `Nivel ${stats.level} (${stats.xp}/${stats.xpToNextLevel} XP)`;
  statRank.textContent = stats.rank ? `🏆 ${stats.rank}` : '🏆 Sin rango';

  playerStatsBox.classList.remove('hidden');
}

function setBusy(busy) {
  activateBtn.disabled = busy;
  playBtn.disabled = busy;
}

// --- Modal de documentos legales (Términos / Privacidad / Aviso Legal) ---
function openLegalModal(tab) {
  showTab(tab || 'terminos');
  legalModal.classList.remove('hidden');
}

function closeModal() {
  legalModal.classList.add('hidden');
}

function showTab(tabName) {
  modalTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  modalPanels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.panel !== tabName);
  });
}

// Cualquier botón/link con data-tab abre el modal en esa pestaña
document.querySelectorAll('[data-tab]').forEach((el) => {
  el.addEventListener('click', () => openLegalModal(el.dataset.tab));
});

modalTabs.forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

closeLegalModal.addEventListener('click', closeModal);
legalModal.addEventListener('click', (e) => {
  if (e.target === legalModal) closeModal();
});

// --- Aceptación de términos y privacidad (bloquea el paso hasta marcar la casilla) ---
legalCheckbox.addEventListener('change', () => {
  acceptLegalBtn.disabled = !legalCheckbox.checked;
});

acceptLegalBtn.addEventListener('click', async () => {
  await window.pillaAPI.acceptLegal();
  await continueFlow();
});

// --- Iniciar sesión con Google ---
googleLoginBtn.addEventListener('click', async () => {
  loginError.classList.add('hidden');
  googleLoginBtn.disabled = true;
  googleBtnLabel.textContent = 'Esperando a Google...';

  const result = await window.pillaAPI.loginWithGoogle();

  googleLoginBtn.disabled = false;
  googleBtnLabel.textContent = 'Continuar con Google';

  if (!result.ok) {
    loginError.textContent = result.error || 'No se pudo iniciar sesión.';
    loginError.classList.remove('hidden');
    return;
  }

  await continueFlow();
});

// --- Activación de key nueva ---
activateBtn.addEventListener('click', async () => {
  const key = keyInput.value.trim();
  keyError.classList.add('hidden');

  if (!key) {
    keyError.textContent = 'Introduce una key.';
    keyError.classList.remove('hidden');
    return;
  }

  setBusy(true);
  activateBtn.textContent = 'Activando...';

  const result = await window.pillaAPI.activateKey(key);

  setBusy(false);
  activateBtn.textContent = 'Activar';

  if (!result.ok) {
    keyError.textContent = result.error;
    keyError.classList.remove('hidden');
    return;
  }

  showScreen('main');
});

keyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') activateBtn.click();
});

// --- Jugar (descarga si hace falta, luego lanza el juego) ---
playBtn.addEventListener('click', async () => {
  playError.classList.add('hidden');
  setBusy(true);
  playBtn.textContent = 'Comprobando...';
  progressWrap.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressLabel.textContent = '';

  const result = await window.pillaAPI.startUpdateAndPlay();

  setBusy(false);
  playBtn.textContent = 'Jugar';
  progressWrap.classList.add('hidden');
  statusText.textContent = 'Listo para jugar';

  if (!result.ok) {
    playError.textContent = result.error;
    playError.classList.remove('hidden');
  }
});

window.pillaAPI.onDownloadProgress((progress) => {
  statusText.textContent = `Descargando actualización (${progress.fileIndex}/${progress.totalFiles})`;
  playBtn.textContent = `Descargando... ${progress.overallPercent}%`;
  progressBar.style.width = `${progress.overallPercent}%`;
  progressLabel.textContent = progress.fileName;
});

// --- Cerrar sesión ---
logoutBtn.addEventListener('click', async () => {
  await window.pillaAPI.logout();
  keyInput.value = '';
  showScreen('login');
});

// --- Discord: abrir invitación a la comunidad ---
discordBtn.addEventListener('click', async () => {
  await window.pillaAPI.openDiscord();
});

// --- Mostrar versión del launcher (y del juego, si ya está instalado) ---
(async () => {
  const info = await window.pillaAPI.getVersionInfo();
  versionText.textContent = info.gameVersion
    ? `Launcher v${info.launcherVersion} · Juego v${info.gameVersion}`
    : `Launcher v${info.launcherVersion}`;
})();

// --- Una vez superada (o no necesaria) la pantalla legal, seguimos el flujo normal:
// 1) ¿hay sesión de Google guardada? -> si no, pantalla de login
// 2) si hay sesión, ¿la cuenta ya tiene una key activa? -> si no, pantalla de key
// 3) si tiene key activa -> directo al launcher principal
async function continueFlow() {
  const session = await window.pillaAPI.checkSession();
  if (!session.loggedIn) {
    showScreen('login');
    return;
  }
  showScreen(session.hasLicense ? 'main' : 'key');
}

// --- Al arrancar: primero comprobamos si falta aceptar términos/privacidad ---
(async () => {
  const legal = await window.pillaAPI.checkLegalAccepted();
  if (!legal.accepted) {
    showScreen('legal-gate');
    return;
  }
  await continueFlow();
})();
