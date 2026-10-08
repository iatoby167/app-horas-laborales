import {
  BILLING_CYCLES,
  CURRENCIES,
  PAYMENT_STATES,
  PROJECT_STATES,
  SOURCE_TYPES,
  amountInArs,
  applyImportedSettings,
  calculateHub,
  calculateMonth,
  clearAllData,
  collectedAmount,
  createId,
  createSafetyBackup,
  dateOf,
  dayOfWeek,
  daysInMonth,
  exportBackup,
  getPaymentForPeriod,
  getRateForPeriod,
  getStatusForPeriod,
  getTrackerPayment,
  recurringDates,
  isValidDate,
  listStorageKeys,
  loadExchangeRate,
  loadMonth,
  loadSettings,
  loadSources,
  loadTrackerPayments,
  loadUiPreferences,
  mondayOffset,
  monthKey,
  monthKeyFromDate,
  normalizeSource,
  pad,
  parseBackup,
  storageTransaction,
  parseMonthKey,
  parseNumber as parseLocaleNumber,
  saveMonth,
  saveExchangeRate,
  saveSettings,
  saveSources,
  saveTrackerPayments,
  saveUiPreferences,
  setRateForPeriod,
  setPaymentForPeriod,
  setStatusForPeriod,
  shiftMonth,
  sourceAmountForPeriod,
  sourceIsVisibleInPeriod,
  storageWorks,
  todayKey,
  todayString,
  ymd
} from './data.js';
import { buildMonthlyInvoicePdf } from './pdf-report.js';
import { initDesktopUpdates, renderDesktopUpdateCard } from './desktop-updates.js';
import { loadWorkspace, saveWorkspace, normalizeWorkspace, convertAmount, moneyFor, dateFor, expenseSummary } from './workspace.js';
import { createWorkspaceUI, currencyOptions } from './workspace-ui.js';

const $ = selector => document.querySelector(selector);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const usdMoney = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const monthYear = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
const monthOnly = new Intl.DateTimeFormat('es-AR', { month: 'long' });
const longDate = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
const refreshedAt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const BCRA_USD_ENDPOINT = 'https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD';
const EXCHANGE_RATE_MAX_AGE = 6 * 60 * 60 * 1000;

const elements = {
  nav: $('#mainNav'),
  sidebar: $('#appSidebar'),
  sidebarScrim: $('#sidebarScrim'),
  menuToggle: $('#menuToggle'),
  pinSidebar: $('#pinSidebar'),
  collapseSidebar: $('#collapseSidebar'),
  closeSidebar: $('#closeSidebar'),
  sidebarNewSource: $('#sidebarNewSource'),
  activeSectionLabel: $('#activeSectionLabel'),
  exchangeRateControl: $('#exchangeRateControl'),
  exchangeRateValue: $('#exchangeRateValue'),
  exchangeRateMeta: $('#exchangeRateMeta'),
  refreshExchangeRate: $('#refreshExchangeRate'),
  periodInput: $('#periodInput'),
  periodLabel: $('#periodLabel'),
  filter: $('#filterControl'),
  view: $('#view'),
  status: $('#status'),
  addSource: $('#addSource'),
  sourceDialog: $('#sourceDialog'),
  sourceForm: $('#sourceForm'),
  sourceError: $('#sourceError'),
  deleteSource: $('#deleteSource'),
  closeSource: $('#closeSource'),
  hourDialog: $('#hourDialog'),
  hourForm: $('#hourForm'),
  importFile: $('#importFile'),
  importDialog: $('#importDialog'),
  importSummary: $('#importSummary'),
  applyImport: $('#applyImport'),
  cancelImport: $('#cancelImport')
};

const state = {
  workspace: loadWorkspace(),
  route: 'hub',
  period: todayKey(),
  filter: 'all',
  status: 'Se guarda en este dispositivo',
  settings: loadSettings(),
  months: new Map(),
  sources: loadSources(),
  trackerPayments: loadTrackerPayments(),
  exchangeRate: loadExchangeRate(),
  exchangeLoading: false,
  exchangeError: '',
  mode: 'work',
  editingDate: null,
  pendingImport: null,
  sidebar: {
    open: false,
    ...loadUiPreferences()
  }
};

const ROUTES = {
  hub: 'Hub',
  saas: 'Ingresos recurrentes',
  projects: 'Proyectos',
  hours: 'Consultorio',
  settings: 'Ajustes',
  clients: 'Clientes y servicios',
  expenses: 'Gastos'
};

const workspaceUI = createWorkspaceUI({ state, render, setRoute, setStatus, formatCurrency, formatMonth, currentHub, currentTracker,
  sourcesFor, renderSourceCard, renderTrackerWidget, typeLabel, openSource: openSourceModal, preferencesChanged: applyWorkspacePreferences });

function typeLabel(type) {
  return state.workspace.profile.labels[{ hours: 'hours', saas: 'saas', project: 'projects' }[type]] || SOURCE_TYPES[type];
}

function applyWorkspacePreferences() {
  const profile = state.workspace.profile;
  ROUTES.hours = profile.labels.hours; ROUTES.saas = profile.labels.saas; ROUTES.projects = profile.labels.projects;
  elements.nav.querySelectorAll('[data-route]').forEach(button => {
    const route = button.dataset.route;
    button.hidden = profile.modules[route] === false;
    button.setAttribute('aria-label', ROUTES[route]);
    const label = button.querySelector('.sidebar-nav-label');
    if (label) label.textContent = ROUTES[route];
  });
  if (profile.modules[state.route] === false) state.route = 'hub';
  document.documentElement.lang = profile.locale;
  document.querySelector('.brand').textContent = profile.name || 'Hub de Ingresos';
  elements.exchangeRateControl.hidden = !['ARS', 'USD'].includes(profile.currency);
}

const FILTERS = {
  all: 'Todo',
  pending: 'Pendientes',
  paid: 'Cobrados'
};

const desktopQuery = window.matchMedia('(min-width: 1024px)');

function sidebarIsPinned() {
  return state.sidebar.sidebarPinned && desktopQuery.matches;
}

function sidebarIsVisible() {
  return sidebarIsPinned() || state.sidebar.open;
}

function updateSidebarFocus(visible) {
  if ('inert' in elements.sidebar) {
    elements.sidebar.inert = !visible;
    return;
  }
  elements.sidebar.querySelectorAll('button, a').forEach(control => {
    if (visible) control.removeAttribute('tabindex');
    else control.setAttribute('tabindex', '-1');
  });
}

function applySidebarState() {
  const pinned = sidebarIsPinned();
  const visible = sidebarIsVisible();
  const compactSidebar = pinned && state.sidebar.sidebarCompact;
  document.body.classList.toggle('sidebar-open', visible);
  document.body.classList.toggle('sidebar-pinned', pinned);
  document.body.classList.toggle('sidebar-compact', compactSidebar);
  document.body.classList.toggle('drawer-open', state.sidebar.open && !pinned);
  elements.sidebar.setAttribute('aria-hidden', String(!visible));
  elements.menuToggle.setAttribute('aria-expanded', String(visible));
  elements.menuToggle.setAttribute('aria-label', pinned ? (compactSidebar ? 'Expandir barra lateral' : 'Colapsar barra lateral') : visible ? 'Cerrar menú' : 'Abrir menú');
  elements.pinSidebar.setAttribute('aria-pressed', String(state.sidebar.sidebarPinned));
  elements.pinSidebar.setAttribute('aria-label', state.sidebar.sidebarPinned ? 'Desfijar barra lateral' : 'Fijar barra lateral');
  elements.collapseSidebar.setAttribute('aria-pressed', String(state.sidebar.sidebarCompact));
  elements.collapseSidebar.setAttribute('aria-label', state.sidebar.sidebarCompact ? 'Mostrar etiquetas' : 'Mostrar solo íconos');
  updateSidebarFocus(visible);
}

function saveSidebarState() {
  if (!saveUiPreferences(state.sidebar)) setStatus('No se pudo guardar la preferencia de navegación', 'error');
}

function openSidebar() {
  state.sidebar.open = true;
  applySidebarState();
  window.setTimeout(() => elements.nav.querySelector('button[aria-current="page"]')?.focus(), 80);
}

function closeSidebar() {
  if (sidebarIsPinned()) return;
  state.sidebar.open = false;
  applySidebarState();
  elements.menuToggle.focus();
}

function toggleSidebar() {
  if (sidebarIsPinned()) {
    state.sidebar.sidebarCompact = !state.sidebar.sidebarCompact;
    saveSidebarState();
    applySidebarState();
    return;
  }
  if (state.sidebar.open) closeSidebar();
  else openSidebar();
}

function toggleSidebarPin() {
  if (!desktopQuery.matches) return;
  state.sidebar.sidebarPinned = !state.sidebar.sidebarPinned;
  state.sidebar.open = true;
  if (state.sidebar.sidebarPinned) state.sidebar.sidebarCompact = false;
  saveSidebarState();
  applySidebarState();
}

function toggleSidebarCompact() {
  if (!sidebarIsPinned()) return;
  state.sidebar.sidebarCompact = !state.sidebar.sidebarCompact;
  saveSidebarState();
  applySidebarState();
}

function closeDrawerAfterNavigation() {
  if (!sidebarIsPinned()) {
    state.sidebar.open = false;
    applySidebarState();
    elements.menuToggle.focus();
  }
}

function cap(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (_) {
    return '';
  }
}

function setStatus(message, kind = 'idle') {
  state.status = message;
  if (elements.status) {
    elements.status.textContent = message;
    elements.status.dataset.state = kind;
  }
  if (kind === 'saved' || kind === 'error') {
    let toast = $('#appToast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'appToast'; toast.className = 'app-toast'; toast.setAttribute('role', 'status'); document.body.append(toast); }
    toast.textContent = message; toast.hidden = false;
    clearTimeout(setStatus.toastTimer); setStatus.toastTimer = setTimeout(() => { toast.hidden = true; }, kind === 'error' ? 7000 : 3500);
  }
}

function persist(ok) {
  setStatus(ok ? 'Guardado' : 'No se pudo guardar', ok ? 'saved' : 'error');
}

function currentParts() {
  return parseMonthKey(state.period) || parseMonthKey(todayKey());
}

function dateInCurrentPeriod(day) {
  const { year, month } = currentParts();
  return ymd(year, month, day);
}

function ensureMonth(key = state.period) {
  if (!state.months.has(key)) state.months.set(key, loadMonth(key));
  return state.months.get(key);
}

function currentDays() {
  return ensureMonth().days;
}

function currentRate() {
  const rate = getRateForPeriod(state.settings, state.period);
  return rate.isMonthly ? rate : { ...rate, currency: state.workspace.profile.currency };
}

function currentTracker() {
  return calculateMonth(currentDays(), state.settings.holidays, currentRate().rate, state.settings.mult);
}

function currentTrackerPayment() {
  return getTrackerPayment(state.trackerPayments, state.period);
}

function currentHub() {
  const tracker = currentTracker();
  const rate = currentRate();
  return calculateHub(
    state.sources,
    state.period,
    tracker.total,
    currentTrackerPayment(),
    state.exchangeRate.rate,
    rate.currency,
    (amount, currency) => convertAmount(amount, currency, state.workspace.profile, state.exchangeRate)
  );
}

function formatMonth(key = state.period) {
  const { year, month } = parseMonthKey(key) || currentParts();
  return cap(new Intl.DateTimeFormat(state.workspace.profile.locale, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)));
}

function formatInputNumber(value) {
  if (!Number.isFinite(Number(value))) return '';
  const decimal = new Intl.NumberFormat(state.workspace.profile.locale).formatToParts(1.1).find(part => part.type === 'decimal').value;
  return String(value).replace('.', decimal);
}

function parseNumber(value) { return parseLocaleNumber(value, state.workspace.profile.locale); }

function formatDate(value) {
  return dateFor(value, state.workspace.profile);
}

function formatCurrency(value, currency = 'ARS') {
  return moneyFor(value, currency, state.workspace.profile);
}

function currencyName(currency = 'ARS') {
  return CURRENCIES[currency] || CURRENCIES.ARS;
}

function hasExchangeRate() {
  return Number.isFinite(state.exchangeRate.rate) && state.exchangeRate.rate > 0;
}

function convertedToArs(amount, currency = 'ARS') {
  return amountInArs(amount, currency, state.exchangeRate.rate);
}

function arsConversionLabel(amount, currency = 'ARS') {
  if (currency === state.workspace.profile.currency) return '';
  const converted = convertAmount(amount, currency, state.workspace.profile, state.exchangeRate);
  return converted === null ? 'Sin conversión configurada' : `≈ ${formatCurrency(converted, state.workspace.profile.currency)}`;
}

function exchangeRateIsStale() {
  const fetchedAt = Date.parse(state.exchangeRate.fetchedAt || '');
  return !hasExchangeRate() || !Number.isFinite(fetchedAt) || Date.now() - fetchedAt > EXCHANGE_RATE_MAX_AGE;
}

function exchangeRateMeta() {
  if (!hasExchangeRate()) return state.exchangeError || 'Se actualizará al conectar';
  const quoted = state.exchangeRate.quoteDate ? `Publicado ${formatDate(state.exchangeRate.quoteDate)}` : 'Última cotización publicada';
  if (state.exchangeLoading) return `${quoted} · actualizando…`;
  if (state.exchangeError) return `${quoted} · usando última guardada`;
  const updated = state.exchangeRate.fetchedAt ? refreshedAt.format(new Date(state.exchangeRate.fetchedAt)) : '';
  return updated ? `${quoted} · actualizado ${updated}` : quoted;
}

function renderExchangeRateControl() {
  if (!elements.exchangeRateControl) return;
  const stateName = state.exchangeLoading ? 'loading' : state.exchangeError ? 'error' : hasExchangeRate() ? 'ready' : 'idle';
  elements.exchangeRateControl.dataset.state = stateName;
  elements.exchangeRateControl.setAttribute('aria-busy', String(state.exchangeLoading));
  elements.exchangeRateValue.textContent = state.exchangeLoading && !hasExchangeRate()
    ? 'Actualizando…'
    : hasExchangeRate()
      ? `1 USD = ${money.format(state.exchangeRate.rate)}`
      : 'Sin cotización';
  elements.exchangeRateMeta.textContent = exchangeRateMeta();
  elements.refreshExchangeRate.disabled = state.exchangeLoading;
}

function parseBcraUsdQuote(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : payload?.results ? [payload.results] : [];
  for (const result of results) {
    const details = Array.isArray(result?.detalle) ? result.detalle : result?.detalle ? [result.detalle] : [];
    const usd = details.find(detail => detail?.codigoMoneda === 'USD') || details[0];
    const rate = Number(usd?.tipoCotizacion);
    if (Number.isFinite(rate) && rate > 0) {
      return { rate, quoteDate: isValidDate(result?.fecha) ? result.fecha : todayString() };
    }
  }
  return null;
}

function isDialogOpen(dialog) {
  return Boolean(dialog?.open || dialog?.hasAttribute('open'));
}

async function refreshExchangeRate({ quiet = false } = {}) {
  if (state.exchangeLoading) return;
  state.exchangeLoading = true;
  state.exchangeError = '';
  renderExchangeRateControl();
  try {
    const response = await fetch(BCRA_USD_ENDPOINT, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`BCRA respondió ${response.status}`);
    const quote = parseBcraUsdQuote(await response.json());
    if (!quote) throw new Error('La respuesta del BCRA no incluyó una cotización de USD válida');
    state.exchangeRate = {
      rate: quote.rate,
      quoteDate: quote.quoteDate,
      fetchedAt: new Date().toISOString(),
      source: 'BCRA'
    };
    if (!saveExchangeRate(state.exchangeRate)) setStatus('Cotización actualizada, pero no se pudo guardar localmente', 'error');
    else if (!quiet) setStatus('Cotización oficial actualizada', 'saved');
  } catch (_) {
    state.exchangeError = hasExchangeRate()
      ? 'No se pudo actualizar la cotización oficial'
      : 'No se pudo obtener la cotización oficial';
    if (!quiet) setStatus(hasExchangeRate() ? 'No pude actualizar; uso la última cotización guardada' : state.exchangeError, 'error');
  } finally {
    state.exchangeLoading = false;
    renderExchangeRateControl();
    if (!isDialogOpen(elements.sourceDialog) && !isDialogOpen(elements.hourDialog) && !isDialogOpen(elements.importDialog)) render();
  }
}

function amountClass(value) {
  return value > 0 ? 'positive' : 'muted';
}

function paymentBadge(payment, source, expected, quickToggle = false) {
  const canToggle = quickToggle
    && source
    && expected > 0
    && ['pending', 'paid'].includes(payment.status);
  if (!canToggle) return `<span class="badge payment ${escapeHtml(payment.status)}">${escapeHtml(PAYMENT_STATES[payment.status])}</span>`;

  const isPaid = payment.status === 'paid';
  const action = isPaid ? 'Marcar como pendiente' : 'Marcar como cobrado total';
  const sourceName = escapeHtml(sourceTitle(source));
  return `<button class="badge payment ${escapeHtml(payment.status)} payment-toggle" type="button" data-action="toggle-source-payment" data-id="${escapeHtml(source.id)}" aria-pressed="${String(isPaid)}" aria-label="${action}: ${sourceName}" title="${action}: ${sourceName}">${escapeHtml(PAYMENT_STATES[payment.status])}</button>`;
}

function trackerPaymentBadge(payment, expected) {
  const canToggle = expected > 0 && ['pending', 'paid'].includes(payment.status);
  if (!canToggle) return paymentBadge(payment);

  const isPaid = payment.status === 'paid';
  const action = isPaid ? 'Marcar horas como pendientes' : 'Marcar horas como cobradas';
  return `<button class="badge payment ${escapeHtml(payment.status)} payment-toggle" type="button" data-action="toggle-tracker-payment" aria-pressed="${String(isPaid)}" aria-label="${action}" title="${action}">${escapeHtml(PAYMENT_STATES[payment.status])}</button>`;
}

function trackerPaymentTiming(payment) {
  if (payment.status === 'paid') return 'Cobro registrado';
  return payment.expectedPaymentDate
    ? `Cobro estimado: ${formatDate(payment.expectedPaymentDate)}`
    : 'Sin fecha estimada de cobro';
}

function projectBadge(status, source, quickToggle = false) {
  const canToggle = quickToggle
    && source
    && ['saas', 'project'].includes(source.type)
    && ['development', 'active', 'paused'].includes(status);
  if (!canToggle) return `<span class="badge project ${escapeHtml(status)}">${escapeHtml(PROJECT_STATES[status])}</span>`;

  const isActive = status === 'active';
  const action = isActive ? 'Pausar' : 'Activar';
  const sourceName = escapeHtml(sourceTitle(source));
  return `<button class="badge project ${escapeHtml(status)} status-toggle" type="button" data-action="toggle-source-status" data-id="${escapeHtml(source.id)}" aria-pressed="${String(isActive)}" aria-label="${action} ${sourceName}" title="${action} ${sourceName}">${escapeHtml(PROJECT_STATES[status])}</button>`;
}

function typeBadge(type) {
  return `<span class="type-badge ${escapeHtml(type)}">${escapeHtml(typeLabel(type))}</span>`;
}

function currencyBadge(currency) {
  return `<span class="badge currency" title="${escapeHtml(currencyName(currency))}">${escapeHtml(currency)}</span>`;
}

function sourceTitle(source) {
  return source.name || 'Sin nombre';
}

function sourcePeriodLabel(source, expected) {
  if (source.type === 'saas') return `${BILLING_CYCLES[source.billingCycle]} · ${source.billingMode === 'scheduled' ? 'Cobro del período' : 'Equivalente mensual'} ${formatCurrency(expected, source.currency)}`;
  if (source.type === 'project') return `Proyecto ${formatCurrency(source.amount, source.currency)}`;
  if (source.type === 'hours') return `${number.format(source.estimatedHours)} h × ${formatCurrency(source.amount, source.currency)}`;
  if (source.billingCycle === 'once') return `Extra ${formatCurrency(source.amount, source.currency)}`;
  return `${BILLING_CYCLES[source.billingCycle]} · ${formatCurrency(expected, source.currency)}`;
}

function meetsFilter(source) {
  if (state.filter === 'all') return true;
  const payment = getPaymentForPeriod(source, state.period);
  return state.filter === 'paid' ? payment.status === 'paid' : payment.status !== 'paid';
}

function renderSourceCard(source, compactCard = false, quickToggle = false) {
  const expected = sourceAmountForPeriod(source, state.period);
  const payment = getPaymentForPeriod(source, state.period);
  const collected = collectedAmount(expected, payment);
  const visibleExpected = expected;
  const convertedExpected = arsConversionLabel(expected, source.currency);
  const convertedCollected = arsConversionLabel(collected, source.currency);
  const dueDate = source.type === 'saas' && source.billingMode === 'scheduled' ? recurringDates(source, state.period)[0] : source.expectedDate;
  const projectDate = dueDate ? `<span class="meta-item">Vence ${formatDate(dueDate)}</span>` : '';
  const linkedClient = state.workspace.clients.find(client => client.id === source.clientId);
  const clientMetric = source.type === 'saas' && source.clients > 0
    ? `<span class="meta-item">${number.format(source.clients)} ${source.clients === 1 ? 'cliente' : 'clientes'}</span>`
    : '';
  const url = safeUrl(source.url);
  return `
    <article class="income-card ${compactCard ? 'compact' : ''}" data-source-card="${escapeHtml(source.id)}">
      <div class="card-topline">
        <span class="badge-group">${typeBadge(source.type)}${currencyBadge(source.currency)}</span>
        <div class="badge-group">${projectBadge(getStatusForPeriod(source, state.period), source, quickToggle)}${paymentBadge(payment, source, expected, quickToggle)}</div>
      </div>
      <div class="card-heading">
        <div>
          <h3>${escapeHtml(sourceTitle(source))}</h3>
          <p>${escapeHtml(sourcePeriodLabel(source, visibleExpected))}</p>
        </div>
        <div class="card-amount-wrap"><strong class="card-amount ${amountClass(expected)}">${formatCurrency(expected, source.currency)}</strong>${convertedExpected ? `<span class="card-amount-secondary">${escapeHtml(convertedExpected)}</span>` : ''}</div>
      </div>
      <div class="card-meta">
        ${linkedClient ? `<span class="meta-item">${escapeHtml(linkedClient.name)}</span>` : ''}
        ${source.category ? `<span class="meta-item">${escapeHtml(source.category)}</span>` : ''}
        ${source.cancelledFrom ? `<span class="meta-item">Cancelada desde ${escapeHtml(source.cancelledFrom)}</span>` : ''}
        ${clientMetric}
        ${projectDate}
        ${source.notes ? `<span class="meta-item note-preview">${escapeHtml(source.notes)}</span>` : ''}
      </div>
      <div class="card-footer">
        <span>${payment.status === 'partial' || payment.status === 'paid' ? `Cobrado ${formatCurrency(collected, source.currency)}${convertedCollected ? ` · ${convertedCollected}` : ''}` : 'Sin cobro registrado'}</span>
        <span class="card-actions">
          ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" class="mini-link">Abrir</a>` : ''}
          <button class="text-button" type="button" data-action="edit-source" data-id="${escapeHtml(source.id)}">Editar</button>
        </span>
      </div>
    </article>`;
}

function renderEmpty(title, description, action = 'Agregar fuente') {
  return `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">+</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <button type="button" class="btn primary" data-action="new-source">${escapeHtml(action)}</button>
    </div>`;
}

function sourcesFor(type, { relevantOnly = false } = {}) {
  return state.sources
    .filter(source => !source.deletedAt)
    .filter(source => source.type === type)
    .filter(source => !(relevantOnly || source.type === 'saas') || sourceIsVisibleInPeriod(source, state.period))
    .filter(meetsFilter);
}

function renderTrackerWidget({ large = false } = {}) {
  const tracker = currentTracker();
  const payment = currentTrackerPayment();
  const collected = collectedAmount(tracker.total, payment);
  const currency = currentRate().currency;
  const convertedTotal = arsConversionLabel(tracker.total, currency);
  const convertedCollected = arsConversionLabel(collected, currency);
  return `
    <article class="tracker-widget ${large ? 'large' : ''}">
      <div class="section-kicker">Ingreso principal</div>
      <div class="tracker-title-row">
        <div>
          <h3>${escapeHtml(typeLabel('hours'))}</h3>
          <p>${formatMonth()} · ${tracker.days} ${tracker.days === 1 ? 'día registrado' : 'días registrados'}</p>
        </div>
        ${trackerPaymentBadge(payment, tracker.total)}
      </div>
      <div class="tracker-numbers">
        <div><span>Horas reales</span><b>${number.format(tracker.real)} h</b></div>
        <div><span>Horas a pagar</span><b>${number.format(tracker.payable)} h</b></div>
        <div><span>Total · ${currency}</span><span class="currency-value"><b>${formatCurrency(tracker.total, currency)}</b>${convertedTotal ? `<small>${escapeHtml(convertedTotal)}</small>` : ''}</span></div>
      </div>
      <div class="tracker-footer">
        <div class="tracker-payment-copy">
          <span>${payment.status === 'partial' || payment.status === 'paid' ? `Cobrado ${formatCurrency(collected, currency)}${convertedCollected ? ` · ${convertedCollected}` : ''}` : 'Pendiente de cobro'}</span>
          <small>${escapeHtml(trackerPaymentTiming(payment))}</small>
        </div>
        <button class="btn small" type="button" data-action="go-hours">Ver horas</button>
      </div>
    </article>`;
}


function renderCatalog(type) {
  const isSaas = type === 'saas';
  const title = typeLabel(type);
  const description = isSaas
    ? 'Suscripciones desde su mes de alta, con activación y cobros independientes para cada mes.'
    : 'Proyectos de pago único del mes elegido, con sus fechas de entrega y cobros esperados.';
  const sources = sourcesFor(type, { relevantOnly: !isSaas });
  const ended = isSaas ? state.sources.filter(source => source.type === 'saas' && !source.deletedAt && source.startPeriod <= state.period && !sourceIsVisibleInPeriod(source, state.period)) : [];
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${isSaas ? 'Ingresos recurrentes' : 'Pago único'}</p><h1>${escapeHtml(title)}</h1><p class="lede">${description}</p></div>
      <button type="button" class="btn primary" data-action="new-source" data-type="${type}">+ ${isSaas ? 'Ingreso recurrente' : 'Proyecto'}</button>
    </section>
    <section class="catalog-grid">
      ${sources.length ? sources.map(source => renderSourceCard(source, false, true)).join('') : renderEmpty(`No hay ${isSaas ? 'suscripciones' : 'desarrollos'} para mostrar`, 'Podés crear una fuente ahora y completar el cobro más tarde.')}
    </section>${ended.length ? `<details class="settings-card"><summary>Finalizadas o canceladas (${ended.length})</summary><p class="note">No se incluyen en los totales del mes. Podés editar sus fechas para volver a usarlas.</p><div class="card-grid">${ended.map(source => renderSourceCard(source)).join('')}</div></details>` : ''}`;
}

function renderCalendar() {
  const { year, month } = currentParts();
  const days = currentDays();
  const offset = (new Date(year, month - 1, 1).getDay() - state.workspace.profile.weekStart + 7) % 7;
  const dim = daysInMonth(year, month);
  const today = todayString();
  let output = '';
  for (let index = 0; index < offset; index += 1) output += '<div class="day blank" aria-hidden="true"></div>';
  for (let day = 1; day <= dim; day += 1) {
    const date = dateInCurrentPeriod(day);
    const hours = days[date] || 0;
    const holiday = state.settings.holidays.has(date);
    const weekend = !state.settings.hours[dayOfWeek(date)];
    const classes = ['day'];
    if (weekend) classes.push('weekend');
    if (holiday) classes.push('holiday');
    if (hours) classes.push('worked');
    if (date === today) classes.push('today');
    let label = longDate.format(dateOf(date));
    if (hours) label += `, trabajado ${number.format(hours)} horas`;
    if (holiday) label += ', feriado';
    output += `<button type="button" class="${classes.join(' ')}" data-action="day" data-date="${date}" aria-label="${escapeHtml(label)}" aria-pressed="${hours ? 'true' : 'false'}"><span>${day}</span><small>${hours ? `${number.format(hours)}h${holiday ? `×${number.format(state.settings.mult)}` : ''}` : ''}</small></button>`;
  }
  return output;
}

function renderHours() {
  const tracker = currentTracker();
  const payment = currentTrackerPayment();
  const rate = currentRate();
  const currency = rate.currency;
  const convertedTotal = arsConversionLabel(tracker.total, currency);
  const rateScopeNote = rate.isMonthly
    ? `Tarifa guardada solo para ${formatMonth().toLowerCase()}.`
    : `Este mes empieza en 0. Al cargar una tarifa quedará guardada solo para ${formatMonth().toLowerCase()}.`;
  return `
    <section class="page-heading">
      <div><p class="eyebrow">Trabajo por horas</p><h1>${escapeHtml(typeLabel('hours'))}</h1><p class="lede">Registrá tus jornadas y llevá el control del cobro mensual. Para tarifas por cliente, agregá un servicio por horas.</p></div>
      <button type="button" class="btn" data-action="new-source" data-type="hours">+ Servicio por horas</button>
    </section>
    <section class="hours-summary-layout">
      ${renderTrackerWidget({ large: true })}
      <form class="payment-panel" id="trackerPaymentForm">
        <p class="section-kicker">Cierre mensual</p>
        <h2>${escapeHtml(typeLabel('hours'))} · ${formatMonth()}</h2>
        <div class="payment-quick-actions" role="group" aria-label="Marcar cobro de las horas">
          <button class="payment-state-action ${payment.status === 'pending' ? 'is-active pending' : ''}" type="button" data-action="set-tracker-payment-status" data-status="pending" aria-pressed="${String(payment.status === 'pending')}" ${tracker.total > 0 ? '' : 'disabled'}>Pendiente</button>
          <button class="payment-state-action ${payment.status === 'paid' ? 'is-active paid' : ''}" type="button" data-action="set-tracker-payment-status" data-status="paid" aria-pressed="${String(payment.status === 'paid')}" ${tracker.total > 0 ? '' : 'disabled'}>Cobrado total</button>
        </div>
        <label>Estado detallado
          <select name="status">${Object.entries(PAYMENT_STATES).map(([value, label]) => `<option value="${value}" ${payment.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
        </label>
        <label>Fecha estimada de cobro
          <input name="expectedPaymentDate" type="date" value="${escapeHtml(payment.expectedPaymentDate)}">
        </label>
        <label>Monto cobrado (${currency})
          <input name="paidAmount" type="text" inputmode="decimal" value="${escapeHtml(formatInputNumber(payment.paidAmount))}" placeholder="0">
        </label>
        <p class="note">Total registrado: <strong>${formatCurrency(tracker.total, currency)}</strong><br><small>Usá el estado detallado solo si necesitás registrar un cobro parcial.</small></p>
        <button class="btn primary" type="submit">Guardar detalle</button>
      </form>
    </section>
    <section class="calendar-panel">
      <div class="calendar-toolbar">
        <div><p class="section-kicker">${formatMonth()}</p><h2>Jornadas registradas</h2></div>
        <label class="rate-field">Valor hora <span class="rate-inputs"><input id="rateInput" type="text" inputmode="decimal" value="${escapeHtml(formatInputNumber(rate.rate))}" placeholder="0"><select id="rateCurrency" aria-label="Moneda de la tarifa por hora">${currencyOptions(currency)}</select></span></label>
      </div>
      <p class="rate-period-note">${escapeHtml(rateScopeNote)}</p>
      <div class="mode-tabs" role="group" aria-label="Modo del calendario">
        <button type="button" data-action="mode" data-mode="work" aria-pressed="${state.mode === 'work'}">Registrar jornada</button>
        <button type="button" data-action="mode" data-mode="holiday" aria-pressed="${state.mode === 'holiday'}">Feriado</button>
        <button type="button" data-action="mode" data-mode="edit" aria-pressed="${state.mode === 'edit'}">Editar horas</button>
      </div>
      <p class="hint">${state.mode === 'work' ? 'Tocá un día para registrar tu jornada; si no tiene horas por defecto, podés elegirlas.' : state.mode === 'holiday' ? 'Marcá los feriados que deban contar con multiplicador.' : 'Elegí un día para editar sus horas o su feriado.'}</p>
      <div class="weekdays" aria-hidden="true">${Array.from({ length: 7 }, (_, index) => `<span>${['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'][(index + state.workspace.profile.weekStart) % 7]}</span>`).join('')}</div>
      <div class="calendar-grid">${renderCalendar()}</div>
      <div class="calendar-total"><span>${tracker.days} días · ${number.format(tracker.real)} h reales · ${number.format(tracker.payable)} h a pagar</span><span class="currency-value"><strong>${formatCurrency(tracker.total, currency)}</strong>${convertedTotal ? `<small>${escapeHtml(convertedTotal)}</small>` : ''}</span></div>
    </section>
    <section class="module-section">
      <div class="section-header"><div><p class="section-kicker">Freelance</p><h2>Servicios por hora planificados</h2></div><button type="button" class="text-button" data-action="new-source" data-type="hours">Agregar servicio</button></div>
      <div class="card-grid">${sourcesFor('hours', { relevantOnly: true }).length ? sourcesFor('hours', { relevantOnly: true }).map(source => renderSourceCard(source)).join('') : renderEmpty('Sin servicios adicionales', 'El tracker ya calcula tus horas registradas. Agregá aquí presupuestos por horas de clientes específicos.')}</div>
    </section>`;
}

function renderSettings() {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const names = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  return `
    <section class="page-heading compact-heading">
      <div><p class="eyebrow">Configuración</p><h1>Ajustes & copias</h1><p class="lede">Adaptá las secciones, el calendario y las monedas a tu actividad. Tus copias y recuperaciones también están acá.</p></div>
    </section>
    <section class="settings-layout">
      ${renderDesktopUpdateCard()}
      ${workspaceUI.settingsExtra()}
      <form class="settings-card" id="hoursDefaultsForm">
        <p class="section-kicker">Tracker de horas</p>
        <h2>Horas que se cargan al tocar un día</h2>
        <div class="default-hours-grid">
          ${order.map((day, index) => `<label><span>${names[index]}</span><input data-dow="${day}" type="text" inputmode="decimal" value="${escapeHtml(formatInputNumber(state.settings.hours[day]))}" aria-label="Horas por defecto ${names[index]}"></label>`).join('')}
        </div>
        <label class="wide-label">Multiplicador de feriados
          <input id="multiplierInput" type="text" inputmode="decimal" value="${escapeHtml(formatInputNumber(state.settings.mult))}">
        </label>
        <p class="note">Los cambios aplican a futuras cargas. Para editar una fecha ya marcada, abrila desde el tracker.</p>
        <p class="note">Poné 0 en los días no laborables. No se precargan feriados en espacios nuevos.</p>
        <button class="btn primary" type="submit">Guardar jornada habitual</button>
      </form>
      <section class="settings-card">
        <p class="section-kicker">Copia de seguridad</p>
        <h2>Tus datos quedan en este dispositivo</h2>
        <p class="note">Descargá una copia antes de borrar datos del navegador, cambiar de teléfono o publicar una versión nueva.</p>
        <div class="button-row"><button class="btn primary" type="button" data-action="export-backup">Descargar backup</button><button class="btn" type="button" data-action="import-backup">Importar backup</button></div>
      </section>
      <section class="settings-card">
        <p class="section-kicker">Conversión automática</p>
        <h2>${hasExchangeRate() ? `1 USD = ${money.format(state.exchangeRate.rate)}` : 'Sin cotización USD'}</h2>
        <p class="note">Fuente: BCRA · ${exchangeRateMeta()}. Referencia automática entre ARS y USD. Para otras monedas usá las conversiones manuales; los importes originales se conservan.</p>
        <div class="button-row"><button class="btn" type="button" data-action="refresh-exchange-rate" ${state.exchangeLoading ? 'disabled' : ''}>${state.exchangeLoading ? 'Actualizando…' : 'Actualizar cotización'}</button></div>
        <p class="note">${state.sources.length} fuentes de ingreso guardadas en este dispositivo.</p>
      </section>
      <section class="settings-card danger-zone">
        <div>
          <p class="section-kicker">Zona de riesgo</p>
          <h2>Eliminar toda la información</h2>
          <p class="note">Vacía el espacio actual y conserva una copia local para recuperar los datos desde Configuración.</p>
        </div>
        <button class="btn danger" type="button" data-action="clear-all-data">Eliminar datos</button>
      </section>
    </section>`;
}

function render() {
  applyWorkspacePreferences();
  ensureMonth();
  document.body.dataset.route = state.route;
  elements.periodInput.value = state.period;
  elements.periodLabel.textContent = formatMonth();
  elements.status.textContent = state.status;
  renderExchangeRateControl();
  elements.activeSectionLabel.textContent = ROUTES[state.route];
  elements.filter.hidden = !['hub', 'saas', 'projects', 'hours'].includes(state.route);
  elements.nav.querySelectorAll('button[data-route]').forEach(button => {
    button.setAttribute('aria-current', button.dataset.route === state.route ? 'page' : 'false');
  });
  elements.filter.querySelectorAll('button[data-filter]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
  });
  let content;
  if (state.route === 'hub') content = workspaceUI.dashboard();
  else if (state.route === 'saas') content = renderCatalog('saas');
  else if (state.route === 'projects') content = renderCatalog('project');
  else if (state.route === 'hours') content = renderHours();
  else if (state.route === 'clients') content = workspaceUI.directory();
  else if (state.route === 'expenses') content = workspaceUI.expenses();
  else content = renderSettings();
  elements.view.innerHTML = `<div class="page page-${escapeHtml(state.route)}">${content}</div>`;
}

function setRoute(route) {
  if (!ROUTES[route]) return;
  state.route = route;
  render();
  closeDrawerAfterNavigation();
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function changePeriod(next) {
  if (!parseMonthKey(next)) return;
  state.period = next;
  ensureMonth(next);
  render();
}

function saveCurrentMonth() {
  persist(saveMonth(state.period, ensureMonth()));
}

function saveCurrentSources() {
  persist(saveSources(state.sources));
}

function saveCurrentTrackerPayments() {
  persist(saveTrackerPayments(state.trackerPayments));
}

function showDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function sourceFormFields() {
  return elements.sourceForm.elements;
}

function updateSourceFormUI() {
  const fields = sourceFormFields();
  const type = fields.type.value;
  const currency = fields.currency.value;
  const isSaas = type === 'saas';
  const isProject = type === 'project';
  const isHours = type === 'hours';
  const amountLabel = isSaas ? 'Monto por ciclo' : isProject ? 'Precio total acordado' : isHours ? 'Tarifa por hora' : 'Monto por ciclo o extra';
  $('#sourceAmountLabel').textContent = `${amountLabel} (${currency})`;
  $('#sourcePaidAmountLabel').textContent = `Monto ya cobrado (${currency})`;
  $('#sourceCycleWrap').hidden = isProject || isHours;
  $('#sourceClientsWrap').hidden = true;
  $('#sourceRecurrenceWrap').hidden = !isSaas;
  $('#sourceHoursWrap').hidden = !isHours;
  $('#sourceDateLabel').textContent = isProject ? 'Fecha del trabajo / cobro' : 'Fecha estimada de cobro';
  fields.expectedDate.closest('label').hidden = isSaas;
  fields.paidAmount.closest('label').hidden = fields.paymentStatus.value !== 'partial';
  fields.clientId.closest('label').hidden = !state.workspace.profile.modules.clients && !fields.clientId.value;
  fields.serviceId.closest('label').hidden = !state.workspace.profile.modules.clients && !fields.serviceId.value;
  const isNewSource = !state.sources.some(source => source.id === fields.id.value);
  $('#sourceStatusLabel').textContent = isSaas ? 'Estado en este mes' : 'Estado del trabajo';
  const periodHint = $('#sourcePeriodHint');
  periodHint.hidden = !isSaas;
  periodHint.textContent = `${formatMonth()}: activar, pausar o marcar un cobro afecta solo este mes. Nombre, tarifa y fechas definen todo el servicio. ${isNewSource ? 'La suscripción aparecerá desde su mes de inicio.' : ''}`;
  if (isProject && isNewSource && !fields.expectedDate.value) {
    fields.expectedDate.value = state.period === todayKey() ? todayString() : `${state.period}-01`;
  }
  const currencyHint = $('#sourceCurrencyHint');
  currencyHint.hidden = currency === state.workspace.profile.currency;
  if (!currencyHint.hidden) {
    const converted = convertAmount(1, currency, state.workspace.profile, state.exchangeRate);
    currencyHint.textContent = converted === null ? `Guardado en ${currency}. Configurá su conversión en Ajustes para incluirlo en el total en ${state.workspace.profile.currency}.`
      : `Conversión del panel: 1 ${currency} = ${formatCurrency(converted, state.workspace.profile.currency)}. El importe original se conserva.`;
  }
  if (isProject) fields.billingCycle.value = 'once';
  else if (isHours) fields.billingCycle.value = 'monthly';
}

function populateSourceRelations(clientId = '', serviceId = '') {
  const fields = sourceFormFields();
  fields.clientId.innerHTML = '<option value="">Sin cliente</option>' + state.workspace.clients.filter(item => !item.deletedAt || item.id === clientId).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  fields.clientId.value = clientId;
  fields.serviceId.innerHTML = '<option value="">Carga manual</option>' + state.workspace.services.filter(item => (!item.deletedAt || item.id === serviceId) && (!item.clientId || !clientId || item.clientId === clientId)).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${formatCurrency(item.rate, item.currency)}</option>`).join('');
  fields.serviceId.value = serviceId;
}

function applySourceService(service) {
  if (!service) return;
  const fields = sourceFormFields();
  populateSourceRelations(service.clientId || fields.clientId.value, service.id);
  fields.amount.value = formatInputNumber(service.rate); fields.currency.value = service.currency;
  fields.type.value = service.unit === 'hour' ? 'hours' : 'project';
  if (!fields.name.value.trim()) fields.name.value = service.name;
  updateSourceFormUI();
}

function openSourceModal(id = '', type = '', presets = {}) {
  const source = state.sources.find(item => item.id === id);
  const fields = sourceFormFields();
  const initialType = type || (state.workspace.profile.modules.saas ? 'saas' : state.workspace.profile.modules.projects ? 'project' : state.workspace.profile.modules.hours ? 'hours' : 'fixed');
  const projectDateForPeriod = state.period === todayKey() ? todayString() : `${state.period}-01`;
  const initial = source || normalizeSource({
    type: initialType,
    id: createId(),
    startPeriod: state.period,
    startsOn: initialType === 'saas' ? `${state.period}-01` : '',
    billingMode: 'scheduled',
    currency: state.workspace.profile.currency,
    expectedDate: initialType === 'project' ? projectDateForPeriod : '',
    projectStatus: (initialType === 'saas' || initialType === 'fixed') ? 'active' : 'development'
  });
  const payment = getPaymentForPeriod(initial, state.period);
  fields.id.value = initial.id;
  fields.name.value = initial.name;
  fields.type.value = initial.type;
  fields.amount.value = formatInputNumber(initial.amount);
  fields.currency.innerHTML = currencyOptions(initial.currency);
  fields.billingCycle.value = initial.billingCycle;
  fields.clients.value = initial.clients || '';
  fields.estimatedHours.value = initial.estimatedHours || '';
  fields.projectStatus.value = getStatusForPeriod(initial, state.period);
  fields.expectedDate.value = initial.expectedDate;
  fields.url.value = initial.url;
  fields.notes.value = initial.notes;
  fields.category.value = initial.category;
  fields.startsOn.value = initial.startsOn || (initial.type === 'saas' ? `${initial.startPeriod}-01` : `${state.period}-01`);
  fields.endsOn.value = initial.endsOn;
  fields.cancelledFrom.value = initial.cancelledFrom;
  fields.dueDay.value = initial.dueDay;
  fields.billingMode.value = initial.billingMode;
  populateSourceRelations(presets.clientId || initial.clientId, initial.serviceId);
  if (presets.service) applySourceService(presets.service);
  fields.paymentStatus.value = payment.status;
  fields.paidAmount.value = payment.paidAmount ? formatInputNumber(payment.paidAmount) : '';
  $('#sourceDialogTitle').textContent = source ? 'Editar fuente' : 'Nueva fuente de ingreso';
  elements.deleteSource.hidden = !source;
  elements.sourceError.hidden = true;
  updateSourceFormUI();
  showDialog(elements.sourceDialog);
  setTimeout(() => fields.name.focus(), 0);
}

function removeSource(id) {
  const source = state.sources.find(item => item.id === id);
  if (!source) return;
  const sources = state.sources.map(item => item.id === id ? { ...item, deletedAt: new Date().toISOString() } : item);
  if (!saveSources(sources)) return setStatus('No se pudo guardar.', 'error');
  state.sources = sources;
  setStatus('Ingreso movido a papelera. Podés recuperarlo en Configuración.', 'saved');
  closeDialog(elements.sourceDialog);
  render();
}

function toggleSourceStatus(id) {
  const source = state.sources.find(item => item.id === id);
  if (!source || !['saas', 'project'].includes(source.type)) return;
  const status = getStatusForPeriod(source, state.period);
  if (!['development', 'active', 'paused'].includes(status)) return;
  const nextStatus = status === 'active' ? 'paused' : 'active';
  state.sources = state.sources.map(item => item.id === id
    ? setStatusForPeriod(item, state.period, nextStatus)
    : item);
  const saved = saveSources(state.sources);
  setStatus(saved ? `${sourceTitle(source)} ${nextStatus === 'active' ? 'activado' : 'pausado'}` : 'No se pudo guardar el cambio', saved ? 'saved' : 'error');
  render();
}

function toggleSourcePayment(id) {
  const source = state.sources.find(item => item.id === id);
  if (!source) return;
  const expected = sourceAmountForPeriod(source, state.period);
  const payment = getPaymentForPeriod(source, state.period);
  if (!(expected > 0) || !['pending', 'paid'].includes(payment.status)) return;

  const isPaid = payment.status === 'paid';
  const updatedSource = setPaymentForPeriod(source, state.period, {
    status: isPaid ? 'pending' : 'paid',
    paidAmount: isPaid ? 0 : expected
  });
  state.sources = state.sources.map(item => item.id === id ? updatedSource : item);
  const saved = saveSources(state.sources);
  const message = isPaid ? 'marcado como pendiente' : 'marcado como cobrado total';
  setStatus(saved ? `${sourceTitle(source)} ${message}` : 'No se pudo guardar el cambio', saved ? 'saved' : 'error');
  render();
}

function onSourceSubmit(event) {
  event.preventDefault();
  const fields = sourceFormFields();
  const amount = parseNumber(fields.amount.value);
  const paidAmount = fields.paidAmount.value.trim() ? parseNumber(fields.paidAmount.value) : 0;
  const estimatedHours = fields.estimatedHours.value.trim() ? parseNumber(fields.estimatedHours.value) : 0;
  const clients = fields.clients.value.trim() ? parseNumber(fields.clients.value) : 0;
  if (!fields.name.value.trim()) return showSourceError('Escribí un nombre para identificar esta fuente.');
  if (!Number.isFinite(amount) || amount < 0) return showSourceError('Ingresá un monto válido, igual o mayor que cero.');
  if (!Number.isFinite(paidAmount) || paidAmount < 0) return showSourceError('El monto cobrado debe ser válido.');
  if (!Number.isFinite(estimatedHours) || estimatedHours < 0 || estimatedHours > 744) return showSourceError('Las horas estimadas deben estar entre 0 y 744.');
  if (!Number.isFinite(clients) || clients < 0) return showSourceError('La cantidad de clientes debe ser válida.');
  if (fields.type.value === 'saas') {
    if (!isValidDate(fields.startsOn.value)) return showSourceError('Elegí una fecha de inicio válida.');
    if (fields.endsOn.value && (!isValidDate(fields.endsOn.value) || fields.endsOn.value < fields.startsOn.value)) return showSourceError('La fecha final debe ser igual o posterior al inicio.');
    if (!Number.isInteger(Number(fields.dueDay.value)) || !(Number(fields.dueDay.value) >= 1 && Number(fields.dueDay.value) <= 31)) return showSourceError('El día de vencimiento debe ser un entero entre 1 y 31.');
    if (fields.cancelledFrom.value && fields.cancelledFrom.value < fields.startsOn.value.slice(0, 7)) return showSourceError('La cancelación no puede ser anterior al inicio.');
  }
  const previous = state.sources.find(item => item.id === fields.id.value);
  let source = normalizeSource({
    ...(previous || {}),
    id: fields.id.value || createId(),
    name: fields.name.value,
    type: fields.type.value,
    startPeriod: fields.type.value === 'saas' ? fields.startsOn.value.slice(0, 7) : state.period,
    startsOn: fields.type.value === 'saas' ? fields.startsOn.value : '',
    endsOn: fields.type.value === 'saas' ? fields.endsOn.value : '',
    cancelledFrom: fields.type.value === 'saas' ? fields.cancelledFrom.value : '',
    dueDay: Number(fields.dueDay.value),
    billingMode: fields.billingMode.value,
    clientId: fields.clientId.value,
    serviceId: fields.serviceId.value,
    category: fields.category.value,
    period: fields.type.value === 'hours' ? (previous?.period || state.period) : '',
    amount,
    currency: fields.currency.value,
    billingCycle: fields.type.value === 'project' ? 'once' : fields.type.value === 'hours' ? 'monthly' : fields.billingCycle.value,
    clients,
    estimatedHours,
    projectStatus: fields.projectStatus.value,
    expectedDate: fields.expectedDate.value,
    url: fields.url.value,
    notes: fields.notes.value,
    updatedAt: new Date().toISOString()
  });
  source = setStatusForPeriod(source, state.period, fields.projectStatus.value);
  source = setPaymentForPeriod(source, state.period, { status: fields.paymentStatus.value, paidAmount });
  const sources = previous ? state.sources.map(item => item.id === source.id ? source : item) : [...state.sources, source];
  if (!saveSources(sources)) return showSourceError('No se pudo guardar. Tus cambios siguen en este formulario.');
  state.sources = sources;
  setStatus('Ingreso guardado', 'saved');
  closeDialog(elements.sourceDialog);
  render();
}

function showSourceError(message) {
  elements.sourceError.textContent = message;
  elements.sourceError.hidden = false;
}

function openHourModal(date) {
  state.editingDate = date;
  const days = currentDays();
  const existing = days[date] || 0;
  const defaultHours = state.settings.hours[dayOfWeek(date)] || 0;
  const holiday = state.settings.holidays.has(date);
  $('#hourDialogTitle').textContent = cap(longDate.format(dateOf(date)));
  $('#hourDate').value = date;
  $('#hourInput').value = existing ? formatInputNumber(existing) : (defaultHours ? formatInputNumber(defaultHours) : '');
  $('#hourHoliday').checked = holiday;
  $('#removeHour').hidden = !existing;
  $('#hourError').hidden = true;
  showDialog(elements.hourDialog);
  setTimeout(() => $('#hourInput').focus(), 0);
}

function closeHourModal() {
  state.editingDate = null;
  closeDialog(elements.hourDialog);
}

function onDay(date) {
  const days = currentDays();
  if (state.mode === 'holiday') {
    if (state.settings.holidays.has(date)) state.settings.holidays.delete(date);
    else state.settings.holidays.add(date);
    persist(saveSettings(state.settings));
    render();
    return;
  }
  if (state.mode === 'edit') return openHourModal(date);
  if (days[date] > 0) {
    if (!createSafetyBackup('Antes de quitar una jornada', true)) return setStatus('No se pudo crear una copia; la jornada se conservó.', 'error');
    delete days[date];
    saveCurrentMonth();
    render();
    return;
  }
  const defaultHours = state.settings.hours[dayOfWeek(date)] || 0;
  if (defaultHours > 0) {
    days[date] = defaultHours;
    saveCurrentMonth();
    render();
  } else {
    openHourModal(date);
  }
}

function onHourSubmit(event) {
  event.preventDefault();
  const date = $('#hourDate').value;
  const hours = parseNumber($('#hourInput').value);
  if (!isValidDate(date) || !Number.isFinite(hours) || hours < 0.5 || hours > 24 || Math.round(hours * 2) !== hours * 2) {
    $('#hourError').textContent = 'Usá horas entre 0,5 y 24, en intervalos de media hora.';
    $('#hourError').hidden = false;
    return;
  }
  currentDays()[date] = hours;
  if ($('#hourHoliday').checked) state.settings.holidays.add(date);
  else state.settings.holidays.delete(date);
  saveCurrentMonth();
  persist(saveSettings(state.settings));
  closeHourModal();
  render();
}

function updateTrackerPayment(event) {
  event.preventDefault();
  const form = event.target;
  const paidAmount = form.elements.paidAmount.value.trim() ? parseNumber(form.elements.paidAmount.value) : 0;
  const expectedPaymentDate = form.elements.expectedPaymentDate.value;
  if (!Number.isFinite(paidAmount) || paidAmount < 0 || (expectedPaymentDate && !isValidDate(expectedPaymentDate))) return;
  state.trackerPayments = {
    ...state.trackerPayments,
    [state.period]: { status: form.elements.status.value, paidAmount, expectedPaymentDate }
  };
  saveCurrentTrackerPayments();
  render();
}

function setTrackerPaymentStatus(status) {
  if (!['pending', 'paid'].includes(status)) return;
  const tracker = currentTracker();
  if (!(tracker.total > 0)) {
    setStatus('Primero cargá horas y una tarifa para registrar el cobro', 'error');
    return;
  }
  const payment = currentTrackerPayment();
  state.trackerPayments = {
    ...state.trackerPayments,
    [state.period]: {
      ...payment,
      status,
      paidAmount: status === 'paid' ? tracker.total : 0
    }
  };
  const saved = saveTrackerPayments(state.trackerPayments);
  const message = status === 'paid' ? 'Horas marcadas como cobradas' : 'Horas marcadas como pendientes';
  setStatus(saved ? message : 'No se pudo guardar el cambio', saved ? 'saved' : 'error');
  render();
}

function toggleTrackerPayment() {
  const payment = currentTrackerPayment();
  setTrackerPaymentStatus(payment.status === 'paid' ? 'pending' : 'paid');
}

function updateRate(input) {
  const value = parseNumber(input.value);
  if (!Number.isFinite(value) || value < 0) return;
  state.settings = setRateForPeriod(state.settings, state.period, value, currentRate().currency);
  persist(saveSettings(state.settings));
  render();
}

function updateRateCurrency(input) {
  if (!CURRENCIES[input.value]) return;
  state.settings = setRateForPeriod(state.settings, state.period, currentRate().rate, input.value);
  persist(saveSettings(state.settings));
  render();
}

function updateDefaults(form) {
  let changed = false;
  form.querySelectorAll('input[data-dow]').forEach(input => {
    const day = Number(input.dataset.dow);
    const value = parseNumber(input.value);
    if (Number.isFinite(value) && value >= 0 && value <= 24) {
      state.settings.hours[day] = value;
      changed = true;
    }
  });
  const multiplier = parseNumber($('#multiplierInput').value);
  if (Number.isFinite(multiplier) && multiplier >= 1 && multiplier <= 10) {
    state.settings.mult = multiplier;
    changed = true;
  }
  if (changed) {
    persist(saveSettings(state.settings));
    render();
  }
}

function buildBackupFile() {
  return JSON.stringify(exportBackup(state.settings, state.months, state.sources, state.trackerPayments, state.exchangeRate), null, 2);
}

function downloadFile(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBackup() {
  downloadFile(buildBackupFile(), 'application/json', `hub-financiero-backup-${todayString()}.json`);
  setStatus('Backup descargado', 'saved');
}

function clearSavedData() {
  const confirmed = window.confirm('¿Vaciar este espacio? Se quitarán horas, ingresos, clientes, gastos y preferencias. Se conservará una copia local para recuperar los datos desde Configuración.');
  if (!confirmed) return;
  if (!createSafetyBackup('Antes de vaciar el espacio', true)) return setStatus('No se pudo crear la copia de seguridad. No se borró nada.', 'error');
  if (!clearAllData()) {
    setStatus('No se pudieron eliminar todos los datos', 'error');
    return;
  }
  state.period = todayKey();
  state.filter = 'all';
  state.settings = loadSettings();
  state.workspace = loadWorkspace();
  state.months = new Map();
  state.sources = [];
  state.trackerPayments = {};
  state.exchangeRate = loadExchangeRate();
  state.exchangeLoading = false;
  state.exchangeError = '';
  state.mode = 'work';
  state.editingDate = null;
  state.pendingImport = null;
  state.sidebar = { open: false, ...loadUiPreferences() };
  setStatus('Se eliminaron todos los datos guardados', 'saved');
  applySidebarState();
  render();
}

function buildMonthlySummaryReport() {
  const { metrics, lines } = currentHub();
  const tracker = currentTracker();
  const trackerPayment = currentTrackerPayment();
  const trackerCurrency = currentRate().currency;
  const trackerCollected = collectedAmount(tracker.total, trackerPayment);
  const trackerPending = Math.max(tracker.total - trackerCollected, 0);
  const rows = lines
    .filter(line => sourceIsVisibleInPeriod(line.source, state.period))
    .map(line => {
      const { source, payment } = line;
      return {
        name: sourceTitle(source),
        type: typeLabel(source.type),
        projectStatus: PROJECT_STATES[getStatusForPeriod(source, state.period)],
        paymentStatus: PAYMENT_STATES[payment.status],
        currency: source.currency,
        expected: formatCurrency(line.expected, source.currency),
        collected: formatCurrency(line.collected, source.currency),
        pending: formatCurrency(line.pending, source.currency),
        date: source.expectedDate ? formatDate(source.expectedDate) : '-'
      };
    });
  rows.push({
    name: typeLabel('hours'),
    type: SOURCE_TYPES.hours,
    projectStatus: '-',
    paymentStatus: PAYMENT_STATES[trackerPayment.status],
    currency: trackerCurrency,
    expected: formatCurrency(tracker.total, trackerCurrency),
    collected: formatCurrency(trackerCollected, trackerCurrency),
    pending: formatCurrency(trackerPending, trackerCurrency),
    date: `${number.format(tracker.real)} h reales${trackerPayment.expectedPaymentDate ? ` · cobro estimado ${formatDate(trackerPayment.expectedPaymentDate)}` : ''}`
  });
  const exchangeRate = hasExchangeRate()
    ? `1 USD = ${money.format(state.exchangeRate.rate)}`
    : 'Sin cotización disponible';
  return {
    title: 'Resumen de facturación mensual',
    period: formatMonth(),
    generatedAt: `Generado ${refreshedAt.format(new Date())}`,
    exchangeRate,
    note: metrics.unconvertedUsd
      ? `Total parcial: ${metrics.unconvertedUsd} importes sin conversión. Moneda principal: ${state.workspace.profile.currency}.`
      : `Moneda principal: ${state.workspace.profile.currency}. Gastos pagados: ${formatCurrency(expenseSummary(state.workspace, state.period, state.exchangeRate).paid, state.workspace.profile.currency)}.`,
    totals: {
      mrr: formatCurrency(metrics.mrr, state.workspace.profile.currency),
      projects: formatCurrency(metrics.projects, state.workspace.profile.currency),
      total: formatCurrency(metrics.total, state.workspace.profile.currency),
      collected: formatCurrency(metrics.collected, state.workspace.profile.currency),
      pending: formatCurrency(metrics.pending, state.workspace.profile.currency)
    },
    rows
  };
}

function downloadMonthlySummary() {
  const pdf = buildMonthlyInvoicePdf(buildMonthlySummaryReport());
  downloadFile(pdf, 'application/pdf', `resumen-facturacion-${state.period}.pdf`);
  setStatus(`Resumen de ${formatMonth().toLowerCase()} descargado`, 'saved');
}

function chooseImport() {
  elements.importFile.value = '';
  elements.importFile.click();
}

async function readImport(file) {
  if (!file) return;
  let text;
  try {
    text = await file.text();
  } catch (_) {
    setStatus('No pude leer el archivo', 'error');
    return;
  }
  const parsed = parseBackup(text);
  if (parsed.error) {
    setStatus(parsed.error, 'error');
    return;
  }
  state.pendingImport = parsed;
  elements.importSummary.textContent = `El backup tiene ${parsed.count} ${parsed.count === 1 ? 'mes' : 'meses'} de horas, ${parsed.sources.length} ${parsed.sources.length === 1 ? 'fuente' : 'fuentes'} de ingreso y sus cobros guardados. Reemplazará los meses y las fuentes importadas.`;
  showDialog(elements.importDialog);
}

function applyImport() {
  if (!state.pendingImport) return;
  if (!createSafetyBackup('Antes de importar', true)) return setStatus('No se pudo respaldar el espacio actual; importación cancelada.', 'error');
  const backup = state.pendingImport;
  const settings = applyImportedSettings(state.settings, backup.settings);
  const workspace = backup.workspace ? normalizeWorkspace(backup.workspace) : state.workspace;
  const saved = storageTransaction(() => {
    for (const [key, month] of Object.entries(backup.months)) if (!saveMonth(key, month)) return false;
    return saveSettings(settings) && saveSources(backup.sources) && saveTrackerPayments(backup.trackerPayments)
      && (!backup.workspace || saveWorkspace(workspace)) && (!backup.exchangeRate || saveExchangeRate(backup.exchangeRate));
  });
  if (!saved) return setStatus('No se pudo importar. Se conservaron los datos anteriores; descargá una copia o liberá espacio.', 'error');
  for (const [key, month] of Object.entries(backup.months)) state.months.set(key, month);
  state.settings = settings;
  state.sources = backup.sources;
  state.trackerPayments = backup.trackerPayments;
  state.workspace = workspace;
  if (backup.exchangeRate) state.exchangeRate = backup.exchangeRate;
  state.pendingImport = null;
  closeDialog(elements.importDialog);
  persist(true);
  render();
}

function handleAction(action, target) {
  switch (action) {
    case 'new-source': openSourceModal('', target.dataset.type || ''); break;
    case 'edit-source': openSourceModal(target.dataset.id); break;
    case 'toggle-source-status': toggleSourceStatus(target.dataset.id); break;
    case 'toggle-source-payment': toggleSourcePayment(target.dataset.id); break;
    case 'toggle-tracker-payment': toggleTrackerPayment(); break;
    case 'set-tracker-payment-status': setTrackerPaymentStatus(target.dataset.status); break;
    case 'go-route': setRoute(target.dataset.route); break;
    case 'go-hours': setRoute('hours'); break;
    case 'day': onDay(target.dataset.date); break;
    case 'mode': state.mode = target.dataset.mode; render(); break;
    case 'refresh-exchange-rate': refreshExchangeRate(); break;
    case 'export-monthly-summary': downloadMonthlySummary(); break;
    case 'export-backup': downloadBackup(); break;
    case 'import-backup': chooseImport(); break;
    case 'clear-all-data': clearSavedData(); break;
    default: break;
  }
}

elements.menuToggle.addEventListener('click', toggleSidebar);
elements.sidebarScrim.addEventListener('click', closeSidebar);
elements.closeSidebar.addEventListener('click', closeSidebar);
elements.pinSidebar.addEventListener('click', toggleSidebarPin);
elements.collapseSidebar.addEventListener('click', toggleSidebarCompact);
elements.sidebarNewSource.addEventListener('click', () => {
  if (!sidebarIsPinned()) {
    state.sidebar.open = false;
    applySidebarState();
  }
  openSourceModal();
});

elements.nav.addEventListener('click', event => {
  const button = event.target.closest('button[data-route]');
  if (button) setRoute(button.dataset.route);
});

elements.addSource?.addEventListener('click', () => openSourceModal());
elements.refreshExchangeRate.addEventListener('click', () => refreshExchangeRate());
elements.periodInput.addEventListener('change', event => changePeriod(event.target.value));
$('#prevPeriod').addEventListener('click', () => changePeriod(shiftMonth(state.period, -1)));
$('#nextPeriod').addEventListener('click', () => changePeriod(shiftMonth(state.period, 1)));
$('#todayPeriod').addEventListener('click', () => changePeriod(todayKey()));
elements.filter.addEventListener('click', event => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  render();
});

elements.view.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (target) handleAction(target.dataset.action, target);
});

elements.view.addEventListener('change', event => {
  if (event.target.id === 'rateInput') updateRate(event.target);
  if (event.target.id === 'rateCurrency') updateRateCurrency(event.target);
});

elements.view.addEventListener('submit', event => {
  if (event.target.id === 'trackerPaymentForm') updateTrackerPayment(event);
  if (event.target.id === 'hoursDefaultsForm') {
    event.preventDefault();
    updateDefaults(event.target);
  }
});

elements.view.addEventListener('focusout', event => {
  if (event.target.id === 'rateInput') updateRate(event.target);
});

elements.sourceForm.addEventListener('submit', onSourceSubmit);
elements.sourceForm.elements.type.addEventListener('change', updateSourceFormUI);
elements.sourceForm.elements.currency.addEventListener('change', updateSourceFormUI);
elements.sourceForm.elements.paymentStatus.addEventListener('change', updateSourceFormUI);
elements.sourceForm.elements.clientId.addEventListener('change', event => populateSourceRelations(event.target.value));
elements.sourceForm.elements.serviceId.addEventListener('change', event => applySourceService(state.workspace.services.find(item => item.id === event.target.value)));
elements.deleteSource.addEventListener('click', () => removeSource(elements.sourceForm.elements.id.value));
elements.closeSource.addEventListener('click', () => closeDialog(elements.sourceDialog));
$('#cancelSource').addEventListener('click', () => closeDialog(elements.sourceDialog));
elements.sourceDialog.addEventListener('click', event => {
  if (event.target === elements.sourceDialog) closeDialog(elements.sourceDialog);
});

elements.hourForm.addEventListener('submit', onHourSubmit);
$('#closeHour').addEventListener('click', closeHourModal);
$('#removeHour').addEventListener('click', () => {
  const date = $('#hourDate').value;
  if (isValidDate(date)) {
    if (!createSafetyBackup('Antes de quitar una jornada', true)) return setStatus('No se pudo crear una copia; la jornada se conservó.', 'error');
    delete currentDays()[date];
    saveCurrentMonth();
    closeHourModal();
    render();
  }
});
elements.hourDialog.addEventListener('click', event => {
  if (event.target === elements.hourDialog) closeHourModal();
});

elements.importFile.addEventListener('change', event => readImport(event.target.files?.[0]));
elements.applyImport.addEventListener('click', applyImport);
elements.cancelImport.addEventListener('click', () => {
  state.pendingImport = null;
  closeDialog(elements.importDialog);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!state.editingDate) render();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.sidebar.open && !sidebarIsPinned()) closeSidebar();
});

if (typeof desktopQuery.addEventListener === 'function') desktopQuery.addEventListener('change', applySidebarState);
else if (typeof desktopQuery.addListener === 'function') desktopQuery.addListener(applySidebarState);

if (!storageWorks()) setStatus('No se pudo acceder al almacenamiento', 'error');
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Se carga el mes actual sin modificar los registros anteriores guardados por la versión original.
ensureMonth();
workspaceUI.init();
render();
initDesktopUpdates(() => setRoute('settings'));
applySidebarState();
if (exchangeRateIsStale()) refreshExchangeRate({ quiet: hasExchangeRate() });
