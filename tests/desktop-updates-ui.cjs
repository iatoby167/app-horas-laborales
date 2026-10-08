// Interfaz real y preload real; la descarga/instalación se simulan para no modificar Windows.
const { app, BrowserWindow, ipcMain } = require('electron');
const { EventEmitter } = require('node:events');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createUpdateController } = require('../desktop-updater.cjs');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'hub-update-ui-')));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: {
    preload: path.resolve(__dirname, '../preload.cjs'), partition: 'update-ui-test',
    contextIsolation: true, nodeIntegration: false, sandbox: true
  } });
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, callback) => callback({ cancel: true }));
  const updater = new EventEmitter();
  let installed = false;
  updater.checkForUpdates = async () => { updater.emit('update-available', { version: '1.0.3' }); return {}; };
  updater.downloadUpdate = async () => {
    updater.emit('download-progress', { percent: 50 });
    await new Promise(resolve => setTimeout(resolve, 200));
    updater.emit('update-downloaded', { version: '1.0.3' });
  };
  updater.quitAndInstall = () => { installed = true; };
  const controller = createUpdateController({ updater, version: '1.0.2', packaged: true, portable: false,
    configured: true, publish: state => window.webContents.send('updates:changed', state) });
  for (const [name, action] of Object.entries({ state: 'getState', check: 'check', download: 'download', install: 'install' })) {
    ipcMain.handle(`updates:${name}`, async () => { await controller[action](); return controller.getState(); });
  }
  await window.loadFile(path.resolve(__dirname, '../index.html'));
  await window.webContents.executeJavaScript(`(async () => {
    const $ = selector => document.querySelector(selector);
    async function waitFor(check) {
      for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 30)); }
      throw new Error('Tiempo agotado: ' + check);
    }
    await waitFor(() => !$('#desktopUpdateButton').hidden);
    $('#desktopUpdateButton').click();
    await waitFor(() => $('[data-update-action="check"]') && !$('[data-update-action="check"]').disabled);
    if (!$('#desktopUpdatesCard').textContent.includes('1.0.2')) throw new Error('Falta versión instalada');
    // El progreso no debe volver a renderizar los otros formularios de Ajustes.
    $('#multiplierInput').value = '7';
    $('[data-update-action="check"]').click();
    await waitFor(() => $('[data-update-action="download"]'));
    $('[data-update-action="download"]').click();
    await waitFor(() => $('#desktopUpdatesCard progress'));
    await waitFor(() => $('[data-update-action="install"]'));
    if ($('#multiplierInput').value !== '7') throw new Error('Se perdió el formulario abierto');
    $('[data-update-action="install"]').click();
    await waitFor(() => $('#desktopUpdatesCard').textContent.includes('Cerrando'));
  })()`);
  assert.equal(installed, true);
  console.log('OK: botón visible, versión, búsqueda, descarga, progreso y reinicio con preload aislado.');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
