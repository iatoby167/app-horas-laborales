let updateState = null;
const bridge = window.desktopUpdates;
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export function renderDesktopUpdateCard() {
  if (!bridge) return '';
  const state = updateState || { status: 'loading', version: '' };
  const messages = {
    loading: 'Consultando la versión instalada…',
    idle: 'Buscá si hay una nueva versión del programa.',
    checking: 'Buscando actualizaciones…',
    current: 'Ya tenés la última versión disponible.',
    available: `La versión ${state.nextVersion} está disponible para descargar.`,
    downloading: `Descargando actualización: ${state.percent}%. Podés seguir usando el programa.`,
    downloaded: `La versión ${state.nextVersion} está lista. Guardá los formularios abiertos antes de reiniciar.`,
    installing: 'Cerrando el programa para instalar la actualización…',
    error: 'No se pudo completar la actualización. Revisá la conexión e intentá buscar nuevamente.',
    unpublished: 'Todavía no hay una versión publicada con los archivos de actualización en GitHub. Intentá de nuevo cuando se publique.',
    unconfigured: 'Todavía no se configuró dónde se publican las nuevas versiones. La búsqueda estará disponible cuando se conecte el canal de actualizaciones.',
    portable: 'Estás usando la versión portable. Instalá la app con el instalador de Windows para actualizar desde el programa.',
    development: 'La búsqueda de actualizaciones está disponible en la aplicación instalada.'
  };
  const disabled = !['idle', 'current', 'error', 'available', 'unpublished'].includes(state.status);
  return `<section id="desktopUpdatesCard" class="settings-card" aria-labelledby="desktopUpdatesTitle">
    <p class="section-kicker">${state.channel === 'prueba' ? 'VERSIÓN DE PRUEBA · Windows' : 'Aplicación para Windows · Estable'}</p>
    <h2 id="desktopUpdatesTitle">Actualizaciones${state.version ? ` · v${escape(state.version)}` : ''}</h2>
    <p class="note" role="status">${escape(messages[state.status] || messages.error)}</p>
    ${state.status === 'downloading' ? `<progress value="${state.percent}" max="100" aria-label="Descarga de la actualización">${state.percent}%</progress>` : ''}
    <div class="button-row">
      <button class="btn" type="button" data-update-action="check" ${disabled ? 'disabled' : ''}>Buscar actualizaciones</button>
      ${state.status === 'available' ? '<button class="btn primary" type="button" data-update-action="download">Descargar actualización</button>' : ''}
      ${state.status === 'downloaded' ? '<button class="btn primary" type="button" data-update-action="install">Instalar y reiniciar</button>' : ''}
    </div>
    <p class="note">Tus registros guardados se conservan al actualizar.</p>
    ${state.channel === 'prueba' ? '<p class="note">Esta app tiene datos separados. Para volver a la versión normal, cerrá esta ventana y abrí Hub de Ingresos. Para probar con tus registros, importá una copia de seguridad de la app normal.</p>' : ''}
  </section>`;
}

function receiveState(state) {
  updateState = state;
  if (state.channel === 'prueba') {
    const subtitle = document.querySelector('.brand-subtitle');
    if (subtitle) subtitle.textContent = 'VERSIÓN DE PRUEBA · Datos separados';
  }
  const card = document.querySelector('#desktopUpdatesCard');
  if (card) card.outerHTML = renderDesktopUpdateCard();
  const button = document.querySelector('#desktopUpdateButton');
  if (button) button.textContent = ['available', 'downloaded'].includes(state.status) ? 'Actualización disponible' : 'Actualizar programa';
}

export function initDesktopUpdates(openSettings) {
  if (!bridge) return;
  const button = document.querySelector('#desktopUpdateButton');
  button.hidden = false;
  button.addEventListener('click', () => {
    openSettings();
    document.querySelector('#desktopUpdatesCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  bridge.onState(receiveState);
  bridge.getState().then(receiveState).catch(() => receiveState({ status: 'error' }));
  document.addEventListener('click', async event => {
    const actionButton = event.target.closest('[data-update-action]');
    if (!actionButton || actionButton.disabled) return;
    const action = actionButton.dataset.updateAction;
    if (!['check', 'download', 'install'].includes(action)) return;
    actionButton.disabled = true;
    try { receiveState(await bridge[action]()); }
    catch (_) { receiveState({ ...updateState, status: 'error' }); }
  });
}
