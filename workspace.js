import { CURRENCIES, STORAGE_PREFIX, createId, createSafetyBackup, isValidDate, monthKeyFromDate } from './data.js';

export const MODULES = { hours: 'Horas trabajadas', saas: 'Ingresos recurrentes', projects: 'Proyectos', clients: 'Clientes y servicios', expenses: 'Gastos' };
export const WIDGETS = { income: 'Ingresos previstos', collected: 'Cobrado', pending: 'Pendiente', hours: 'Horas trabajadas', expenses: 'Gastos pagados', balance: 'Balance de caja' };
export const LOCALES = { 'es-AR': 'Español · Argentina', 'es-ES': 'Español · España', 'es-MX': 'Español · México', 'es-CL': 'Español · Chile', 'es-CO': 'Español · Colombia', 'es-UY': 'Español · Uruguay', 'es-PE': 'Español · Perú', 'en-US': 'Formato de Estados Unidos' };
export const clean = (value, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const currency = value => CURRENCIES[value] ? value : 'ARS';
const amount = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const id = value => /^[a-zA-Z0-9_-]{4,80}$/.test(value || '') ? value : createId();
const rows = (items, normalize) => Array.isArray(items) ? items.filter(item => item && typeof item === 'object').map(normalize).filter(item => item.name) : [];

export function normalizeWorkspace(value = {}) {
  const p = value?.profile || {};
  const rates = Object.fromEntries(Object.entries(p.rates || {}).filter(([key, rate]) => CURRENCIES[key] && Number.isFinite(Number(rate)) && Number(rate) > 0).map(([key, rate]) => [key, Number(rate)]));
  return {
    version: 1,
    profile: {
      onboarded: Boolean(p.onboarded), name: clean(p.name, 70), activity: clean(p.activity, 40) || 'mixed',
      currency: currency(p.currency), locale: LOCALES[p.locale] ? p.locale : 'es-AR',
      dateFormat: ['short', 'iso', 'long'].includes(p.dateFormat) ? p.dateFormat : 'short',
      weekStart: p.weekStart === 0 ? 0 : 1,
      labels: { hours: clean(p.labels?.hours, 40) || 'Horas trabajadas', saas: clean(p.labels?.saas, 40) || 'Ingresos recurrentes', projects: clean(p.labels?.projects, 40) || 'Proyectos' },
      modules: Object.fromEntries(Object.keys(MODULES).map(key => [key, typeof p.modules?.[key] === 'boolean' ? p.modules[key] : key !== 'expenses'])),
      widgets: Object.fromEntries(Object.keys(WIDGETS).map(key => [key, typeof p.widgets?.[key] === 'boolean' ? p.widgets[key] : true])),
      rates, demoActive: Boolean(p.demoActive)
    },
    clients: rows(value?.clients, item => ({ id: id(item.id), name: clean(item.name), email: clean(item.email, 160), notes: clean(item.notes, 500), deletedAt: clean(item.deletedAt) })),
    services: rows(value?.services, item => ({ id: id(item.id), name: clean(item.name), clientId: clean(item.clientId, 80), rate: amount(item.rate), currency: currency(item.currency), unit: item.unit === 'hour' ? 'hour' : 'fixed', deletedAt: clean(item.deletedAt) })),
    expenses: rows(value?.expenses, item => ({ id: id(item.id), name: clean(item.name), amount: amount(item.amount), currency: currency(item.currency), category: clean(item.category, 60), date: isValidDate(item.date) ? item.date : '', paid: item.paid !== false, deletedAt: clean(item.deletedAt) })).filter(item => item.date)
  };
}

export function loadWorkspace() {
  try { return normalizeWorkspace(JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'hub:workspace') || '{}')); }
  catch (_) { return normalizeWorkspace(); }
}

export function saveWorkspace(value) {
  try {
    if (!createSafetyBackup('Automática diaria')) return false;
    localStorage.setItem(STORAGE_PREFIX + 'hub:workspace', JSON.stringify(normalizeWorkspace(value)));
    return true;
  } catch (_) { return false; }
}

export function convertAmount(value, from, profile, exchange = {}) {
  if (!Number.isFinite(Number(value))) return null;
  if (from === profile.currency || Number(value) === 0) return Number(value);
  let rate = profile.rates[from];
  if (!rate && profile.currency === 'ARS' && from === 'USD') rate = exchange.rate;
  if (!rate && profile.currency === 'USD' && from === 'ARS' && exchange.rate > 0) rate = 1 / exchange.rate;
  return rate > 0 ? Math.round(Number(value) * rate * 100) / 100 : null;
}

export function expenseSummary(workspace, period, exchange) {
  const entries = workspace.expenses.filter(item => !item.deletedAt && monthKeyFromDate(item.date) === period);
  return entries.reduce((total, item) => {
    const value = convertAmount(item.amount, item.currency, workspace.profile, exchange);
    if (value === null) total.missing++;
    else { total.total += value; if (item.paid) total.paid += value; else total.pending += value; }
    return total;
  }, { total: 0, paid: 0, pending: 0, missing: 0, count: entries.length });
}

export function moneyFor(value, code, profile) {
  return new Intl.NumberFormat(profile.locale, { style: 'currency', currency: currency(code), maximumFractionDigits: 2 }).format(Number(value) || 0);
}

export function dateFor(value, profile) {
  if (!isValidDate(value)) return 'Sin fecha';
  if (profile.dateFormat === 'iso') return value;
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(profile.locale, { dateStyle: profile.dateFormat === 'long' ? 'long' : 'short' }).format(date);
}
