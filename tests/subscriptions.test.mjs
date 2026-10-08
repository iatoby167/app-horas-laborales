import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const code = await readFile(new URL('../data.js', import.meta.url), 'utf8');
const data = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const { normalizeSource, setStatusForPeriod, getStatusForPeriod, setPaymentForPeriod,
  getPaymentForPeriod, sourceIsVisibleInPeriod, sourceAmountForPeriod, calculateHub } = data;
const pending = { status: 'pending', paidAmount: 0, expectedPaymentDate: '' };
const subscription = overrides => normalizeSource({
  id: 'subscription-test', name: 'Mantenimiento', type: 'saas', amount: 100,
  projectStatus: 'active', startPeriod: '2026-10', createdAt: '2026-10-08T12:00:00Z', ...overrides
});

test('el mes seleccionado determina el alta, incluso si es anterior o posterior a hoy', () => {
  for (const startPeriod of ['2024-01', '2026-10', '2028-12']) {
    const source = subscription({ startPeriod });
    assert.equal(sourceIsVisibleInPeriod(source, data.shiftMonth(startPeriod, -1)), false);
    assert.equal(sourceAmountForPeriod(source, data.shiftMonth(startPeriod, -1)), 0);
    assert.equal(sourceIsVisibleInPeriod(source, startPeriod), true);
    assert.equal(sourceAmountForPeriod(source, data.shiftMonth(startPeriod, 1)), 100);
  }
});

test('pausar y reactivar un mes no cambia los estados de otros meses', () => {
  const original = subscription();
  let source = setStatusForPeriod(original, '2026-11', 'paused');
  assert.equal(getStatusForPeriod(original, '2026-11'), 'active');
  assert.equal(sourceAmountForPeriod(source, '2026-10'), 100);
  assert.equal(sourceAmountForPeriod(source, '2026-11'), 0);
  assert.equal(sourceAmountForPeriod(source, '2026-12'), 100);
  source = setStatusForPeriod(source, '2026-10', 'development');
  source = setStatusForPeriod(source, '2026-11', 'active');
  assert.equal(getStatusForPeriod(source, '2026-10'), 'development');
  assert.equal(getStatusForPeriod(source, '2026-11'), 'active');
  assert.equal(getStatusForPeriod(source, '2026-12'), 'active');
});

test('cobros totales, parciales y pendientes son independientes por mes', () => {
  let source = setPaymentForPeriod(subscription(), '2026-10', { status: 'paid', paidAmount: 100 });
  source = setPaymentForPeriod(source, '2026-11', { status: 'partial', paidAmount: 30 });
  assert.equal(getPaymentForPeriod(source, '2026-10').status, 'paid');
  assert.equal(getPaymentForPeriod(source, '2026-11').paidAmount, 30);
  assert.deepEqual(getPaymentForPeriod(source, '2026-12'), pending);
  source = setPaymentForPeriod(source, '2026-10', pending);
  assert.equal(getPaymentForPeriod(source, '2026-11').status, 'partial');
});

test('el resumen respeta inicio, pausa y cobro del período', () => {
  let source = setPaymentForPeriod(subscription(), '2026-10', { status: 'paid' });
  source = setStatusForPeriod(source, '2026-11', 'paused');
  const summary = period => calculateHub([source], period, 0, pending);
  assert.equal(summary('2026-09').lines.length, 0);
  assert.equal(summary('2026-09').metrics.active, 0);
  assert.equal(summary('2026-10').metrics.collected, 100);
  assert.equal(summary('2026-11').metrics.mrr, 0);
  assert.equal(summary('2026-11').metrics.active, 0);
  assert.equal(summary('2026-12').metrics.mrr, 100);
  assert.equal(summary('2026-12').metrics.pending, 100);
  assert.equal(summary('2026-12').metrics.collected, 0);
});

test('datos antiguos: conserva los pagos explícitos y limita el estado global al inicio', () => {
  const source = subscription({ startPeriod: undefined, projectStatus: 'paused',
    payment: { status: 'paid', paidAmount: 100 },
    payments: { '2026-08': { status: 'partial', paidAmount: 20 }, '2026-10': { status: 'paid' } }
  });
  assert.equal(source.startPeriod, '2026-08');
  assert.equal(sourceIsVisibleInPeriod(source, '2026-07'), false);
  assert.equal(getStatusForPeriod(source, '2026-08'), 'paused');
  assert.equal(getStatusForPeriod(source, '2026-11'), 'active');
  assert.equal(getPaymentForPeriod(source, '2026-08').paidAmount, 20);
  assert.equal(getPaymentForPeriod(source, '2026-10').status, 'paid');
  assert.deepEqual(getPaymentForPeriod(source, '2026-11'), pending);
  assert.deepEqual(normalizeSource(source), source);
  const legacy = subscription({ startPeriod: undefined, payment: { status: 'paid' } });
  assert.equal(getPaymentForPeriod(legacy, '2026-10').status, 'paid');
  assert.deepEqual(getPaymentForPeriod(legacy, '2026-11'), pending);
});

test('guardado, recarga y backup conservan alta y estados mensuales', () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    get length() { return storage.size; },
    key: index => [...storage.keys()][index]
  };
  let source = setStatusForPeriod(subscription(), '2026-11', 'paused');
  source = setPaymentForPeriod(source, '2026-10', { status: 'paid', paidAmount: 100 });
  assert.equal(data.saveSources([source]), true);
  assert.deepEqual(data.loadSources(), [source]);
  const backup = data.exportBackup(data.loadSettings(), new Map(), [source], {}, {});
  assert.deepEqual(data.parseBackup(JSON.stringify(backup)).sources, [source]);
});

test('proyectos e ingresos fijos conservan su comportamiento', () => {
  const project = subscription({ type: 'project', expectedDate: '2026-10-15', payment: { status: 'paid' } });
  assert.equal(sourceAmountForPeriod(project, '2026-10'), 100);
  assert.equal(sourceAmountForPeriod(project, '2026-11'), 0);
  assert.equal(getPaymentForPeriod(project, '2026-10').status, 'paid');
  assert.equal(setStatusForPeriod(project, '2026-10', 'paused').projectStatus, 'paused');
  const fixed = subscription({ type: 'fixed' });
  assert.equal(sourceAmountForPeriod(fixed, '2026-09'), 100);
});
