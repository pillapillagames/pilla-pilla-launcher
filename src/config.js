const path = require('path');
const { app } = require('electron');

module.exports = {
  // URL de tu servidor en Railway. Puedes sobreescribirla con la variable
  // de entorno PILLA_API_URL si algún día cambias de servidor.
  API_BASE_URL: process.env.PILLA_API_URL || 'https://pilla-pilla-server-production.up.railway.app',

  // Carpeta donde se instala el juego, dentro de los datos de usuario de la app
  GAME_DIR: path.join(app.getPath('userData'), 'game'),

  // Archivo donde se guarda qué versión/archivos tenemos instalados localmente
  MANIFEST_FILE: path.join(app.getPath('userData'), 'local-manifest.json'),

  // Enlace de invitación al servidor de Discord de la comunidad
  DISCORD_INVITE_URL: process.env.PILLA_DISCORD_URL || 'https://discord.gg/tu-invitacion',

  // Versión del texto legal (Términos + Privacidad). Súbela cada vez que cambies
  // el contenido legal para forzar que el usuario lo vuelva a aceptar.
  LEGAL_VERSION: '1.0',

  // Datos del responsable, para Aviso Legal / RGPD / LSSI. Sustituye por los tuyos.
  LEGAL_CONTACT_EMAIL: 'contacto@pillapilla.com',
  LEGAL_RESPONSIBLE_NAME: 'Propelfunding',
};
