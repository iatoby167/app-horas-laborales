// Modelo y persistencia del Hub. No depende del DOM para poder mantener la
// lógica financiera separada de la interfaz.
export const STORAGE_PREFIX = 'libreta-horas:';
export const DEFAULT_HOURS = [0, 6, 5, 6, 5, 6, 0];
export const DEFAULT_MULT = 2;
export const HOLIDAYS_2026 = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-03-24', '2026-04-02', '2026-04-03',
  '2026-05-01', '2026-05-25', '2026-06-15', '2026-06-20', '2026-07-09', '2026-08-17',
  '2026-10-12', '2026-11-23', '2026-12-08', '2026-12-25'
];

export const SOURCE_TYPES = {
  saas: 'Micro-SaaS / Suscripción',
  project: 'Desarrollo puntual',
  hours: 'Servicio por horas',
  fixed: 'Ingreso fijo / extra'
};

export const PROJECT_STATES = {
  development: 'En desarrollo',
  active: 'Activo',
  paused: 'Pausado',
  delivered: 'Entregado'
};

export const PAYMENT_STATES = {
  pending: 'Pendiente',
  partial: 'Cobrado parcial',
  paid: 'Cobrado total'
};

export const BILLING_CYCLES = {
  monthly: 'Mensual',
  weekly: 'Semanal',
  quarterly: 'Trimestral',
  annual: 'Anual',
  once: 'Única vez'
};

export const CURRENCIES = {
  ARS: 'Pesos argentinos (ARS)',
  USD: 'Dólares estadounidenses (USD)'
};

const VALID_TYPES = new Set(Object.keys(SOURCE_TYPES));
const VALID_PROJECT_STATES = new Set(Object.keys(PROJECT_STATES));
const VALID_PAYMENT_STATES = new Set(Object.keys(PAYMENT_STATES));
const VALID_CYCLES = new Set(Object.keys(BILLING_CYCLES));
const VALID_CURRENCIES = new Set(Object.keys(CURRENCIES));

export const pad = value => String(value).padStart(2, '0');
export const monthKey = (year, month) => `${year}-${pad(month)}`;
export const monthKeyFromDate = value => (typeof value === 'string' ? value.slice(0, 7) : '');

export function parseMonthKey(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value))) return null;
  const [year, month] = String(value).split('-').map(Number);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function dateOf(value) {
  if (!isValidDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function ymd(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function todayKey() {
  const now = new Date();
  return monthKey(now.getFullYear(), now.getMonth() + 1);
}

export function todayString() {
  const now = new Date();
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function shiftMonth(key, delta) {
  const parsed = parseMonthKey(key) || parseMonthKey(todayKey());
  const date = new Date(parsed.year, parsed.month - 1 + delta, 1);
  return monthKey(date.getFullYear(), date.getMonth() + 1);
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function mondayOffset(year, month) {
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

export function dayOfWeek(value) {
  const date = dateOf(value);
  return date ? date.getDay() : 0;
}

export function parseNumber(value) {
  let text = String(value ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!text) return NaN;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return NaN;
  const result = Number(text);
  return Number.isFinite(result) ? result : NaN;
}

function read(key) {
  try {
    const value = localStorage.getItem(STORAGE_PREFIX + key);
    return value ? JSON.parse(value) : null;
  } catch (_) {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

export function storageWorks() {
  try {
    localStorage.setItem(STORAGE_PREFIX + 'probe', '1');
    localStorage.removeItem(STORAGE_PREFIX + 'probe');
    return true;
  } catch (_) {
    return false;
  }
}

export function listStorageKeys() {
  const keys = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key.slice(STORAGE_PREFIX.length));
    }
  } catch (_) {
    // El estado de la app mostrará el error de guardado si el navegador lo bloquea.
  }
  return keys;
}

export function loadSettings() {
  const raw = read('settings');
  const settings = {
    rate: 0,
    rateCurrency: 'ARS',
    monthlyRates: {},
    mult: DEFAULT_MULT,
    hours: DEFAULT_HOURS.slice(),
    holidays: new Set(HOLIDAYS_2026)
  };
  if (!raw || typeof raw !== 'object') return settings;
  if (Number.isFinite(raw.rate) && raw.rate >= 0) settings.rate = raw.rate;
  if (VALID_CURRENCIES.has(raw.rateCurrency)) settings.rateCurrency = raw.rateCurrency;
  settings.monthlyRates = normalizeMonthlyRates(raw.monthlyRates);
  if (Number.isFinite(raw.mult) && raw.mult >= 1 && raw.mult <= 10) settings.mult = raw.mult;
  if (Array.isArray(raw.hours) && raw.hours.length === 7 && raw.hours.every(value => Number.isFinite(value) && value >= 0 && value <= 24)) {
    settings.hours = raw.hours.slice();
  }
  if (Array.isArray(raw.holidays)) settings.holidays = new Set(raw.holidays.filter(isValidDate));
  return settings;
}

// Preferencias visuales separadas de los datos financieros. Así el layout no
// queda acoplado al controlador ni modifica una copia de seguridad contable.
export function loadUiPreferences() {
  const raw = read('ui');
  return {
    sidebarPinned: Boolean(raw?.sidebarPinned),
    sidebarCompact: Boolean(raw?.sidebarCompact)
  };
}

export function saveUiPreferences(preferences) {
  return write('ui', {
    sidebarPinned: Boolean(preferences?.sidebarPinned),
    sidebarCompact: Boolean(preferences?.sidebarCompact)
  });
}

export function saveSettings(settings) {
  return write('settings', {
    rate: settings.rate,
    rateCurrency: VALID_CURRENCIES.has(settings.rateCurrency) ? settings.rateCurrency : 'ARS',
    monthlyRates: normalizeMonthlyRates(settings.monthlyRates),
    mult: settings.mult,
    hours: settings.hours.slice(),
    holidays: Array.from(settings.holidays).sort()
  });
}

function normalizeCurrency(value) {
  return VALID_CURRENCIES.has(value) ? value : 'ARS';
}

function normalizeMonthlyRates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const rates = {};
  for (const [period, rateData] of Object.entries(value)) {
    if (!parseMonthKey(period)) continue;
    const rate = Number(rateData?.rate);
    if (!Number.isFinite(rate) || rate < 0) continue;
    rates[period] = { rate, currency: normalizeCurrency(rateData?.currency) };
  }
  return rates;
}

// Cada período guarda su propia tarifa. Los meses que todavía no fueron
// configurados empiezan en cero, para que un valor nuevo no se replique a
// meses anteriores ni a los siguientes.
export function getRateForPeriod(settings, period) {
  const monthlyRate = settings?.monthlyRates?.[period];
  if (monthlyRate && Number.isFinite(Number(monthlyRate.rate)) && Number(monthlyRate.rate) >= 0) {
    return { rate: Number(monthlyRate.rate), currency: normalizeCurrency(monthlyRate.currency), isMonthly: true };
  }
  return {
    rate: 0,
    currency: normalizeCurrency(settings?.rateCurrency),
    isMonthly: false
  };
}

export function setRateForPeriod(settings, period, rate, currency) {
  if (!parseMonthKey(period)) return settings;
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate < 0) return settings;
  return {
    ...settings,
    monthlyRates: {
      ...normalizeMonthlyRates(settings?.monthlyRates),
      [period]: { rate: numericRate, currency: normalizeCurrency(currency) }
    }
  };
}

// La cotización se persiste para poder seguir mostrando conversiones cuando la
// app se abre sin conexión. La fuente y la fecha publicada nunca se ocultan.
export function normalizeExchangeRate(value = {}) {
  const rate = Number(value?.rate);
  return {
    rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    quoteDate: isValidDate(value?.quoteDate) ? value.quoteDate : '',
    fetchedAt: typeof value?.fetchedAt === 'string' && !Number.isNaN(Date.parse(value.fetchedAt)) ? value.fetchedAt : '',
    source: 'BCRA'
  };
}

export function loadExchangeRate() {
  return normalizeExchangeRate(read('hub:usd-rate'));
}

export function saveExchangeRate(rate) {
  return write('hub:usd-rate', normalizeExchangeRate(rate));
}

export function amountInArs(amount, currency = 'ARS', usdRate = 0) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return null;
  if (numericAmount === 0 || normalizeCurrency(currency) === 'ARS') return numericAmount;
  const numericRate = Number(usdRate);
  if (!(numericRate > 0)) return null;
  return Math.round(numericAmount * numericRate * 100) / 100;
}

export function loadMonth(key) {
  const raw = read(`m-${key}`);
  const days = {};
  if (!raw || !raw.days || typeof raw.days !== 'object') return { days };
  for (const [date, hours] of Object.entries(raw.days)) {
    const value = Number(hours);
    if (isValidDate(date) && monthKeyFromDate(date) === key && value > 0 && value <= 24) days[date] = value;
  }
  return { days };
}

export function saveMonth(key, month) {
  return write(`m-${key}`, { days: { ...month.days } });
}

function safeId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{4,80}$/.test(value) ? value : null;
}

export function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `income-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizePayment(value) {
  const status = VALID_PAYMENT_STATES.has(value?.status) ? value.status : 'pending';
  const paidAmount = Number(value?.paidAmount);
  return { status, paidAmount: Number.isFinite(paidAmount) && paidAmount >= 0 ? paidAmount : 0 };
}

function normalizePayments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const payments = {};
  for (const [key, payment] of Object.entries(value)) {
    if (parseMonthKey(key)) payments[key] = normalizePayment(payment);
  }
  return payments;
}

export function normalizeSource(value = {}) {
  const type = VALID_TYPES.has(value.type) ? value.type : 'saas';
  const amount = Number(value.amount);
  const currency = normalizeCurrency(value.currency);
  const clients = Number(value.clients);
  const estimatedHours = Number(value.estimatedHours);
  const projectStatus = VALID_PROJECT_STATES.has(value.projectStatus) ? value.projectStatus : 'development';
  // Un desarrollo puntual nunca hereda un ciclo recurrente, incluso si fue
  // creado con una versión anterior de la app.
  const billingCycle = type === 'project'
    ? 'once'
    : (VALID_CYCLES.has(value.billingCycle) ? value.billingCycle : 'monthly');
  return {
    id: safeId(value.id) || createId(),
    name: typeof value.name === 'string' ? value.name.trim().slice(0, 120) : '',
    type,
    amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
    currency,
    billingCycle,
    clients: Number.isFinite(clients) && clients >= 0 ? Math.round(clients) : 0,
    estimatedHours: Number.isFinite(estimatedHours) && estimatedHours >= 0 ? estimatedHours : 0,
    projectStatus,
    expectedDate: isValidDate(value.expectedDate) ? value.expectedDate : '',
    url: typeof value.url === 'string' ? value.url.trim().slice(0, 300) : '',
    notes: typeof value.notes === 'string' ? value.notes.trim().slice(0, 1500) : '',
    payment: normalizePayment(value.payment),
    payments: normalizePayments(value.payments),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()
  };
}

export function loadSources() {
  const raw = read('hub:sources');
  return Array.isArray(raw) ? raw.map(normalizeSource).filter(source => source.name) : [];
}

export function saveSources(sources) {
  return write('hub:sources', sources.map(normalizeSource));
}

export function getPaymentForPeriod(source, period) {
  return normalizePayment(source.payments?.[period] || source.payment);
}

export function setPaymentForPeriod(source, period, payment) {
  return {
    ...source,
    payments: { ...source.payments, [period]: normalizePayment(payment) },
    updatedAt: new Date().toISOString()
  };
}

export function loadTrackerPayments() {
  return normalizePayments(read('hub:tracker-payments'));
}

export function saveTrackerPayments(payments) {
  return write('hub:tracker-payments', normalizePayments(payments));
}

export function getTrackerPayment(payments, period) {
  return normalizePayment(payments?.[period]);
}

export function toMonthlyAmount(source) {
  const amount = Number(source.amount) || 0;
  switch (source.billingCycle) {
    case 'weekly': return amount * (52 / 12);
    case 'quarterly': return amount / 3;
    case 'annual': return amount / 12;
    default: return amount;
  }
}

function projectPeriodDate(source) {
  if (isValidDate(source.expectedDate)) return source.expectedDate;
  // Los proyectos ya creados sin fecha quedan asociados a su mes de alta,
  // en vez de proyectarse una y otra vez en los meses siguientes.
  const createdDate = typeof source.createdAt === 'string' ? source.createdAt.slice(0, 10) : '';
  return isValidDate(createdDate) ? createdDate : '';
}

export function sourceIsVisibleInPeriod(source, period) {
  if (source.type === 'saas') return true;
  if (source.type === 'project') {
    const date = projectPeriodDate(source);
    return date ? monthKeyFromDate(date) === period : period === todayKey();
  }
  if (source.billingCycle !== 'once') return true;
  // Si todavía no hay fecha, se proyecta solo en el mes actual: de lo
  // contrario un desarrollo sin fecha aparecería repetido en cada histórico.
  return source.expectedDate ? monthKeyFromDate(source.expectedDate) === period : period === todayKey();
}

export function sourceAmountForPeriod(source, period) {
  if (!sourceIsVisibleInPeriod(source, period) || source.projectStatus === 'paused') return 0;
  if (source.type === 'saas') return source.projectStatus === 'active' ? toMonthlyAmount(source) : 0;
  if (source.type === 'project') return source.amount;
  if (source.type === 'hours') {
    if (source.billingCycle === 'once' && source.expectedDate && monthKeyFromDate(source.expectedDate) !== period) return 0;
    return source.amount * source.estimatedHours;
  }
  if (source.billingCycle === 'once' && source.expectedDate && monthKeyFromDate(source.expectedDate) !== period) return 0;
  return source.billingCycle === 'once' ? source.amount : toMonthlyAmount(source);
}

export function collectedAmount(expected, payment) {
  if (!(expected > 0)) return 0;
  if (payment.status === 'paid') return expected;
  if (payment.status === 'partial') return Math.min(Math.max(payment.paidAmount, 0), expected);
  return 0;
}

export function calculateMonth(days, holidays, rate, mult) {
  let daysWorked = 0;
  let realHours = 0;
  let payableHours = 0;
  for (const [date, rawHours] of Object.entries(days)) {
    const hours = Number(rawHours);
    if (!isValidDate(date) || !(hours > 0)) continue;
    daysWorked += 1;
    realHours += hours;
    payableHours += holidays.has(date) ? hours * mult : hours;
  }
  const hourlyRate = Number(rate) || 0;
  return {
    days: daysWorked,
    real: realHours,
    payable: payableHours,
    total: Math.round(payableHours * hourlyRate * 100) / 100
  };
}

export function calculateHub(sources, period, trackerTotal, trackerPayment, usdRate = 0, trackerCurrency = 'ARS') {
  const normalizedTrackerCurrency = normalizeCurrency(trackerCurrency);
  const metrics = {
    mrr: 0,
    projects: 0,
    hours: 0,
    fixed: 0,
    collected: 0,
    pending: 0,
    active: 0,
    unconvertedUsd: 0,
    trackerTotal,
    trackerCurrency: normalizedTrackerCurrency,
    trackerTotalArs: null,
    trackerCollected: 0,
    trackerCollectedArs: null
  };
  const lines = [];
  for (const source of sources) {
    const expected = sourceAmountForPeriod(source, period);
    const payment = getPaymentForPeriod(source, period);
    const collected = collectedAmount(expected, payment);
    const expectedArs = amountInArs(expected, source.currency, usdRate);
    const collectedArs = amountInArs(collected, source.currency, usdRate);
    const amountForMetric = expectedArs ?? 0;
    if (expected > 0 && expectedArs === null) metrics.unconvertedUsd += 1;
    if (source.type === 'saas') metrics.mrr += amountForMetric;
    if (source.type === 'project') metrics.projects += amountForMetric;
    if (source.type === 'hours') metrics.hours += amountForMetric;
    if (source.type === 'fixed') metrics.fixed += amountForMetric;
    if ((source.type === 'saas' || source.type === 'project') && source.projectStatus !== 'paused' && source.projectStatus !== 'delivered') metrics.active += 1;
    metrics.collected += collectedArs ?? 0;
    lines.push({
      source,
      expected,
      expectedArs,
      payment,
      collected,
      collectedArs,
      pending: Math.max(expected - collected, 0),
      pendingArs: expectedArs === null ? null : Math.max(expectedArs - (collectedArs ?? 0), 0)
    });
  }
  const trackerCollected = collectedAmount(trackerTotal, trackerPayment);
  const trackerTotalArs = amountInArs(trackerTotal, normalizedTrackerCurrency, usdRate);
  const trackerCollectedArs = amountInArs(trackerCollected, normalizedTrackerCurrency, usdRate);
  if (trackerTotal > 0 && trackerTotalArs === null) metrics.unconvertedUsd += 1;
  metrics.hours += trackerTotalArs ?? 0;
  metrics.collected += trackerCollectedArs ?? 0;
  const total = metrics.mrr + metrics.projects + metrics.hours + metrics.fixed;
  metrics.total = total;
  metrics.pending = Math.max(total - metrics.collected, 0);
  metrics.trackerCollected = trackerCollected;
  metrics.trackerTotalArs = trackerTotalArs;
  metrics.trackerCollectedArs = trackerCollectedArs;
  return { metrics, lines };
}

export function exportBackup(settings, loadedMonths, sources, trackerPayments, exchangeRate) {
  const months = {};
  listStorageKeys().forEach(key => {
    if (!key.startsWith('m-')) return;
    const value = read(key);
    if (value?.days) months[key.slice(2)] = { days: value.days };
  });
  for (const [key, value] of loadedMonths.entries()) months[key] = { days: { ...value.days } };
  return {
    app: 'libreta-de-horas-hub',
    version: 4,
    exportedAt: new Date().toISOString(),
    settings: {
      rate: settings.rate,
      rateCurrency: normalizeCurrency(settings.rateCurrency),
      monthlyRates: normalizeMonthlyRates(settings.monthlyRates),
      mult: settings.mult,
      hours: settings.hours,
      holidays: Array.from(settings.holidays)
    },
    months,
    sources,
    trackerPayments,
    exchangeRate: normalizeExchangeRate(exchangeRate)
  };
}

export function parseBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch (_) {
    return { error: 'El archivo no es un JSON válido.' };
  }
  // Acepta los backups anteriores para no dejar atrás los datos de horas existentes.
  if (!backup || (backup.app !== 'libreta-de-horas' && backup.app !== 'libreta-de-horas-hub') || !backup.months || typeof backup.months !== 'object') {
    return { error: 'Este archivo no parece un backup de la Libreta de Horas.' };
  }
  const months = {};
  for (const [key, value] of Object.entries(backup.months)) {
    if (!parseMonthKey(key) || !value?.days || typeof value.days !== 'object') continue;
    const days = {};
    for (const [date, rawHours] of Object.entries(value.days)) {
      const hours = Number(rawHours);
      if (isValidDate(date) && monthKeyFromDate(date) === key && hours > 0 && hours <= 24) days[date] = hours;
    }
    months[key] = { days };
  }
  const sources = Array.isArray(backup.sources) ? backup.sources.map(normalizeSource).filter(source => source.name) : [];
  return {
    months,
    settings: backup.settings && typeof backup.settings === 'object' ? backup.settings : null,
    sources,
    trackerPayments: normalizePayments(backup.trackerPayments),
    exchangeRate: backup.exchangeRate ? normalizeExchangeRate(backup.exchangeRate) : null,
    count: Object.keys(months).length
  };
}

export function applyImportedSettings(current, incoming) {
  if (!incoming || typeof incoming !== 'object') return current;
  const next = { ...current, monthlyRates: normalizeMonthlyRates(incoming.monthlyRates), hours: current.hours.slice(), holidays: new Set(current.holidays) };
  if (Number.isFinite(incoming.rate) && incoming.rate >= 0) next.rate = incoming.rate;
  if (VALID_CURRENCIES.has(incoming.rateCurrency)) next.rateCurrency = incoming.rateCurrency;
  if (Number.isFinite(incoming.mult) && incoming.mult >= 1 && incoming.mult <= 10) next.mult = incoming.mult;
  if (Array.isArray(incoming.hours) && incoming.hours.length === 7 && incoming.hours.every(value => Number.isFinite(value) && value >= 0 && value <= 24)) next.hours = incoming.hours.slice();
  if (Array.isArray(incoming.holidays)) next.holidays = new Set(incoming.holidays.filter(isValidDate));
  return next;
}
