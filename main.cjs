const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { createUpdateController } = require('./desktop-updater.cjs');
const packageInfo = require('./package.json');
const { configureDistribution } = require('./desktop-distribution.cjs');
const distribution = configureDistribution(app, packageInfo);
const { autoUpdater } = require('electron-updater');
const appUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
let mainWindow;
let updates;
let installPromptOpen = false;

function trustedSender(event) {
  return mainWindow && event.sender === mainWindow.webContents
    && event.senderFrame === mainWindow.webContents.mainFrame
    && event.senderFrame.url === appUrl;
}

function registerUpdates() {
  updates = createUpdateController({
    updater: autoUpdater,
    version: app.getVersion(),
    channel: distribution.channel,
    packaged: app.isPackaged,
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
    configured: app.isPackaged
      ? fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))
      : Boolean(packageInfo.build?.publish),
    publish: state => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:changed', state);
    }
  });
  for (const [channel, action] of Object.entries({ state: 'getState', check: 'check', download: 'download' })) {
    ipcMain.handle(`updates:${channel}`, event => {
      if (!trustedSender(event)) throw new Error('Solicitud no autorizada');
      return updates[action]();
    });
  }
  ipcMain.handle('updates:install', async event => {
    if (!trustedSender(event)) throw new Error('Solicitud no autorizada');
    if (installPromptOpen || updates.getState().status !== 'downloaded') return updates.getState();
    installPromptOpen = true;
    try {
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'question', title: 'Instalar actualización',
        message: '¿Cerrar el programa e instalar la actualización?',
        detail: 'Guardá cualquier formulario abierto antes de continuar. Tus registros guardados se conservarán.',
        buttons: ['Instalar y reiniciar', 'Ahora no'], defaultId: 0, cancelId: 1
      });
      if (choice.response === 0) {
        mainWindow.webContents.session.flushStorageData();
        updates.install();
      }
    } finally { installPromptOpen = false; }
    return updates.getState();
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#E9EEEA',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow = window;
  if (distribution.isTest) {
    window.on('page-title-updated', event => {
      event.preventDefault();
      window.setTitle('Hub de Ingresos — VERSIÓN DE PRUEBA');
    });
  }

  window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.on('will-navigate', event => event.preventDefault());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerUpdates();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
