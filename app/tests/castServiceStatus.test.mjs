import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function compile(file) {
  const source = await readFile(new URL(`../src/services/${file}.ts`, import.meta.url), 'utf8');
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const [castCode, diagnosticCode] = await Promise.all([compile('cast'), compile('diagnosticReport')]);

function harness(native = {}) {
  const diagnostics = { exports: {} };
  vm.runInNewContext(diagnosticCode, { module: diagnostics, exports: diagnostics.exports });
  const cast = { exports: {} };
  let listener;
  vm.runInNewContext(castCode, {
    module: cast, exports: cast.exports,
    require: id => {
      if (id === './diagnosticReport') return diagnostics.exports;
      if (id === 'react-native') return { NativeModules: { CastModule: native }, DeviceEventEmitter: { addListener: (_name, callback) => { listener = callback; return { remove() {} }; } } };
      throw new Error(id);
    },
  });
  return { cast: cast.exports, diagnostics: diagnostics.exports, emit: value => listener(value) };
}

const status = { connected: true, deviceName: 'Salon', mediaSessionId: null, state: 'error', positionSec: 0, durationSec: null, canSeek: false, errorCode: 'MOVIX_CAST_LOAD_REJECTED' };

test('retains safe SDK error codes but drops free text and URLs', () => {
  const { cast } = harness();
  assert.equal(cast.normalizeNativeCastStatus({ ...status, nativeErrorCode: 'GCK_STATUS_2100' }).nativeErrorCode, 'GCK_STATUS_2100');
  assert.equal(cast.normalizeNativeCastStatus({ ...status, nativeErrorCode: 'https://cdn.example/?token=secret' }).nativeErrorCode, undefined);
});

test('diagnostics retain a changed native cause even when the UI error is unchanged', () => {
  const { cast, diagnostics, emit } = harness();
  cast.subscribeCastStatus(() => {});
  emit({ ...status, nativeErrorCode: 'GCK_STATUS_2100' });
  emit({ ...status, nativeErrorCode: 'GCK_STATUS_2102' });
  const entries = diagnostics.getCastDiagnostics();
  assert.equal(entries.length, 2);
  assert.match(entries[0], /GCK_STATUS_2100/);
  assert.match(entries[1], /GCK_STATUS_2102/);
});

test('load failures record sanitized native userInfo codes without copying SDK descriptions', async () => {
  const { cast, diagnostics } = harness({ loadProxiedMedia: async () => { throw { code: 'MOVIX_CAST_LOAD_REJECTED', userInfo: { nativeErrorCode: 'GCK_STATUS_2100', private: 'private-description' } }; } });
  await assert.rejects(cast.loadCastMedia({ url: 'https://cdn.example/', headers: {}, protocolVersion: 1 }, { title: 'Film' }, 0));
  const report = diagnostics.getCastDiagnostics().join('\n');
  assert.match(report, /GCK_STATUS_2100/);
  assert.ok(!report.includes('private-description'));
});
