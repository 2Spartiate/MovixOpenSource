import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

type Service = typeof import('../src/services/downloadLinksService.ts');
interface RequestConfig {
  params?: { title_id: string };
  headers?: { Authorization: string };
  signal: AbortSignal;
  validateStatus: (status: number) => boolean;
}

function loadService(authToken: string | null, status = 200) {
  const calls: { url: string; body: { turnstileToken: string }; config: RequestConfig }[] = [];
  const axios = { async post(url: string, body: { turnstileToken: string }, config: RequestConfig) {
    calls.push({ url, body, config });
    return { status, data: status === 200 ? { success: true } : { error: 'Vérification échouée' } };
  } };
  const source = readFileSync(new URL('../src/services/downloadLinksService.ts', import.meta.url), 'utf8')
    .replace('import.meta.env.VITE_MAIN_API', JSON.stringify('https://download.test'));
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', 'localStorage', js)(exports, (name: string) => {
    assert.equal(name, 'axios');
    return axios;
  }, { getItem: (key: string) => {
    assert.equal(key, 'auth_token');
    return authToken;
  } });
  return { service: exports as Service, calls };
}

test('envoie le CAPTCHA dans le corps POST et la session dans Authorization', async () => {
  const { service, calls } = loadService('session-token');
  const controller = new AbortController();
  await service.decodeDownloadLink('123', 'captcha-token', '456', controller.signal);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://download.test/api/darkiworld/decode/123');
  assert.deepEqual(calls[0].body, { turnstileToken: 'captcha-token' });
  assert.deepEqual(calls[0].config.params, { title_id: '456' });
  assert.equal(calls[0].config.headers?.Authorization, 'Bearer session-token');
  assert.equal(calls[0].config.signal, controller.signal);
});

test('permet le décodage anonyme avec CAPTCHA sans envoyer de fausse session', async () => {
  const { service, calls } = loadService(null);
  await service.decodeDownloadLink('123', 'captcha-token', null, new AbortController().signal);
  assert.equal(calls[0].config.headers, undefined);
  assert.equal(calls[0].config.params, undefined);
});

test('restitue le refus CAPTCHA sans réutiliser le jeton dans une nouvelle requête', async () => {
  const { service, calls } = loadService(null, 403);
  const response = await service.decodeDownloadLink('123', 'expired-token', null, new AbortController().signal);
  assert.equal(response.status, 403);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].config.validateStatus(403), true);
});
