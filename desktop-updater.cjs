// Control del actualizador separado de Electron para verificar los estados sin instalar nada.
function createUpdateController({ updater, version, packaged, portable, configured, publish, channel = 'stable' }) {
  const blocked = portable ? 'portable' : !configured ? 'unconfigured' : !packaged ? 'development' : null;
  let state = { version, channel, status: blocked || 'idle', nextVersion: '', percent: 0 };
  const getState = () => ({ ...state });
  function change(patch) {
    state = { ...state, ...patch };
    publish(getState());
  }
  function fail(error) {
    const noRelease = ['ERR_UPDATER_NO_PUBLISHED_VERSIONS', 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'].includes(error?.code);
    change({ status: noRelease ? 'unpublished' : 'error', percent: 0 });
  }
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  // Canal personalizado: GitHub no debe ofrecer el instalador estable a la app de prueba.
  updater.channel = channel === 'prueba' ? 'prueba' : 'latest';
  updater.allowDowngrade = false;
  updater.allowPrerelease = channel === 'prueba';
  updater.on('checking-for-update', () => change({ status: 'checking', nextVersion: '', percent: 0 }));
  updater.on('update-available', info => change({ status: 'available', nextVersion: info.version }));
  updater.on('update-not-available', () => change({ status: 'current', nextVersion: '', percent: 0 }));
  updater.on('download-progress', progress => change({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))) }));
  updater.on('update-downloaded', info => change({ status: 'downloaded', nextVersion: info.version, percent: 100 }));
  updater.on('error', fail);
  let busy = false;
  return {
    getState,
    async check() {
      if (blocked || busy || ['downloaded', 'installing'].includes(state.status)) return getState();
      busy = true;
      change({ status: 'checking', nextVersion: '', percent: 0 });
      try {
        const result = await updater.checkForUpdates();
        if (!result && state.status === 'checking') fail();
      } catch (error) { fail(error); }
      finally { busy = false; }
      return getState();
    },
    async download() {
      if (blocked || busy || state.status !== 'available') return getState();
      busy = true;
      change({ status: 'downloading', percent: 0 });
      try { await updater.downloadUpdate(); }
      catch (error) { fail(error); }
      finally { busy = false; }
      return getState();
    },
    install() {
      if (blocked || busy || state.status !== 'downloaded') return false;
      change({ status: 'installing' });
      try { updater.quitAndInstall(false, true); }
      catch (_) { fail(); return false; }
      return true;
    }
  };
}

module.exports = { createUpdateController };
