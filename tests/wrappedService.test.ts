import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

type Service = typeof import('../src/services/wrappedService.ts');

function loadService(fetcher: typeof fetch) {
    // Exécuter le vrai client sans le runtime Vite, avec une origine de test explicite.
    const source = readFileSync(new URL('../src/services/wrappedService.ts', import.meta.url), 'utf8')
        .replace('import.meta.env.VITE_MAIN_API', JSON.stringify('https://wrapped.test'));
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    new Function('exports', 'fetch', 'localStorage', 'console', js)(exports, fetcher, { getItem: () => 'another-session' }, { error: () => undefined });
    return exports as Service;
}

test('la requête garde le compte et le profil capturés même si le stockage a changé', async () => {
    let captured: RequestInit | undefined;
    const controller = new AbortController();
    const service = loadService((async (url, init) => {
        assert.equal(url, 'https://wrapped.test/api/wrapped/generate/2026');
        captured = init;
        return new Response(JSON.stringify({ success: true, wrapped: null }), { status: 200 });
    }) as typeof fetch);
    const result = await service.fetchWrappedData(2026, { signal: controller.signal, session: { token: 'account-a', profileId: 'profile-a', collectionEnabled: true } });
    assert.equal(result.success, true);
    assert.equal(new Headers(captured?.headers).get('Authorization'), 'Bearer account-a');
    assert.equal(new Headers(captured?.headers).get('x-profile-id'), 'profile-a');
    assert.equal(captured?.signal, controller.signal);
});

test('une session explicitement déconnectée ne réutilise pas un autre jeton du stockage', async () => {
    let called = false;
    const service = loadService((async () => { called = true; return new Response(); }) as typeof fetch);
    const result = await service.fetchWrappedData(2026, { session: { token: null, profileId: null, collectionEnabled: true } });
    assert.equal(result.success, false);
    assert.equal(called, false);
});

test('une erreur réseau reste distincte d’un récap vide mais valide', async () => {
    const failed = loadService((async () => new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503 })) as typeof fetch);
    const empty = loadService((async () => new Response(JSON.stringify({ success: true, wrapped: null, progress: null }), { status: 200 })) as typeof fetch);
    const request = { session: { token: 'account-a', profileId: 'profile-a', collectionEnabled: true } };
    assert.equal((await failed.fetchWrappedData(2026, request)).success, false);
    assert.deepEqual(await empty.fetchWrappedData(2026, request), { success: true, wrapped: null, progress: null });
});
