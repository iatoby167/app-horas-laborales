const path = require('node:path');
const fs = require('node:fs');

function configureDistribution(app, packageInfo) {
  const isTest = packageInfo.releaseChannel === 'prueba';
  if (isTest) {
    const profile = path.join(app.getPath('appData'), 'hub-de-ingresos-prueba');
    fs.mkdirSync(profile, { recursive: true });
    app.setName('Hub de Ingresos Prueba');
    app.setPath('userData', profile);
    app.setPath('sessionData', profile);
  }
  return { isTest, channel: isTest ? 'prueba' : 'stable' };
}

module.exports = { configureDistribution };
