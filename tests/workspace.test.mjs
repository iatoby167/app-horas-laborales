import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import * as data from '../data.js';
import { normalizeWorkspace, saveWorkspace, loadWorkspace, convertAmount, expenseSummary, moneyFor, dateFor } from '../workspace.js';

let storage;
beforeEach(() => {
  storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    get length() { return storage.size; }, key: index => [...storage.keys()][index]
  };
});

const subscription = overrides => data.normalizeSource({ id: 'schedule-test', name: 'Servicio', type: 'saas', projectStatus: 'active',
  startPeriod: '2026-10', startsOn: '2026-10-01', dueDay: 15, billingMode: 'scheduled', amount: 300, ...overrides });

test('los ciclos trimestrales y anuales cobran el ciclo completo en su mes', () => {
  const quarterly = subscription({ billingCycle: 'quarterly' });
  assert.equal(data.sourceAmountForPeriod(quarterly, '2026-10'), 300);
  assert.equal(data.sourceAmountForPeriod(quarterly, '2026-11'), 0);
  assert.equal(data.sourceAmountForPeriod(quarterly, '2027-01'), 300);
  const annual = subscription({ billingCycle: 'annual' });
  assert.equal(data.sourceAmountForPeriod(annual, '2027-09'), 0);
  assert.equal(data.sourceAmountForPeriod(annual, '2027-10'), 300);
  const legacy = subscription({ billingCycle: 'annual', billingMode: undefined });
  assert.equal(data.sourceAmountForPeriod(legacy, '2026-11'), 25);
});

test('vencimientos respetan último día, inicio, fin y cancelación futura', () => {
  assert.deepEqual(data.recurringDates(subscription({ dueDay: 31 }), '2027-02'), ['2027-02-28']);
  assert.deepEqual(data.recurringDates(subscription({ dueDay: 31 }), '2028-02'), ['2028-02-29']);
  assert.equal(data.sourceAmountForPeriod(subscription({ startsOn: '2026-10-20' }), '2026-10'), 0);
  const ending = subscription({ endsOn: '2026-11-10' });
  assert.equal(data.sourceAmountForPeriod(ending, '2026-11'), 0);
  assert.equal(data.sourceIsVisibleInPeriod(ending, '2026-12'), false);
  const cancelled = subscription({ cancelledFrom: '2026-12' });
  assert.equal(data.sourceAmountForPeriod(cancelled, '2026-11'), 300);
  assert.equal(data.sourceIsVisibleInPeriod(cancelled, '2026-12'), false);
  const paused = data.setStatusForPeriod(cancelled, '2026-10', 'paused');
  assert.equal(data.sourceAmountForPeriod(paused, '2026-10'), 0);
  assert.equal(data.sourceAmountForPeriod(paused, '2026-11'), 300);
});

test('el ciclo semanal cuenta las fechas reales y el servicio por horas no se repite', () => {
  const weekly = subscription({ billingCycle: 'weekly', startsOn: '2026-10-02', amount: 10 });
  assert.equal(data.recurringDates(weekly, '2026-10').length, 5);
  assert.equal(data.sourceAmountForPeriod(weekly, '2026-10'), 50);
  const hourly = data.normalizeSource({ type: 'hours', name: 'Clase', amount: 20, estimatedHours: 3, period: '2026-10' });
  assert.equal(data.sourceAmountForPeriod(hourly, '2026-10'), 60);
  assert.equal(data.sourceAmountForPeriod(hourly, '2026-11'), 0);
});

test('monedas: nunca suma monedas distintas sin tasa y permite base diferente de ARS', () => {
  const workspace = normalizeWorkspace({ profile: { currency: 'EUR', rates: { USD: 0.9, ARS: 0.001 } } });
  assert.equal(convertAmount(100, 'USD', workspace.profile), 90);
  assert.equal(convertAmount(100, 'EUR', workspace.profile), 100);
  assert.equal(convertAmount(100, 'BRL', workspace.profile), null);
  const summary = data.calculateHub([subscription({ currency: 'USD', amount: 100 })], '2026-10', 20, { status: 'paid' }, 0, 'EUR', (value, from) => convertAmount(value, from, workspace.profile));
  assert.equal(summary.metrics.total, 110);
  assert.equal(summary.metrics.collected, 20);
  assert.equal(data.amountInArs(100, 'EUR', 1000), null);
});

test('gastos separan pagados, pendientes y borrados en el mes correcto', () => {
  const workspace = normalizeWorkspace({ profile: { currency: 'EUR', rates: { USD: 0.9 } }, expenses: [
    { id: 'paid-item', name: 'Material', amount: 10, currency: 'EUR', date: '2026-10-10', paid: true },
    { id: 'pending-item', name: 'Alquiler', amount: 100, currency: 'USD', date: '2026-10-10', paid: false },
    { name: 'Otro mes', amount: 99, currency: 'EUR', date: '2026-11-10' },
    { name: 'Papelera', amount: 99, currency: 'EUR', date: '2026-10-10', deletedAt: '2026-10-11' }
  ] });
  assert.deepEqual(expenseSummary(workspace, '2026-10', {}), { total: 100, paid: 10, pending: 90, missing: 0, count: 2 });
});

test('copias completas incluyen perfil, clientes, tarifas, gastos y papelera', () => {
  const workspace = normalizeWorkspace({ profile: { onboarded: true, labels: { hours: 'Clases' }, currency: 'EUR' },
    clients: [{ id: 'client-one', name: 'Ana' }], services: [{ id: 'service-one', name: 'Clase', clientId: 'client-one', rate: 35, currency: 'EUR' }],
    expenses: [{ name: 'Transporte', amount: 10, date: '2026-10-01', currency: 'EUR' }] });
  assert.equal(saveWorkspace(workspace), true);
  const sources = [subscription({ deletedAt: '2026-10-15T12:00:00Z', clientId: 'client-one', category: 'Docencia' })];
  const backup = data.exportBackup(data.loadSettings(), new Map(), sources, {}, {});
  const restored = data.parseBackup(JSON.stringify(backup));
  assert.deepEqual(restored.workspace, workspace);
  assert.equal(restored.sources[0].clientId, 'client-one');
  assert.equal(data.sourceAmountForPeriod(restored.sources[0], '2026-10'), 0);
});

test('restauración de copia recupera registros y permite volver al estado previo', () => {
  saveWorkspace(normalizeWorkspace({ clients: [{ id: 'client-one', name: 'Original' }] }));
  data.saveSources([subscription()]);
  assert.equal(data.createSafetyBackup('Punto de retorno', true), true);
  const snapshot = data.listSafetyBackups()[0];
  saveWorkspace(normalizeWorkspace({ clients: [{ id: 'client-two', name: 'Cambio' }] }));
  data.saveMonth('2026-12', { days: { '2026-12-01': 8 } });
  assert.equal(data.restoreSafetyBackup(snapshot.id), true);
  assert.equal(loadWorkspace().clients[0].name, 'Original');
  assert.deepEqual(data.loadMonth('2026-12').days, {});
  const reverse = data.listSafetyBackups().find(item => item.reason === 'Antes de restaurar');
  assert.equal(data.restoreSafetyBackup(reverse.id), true);
  assert.equal(loadWorkspace().clients[0].name, 'Cambio');
});

test('el calendario nuevo no precarga feriados y los formatos respetan región', () => {
  assert.equal(data.loadSettings().holidays.size, 0);
  assert.equal(data.parseNumber('1,234.50', 'en-US'), 1234.5);
  assert.equal(data.parseNumber('1.234,50', 'es-AR'), 1234.5);
  assert.equal(data.parseNumber('1.000', 'en-US'), 1);
  const profile = normalizeWorkspace({ profile: { currency: 'EUR', dateFormat: 'iso' } }).profile;
  assert.equal(dateFor('2027-01-05', profile), '2027-01-05');
  assert.match(moneyFor(10, 'EUR', profile), /10/);
});

test('un fallo a mitad de una importación restaura todos los valores originales', () => {
  data.saveSources([subscription()]);
  saveWorkspace(normalizeWorkspace({ clients: [{ id: 'client-one', name: 'Original' }] }));
  const previous = [...storage].filter(([key]) => !key.endsWith(':safety'));
  const write = localStorage.setItem;
  let fail = true;
  localStorage.setItem = (key, value) => {
    if (key.endsWith('hub:workspace') && fail) { fail = false; throw Error('QuotaExceededError'); }
    return write(key, value);
  };
  assert.equal(data.storageTransaction(() => data.saveSources([]) && saveWorkspace(normalizeWorkspace())), false);
  assert.deepEqual([...storage].filter(([key]) => !key.endsWith(':safety')).sort(), previous.sort());
});
