import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = fileURLToPath(new URL('../', import.meta.url));
const pendingKey = 'update:pendingDownload';
const manifest = {
  version: '9.0.0', buildNumber: 9999, mandatory: true,
  apkUrl: 'https://example.com/official.apk', apkSizeBytes: 100,
  apkSha256: 'a'.repeat(64), releasedAt: '2026-10-10',
  releaseNotes: { fr: 'Mise à jour obligatoire', en: 'Mandatory update' },
};

function harness({ platform = 'android', isTV = false, pending = null, cancelFails = false } = {}) {
  const calls = [];
  const storage = new Map([
    ['movix_parental_pin_v1', 'protected-pin'], ['history', 'viewing-history'],
    ['address:lastConfig', 'resolved-site'], ['dnsConsent', 'accepted'],
  ]);
  if (pending !== null) storage.set(pendingKey, pending);
  const listeners = [];
  let cursor = 0;
  const slots = [], effects = [];
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: initial };
      return [slots[i].value, value => {
        slots[i].value = typeof value === 'function' ? value(slots[i].value) : value;
      }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) {
      const i = cursor++;
      const previous = slots[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        previous?.cleanup?.();
        slots[i] = { deps };
        effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
    createElement(type, props, ...children) { return { type, props, children }; },
    Fragment: 'Fragment',
  };
  const nativeUpdate = Object.fromEntries([
    'getVersionCode', 'getVersionName', 'canInstallApks', 'openInstallSettings',
    'installApk', 'enqueueDownload', 'queryDownload', 'computeSha256', 'cancelDownload',
  ].map(operation => [operation, async (...args) => {
    calls.push([operation, ...args]);
    if (operation === 'cancelDownload' && cancelFails) throw new Error('stale ID');
    if (operation === 'getVersionCode') return 1;
    if (operation === 'getVersionName') return '1.0.0';
    if (operation === 'queryDownload') return { status: 'successful' };
    if (operation === 'computeSha256') return manifest.apkSha256;
    return true;
  }]));
  const external = {
    react,
    'react-native': {
      Platform: { OS: platform, isTV }, NativeModules: { UpdateModule: nativeUpdate },
      AppState: {
        currentState: 'active',
        addEventListener(type, callback) {
          calls.push(['subscribe', type]); listeners.push(callback);
          return { remove() {} };
        },
      },
    },
    '@react-native-async-storage/async-storage': {
      async getItem(key) { calls.push(['getItem', key]); return storage.get(key) ?? null; },
      async removeItem(key) { calls.push(['removeItem', key]); storage.delete(key); },
      async setItem(key, value) { calls.push(['setItem', key]); storage.set(key, value); },
    },
  };
  const modules = new Map();
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    if (filename.endsWith('.json')) return JSON.parse(readFileSync(filename, 'utf8'));
    const module = { exports: {} };
    modules.set(filename, module);
    const source = readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
    }).outputText;
    const context = vm.createContext({
      module, exports: module.exports, AbortController, setTimeout, clearTimeout,
      console: { warn() {} },
      async fetch(url) {
        calls.push(['fetch', url]);
        return { ok: true, json: async () => manifest };
      },
      require(specifier) {
        if (Object.hasOwn(external, specifier)) return external[specifier];
        assert.ok(specifier.startsWith('.'), `Unexpected import: ${specifier}`);
        const path = resolve(dirname(filename), specifier);
        const found = [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`]
          .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
        assert.ok(found, `Missing import: ${specifier}`);
        return load(found);
      },
    });
    new vm.Script(compiled + (filename.endsWith('/App.tsx') ? '\nexports.AppShell = AppShell;' : ''),
      { filename }).runInContext(context);
    return module.exports;
  }
  const useAppUpdate = load(resolve(root, 'src/hooks/useAppUpdate.ts')).useAppUpdate;
  let hookCount;
  function render(githubUrl = 'https://github.com/movixstream/MovixOpenSource', options) {
    cursor = 0;
    const result = useAppUpdate(githubUrl, options);
    if (hookCount !== undefined) assert.equal(cursor, hookCount, 'Hook order must stay stable');
    hookCount = cursor;
    effects.splice(0).forEach(effect => effect());
    return result;
  }
  async function flush() {
    for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
  }
  return { calls, storage, external, load, render, flush,
    resume() { listeners.forEach(fn => fn('background')); listeners.forEach(fn => fn('active')); } };
}

function assertSilent(h) {
  const allowed = new Set(['getItem', 'removeItem', 'cancelDownload']);
  assert.deepEqual(h.calls.filter(([name]) => !allowed.has(name)), []);
  assert.ok(h.calls.filter(([name]) => ['getItem', 'removeItem'].includes(name))
    .every(([, key]) => key === pendingKey));
  assert.equal(h.storage.get('movix_parental_pin_v1'), 'protected-pin');
  assert.equal(h.storage.get('history'), 'viewing-history');
  assert.equal(h.storage.get('address:lastConfig'), 'resolved-site');
  assert.equal(h.storage.get('dnsConsent'), 'accepted');
}

for (const isTV of [false, true]) {
  test(`Android ${isTV ? 'TV' : 'mobile'} stays silent at startup, config changes and foreground resume`, async () => {
    const h = harness({ isTV });
    assert.equal(h.render(null).state.stage, 'idle');
    await h.flush();
    let result = h.render(undefined, { enabled: true });
    await h.flush();
    h.resume();
    for (const action of ['accept', 'dismiss', 'retry', 'openSettings', 'cancel']) await result[action]();
    await h.flush();
    assert.equal(h.render().state.stage, 'idle');
    assertSilent(h);
  });
}

for (const status of ['running', 'successful']) {
  test(`A preexisting ${status} APK download is cancelled without query, verification or installation`, async () => {
    const pending = JSON.stringify({ downloadId: 73, targetBuildNumber: 9999,
      apkFilePath: '/old/official.apk', targetSha256: manifest.apkSha256, status });
    const h = harness({ pending });
    h.render(null);
    await h.flush();
    assert.equal(h.storage.has(pendingKey), false);
    assert.deepEqual(h.calls.filter(([name]) => name === 'cancelDownload'), [['cancelDownload', 73]]);
    h.resume(); h.render(); await h.flush();
    assertSilent(h);
    // A fresh process must not recover any installer state from the previous launch.
    const reboot = harness(); reboot.render(); await reboot.flush(); assertSilent(reboot);
  });
}

test('Only obsolete update state is removed for corrupt or invalid payloads', async () => {
  for (const pending of ['{broken', 'null', 'false', '{"downloadId":-1}',
    '{"downloadId":"73"}', '{"downloadId":1.5}', '{"downloadId":9007199254740992}']) {
    const h = harness({ pending }); h.render(); await h.flush();
    assert.equal(h.storage.has(pendingKey), false);
    assert.equal(h.calls.some(([name]) => name === 'cancelDownload'), false);
    assertSilent(h);
  }
});

test('A failed cancellation cannot retain the legacy installation state', async () => {
  const h = harness({ pending: '{"downloadId":73}', cancelFails: true });
  h.render(); await h.flush();
  assert.equal(h.storage.has(pendingKey), false);
  assertSilent(h);
});

test('Direct Android service calls cannot fetch, download, poll, request permission or install', async () => {
  const h = harness();
  const versions = h.load(resolve(root, 'src/services/versionCheck.ts'));
  const installer = h.load(resolve(root, 'src/services/apkInstaller.ts'));
  const downloader = h.load(resolve(root, 'src/services/updateDownloader.ts'));
  assert.equal((await versions.fetchLatestVersion('https://github.com/official/repo')).kind, 'no-check');
  assert.equal(await installer.canInstallApks(), false);
  await assert.rejects(installer.installApk('/old/official.apk'), /APK_UPDATES_DISABLED/);
  await assert.rejects(installer.openInstallSettings(), /APK_UPDATES_DISABLED/);
  await assert.rejects(downloader.enqueueDownload(manifest.apkUrl, 'official.apk', 'Update'), /APK_UPDATES_DISABLED/);
  await assert.rejects(downloader.pollUntilDone(73, () => {}, () => true), /APK_UPDATES_DISABLED/);
  assert.deepEqual(h.calls, []);
  // Reading the installed version remains available to Settings.
  assert.equal(await installer.getLocalVersionCode(), 1);
});

test('AppShell suppresses every update UI even if a future hook returns stale update state', () => {
  const h = harness();
  for (const component of ['BrowserScreen', 'UpdateScreen'])
    h.external[`./screens/${component}`] = { __esModule: true, default: component };
  h.external['./components/UpdateDialog'] = { __esModule: true, default: 'UpdateDialog' };
  h.external['react-native-safe-area-context'] = {};
  h.external['./services/networkJournal'] = {};
  h.external['./context/AddressContext'] = { useAddress: () => ({ config: { githubUrl: manifest.apkUrl } }) };
  let stage = 'offered', hookCalls = 0;
  h.external['./hooks/useAppUpdate'] = { useAppUpdate(url, options) {
    hookCalls++; assert.equal(options.enabled, false);
    return { state: { stage, manifest } };
  } };
  const { AppShell } = h.load(resolve(root, 'src/App.tsx'));
  function types(element) {
    return element && typeof element === 'object'
      ? [element.type, ...element.children.flatMap(types)] : [];
  }
  for (stage of ['idle', 'offered', 'downloading', 'verifying', 'installing', 'need_permission', 'error']) {
    for (const dnsSettled of [false, true]) {
      const tree = types(AppShell({ dnsSettled }));
      assert.ok(tree.includes('BrowserScreen'));
      assert.equal(tree.includes('UpdateScreen'), false);
      assert.equal(tree.includes('UpdateDialog'), false);
    }
  }
  assert.equal(hookCalls, 14, 'The updater hook is always called');
});

test('Bundled policy is immutable, Android remains off and iOS retains its existing update flow', async () => {
  const h = harness({ platform: 'ios' });
  const policy = h.load(resolve(root, 'src/config/appUpdates.ts'));
  assert.equal(Object.isFrozen(policy.APP_UPDATE_POLICY), true);
  assert.equal(policy.areAppUpdatesEnabled('android'), false);
  assert.equal(policy.areAppUpdatesEnabled('unknown'), false);
  assert.equal(policy.areAppUpdatesEnabled('ios'), true);
  h.render(); await h.flush();
  assert.equal(h.render().state.stage, 'need_permission');
  assert.equal(h.calls.some(([name]) => name === 'fetch'), true);
  assert.equal(h.calls.some(([name]) => ['getItem', 'installApk', 'enqueueDownload'].includes(name)), false);
});
