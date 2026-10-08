import { CURRENCIES, createId, todayString, todayKey, normalizeSource, saveSources, saveSettings, listSafetyBackups, createSafetyBackup, restoreSafetyBackup, isValidDate, parseNumber, sourceIsVisibleInPeriod, sourceAmountForPeriod, getPaymentForPeriod, listStorageKeys, loadMonth } from './data.js';
import { MODULES, WIDGETS, LOCALES, normalizeWorkspace, saveWorkspace, expenseSummary, dateFor } from './workspace.js';
import { storageTransaction } from './data.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const currencyOptions = selected => Object.entries(CURRENCIES).map(([key, label]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
const button = (action, text, id = '', primary = false) => `<button type="button" class="btn ${primary ? 'primary' : ''}" data-workspace-action="${action}" data-id="${esc(id)}">${text}</button>`;
const input = (label, name, value = '', type = 'text', extra = '') => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const checked = value => value ? 'checked' : '';

export function createWorkspaceUI(ctx) {
  const { state, render, setRoute, setStatus, formatCurrency, formatMonth, currentHub, currentTracker } = ctx;
  const p = () => state.workspace.profile;
  const decimal = value => value === undefined || value === null ? '' : String(value).replace('.', new Intl.NumberFormat(p().locale).formatToParts(1.1).find(part => part.type === 'decimal').value);
  const money = value => formatCurrency(value, p().currency);
  const active = kind => state.workspace[kind].filter(item => !item.deletedAt);
  const label = route => p().labels[route] || MODULES[route];
  function commit(next) {
    next = normalizeWorkspace(next);
    if (!saveWorkspace(next)) { setStatus('No se pudo guardar. Liberá espacio o descargá una copia.', 'error'); return false; }
    state.workspace = next;
    setStatus('Guardado en este dispositivo', 'saved');
    return true;
  }
  function error(form, message) { form.querySelector('[role="alert"]').textContent = message; }
  function hasRecords() {
    return state.sources.length || state.workspace.clients.length || state.workspace.services.length || state.workspace.expenses.length || listStorageKeys().some(key => key.startsWith('m-') && Object.keys(loadMonth(key.slice(2)).days).length);
  }

  function profileForm(welcome = false) {
    const profile = p();
    return `<form id="profileForm" class="settings-card workspace-profile" data-welcome="${welcome}">
      <p class="section-kicker">${welcome ? 'Empecemos por lo que necesitás' : 'Tu espacio de trabajo'}</p>
      <h2>${welcome ? 'Una app a tu medida' : 'Personalización'}</h2>
      <p class="note">Elegí qué querés controlar. Podés cambiar todo después; ocultar una sección no borra sus registros.</p>
      <div class="form-grid">
        ${input('Nombre de tu actividad (opcional)', 'name', profile.name, 'text', 'maxlength="70" placeholder="Ej. Estudio, clases o mi negocio"')}
        <label class="field">¿Cómo trabajás?<select name="activity"><option value="mixed" ${profile.activity === 'mixed' ? 'selected' : ''}>Una combinación</option><option value="hours" ${profile.activity === 'hours' ? 'selected' : ''}>Por horas, clases o turnos</option><option value="projects" ${profile.activity === 'projects' ? 'selected' : ''}>Por proyectos</option><option value="recurring" ${profile.activity === 'recurring' ? 'selected' : ''}>Con servicios recurrentes</option></select></label>
        <label class="field">Moneda principal<select name="currency">${currencyOptions(profile.currency)}</select></label>
        <label class="field">Formato regional<select name="locale">${Object.entries(LOCALES).map(([key, text]) => `<option value="${key}" ${profile.locale === key ? 'selected' : ''}>${text}</option>`).join('')}</select></label>
      </div>
      <fieldset><legend>Secciones que querés usar</legend><div class="check-grid">${Object.entries(MODULES).map(([key, text]) => `<label><input type="checkbox" name="module-${key}" ${checked(profile.modules[key])}>${text}</label>`).join('')}</div></fieldset>
      <details ${welcome ? '' : 'open'}><summary>Nombres, calendario y panel</summary><div class="form-grid">
        ${input('Nombre de la sección de horas', 'label-hours', profile.labels.hours, 'text', 'maxlength="40"')}
        ${input('Nombre de los ingresos recurrentes', 'label-saas', profile.labels.saas, 'text', 'maxlength="40"')}
        ${input('Nombre de los proyectos', 'label-projects', profile.labels.projects, 'text', 'maxlength="40"')}
        <label class="field">Fechas<select name="dateFormat"><option value="short" ${profile.dateFormat === 'short' ? 'selected' : ''}>Formato local · 08/10/2026</option><option value="iso" ${profile.dateFormat === 'iso' ? 'selected' : ''}>Año-mes-día · 2026-10-08</option><option value="long" ${profile.dateFormat === 'long' ? 'selected' : ''}>Fecha escrita</option></select></label>
        <label class="field">La semana empieza<select name="weekStart"><option value="1" ${profile.weekStart === 1 ? 'selected' : ''}>Lunes</option><option value="0" ${profile.weekStart === 0 ? 'selected' : ''}>Domingo</option></select></label>
      </div><fieldset><legend>Mostrar en el panel</legend><div class="check-grid">${Object.entries(WIDGETS).map(([key, text]) => `<label><input type="checkbox" name="widget-${key}" ${checked(profile.widgets[key])}>${text}</label>`).join('')}</div></fieldset></details>
      <p role="alert" class="form-error"></p><div class="button-row"><button class="btn primary" type="submit">${welcome ? 'Empezar' : 'Guardar preferencias'}</button>${welcome && !hasRecords() ? button('demo', 'Explorar con ejemplos') : ''}</div>
    </form>`;
  }

  function dashboard() {
    const { metrics, lines } = currentHub();
    const expenses = expenseSummary(state.workspace, state.period, state.exchangeRate);
    const tracker = currentTracker();
    const values = { income: metrics.total, collected: metrics.collected, pending: metrics.pending, hours: tracker.real, expenses: expenses.paid, balance: metrics.collected - expenses.paid };
    const visible = Object.keys(WIDGETS).filter(key => p().widgets[key] && (key !== 'hours' || p().modules.hours) && (!['expenses', 'balance'].includes(key) || p().modules.expenses));
    const pending = lines.filter(line => line.pending > 0).slice(0, 6);
    return `<section class="dashboard-hero"><div><p class="eyebrow">${esc(formatMonth())}</p><h1>${esc(p().name || 'Tu actividad, en orden.')}</h1><p class="lede">Ingresos, cobros y trabajo, con el detalle que necesitás.</p></div><div class="hero-actions"><button class="btn" data-action="export-monthly-summary">Descargar PDF</button><button class="btn primary" data-action="new-source">+ Registrar ingreso</button></div></section>
      ${!p().onboarded ? profileForm(true) : ''}
      ${p().demoActive ? `<aside class="workspace-banner">Estás explorando datos de ejemplo. Lo que agregues por tu cuenta se conserva. ${button('remove-demo', 'Quitar ejemplos')}</aside>` : ''}
      <section class="kpi-grid">${visible.map(key => `<article class="kpi-card ${key === 'balance' ? 'accent' : ''}"><span>${WIDGETS[key]}${key === 'hours' ? '' : ` · ${esc(p().currency)}`}</span><strong>${key === 'hours' ? `${tracker.real} h` : money(values[key])}</strong><small>${key === 'balance' ? 'Cobrado menos gastos pagados' : key === 'income' ? 'Importes previstos para este mes' : key === 'pending' ? 'Ingresos todavía sin cobrar' : key === 'hours' ? 'Registradas en el calendario' : 'Mes seleccionado'}</small></article>`).join('')}</section>
      ${metrics.unconvertedUsd + expenses.missing ? `<aside class="workspace-banner" role="status">Hay ${metrics.unconvertedUsd + expenses.missing} importes sin conversión a ${esc(p().currency)}. Los totales son parciales. ${button('settings', 'Configurar conversiones')}</aside>` : ''}
      <div class="dashboard-split"><section class="settings-card"><p class="section-kicker">Próximos pasos</p><h2>${pending.length ? 'Pendiente de cobro' : 'Todo al día'}</h2>${pending.length ? pending.map(line => `<div class="directory-row"><div><strong>${esc(line.source.name)}</strong><small>${esc(line.source.category || ctx.typeLabel(line.source.type))}</small></div><div><b>${formatCurrency(line.pending, line.source.currency)}</b><button class="text-button" data-action="edit-source" data-id="${esc(line.source.id)}">Ver detalle</button></div></div>`).join('') : '<p class="note">Los ingresos que registres aparecerán acá hasta que marques el cobro.</p>'}</section>
      <section class="settings-card"><p class="section-kicker">Accesos rápidos</p><h2>¿Qué querés registrar?</h2><div class="quick-grid">${p().modules.hours ? button('hours', esc(label('hours'))) : ''}${p().modules.saas ? '<button class="btn" data-action="new-source" data-type="saas">Servicio recurrente</button>' : ''}${p().modules.projects ? '<button class="btn" data-action="new-source" data-type="project">Proyecto o pago único</button>' : ''}${p().modules.clients ? button('new-client', 'Nuevo cliente') : ''}${p().modules.expenses ? button('new-expense', 'Registrar gasto') : ''}${button('settings', 'Personalizar mi espacio')}</div><p class="note">Los datos se guardan en este dispositivo. En Configuración podés exportar una copia y recuperar eliminaciones.</p></section></div>
      ${['saas', 'projects'].filter(route => p().modules[route]).map(route => { const type = route === 'saas' ? 'saas' : 'project'; const sources = ctx.sourcesFor(type, { relevantOnly: true }); return `<section class="module-section"><div class="section-header"><h2>${esc(label(route))}</h2>${button(route, 'Ver todo')}</div><div class="card-grid">${sources.length ? sources.slice(0, 3).map(source => ctx.renderSourceCard(source, true, true)).join('') : `<div class="empty-state"><h3>Tu primer ${route === 'saas' ? 'ingreso recurrente' : 'proyecto'}</h3><p>Agregá un nombre y un monto. Los detalles pueden esperar.</p><button class="btn" data-action="new-source" data-type="${type}">Agregar</button></div>`}</div></section>`; }).join('')}
      ${p().modules.hours ? ctx.renderTrackerWidget() : ''}
      ${ctx.sourcesFor('fixed', { relevantOnly: true }).length ? `<section class="module-section"><h2>Otros ingresos</h2><div class="card-grid">${ctx.sourcesFor('fixed', { relevantOnly: true }).map(source => ctx.renderSourceCard(source, true, true)).join('')}</div></section>` : ''}`;
  }

  function directory() {
    return `<section class="page-heading"><div><p class="eyebrow">Tu actividad</p><h1>Clientes y servicios</h1><p class="lede">Guardá tarifas para completar tus ingresos más rápido. Cambiar una tarifa no modifica trabajos ya registrados.</p></div><div class="button-row">${button('new-client', '+ Cliente', '', true)}${button('new-service', '+ Servicio')}</div></section>
      <div class="dashboard-split"><section class="settings-card"><h2>Clientes</h2>${active('clients').length ? active('clients').map(client => { const sources = state.sources.filter(source => !source.deletedAt && source.clientId === client.id && sourceIsVisibleInPeriod(source, state.period)); return `<article class="directory-item"><div class="directory-row"><div><h3>${esc(client.name)}</h3><small>${esc(client.email)}</small></div>${button('edit-client', 'Editar', client.id)}</div><p class="note">${sources.length} ingresos en ${esc(formatMonth())}</p>${sources.map(source => `<div class="directory-row"><button class="text-button" data-action="edit-source" data-id="${esc(source.id)}">${esc(source.name)}</button><span>${formatCurrency(sourceAmountForPeriod(source, state.period), source.currency)} · ${getPaymentForPeriod(source, state.period).status === 'paid' ? 'Cobrado' : 'Pendiente'}</span></div>`).join('')}<button class="text-button" data-workspace-action="client-income" data-id="${esc(client.id)}">+ Ingreso para este cliente</button></article>`; }).join('') : '<div class="empty-state"><h3>Todos tus clientes, a mano</h3><p>Creá uno con su nombre; el contacto es opcional.</p></div>'}</section>
      <section class="settings-card"><h2>Servicios y tarifas</h2>${active('services').length ? active('services').map(service => `<div class="directory-item"><h3>${esc(service.name)}</h3><p>${formatCurrency(service.rate, service.currency)} ${service.unit === 'hour' ? '/ hora' : '/ servicio'}</p><p class="note">${esc(active('clients').find(client => client.id === service.clientId)?.name || 'Tarifa general')}</p><div class="button-row">${button('service-income', 'Usar tarifa', service.id, true)}${button('edit-service', 'Editar', service.id)}</div></div>`).join('') : '<div class="empty-state"><h3>Dejá de cargar la misma tarifa</h3><p>Podés tener una tarifa general o una especial para cada cliente.</p></div>'}</section></div>`;
  }

  function expenses() {
    const totals = expenseSummary(state.workspace, state.period, state.exchangeRate);
    const entries = active('expenses').filter(item => item.date.slice(0, 7) === state.period).sort((a, b) => b.date.localeCompare(a.date));
    return `<section class="page-heading"><div><p class="eyebrow">${esc(formatMonth())}</p><h1>Gastos</h1><p class="lede">Separá lo pagado de lo pendiente y conocé tu balance de caja.</p></div>${button('new-expense', '+ Registrar gasto', '', true)}</section><section class="kpi-grid"><article class="kpi-card"><span>Pagado · ${p().currency}</span><strong>${money(totals.paid)}</strong></article><article class="kpi-card"><span>Por pagar · ${p().currency}</span><strong>${money(totals.pending)}</strong></article></section>${totals.missing ? '<p class="workspace-banner">Hay gastos sin conversión; los totales son parciales.</p>' : ''}<section class="settings-card">${entries.length ? entries.map(item => `<div class="directory-row"><div><strong>${esc(item.name)}</strong><small>${esc(dateFor(item.date, p()))} · ${esc(item.category || 'Sin categoría')} · ${item.paid ? 'Pagado' : 'Pendiente'}</small></div><div><b>${formatCurrency(item.amount, item.currency)}</b>${button('edit-expense', 'Editar', item.id)}</div></div>`).join('') : '<div class="empty-state"><h3>Sin gastos este mes</h3><p>Registrá alquiler, materiales, herramientas o la categoría que uses.</p></div>'}</section>`;
  }

  function settingsExtra() {
    const backups = listSafetyBackups();
    const trash = [...state.sources.filter(item => item.deletedAt).map(item => ({ ...item, kind: 'sources' })), ...['clients', 'services', 'expenses'].flatMap(kind => state.workspace[kind].filter(item => item.deletedAt).map(item => ({ ...item, kind })))];
    return `${profileForm()}<form id="conversionForm" class="settings-card"><p class="section-kicker">Monedas</p><h2>Conversiones a ${esc(p().currency)}</h2><p class="note">Ingresá cuántos ${esc(p().currency)} vale 1 unidad de cada moneda. Los importes sin tasa quedan fuera del total y se avisan. USD/ARS puede usar la última cotización BCRA si dejás la tasa vacía.</p><div class="form-grid">${Object.keys(CURRENCIES).filter(code => code !== p().currency).map(code => input(`1 ${code} equivale a`, `rate-${code}`, decimal(p().rates[code]), 'text', `inputmode="decimal" placeholder="${p().currency}"`)).join('')}</div><p role="alert" class="form-error"></p><button class="btn primary">Guardar conversiones</button></form>
      <form id="holidayForm" class="settings-card"><p class="section-kicker">Calendario propio</p><h2>Feriados y días especiales</h2><p class="note">No dependés de un país o año fijo. Agregá fechas separadas por comas o saltos de línea; también podés marcarlas en el calendario.</p><label class="field">Fechas (AAAA-MM-DD)<textarea name="dates" rows="5" placeholder="2027-01-01">${esc([...state.settings.holidays].sort().join('\n'))}</textarea></label><p role="alert" class="form-error"></p><button class="btn primary">Guardar fechas</button></form>
      <section class="settings-card"><p class="section-kicker">Recuperación</p><h2>Copias automáticas locales</h2><p class="note">Se conservan hasta 7 copias: antes del primer cambio de cada día y antes de importar o restaurar. Están en este mismo dispositivo; exportá una copia para protegerte ante pérdida del equipo. No hay sincronización en la nube.</p>${button('snapshot', 'Crear copia ahora')}${backups.map(item => `<div class="directory-row"><div><strong>${esc(item.reason)}</strong><small>${esc(new Date(item.at).toLocaleString(p().locale))}</small></div>${button('restore-snapshot', 'Restaurar', item.id)}</div>`).join('') || '<p class="note">Las copias aparecerán al guardar tus primeros cambios.</p>'}</section>
      <section class="settings-card"><p class="section-kicker">Papelera</p><h2>Recuperar eliminaciones</h2>${trash.map(item => `<div class="directory-row"><div><strong>${esc(item.name)}</strong><small>${esc(new Date(item.deletedAt).toLocaleDateString(p().locale))}</small></div><button class="btn" data-workspace-action="restore-item" data-kind="${item.kind}" data-id="${esc(item.id)}">Restaurar</button></div>`).join('') || '<p class="note">Lo que elimines de ingresos, clientes, servicios y gastos aparecerá acá.</p>'}</section>`;
  }

  function openEditor(kind, item = {}) {
    let dialog = document.querySelector('#workspaceDialog');
    if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'workspaceDialog'; document.body.append(dialog); }
    const title = { clients: 'cliente', services: 'servicio', expenses: 'gasto' }[kind];
    const code = item.currency || p().currency;
    const fields = kind === 'clients' ? `${input('Nombre', 'name', item.name, 'text', 'required maxlength="120"')}${input('Email (opcional)', 'email', item.email, 'email', 'maxlength="160"')}${input('Notas (opcional)', 'notes', item.notes, 'text', 'maxlength="500"')}`
      : kind === 'services' ? `${input('Nombre del servicio', 'name', item.name, 'text', 'required maxlength="120"')}<label class="field">Cliente<select name="clientId"><option value="">Tarifa general</option>${active('clients').map(client => `<option value="${esc(client.id)}" ${client.id === item.clientId ? 'selected' : ''}>${esc(client.name)}</option>`).join('')}</select></label>${input('Tarifa', 'rate', decimal(item.rate), 'text', 'required inputmode="decimal"')}<label class="field">Moneda<select name="currency">${currencyOptions(code)}</select></label><label class="field">Se cobra<select name="unit"><option value="hour" ${item.unit === 'hour' ? 'selected' : ''}>Por hora</option><option value="fixed" ${item.unit !== 'hour' ? 'selected' : ''}>Por servicio</option></select></label>`
      : `${input('Descripción', 'name', item.name, 'text', 'required maxlength="120"')}${input('Monto', 'amount', decimal(item.amount), 'text', 'required inputmode="decimal"')}<label class="field">Moneda<select name="currency">${currencyOptions(code)}</select></label>${input('Fecha', 'date', item.date || (state.period === todayKey() ? todayString() : state.period + '-01'), 'date', 'required')}${input('Categoría (opcional)', 'category', item.category, 'text', 'maxlength="60" placeholder="Ej. Alquiler, materiales, transporte"')}<label class="check-line"><input type="checkbox" name="paid" ${checked(item.paid !== false)}>Ya está pagado</label>`;
    dialog.innerHTML = `<div class="dialog-content"><div class="dialog-header"><h2 id="workspaceDialogTitle">${item.id ? 'Editar' : 'Nuevo'} ${title}</h2>${button('close-editor', 'Cerrar')}</div><form data-workspace-form="${kind}" data-id="${esc(item.id || '')}"><div class="form-grid">${fields}</div><p role="alert" class="form-error"></p><div class="dialog-actions">${item.id ? `<button class="btn danger" type="button" data-workspace-action="delete-item" data-kind="${kind}" data-id="${esc(item.id)}">Mover a papelera</button>` : ''}<button class="btn primary" type="submit">Guardar ${title}</button></div></form></div>`;
    dialog.setAttribute('aria-labelledby', 'workspaceDialogTitle'); dialog.showModal(); dialog.querySelector('input').focus();
  }

  function demo() {
    if (hasRecords()) { setStatus('Los ejemplos solo se cargan en un espacio vacío.', 'error'); return; }
    const code = p().currency;
    const next = normalizeWorkspace({ ...state.workspace, profile: { ...p(), onboarded: true, demoActive: true, modules: Object.fromEntries(Object.keys(MODULES).map(key => [key, true])) },
      clients: [{ id: 'demo-client', name: 'Cliente de ejemplo' }], services: [{ id: 'demo-service', name: 'Sesión de ejemplo', rate: 25, currency: code, unit: 'hour', clientId: 'demo-client' }],
      expenses: [{ id: 'demo-expense', name: 'Materiales de ejemplo', amount: 35, currency: code, date: state.period + '-05', paid: true, category: 'Materiales' }] });
    const sources = [normalizeSource({ id: 'demo-income', name: 'Proyecto de ejemplo', type: 'project', amount: 250, currency: code, clientId: 'demo-client', expectedDate: state.period + '-15', projectStatus: 'active', payments: { [state.period]: { status: 'partial', paidAmount: 100 } } })];
    if (!createSafetyBackup('Antes de cargar ejemplos', true) || !storageTransaction(() => saveSources(sources) && saveWorkspace(next))) { setStatus('No se pudieron guardar los ejemplos.', 'error'); return; }
    state.workspace = next; state.sources = sources; render();
  }

  async function action(target) {
    const name = target.dataset.workspaceAction, id = target.dataset.id, kind = target.dataset.kind;
    if (['settings', 'hours', 'saas', 'projects', 'clients', 'expenses'].includes(name)) return setRoute(name);
    const editors = { 'new-client': 'clients', 'edit-client': 'clients', 'new-service': 'services', 'edit-service': 'services', 'new-expense': 'expenses', 'edit-expense': 'expenses' };
    if (editors[name]) return openEditor(editors[name], state.workspace[editors[name]].find(item => item.id === id) || {});
    if (name === 'close-editor') return document.querySelector('#workspaceDialog').close();
    if (name === 'client-income') return ctx.openSource('', 'project', { clientId: id });
    if (name === 'service-income') { const service = active('services').find(item => item.id === id); if (service) ctx.openSource('', service.unit === 'hour' ? 'hours' : 'project', { service }); return; }
    if (name === 'demo') return demo();
    if (name === 'remove-demo') {
      const sources = state.sources.filter(item => item.id !== 'demo-income');
      const next = normalizeWorkspace({ ...state.workspace, profile: { ...p(), demoActive: false }, clients: state.workspace.clients.filter(item => item.id !== 'demo-client'), services: state.workspace.services.filter(item => item.id !== 'demo-service'), expenses: state.workspace.expenses.filter(item => item.id !== 'demo-expense') });
      if (!storageTransaction(() => saveSources(sources) && saveWorkspace(next))) return setStatus('No se pudieron quitar los ejemplos.', 'error');
      state.sources = sources; state.workspace = next; render();
    }
    if (name === 'snapshot') { const saved = createSafetyBackup('Copia manual', true); setStatus(saved ? 'Copia local creada' : 'No se pudo crear la copia', saved ? 'saved' : 'error'); render(); }
    if (name === 'restore-snapshot') {
      if (!window.confirm('¿Restaurar esta copia? Reemplaza tus datos actuales. Antes se guardará una copia para poder volver atrás.')) return;
      if (restoreSafetyBackup(id)) location.reload(); else setStatus('No se pudo restaurar; tus datos actuales se conservaron.', 'error');
    }
    if (['delete-item', 'restore-item'].includes(name)) {
      if (!['sources', 'clients', 'services', 'expenses'].includes(kind)) return;
      const deletedAt = name === 'delete-item' ? new Date().toISOString() : '';
      if (kind === 'sources') {
        const sources = state.sources.map(item => item.id === id ? { ...item, deletedAt } : item);
        if (!saveSources(sources)) return setStatus('No se pudo guardar.', 'error');
        state.sources = sources;
      } else if (!commit({ ...state.workspace, [kind]: state.workspace[kind].map(item => item.id === id ? { ...item, deletedAt } : item) })) return;
      document.querySelector('#workspaceDialog')?.close(); setStatus(deletedAt ? 'Movido a papelera. Podés recuperarlo en Configuración.' : 'Registro recuperado', 'saved'); render();
    }
  }

  function submit(event) {
    const form = event.target;
    const handled = ['profileForm', 'conversionForm', 'holidayForm'].includes(form.id) || form.dataset.workspaceForm;
    if (!handled) return;
    event.preventDefault();
    const f = form.elements;
    if (form.id === 'profileForm') {
      const modules = Object.fromEntries(Object.keys(MODULES).map(key => [key, f[`module-${key}`].checked]));
      if (!Object.values(modules).some(Boolean)) return error(form, 'Elegí al menos una sección.');
      const profile = { ...p(), onboarded: true, name: f.name.value, activity: f.activity.value, currency: f.currency.value, locale: f.locale.value,
        rates: p().currency === f.currency.value ? p().rates : {}, modules, dateFormat: f.dateFormat.value, weekStart: Number(f.weekStart.value),
        labels: Object.fromEntries(['hours', 'saas', 'projects'].map(key => [key, f[`label-${key}`].value])),
        widgets: Object.fromEntries(Object.keys(WIDGETS).map(key => [key, f[`widget-${key}`].checked])) };
      if (commit({ ...state.workspace, profile })) { ctx.preferencesChanged(); if (form.dataset.welcome === 'true') setRoute('hub'); else render(); }
    } else if (form.id === 'conversionForm') {
      const rates = {};
      for (const code of Object.keys(CURRENCIES).filter(code => code !== p().currency)) {
        const text = f[`rate-${code}`].value.trim();
        if (!text) continue;
        const rate = parseNumber(text, p().locale);
        if (!(rate > 0)) return error(form, `Ingresá una tasa positiva para ${code}.`);
        rates[code] = rate;
      }
      if (commit({ ...state.workspace, profile: { ...p(), rates } })) render();
    } else if (form.id === 'holidayForm') {
      const dates = f.dates.value.split(/[\s,;]+/).filter(Boolean);
      if (dates.some(date => !isValidDate(date))) return error(form, 'Revisá las fechas: usá AAAA-MM-DD, sin fechas imposibles.');
      const settings = { ...state.settings, holidays: new Set(dates) };
      if (!saveSettings(settings)) return error(form, 'No se pudieron guardar las fechas.');
      state.settings = settings; setStatus('Calendario guardado', 'saved'); render();
    } else {
      const kind = form.dataset.workspaceForm;
      if (!['clients', 'services', 'expenses'].includes(kind)) return;
      const values = Object.fromEntries(new FormData(form));
      if (!values.name?.trim()) return error(form, 'Ingresá un nombre.');
      if (kind !== 'clients') {
        const key = kind === 'services' ? 'rate' : 'amount';
        values[key] = parseNumber(values[key], p().locale);
        if (!Number.isFinite(values[key]) || values[key] < 0) return error(form, 'Ingresá un monto válido, igual o mayor a cero.');
      }
      if (kind === 'expenses') { if (!isValidDate(values.date)) return error(form, 'Ingresá una fecha válida.'); values.paid = f.paid.checked; }
      const item = { ...values, id: form.dataset.id || createId() };
      const items = form.dataset.id ? state.workspace[kind].map(old => old.id === item.id ? item : old) : [...state.workspace[kind], item];
      if (commit({ ...state.workspace, [kind]: items })) { document.querySelector('#workspaceDialog').close(); render(); }
    }
  }

  function init() {
    document.addEventListener('click', event => { const target = event.target.closest('[data-workspace-action]'); if (target) action(target); });
    document.addEventListener('submit', submit);
    document.addEventListener('change', event => {
      if (event.target.name !== 'activity' || event.target.form?.id !== 'profileForm') return;
      const f = event.target.form.elements, activity = event.target.value;
      for (const key of ['hours', 'saas', 'projects']) f[`module-${key}`].checked = activity === 'mixed' || activity === key || (activity === 'recurring' && key === 'saas');
    });
  }
  return { dashboard, directory, expenses, settingsExtra, init };
}
