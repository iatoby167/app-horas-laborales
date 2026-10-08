const { build, version } = require('./package.json');
const [major, minor, patch] = version.split('.').map(Number);
const buildNumber = process.env.TEST_BUILD_NUMBER || '0.1';
if (!/^\d+\.\d+$/.test(buildNumber)) throw new Error('TEST_BUILD_NUMBER debe tener formato número.intento');

module.exports = {
  ...build,
  extends: null,
  appId: 'com.hubdeingresos.app.prueba',
  productName: 'Hub de Ingresos Prueba',
  directories: { output: 'dist-prueba' },
  extraMetadata: {
    name: 'hub-de-ingresos-prueba',
    version: `${major}.${minor}.${patch + 1}-prueba.${buildNumber}`,
    releaseChannel: 'prueba'
  },
  publish: { ...build.publish, channel: 'prueba', releaseType: 'prerelease' },
  generateUpdatesFilesForAllChannels: false,
  nsis: {
    ...build.nsis,
    shortcutName: 'Hub de Ingresos Prueba',
    artifactName: 'Hub-de-Ingresos-Prueba-${version}-instalador-${arch}.${ext}'
  }
};
