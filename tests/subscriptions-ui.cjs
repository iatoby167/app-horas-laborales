// Prueba de integración con el renderer real, en una sesión temporal sin datos del usuario.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'hub-subscriptions-test-')));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: {
    partition: 'subscriptions-test', contextIsolation: true, nodeIntegration: false, sandbox: true
  } });
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, callback) => callback({ cancel: true }));
  const errors = [];
  window.webContents.on('console-message', (_, level, message) => {
    if (level === 3 && /Uncaught|TypeError|ReferenceError/.test(message)) errors.push(message);
  });
  await window.loadFile(path.resolve(__dirname, '../index.html'));
  const result = await window.webContents.executeJavaScript(`(async () => {
    const $ = selector => document.querySelector(selector);
    const period = value => { $('#periodInput').value = value; $('#periodInput').dispatchEvent(new Event('change', { bubbles: true })); };
    const click = selector => { const element = $(selector); if (!element) throw new Error('No existe: ' + selector); element.click(); };
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    period('2026-10');
    click('#mainNav [data-route="saas"]');
    click('#view [data-action="new-source"]');
    const fields = $('#sourceForm').elements;
    fields.name.value = 'Suscripción de prueba';
    fields.amount.value = '100';
    fields.paymentStatus.value = 'paid';
    fields.paidAmount.value = '100';
    $('#sourceForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    check($('#view [data-action="toggle-source-payment"]').textContent === 'Cobrado total', 'No guardó el cobro inicial');
    period('2026-09');
    check(!$('#view [data-source-card]'), 'Aparece antes del alta');
    period('2026-11');
    check($('#view [data-action="toggle-source-payment"]').textContent === 'Pendiente', 'Heredó cobro del mes anterior');
    click('#view [data-action="toggle-source-status"]');
    check($('#view [data-action="toggle-source-status"]').textContent === 'Pausado', 'No pausó noviembre');
    period('2026-12');
    check($('#view [data-action="toggle-source-status"]').textContent === 'Activo', 'Heredó pausa de noviembre');
    click('#view [data-action="edit-source"]');
    check(fields.projectStatus.value === 'active' && fields.paymentStatus.value === 'pending', 'Formulario con estado de otro mes');
    fields.projectStatus.value = 'paused';
    $('#sourceForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    period('2027-01');
    check($('#view [data-action="toggle-source-status"]').textContent === 'Activo', 'La pausa del formulario afectó enero');
    click('#view [data-action="toggle-source-payment"]');
    period('2026-10');
    check($('#view [data-action="toggle-source-payment"]').textContent === 'Cobrado total', 'Cambió el cobro de octubre');
    check($('#view [data-action="toggle-source-status"]').textContent === 'Activo', 'Cambió el estado de octubre');
    period('2026-11');
    click('#view [data-action="edit-source"]');
    check(fields.projectStatus.value === 'paused', 'El formulario no muestra la pausa mensual');
    click('#cancelSource');
    return JSON.parse(localStorage.getItem('libreta-horas:hub:sources'))[0];
  })()`);
  assert.equal(result.startPeriod, '2026-10');
  assert.equal(result.statuses['2026-11'], 'paused');
  assert.equal(result.statuses['2026-12'], 'paused');
  assert.equal(result.payments['2027-01'].status, 'paid');
  const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload();
  await loaded;
  const reloaded = await window.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('libreta-horas:hub:sources'))[0]`);
  assert.deepEqual(reloaded, result);
  assert.deepEqual(errors, []);
  console.log('OK: alta, navegación mensual, cobros, pausa por botón y formulario, y recarga en Electron.');
  app.exit(0);
}).catch(error => {
  console.error(error);
  app.exit(1);
});
