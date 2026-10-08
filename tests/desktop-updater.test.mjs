import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import controllerModule from '../desktop-updater.cjs';

function setup(options = {}) {
  const updater = new EventEmitter();
  let checks = 0, downloads = 0, installs = 0;
  updater.checkForUpdates = async () => { checks++; updater.emit('update-available', { version: '1.0.3' }); return {}; };
  updater.downloadUpdate = async () => { downloads++; updater.emit('download-progress', { percent: 45.6 }); updater.emit('update-downloaded', { version: '1.0.3' }); };
  updater.quitAndInstall = (silent, restart) => { assert.equal(silent, false); assert.equal(restart, true); installs++; };
  const states = [];
  const controller = controllerModule.createUpdateController({ updater, version: '1.0.2', packaged: true,
    portable: false, configured: true, publish: value => states.push(value), ...options });
  return { updater, controller, states, calls: () => ({ checks, downloads, installs }) };
}

test('buscar no descarga ni instala: cada acción requiere su propio paso', async () => {
  const { controller, updater, states, calls } = setup();
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.channel, 'latest');
  assert.equal(controller.install(), false);
  await controller.download();
  assert.equal(calls().downloads, 0);
  await controller.check();
  assert.equal(controller.getState().status, 'available');
  assert.equal(calls().downloads, 0);
  await controller.download();
  assert.equal(controller.getState().status, 'downloaded');
  assert.equal(calls().installs, 0);
  assert.equal(states.find(state => state.percent === 46).status, 'downloading');
  await controller.check();
  assert.equal(calls().checks, 1);
  assert.equal(controller.install(), true);
  assert.equal(controller.install(), false);
  assert.equal(calls().installs, 1);
});

test('el actualizador de prueba usa un canal propio y no permite bajar de versión', () => {
  const { controller, updater } = setup({ channel: 'prueba' });
  assert.equal(updater.channel, 'prueba');
  assert.equal(updater.allowPrerelease, true);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(controller.getState().channel, 'prueba');
});

test('una búsqueda repetida durante la petición no dispara dos solicitudes', async () => {
  const { controller, updater } = setup();
  let finish, calls = 0;
  updater.checkForUpdates = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = controller.check();
  await controller.check();
  assert.equal(calls, 1);
  updater.emit('update-not-available');
  finish({});
  await first;
  assert.equal(controller.getState().status, 'current');
});

test('errores de red, verificación o instalación no se muestran como éxito', async () => {
  const { controller, updater } = setup();
  updater.checkForUpdates = async () => { throw new Error('offline'); };
  await controller.check();
  assert.equal(controller.getState().status, 'error');
  updater.checkForUpdates = async () => { updater.emit('update-available', { version: '1.0.3' }); return {}; };
  await controller.check();
  updater.downloadUpdate = async () => { throw new Error('checksum mismatch'); };
  await controller.download();
  assert.equal(controller.getState().status, 'error');
  assert.equal(controller.install(), false);
  updater.emit('update-downloaded', { version: '1.0.3' });
  updater.quitAndInstall = () => { throw new Error('failed'); };
  assert.equal(controller.install(), false);
  assert.equal(controller.getState().status, 'error');
});

test('una Release sin publicar no se confunde con estar actualizado', async () => {
  const { controller, updater } = setup();
  updater.checkForUpdates = async () => { throw Object.assign(new Error('no releases'), { code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' }); };
  await controller.check();
  assert.equal(controller.getState().status, 'unpublished');
});

test('portable, desarrollo y falta de configuración bloquean descarga e instalación', async () => {
  for (const options of [{ portable: true }, { packaged: false }, { configured: false }]) {
    const { controller, calls } = setup(options);
    await controller.check();
    await controller.download();
    assert.equal(controller.install(), false);
    assert.deepEqual(calls(), { checks: 0, downloads: 0, installs: 0 });
  }
});
