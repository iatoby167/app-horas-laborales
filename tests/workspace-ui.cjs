// Flujos reales en Electron con almacenamiento aislado, sin tocar perfiles del usuario.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'hub-workspace-test-')));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 960, webPreferences: {
    partition: 'workspace-test', contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false
  } });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, cb) => cb({ cancel: true }));
  const errors = [];
  win.webContents.on('console-message', details => {
    if (/Uncaught|TypeError|ReferenceError/.test(details.message || '')) errors.push(details.message);
  });
  await win.loadFile(path.resolve(__dirname, '../index.html'));
  const run = code => win.webContents.executeJavaScript(`(async () => {
    const $ = s => document.querySelector(s);
    const click = s => { if (!$(s)) throw Error('No existe: ' + s); $(s).click(); };
    const submit = s => $(s).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const check = (ok, text) => { if (!ok) throw Error(text); };
    const period = v => { $('#periodInput').value = v; $('#periodInput').dispatchEvent(new Event('change', { bubbles: true })); };
    const ws = () => JSON.parse(localStorage.getItem('libreta-horas:hub:workspace'));
    const sources = () => JSON.parse(localStorage.getItem('libreta-horas:hub:sources'));
    ${code}
  })()`);
  await run(`
    period('2026-10');
    const p = $('#profileForm').elements;
    p.name.value = 'Estudio Abierto'; p.currency.value = 'EUR'; p.locale.value = 'es-ES';
    p['label-hours'].value = 'Clases'; p['module-expenses'].checked = true;
    submit('#profileForm');
    check(!$('#profileForm'), 'No terminó la bienvenida');
    check($('#mainNav [data-route="hours"]').textContent.includes('Clases'), 'No personalizó el menú');
    click('#mainNav [data-route="clients"]'); click('[data-workspace-action="new-client"]');
    let f = $('[data-workspace-form]').elements; f.name.value = 'Ana'; f.email.value = 'ana@example.test';
    submit('[data-workspace-form]');
    click('[data-workspace-action="new-service"]'); f = $('[data-workspace-form]').elements;
    f.name.value = 'Clase particular'; f.rate.value = '25'; f.unit.value = 'hour'; f.clientId.value = ws().clients[0].id;
    submit('[data-workspace-form]');
    click('[data-workspace-action="service-income"]'); f = $('#sourceForm').elements;
    check(f.name.value === 'Clase particular' && f.amount.value === '25' && f.currency.value === 'EUR', 'No aplicó la tarifa');
    f.estimatedHours.value = '3'; f.paymentStatus.value = 'paid'; submit('#sourceForm');
    check(!$('#sourceDialog').open, 'No guardó el ingreso');
    click('[data-workspace-action="edit-service"]'); f = $('[data-workspace-form]').elements;
    f.rate.value = '50'; submit('[data-workspace-form]');
    check(sources()[0].amount === 25, 'Cambiar tarifa modificó trabajos existentes');
    click('#mainNav [data-route="expenses"]'); click('[data-workspace-action="new-expense"]');
    f = $('[data-workspace-form]').elements; f.name.value = 'Materiales'; f.amount.value = '35'; f.date.value = '2026-10-08';
    submit('[data-workspace-form]');
    click('#mainNav [data-route="hub"]');
    const cards = [...document.querySelectorAll('.kpi-card')];
    check(cards.some(c => c.textContent.includes('Balance') && c.textContent.includes('40')), 'Balance no descuenta gastos pagados de los 75 cobrados');
    period('2026-11');
    check(!$('#view').textContent.includes('Clase particular'), 'El trabajo por horas se repite el mes siguiente');
    period('2026-10'); click('#mainNav [data-route="expenses"]'); click('[data-workspace-action="edit-expense"]');
    click('[data-workspace-action="delete-item"]');
    check(ws().expenses[0].deletedAt, 'No envió gasto a papelera');
    click('#mainNav [data-route="settings"]'); click('[data-workspace-action="restore-item"][data-kind="expenses"]');
    check(!ws().expenses[0].deletedAt, 'No restauró gasto');
    $('#holidayForm').elements.dates.value = '2027-01-01, 2027-03-24'; submit('#holidayForm');
    const profile = $('#profileForm').elements; profile['module-saas'].checked = false; profile.weekStart.value = '0';
    submit('#profileForm');
    check($('#mainNav [data-route="saas"]').hidden, 'No oculta módulo desactivado');
    $('#conversionForm').elements['rate-USD'].value = '0,9'; $('#conversionForm').elements['rate-ARS'].value = '0,001'; submit('#conversionForm');
    check(ws().profile.rates.USD === .9, 'Conversión regional incorrecta');
    submit('#conversionForm'); check(ws().profile.rates.ARS === .001, 'Guardar de nuevo cambió los decimales de la tasa');
    click('[data-workspace-action="snapshot"]');
    const data = await import('./data.js'); const backup = data.parseBackup(JSON.stringify(data.exportBackup(data.loadSettings(), new Map(), sources(), {}, {})));
    check(backup.workspace.clients[0].name === 'Ana' && backup.workspace.expenses[0].amount === 35, 'Backup incompleto');
    check(data.listSafetyBackups().some(b => b.reason === 'Copia manual'), 'No creó copia manual');
    click('#mainNav [data-route="hub"]');
  `);
  const out = path.resolve(__dirname, '../dist-prueba/qa');
  fs.mkdirSync(out, { recursive: true });
  // El renderizador oculto puede suspender las animaciones; para QA visual
  // capturamos el estado final sin transiciones, como con movimiento reducido.
  await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }');
  const screenshot = async name => {
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await new Promise(r => setTimeout(r, 400));
    fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  await new Promise(r => setTimeout(r, 500));
  await screenshot('dashboard');
  await run(`click('#mainNav [data-route="settings"]');`);
  await screenshot('settings');
  await run(`click('#mainNav [data-route="hub"]'); click('[data-action="new-source"]');`);
  await screenshot('income');
  await run(`click('#cancelSource');`);
  win.setSize(390, 844);
  await new Promise(r => setTimeout(r, 300));
  await run(`check(document.documentElement.scrollWidth <= innerWidth + 1, 'Desbordamiento horizontal en ventana angosta');`);
  await screenshot('mobile');
  await win.loadFile(path.resolve(__dirname, '../index.html'));
  await run(`check(ws().profile.name === 'Estudio Abierto' && ws().profile.weekStart === 0, 'No persistió personalización');`);
  await run(`localStorage.clear();`); // Solo la partición temporal de esta prueba.
  await win.loadFile(path.resolve(__dirname, '../index.html'));
  await run(`
    click('[data-workspace-action="demo"]');
    check(ws().profile.demoActive && sources()[0].id === 'demo-income', 'No cargó ejemplos');
    click('[data-action="new-source"][data-type="project"]');
    const f = $('#sourceForm').elements; f.name.value = 'Mi ingreso'; f.amount.value = '400'; submit('#sourceForm');
    click('[data-workspace-action="remove-demo"]');
    check(!ws().profile.demoActive && sources().length === 1 && sources()[0].name === 'Mi ingreso', 'Quitar ejemplos borró datos propios');
    check(ws().clients.length === 0 && ws().expenses.length === 0, 'Dejó datos de ejemplo');
  `);
  assert.deepEqual(errors, []);
  console.log('OK: bienvenida, preferencias, clientes, tarifas, ingresos, gastos, papelera, copias, ejemplos, persistencia y vista angosta.');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
