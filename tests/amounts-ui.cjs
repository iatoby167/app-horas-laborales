// Regresión visual: importes completos dentro de tarjetas, sin recortes.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'hub-amounts-test-')));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: {
    partition: 'amounts-test', contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false
  } });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, cb) => cb({ cancel: true }));
  const page = path.resolve(__dirname, '../index.html');
  await win.loadFile(page);
  await win.webContents.executeJavaScript(`(async () => {
    const d = await import('./data.js'), w = await import('./workspace.js');
    const period = d.todayKey();
    w.saveWorkspace(w.normalizeWorkspace({ profile: { onboarded: true, currency: 'ARS', rates: { USD: 1234.56 }, modules: { expenses: true } },
      expenses: [{ id: 'expense-large', name: 'Gasto mensual', amount: 9876543210987.65, currency: 'ARS', date: period + '-01', paid: true }],
      clients: [{ id: 'client-large', name: 'Cliente de prueba' }], services: [{ id: 'service-large', name: 'Servicio', rate: 9876543210.98, currency: 'USD' }] }));
    d.saveSources(['saas', 'project', 'hours'].map((type, i) => d.normalizeSource({ id: 'income-' + type, type, name: 'Ingreso ' + type, amount: 9876543210.98, currency: i === 0 ? 'USD' : 'ARS',
      clientId: 'client-large', startPeriod: period, period, expectedDate: period + '-01', projectStatus: 'active', estimatedHours: 120,
      payments: { [period]: { status: 'partial', paidAmount: 123456789.12 } } })));
    d.saveMonth(period, { days: { [period + '-01']: 8 } });
    d.saveSettings(d.setRateForPeriod(d.loadSettings(), period, 9876543210.98, 'ARS'));
  })()`);
  await win.loadFile(page);
  await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }');
  const out = path.resolve(__dirname, '../dist-prueba/qa');
  fs.mkdirSync(out, { recursive: true });
  for (const [width, zoom] of [[1440, 1], [1280, 1], [1024, 1], [768, 1], [390, 1], [320, 1], [1280, 1.25]]) {
    win.setSize(width, 1000); win.webContents.setZoomFactor(zoom);
    for (const route of ['hub', 'saas', 'projects', 'hours', 'expenses', 'clients', 'settings']) {
      await win.webContents.executeJavaScript(`document.querySelector('#mainNav [data-route="${route}"]').click()`);
      await new Promise(r => setTimeout(r, 80));
      const failures = await win.webContents.executeJavaScript(`(() => {
        const failures = [];
        const selectors = '.kpi-card strong, .card-amount, .card-heading p, .card-amount-secondary, .tracker-numbers b, .currency-value small, .directory-row b, .calendar-total strong, .card-footer > span:first-child, .tracker-payment-copy span, .directory-item > p';
        for (const el of document.querySelectorAll(selectors)) {
          const card = el.closest('.kpi-card, .income-card, .tracker-widget, .calendar-panel, .settings-card');
          if (!card) continue;
          const rect = card.getBoundingClientRect(), style = getComputedStyle(card);
          const left = rect.left + parseFloat(style.paddingLeft), right = rect.right - parseFloat(style.paddingRight);
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const range = document.createRange(); range.selectNodeContents(walker.currentNode);
            for (const textRect of range.getClientRects()) if (textRect.width && (textRect.left < left - 2 || textRect.right > right + 2)) failures.push(el.className + ': ' + el.textContent.trim());
          }
          if (el.clientWidth && el.scrollWidth > el.clientWidth + 2) failures.push('Desborde interno: ' + el.textContent.trim());
          if (getComputedStyle(el).textOverflow === 'ellipsis' || getComputedStyle(el).overflowX === 'hidden') failures.push('Importe recortado: ' + el.textContent.trim());
        }
        return [...new Set(failures)];
      })()`);
      assert.deepEqual(failures, [], `${route}, ancho ${width}, zoom ${zoom}`);
      if ([1440, 390].includes(width) && ['hub', 'saas', 'hours'].includes(route)) {
        fs.writeFileSync(path.join(out, `amounts-${route}-${width}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
  }
  console.log('OK: importes grandes completos en 7 vistas, 6 tamaños de ventana y zoom 125%.');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
