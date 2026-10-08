import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { configureDistribution } = require('../desktop-distribution.cjs');
const config = require('../electron-builder.prueba.cjs');
const normal = require('../package.json');

test('la app de prueba conserva intacto el perfil de la normal', () => {
  const appData = mkdtempSync(path.join(tmpdir(), 'hub-distribution-test-'));
  const overrides = {};
  const fakeApp = {
    getPath: name => { assert.equal(name, 'appData'); return appData; },
    setName: value => { overrides.name = value; },
    setPath: (name, value) => { overrides[name] = value; }
  };
  assert.deepEqual(configureDistribution(fakeApp, {}), { isTest: false, channel: 'stable' });
  assert.deepEqual(overrides, {});
  assert.deepEqual(configureDistribution(fakeApp, { releaseChannel: 'prueba' }), { isTest: true, channel: 'prueba' });
  assert.equal(overrides.userData, path.join(appData, 'hub-de-ingresos-prueba'));
  assert.equal(overrides.sessionData, overrides.userData);
  assert.equal(existsSync(overrides.userData), true);
});

test('el instalador de prueba no reemplaza la identidad ni metadatos de la normal', () => {
  assert.notEqual(config.appId, normal.build.appId);
  assert.notEqual(config.productName, normal.build.productName);
  assert.notEqual(config.extraMetadata.name, normal.name);
  assert.notEqual(config.nsis.shortcutName, normal.build.nsis.shortcutName);
  assert.equal(config.publish.channel, 'prueba');
  assert.equal(config.publish.releaseType, 'prerelease');
  assert.equal(config.generateUpdatesFilesForAllChannels, false);
  assert.match(config.extraMetadata.version, /^\d+\.\d+\.\d+-prueba\.\d+\.\d+$/);
});
