import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { sourceFunction } from './helpers/sourceFunction.mjs';

function loadConfig(get) {
  const source = readFileSync(new URL('../src/utils/frembedConfig.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', js)(exports, name => {
    assert.equal(name, 'axios');
    return { get };
  });
  return exports;
}

function loadAvailability(config, get) {
  return sourceFunction('src/pages/Watch/WatchTv.tsx', 'checkFrembedAvailability', {
    getFrembedBase: config.getFrembedBase,
    initFrembedBase: config.initFrembedBase,
    axios: { get },
  });
}

test('attend le domaine résolu avant de vérifier la disponibilité de l’épisode', async () => {
  let resolveConfig;
  let configCalls = 0;
  const config = loadConfig(() => {
    configCalls++;
    return new Promise(resolve => { resolveConfig = resolve; });
  });
  const calls = [];
  const check = loadAvailability(config, async (url, options) => {
    calls.push({ url, options });
    return { data: { status: 200, result: { totalItems: 1, items: [{ sa: 2, epi: 3 }] } } };
  });

  const pending = check('1399', 2, 3);
  assert.equal(calls.length, 0, 'aucune requête ne doit partir vers l’ancien domaine');
  resolveConfig({ data: { main: 'https://main.example', backup: 'https://frembed.example/' } });

  assert.equal(await pending, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://frembed.example/api/public/v1/tv/1399?sa=2&epi=3');
  assert.equal(config.getFrembedBase(), 'https://frembed.example');
  await config.initFrembedBase();
  assert.equal(configCalls, 1);
});

test('utilise le domaine de secours actuel si la configuration distante échoue', async () => {
  const config = loadConfig(async () => { throw new Error('Configuration inaccessible'); });
  const check = loadAvailability(config, async url => {
    assert.equal(new URL(url).origin, 'https://frembed.surf');
    return { data: { status: 200, result: { totalItems: 1 } } };
  });

  assert.equal(await check('1399', 1, 1), true);
});

for (const [name, data, expected] of [
  ['format séries actuel', { status: 200, result: { totalItems: 1, items: [{ sa: 1, epi: 1 }] } }, true],
  ['compteur total', { status: 200, result: { total: 1 } }, true],
  ['liste sans compteur', { status: 200, result: { items: [{ sa: 1, epi: 1 }] } }, true],
  ['épisode absent', { status: 200, result: { totalItems: 0, items: [] } }, false],
  ['compteur nul prioritaire', { status: 200, result: { total: 0, totalItems: 1 } }, false],
  ['erreur du service', { status: 404, result: { totalItems: 1 } }, false],
  ['réponse incomplète', { status: 200 }, false],
]) {
  test(`disponibilité Frembed : ${name}`, async () => {
    const config = loadConfig(async () => ({ data: { main: 'https://frembed.example' } }));
    await config.initFrembedBase();
    const check = loadAvailability(config, async () => ({ data }));
    assert.equal(await check('1399', 1, 1), expected);
  });
}

test('conserve une réponse indisponible si la requête échoue', async () => {
  const config = loadConfig(async () => ({ data: { main: 'https://frembed.example' } }));
  await config.initFrembedBase();
  const check = loadAvailability(config, async () => { throw new Error('API inaccessible'); });
  assert.equal(await check('1399', 1, 1), false);
});
