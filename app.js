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
  collectedAmount,
  createId,
  dateOf,
  dayOfWeek,
  daysInMonth,
  exportBackup,
  getPaymentForPeriod,
  getRateForPeriod,
  getTrackerPayment,
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
  parseMonthKey,
  parseNumber,
  saveMonth,
  saveExchangeRate,
  saveSettings,
  saveSources,
  saveTrackerPayments,
  saveUiPreferences,
  setRateForPeriod,
  setPaymentForPeriod,
  shiftMonth,
  sourceAmountForPeriod,
  sourceIsVisibleInPeriod,
  storageWorks,
  todayKey,
  todayString,
  ymd
} from './data.js';

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
  controlbar: $('.controlbar'),
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
  saas: 'Micro-SaaS',
  projects: 'Desarrollos',
  hours: 'Tracker de horas',
  settings: 'Ajustes'
};

const FILTERS = {
  all: 'Todo',
  pending: 'Pendientes',
  paid: 'Cobrados'
};

const desktopQuery = window.matchMedia('(min-width: 1024px)');
let lastScrollY = Math.max(window.scrollY, 0);
let controlbarScrollTicking = false;

function showControlbar() {
  document.body.classList.remove('controls-hidden');
}

function updateControlbarVisibility() {
  if (controlbarScrollTicking) return;
  controlbarScrollTicking = true;
  window.requestAnimationFrame(() => {
    const currentY = Math.max(window.scrollY, 0);
    const distance = currentY - lastScrollY;
    if (currentY <= 72) {
      showControlbar();
      lastScrollY = currentY;
    } else if (Math.abs(distance) >= 8) {
      if (distance > 0 && !elements.controlbar.contains(document.activeElement)) document.body.classList.add('controls-hidden');
      if (distance < 0) showControlbar();
      lastScrollY = currentY;
    }
    controlbarScrollTicking = false;
  });
}

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
  return getRateForPeriod(state.settings, state.period);
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
    rate.currency
  );
}

function formatMonth(key = state.period) {
  const { year, month } = parseMonthKey(key) || currentParts();
  return cap(monthYear.format(new Date(year, month - 1, 1)));
}

function formatInputNumber(value) {
  return Number.isFinite(Number(value)) ? String(value).replace('.', ',') : '';
}

function formatDate(value) {
  const date = dateOf(value);
  return date ? cap(shortDate.format(date)) : 'Sin fecha';
}

function formatCurrency(value, currency = 'ARS') {
  return currency === 'USD' ? usdMoney.format(Number(value) || 0) : money.format(Number(value) || 0);
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
  if (currency !== 'USD') return '';
  const converted = convertedToArs(amount, currency);
  return converted === null ? 'Sin cotización oficial disponible' : `≈ ${money.format(converted)}`;
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

function paymentBadge(payment) {
  return `<span class="badge payment ${escapeHtml(payment.status)}">${escapeHtml(PAYMENT_STATES[payment.status])}</span>`;
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
  return `<span class="type-badge ${escapeHtml(type)}">${escapeHtml(SOURCE_TYPES[type])}</span>`;
}

function currencyBadge(currency) {
  return `<span class="badge currency" title="${escapeHtml(currencyName(currency))}">${escapeHtml(currency)}</span>`;
}

function sourceTitle(source) {
  return source.name || 'Sin nombre';
}

function sourcePeriodLabel(source, expected) {
  if (source.type === 'saas') return `MRR ${formatCurrency(expected, source.currency)}`;
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
  const visibleExpected = expected || source.amount;
  const convertedExpected = arsConversionLabel(expected, source.currency);
  const convertedCollected = arsConversionLabel(collected, source.currency);
  const projectDate = source.expectedDate ? `<span class="meta-item">${formatDate(source.expectedDate)}</span>` : '';
  const clientMetric = source.type === 'saas' && source.clients > 0
    ? `<span class="meta-item">${number.format(source.clients)} ${source.clients === 1 ? 'cliente' : 'clientes'}</span>`
    : '';
  const url = safeUrl(source.url);
  return `
    <article class="income-card ${compactCard ? 'compact' : ''}" data-source-card="${escapeHtml(source.id)}">
      <div class="card-topline">
        <span class="badge-group">${typeBadge(source.type)}${currencyBadge(source.currency)}</span>
        <div class="badge-group">${projectBadge(source.projectStatus, source, quickToggle)}${paymentBadge(payment)}</div>
      </div>
      <div class="card-heading">
        <div>
          <h3>${escapeHtml(sourceTitle(source))}</h3>
          <p>${escapeHtml(sourcePeriodLabel(source, visibleExpected))}</p>
        </div>
        <div class="card-amount-wrap"><strong class="card-amount ${amountClass(expected)}">${formatCurrency(expected, source.currency)}</strong>${source.currency === 'USD' ? `<span class="card-amount-secondary">${escapeHtml(convertedExpected)}</span>` : ''}</div>
      </div>
      <div class="card-meta">
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
    .filter(source => source.type === type)
    .filter(source => !relevantOnly || sourceIsVisibleInPeriod(source, state.period))
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
      <div class="section-kicker">Servicios por hora</div>
      <div class="tracker-title-row">
        <div>
          <h3>Registro de horas</h3>
          <p>${formatMonth()} · ${tracker.days} ${tracker.days === 1 ? 'día marcado' : 'días marcados'}</p>
        </div>
        ${paymentBadge(payment)}
      </div>
      <div class="tracker-numbers">
        <div><span>Horas reales</span><b>${number.format(tracker.real)} h</b></div>
        <div><span>Horas a pagar</span><b>${number.format(tracker.payable)} h</b></div>
        <div><span>Total · ${currency}</span><span class="currency-value"><b>${formatCurrency(tracker.total, currency)}</b>${currency === 'USD' ? `<small>${escapeHtml(convertedTotal)}</small>` : ''}</span></div>
      </div>
      <div class="tracker-footer">
        <span>${payment.status === 'partial' || payment.status === 'paid' ? `Cobrado ${formatCurrency(collected, currency)}${convertedCollected ? ` · ${convertedCollected}` : ''}` : 'Pendiente de cobro'}</span>
        <button class="btn small" type="button" data-action="go-hours">Abrir tracker</button>
      </div>
    </article>`;
}

function renderCollectionCard(metrics) {
  const percentage = metrics.total > 0 ? Math.round((metrics.collected / metrics.total) * 100) : 0;
  return `
    <article class="collection-card">
      <div class="section-kicker">Cobros del período · ARS</div>
      <div class="collection-amounts">
        <div><span>Cobrado</span><strong>${money.format(metrics.collected)}</strong></div>
        <div><span>Pendiente</span><strong>${money.format(metrics.pending)}</strong></div>
      </div>
      <div class="collection-bar" role="progressbar" aria-label="Cobrado del período" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><span style="width:${percentage}%"></span></div>
      <p>${percentage}% del ingreso estimado consolidado está cobrado.</p>
      ${metrics.unconvertedUsd ? `<p class="conversion-warning">Hay ${metrics.unconvertedUsd} ${metrics.unconvertedUsd === 1 ? 'importe en USD sin cotización' : 'importes en USD sin cotización'}; no se incluye en este total.</p>` : ''}
    </article>`;
}

function renderKpis(metrics) {
  const rateNote = hasExchangeRate() ? 'USD convertido con BCRA' : 'Consolidado en ARS';
  return `
    <section class="kpi-grid" aria-label="Resumen financiero">
      <article class="kpi-card accent animate-in" style="--delay:40ms"><span>MRR activo · ARS</span><strong>${money.format(metrics.mrr)}</strong><small>${rateNote}</small></article>
      <article class="kpi-card animate-in" style="--delay:90ms"><span>Desarrollos puntuales · ARS</span><strong>${money.format(metrics.projects)}</strong><small>Proyectado en ${monthOnly.format(new Date(currentParts().year, currentParts().month - 1, 1))}</small></article>
      <article class="kpi-card total animate-in" style="--delay:140ms"><span>Ingreso estimado · ARS</span><strong>${money.format(metrics.total)}</strong><small>${formatMonth()} · ${rateNote}</small></article>
      <article class="kpi-card animate-in" style="--delay:190ms"><span>Apps y proyectos activos</span><strong>${number.format(metrics.active)}</strong><small>Sin contar pausados</small></article>
    </section>`;
}

function renderDashboard() {
  const { metrics } = currentHub();
  const saas = sourcesFor('saas');
  const projects = sourcesFor('project', { relevantOnly: true });
  const fixed = sourcesFor('fixed', { relevantOnly: true });
  return `
    <section class="dashboard-hero animate-in" style="--delay:0ms">
      <div>
        <p class="eyebrow">Hub financiero personal</p>
        <h1>Tu panorama de ingresos, claro y en un solo lugar.</h1>
        <p class="lede">Seguimiento de productos, proyectos, horas y cobros para ${formatMonth().toLowerCase()}.</p>
      </div>
      <button type="button" class="btn primary hero-action" data-action="new-source">+ Nueva fuente</button>
    </section>
    ${renderKpis(metrics)}
    <section class="dashboard-split animate-in" style="--delay:230ms">
      ${renderCollectionCard(metrics)}
      ${renderTrackerWidget()}
    </section>
    <section class="module-section animate-in" style="--delay:280ms">
      <div class="section-header"><div><p class="section-kicker">Recurrente</p><h2>Micro-SaaS & suscripciones</h2></div><button class="text-button" type="button" data-action="go-route" data-route="saas">Ver todo</button></div>
      <div class="card-grid">${saas.length ? saas.slice(0, 3).map(source => renderSourceCard(source, true, true)).join('') : renderEmpty('Todavía no hay suscripciones', 'Agregá tu primer Micro-SaaS o mantenimiento activo.')}</div>
    </section>
    <section class="module-section two-columns animate-in" style="--delay:330ms">
      <div>
        <div class="section-header"><div><p class="section-kicker">Pago único</p><h2>Desarrollos puntuales</h2></div><button class="text-button" type="button" data-action="go-route" data-route="projects">Ver todo</button></div>
        <div class="stack-list">${projects.length ? projects.slice(0, 3).map(source => renderSourceCard(source, true, true)).join('') : renderEmpty('Sin proyectos en este período', 'Usá una fecha estimada para proyectar un desarrollo.')}</div>
      </div>
      <div>
        <div class="section-header"><div><p class="section-kicker">Complementos</p><h2>Fijos & extras</h2></div><button class="text-button" type="button" data-action="new-source">Agregar</button></div>
        <div class="stack-list">${fixed.length ? fixed.slice(0, 3).map(source => renderSourceCard(source, true)).join('') : renderEmpty('Sin extras cargados', 'Registrá pagos fijos, ocasionales o adicionales.')}</div>
      </div>
    </section>`;
}

function renderCatalog(type) {
  const isSaas = type === 'saas';
  const title = isSaas ? 'Micro-SaaS & suscripciones' : 'Desarrollos puntuales';
  const description = isSaas
    ? 'MRR, clientes y estado de cobro de cada producto recurrente.'
    : 'Proyectos de pago único, fechas de entrega y cobros esperados.';
  const sources = sourcesFor(type, { relevantOnly: !isSaas });
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${isSaas ? 'Ingresos recurrentes' : 'Pago único'}</p><h1>${title}</h1><p class="lede">${description}</p></div>
      <button type="button" class="btn primary" data-action="new-source" data-type="${type}">+ ${isSaas ? 'Nueva suscripción' : 'Nuevo desarrollo'}</button>
    </section>
    <section class="catalog-grid">
      ${sources.length ? sources.map(source => renderSourceCard(source)).join('') : renderEmpty(`No hay ${isSaas ? 'suscripciones' : 'desarrollos'} para mostrar`, 'Podés crear una fuente ahora y completar el cobro más tarde.')}
    </section>`;
}

function renderCalendar() {
  const { year, month } = currentParts();
  const days = currentDays();
  const offset = mondayOffset(year, month);
  const dim = daysInMonth(year, month);
  const today = todayString();
  let output = '';
  for (let index = 0; index < offset; index += 1) output += '<div class="day blank" aria-hidden="true"></div>';
  for (let day = 1; day <= dim; day += 1) {
    const date = dateInCurrentPeriod(day);
    const hours = days[date] || 0;
    const holiday = state.settings.holidays.has(date);
    const weekend = [0, 6].includes(dayOfWeek(date));
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
    : `Todavía usa la tarifa base. Al cambiarla quedará guardada solo para ${formatMonth().toLowerCase()}.`;
  return `
    <section class="page-heading">
      <div><p class="eyebrow">Módulo integrado</p><h1>Tracker de horas & servicios</h1><p class="lede">El contador original sigue acá y aporta automáticamente al estimado mensual del Hub.</p></div>
      <button type="button" class="btn" data-action="new-source" data-type="hours">+ Servicio por horas</button>
    </section>
    <section class="hours-summary-layout">
      ${renderTrackerWidget({ large: true })}
      <form class="payment-panel" id="trackerPaymentForm">
        <p class="section-kicker">Estado de cobro</p>
        <h2>Horas de ${monthOnly.format(new Date(currentParts().year, currentParts().month - 1, 1))}</h2>
        <label>Estado
          <select name="status">${Object.entries(PAYMENT_STATES).map(([value, label]) => `<option value="${value}" ${payment.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
        </label>
        <label>Monto cobrado (${currency})
          <input name="paidAmount" type="text" inputmode="decimal" value="${escapeHtml(formatInputNumber(payment.paidAmount))}" placeholder="0">
        </label>
        <p class="note">Total de horas a cobrar: <strong>${formatCurrency(tracker.total, currency)}</strong>${currency === 'USD' ? ` <span class="conversion-note">${escapeHtml(convertedTotal)}</span>` : ''}</p>
        <button class="btn primary" type="submit">Guardar cobro</button>
      </form>
    </section>
    <section class="calendar-panel">
      <div class="calendar-toolbar">
        <div><p class="section-kicker">${formatMonth()}</p><h2>Registro diario</h2></div>
        <label class="rate-field">Valor hora <span class="rate-inputs"><input id="rateInput" type="text" inputmode="decimal" value="${escapeHtml(formatInputNumber(rate.rate))}" placeholder="0"><select id="rateCurrency" aria-label="Moneda de la tarifa por hora"><option value="ARS" ${currency === 'ARS' ? 'selected' : ''}>ARS</option><option value="USD" ${currency === 'USD' ? 'selected' : ''}>USD</option></select></span></label>
      </div>
      <p class="rate-period-note">${escapeHtml(rateScopeNote)}</p>
      <div class="mode-tabs" role="group" aria-label="Modo del calendario">
        <button type="button" data-action="mode" data-mode="work" aria-pressed="${state.mode === 'work'}">Trabajé</button>
        <button type="button" data-action="mode" data-mode="holiday" aria-pressed="${state.mode === 'holiday'}">Feriado</button>
        <button type="button" data-action="mode" data-mode="edit" aria-pressed="${state.mode === 'edit'}">Editar horas</button>
      </div>
      <p class="hint">${state.mode === 'work' ? 'Tocá un día para cargarlo; si no tiene horas por defecto, podés elegirlas.' : state.mode === 'holiday' ? 'Marcá los feriados que deban contar con multiplicador.' : 'Elegí un día para editar sus horas o su feriado.'}</p>
      <div class="weekdays" aria-hidden="true"><span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sá</span><span>Do</span></div>
      <div class="calendar-grid">${renderCalendar()}</div>
      <div class="calendar-total"><span>${tracker.days} días · ${number.format(tracker.real)} h reales · ${number.format(tracker.payable)} h a pagar</span><span class="currency-value"><strong>${formatCurrency(tracker.total, currency)}</strong>${currency === 'USD' ? `<small>${escapeHtml(convertedTotal)}</small>` : ''}</span></div>
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
      <div><p class="eyebrow">Configuración</p><h1>Ajustes & copias</h1><p class="lede">Personalizá las horas, revisá la cotización USD y guardá una copia de tus registros.</p></div>
    </section>
    <section class="settings-layout">
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
        <p class="note">Fuente: BCRA · ${exchangeRateMeta()}. Los montos en USD se conservan en su moneda y el Hub los consolida en ARS.</p>
        <div class="button-row"><button class="btn" type="button" data-action="refresh-exchange-rate" ${state.exchangeLoading ? 'disabled' : ''}>${state.exchangeLoading ? 'Actualizando…' : 'Actualizar cotización'}</button></div>
        <p class="note">${state.sources.length} fuentes de ingreso guardadas en este dispositivo.</p>
      </section>
    </section>`;
}

function render() {
  ensureMonth();
  elements.periodInput.value = state.period;
  elements.periodLabel.textContent = formatMonth();
  elements.status.textContent = state.status;
  renderExchangeRateControl();
  elements.activeSectionLabel.textContent = ROUTES[state.route];
  elements.nav.querySelectorAll('button[data-route]').forEach(button => {
    button.setAttribute('aria-current', button.dataset.route === state.route ? 'page' : 'false');
  });
  elements.filter.querySelectorAll('button[data-filter]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
  });
  let content;
  if (state.route === 'hub') content = renderDashboard();
  else if (state.route === 'saas') content = renderCatalog('saas');
  else if (state.route === 'projects') content = renderCatalog('project');
  else if (state.route === 'hours') content = renderHours();
  else content = renderSettings();
  elements.view.innerHTML = `<div class="page page-${escapeHtml(state.route)}">${content}</div>`;
}

function setRoute(route) {
  if (!ROUTES[route]) return;
  state.route = route;
  showControlbar();
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
  const amountLabel = isSaas ? 'MRR / monto por ciclo' : isProject ? 'Precio total acordado' : isHours ? 'Tarifa por hora' : 'Monto por ciclo o extra';
  $('#sourceAmountLabel').textContent = `${amountLabel} (${currency})`;
  $('#sourcePaidAmountLabel').textContent = `Monto ya cobrado (${currency})`;
  $('#sourceCycleWrap').hidden = isProject || isHours;
  $('#sourceClientsWrap').hidden = !isSaas;
  $('#sourceHoursWrap').hidden = !isHours;
  $('#sourceDateLabel').textContent = isProject ? 'Fecha estimada de entrega / cobro' : 'Fecha estimada de cobro';
  const currencyHint = $('#sourceCurrencyHint');
  currencyHint.hidden = currency !== 'USD';
  if (currency === 'USD') {
    currencyHint.textContent = hasExchangeRate()
      ? `Se mostrará en ARS con la referencia BCRA: 1 USD = ${money.format(state.exchangeRate.rate)} (${state.exchangeRate.quoteDate ? `publicada ${formatDate(state.exchangeRate.quoteDate)}` : 'última disponible'}).`
      : 'El importe queda guardado en USD. La conversión a ARS aparecerá al obtener una cotización oficial del BCRA.';
  }
  if (isProject) fields.billingCycle.value = 'once';
  else if (isHours || fields.billingCycle.value === 'once') fields.billingCycle.value = 'monthly';
}

function openSourceModal(id = '', type = '') {
  const source = state.sources.find(item => item.id === id);
  const fields = sourceFormFields();
  const initialType = type || 'saas';
  const initial = source || normalizeSource({
    type: initialType,
    id: createId(),
    projectStatus: (initialType === 'saas' || initialType === 'fixed') ? 'active' : 'development'
  });
  const payment = getPaymentForPeriod(initial, state.period);
  fields.id.value = initial.id;
  fields.name.value = initial.name;
  fields.type.value = initial.type;
  fields.amount.value = formatInputNumber(initial.amount);
  fields.currency.value = initial.currency;
  fields.billingCycle.value = initial.billingCycle;
  fields.clients.value = initial.clients || '';
  fields.estimatedHours.value = initial.estimatedHours || '';
  fields.projectStatus.value = initial.projectStatus;
  fields.expectedDate.value = initial.expectedDate;
  fields.url.value = initial.url;
  fields.notes.value = initial.notes;
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
  if (!source || !window.confirm(`¿Eliminar “${sourceTitle(source)}”? Esta acción no borra las horas registradas.`)) return;
  state.sources = state.sources.filter(item => item.id !== id);
  saveCurrentSources();
  closeDialog(elements.sourceDialog);
  render();
}

function toggleSourceStatus(id) {
  const source = state.sources.find(item => item.id === id);
  if (!source || !['saas', 'project'].includes(source.type) || !['development', 'active', 'paused'].includes(source.projectStatus)) return;
  const nextStatus = source.projectStatus === 'active' ? 'paused' : 'active';
  state.sources = state.sources.map(item => item.id === id
    ? { ...item, projectStatus: nextStatus, updatedAt: new Date().toISOString() }
    : item);
  const saved = saveSources(state.sources);
  setStatus(saved ? `${sourceTitle(source)} ${nextStatus === 'active' ? 'activado' : 'pausado'}` : 'No se pudo guardar el cambio', saved ? 'saved' : 'error');
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
  const previous = state.sources.find(item => item.id === fields.id.value);
  let source = normalizeSource({
    ...(previous || {}),
    id: fields.id.value || createId(),
    name: fields.name.value,
    type: fields.type.value,
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
  source = setPaymentForPeriod(source, state.period, { status: fields.paymentStatus.value, paidAmount });
  if (previous) state.sources = state.sources.map(item => item.id === source.id ? source : item);
  else state.sources = [...state.sources, source];
  saveCurrentSources();
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
  if (!Number.isFinite(paidAmount) || paidAmount < 0) return;
  state.trackerPayments = { ...state.trackerPayments, [state.period]: { status: form.elements.status.value, paidAmount } };
  saveCurrentTrackerPayments();
  render();
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

function downloadBackup() {
  const content = buildBackupFile();
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `hub-financiero-backup-${todayString()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus('Backup descargado', 'saved');
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
  const backup = state.pendingImport;
  for (const [key, month] of Object.entries(backup.months)) {
    state.months.set(key, month);
    saveMonth(key, month);
  }
  state.settings = applyImportedSettings(state.settings, backup.settings);
  state.sources = backup.sources;
  state.trackerPayments = backup.trackerPayments;
  if (backup.exchangeRate) state.exchangeRate = backup.exchangeRate;
  const settingsSaved = saveSettings(state.settings);
  const sourcesSaved = saveSources(state.sources);
  const paymentsSaved = saveTrackerPayments(state.trackerPayments);
  const exchangeRateSaved = !backup.exchangeRate || saveExchangeRate(state.exchangeRate);
  state.pendingImport = null;
  closeDialog(elements.importDialog);
  persist(settingsSaved && sourcesSaved && paymentsSaved && exchangeRateSaved);
  render();
}

function handleAction(action, target) {
  switch (action) {
    case 'new-source': openSourceModal('', target.dataset.type || ''); break;
    case 'edit-source': openSourceModal(target.dataset.id); break;
    case 'toggle-source-status': toggleSourceStatus(target.dataset.id); break;
    case 'go-route': setRoute(target.dataset.route); break;
    case 'go-hours': setRoute('hours'); break;
    case 'day': onDay(target.dataset.date); break;
    case 'mode': state.mode = target.dataset.mode; render(); break;
    case 'refresh-exchange-rate': refreshExchangeRate(); break;
    case 'export-backup': downloadBackup(); break;
    case 'import-backup': chooseImport(); break;
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

elements.addSource.addEventListener('click', () => openSourceModal());
elements.refreshExchangeRate.addEventListener('click', () => refreshExchangeRate());
elements.controlbar.addEventListener('focusin', showControlbar);
window.addEventListener('scroll', updateControlbarVisibility, { passive: true });
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
    lastScrollY = Math.max(window.scrollY, 0);
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
render();
applySidebarState();
if (exchangeRateIsStale()) refreshExchangeRate({ quiet: hasExchangeRate() });
