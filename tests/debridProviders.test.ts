import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { isDebridProvider, selectAvailableDebridProvider } from '../src/utils/debridProviders.ts';

test('sélectionne uniquement un service affiché, y compris pour un ancien lien automatique', () => {
  assert.equal(selectAvailableDebridProvider('realdebrid', ['deepbrid']), 'deepbrid');
  assert.equal(selectAvailableDebridProvider('bestdebrid', ['bestdebrid', 'deepbrid']), 'bestdebrid');
  assert.equal(selectAvailableDebridProvider(null, ['debridr', 'deepbrid']), 'debridr');
  assert.equal(selectAvailableDebridProvider('deepbrid', []), undefined);
});

function loadService(payload: unknown, ok = true) {
  const calls: { url: string; init: RequestInit }[] = [];
  const source = readFileSync(new URL('../src/services/debridService.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const imports: Record<string, unknown> = {
    '@/config/runtime': { MAIN_API: 'https://movix.test' },
    '@/utils/vipUtils': { getVipHeaders: () => ({ 'x-access-key': 'test-vip' }) },
    '@/utils/debridProviders': { isDebridProvider },
  };
  new Function('exports', 'require', 'fetch', js)(exports, (name: string) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok, json: async () => payload };
  });
  return { service: exports as typeof import('../src/services/debridService.ts'), calls };
}

test('récupère la liste via Main API avec VIP, sans cache et avec annulation', async () => {
  const { service, calls } = loadService({ status: 'success', providers: ['bestdebrid', 'unknown', 'deepbrid', 'deepbrid', null] });
  const controller = new AbortController();
  assert.deepEqual(await service.getDebridProviders(controller.signal), ['bestdebrid', 'deepbrid']);
  assert.equal(calls[0].url, 'https://movix.test/api/media/debrid/providers');
  assert.deepEqual(calls[0].init.headers, { 'x-access-key': 'test-vip' });
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.signal, controller.signal);
});

test('respecte la liste vide et ne réactive rien si la configuration est indisponible', async () => {
  assert.deepEqual(await loadService({ status: 'success', providers: [] }).service.getDebridProviders(), []);
  for (const [payload, ok] of [
    [{ status: 'success', providers: ['deepbrid'] }, false],
    [{ status: 'error', providers: ['deepbrid'] }, true],
    [{ status: 'success', providers: null }, true],
    [null, true],
  ] as const) {
    await assert.rejects(loadService(payload, ok).service.getDebridProviders(), /providersLoadFailed/);
  }
});

test('conserve le fournisseur et les en-têtes VIP lors du débridage', async () => {
  const data = { link: 'https://download.test/file', filename: 'file.mkv', filesize: 123, host: '1fichier.com' };
  const { service, calls } = loadService({ status: 'success', data });
  assert.deepEqual(await service.unlockDebridLink('https://1fichier.com/?example', 'deepbrid'), { ...data, provider: 'deepbrid' });
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { link: 'https://1fichier.com/?example', provider: 'deepbrid' });
  await assert.rejects(loadService({ error: 'Service désactivé' }, false).service.unlockDebridLink('https://1fichier.com/?example', 'deepbrid'), /Service désactivé/);
});
