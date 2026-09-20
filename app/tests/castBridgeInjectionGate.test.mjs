import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const bridgeSource = await readFile(
  new URL('../src/services/bridge.ts', import.meta.url),
  'utf8',
);
const castLoadSingleFlightSource = await readFile(
  new URL('../src/services/castLoadSingleFlight.ts', import.meta.url),
  'utf8',
);
const castLoadSingleFlightOutput = ts.transpileModule(castLoadSingleFlightSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const diagnosticSource = await readFile(new URL('../src/services/diagnosticReport.ts', import.meta.url), 'utf8');
const diagnosticOutput = ts.transpileModule(diagnosticSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const diagnosticReport = await import(`data:text/javascript;base64,${Buffer.from(diagnosticOutput).toString('base64')}`);

function loadCastLoadSingleFlight() {
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(module,exports){${castLoadSingleFlightOutput}\n})`,
    {},
  )(module, module.exports);
  return module.exports;
}

function deferred() {
  let resolve;
  const promise = new Promise(next => {
    resolve = next;
  });
  return { promise, resolve };
}

function loadBridge(overrides = {}, nativeModules = {}, copyDiagnostics = async () => {}) {
  let statusListener = null;
  const cast = {
    getCastCapabilities: async () => ({
      configured: true,
      receiverProtocolVersion: 1,
      castLanProxyVersion: 1,
    }),
    getCastStatus: async () => ({
      connected: true,
      deviceName: 'Salon',
      mediaSessionId: 1,
      state: 'playing',
      positionSec: 1,
      durationSec: 2,
      canSeek: true,
    }),
    getRelayDisclosurePreference: async () => false,
    isCastSupported: async () => true,
    loadCastMedia: async () => {},
    openCastBatterySettings: async () => {},
    pauseCast: async () => {},
    playCast: async () => {},
    requestCastRelayNotificationPermission: () => {},
    seekCastTo: async () => {},
    setRelayDisclosureSuppressed: async () => {},
    stopCast: async () => {},
    subscribeCastStatus: listener => {
      statusListener = listener;
      return () => {
        statusListener = null;
      };
    },
    ...overrides,
  };
  const output = ts.transpileModule(bridgeSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const require = id => {
    if (id === 'react-native') {
      return { NativeModules: nativeModules, Platform: { OS: 'android' } };
    }
    if (id === './cast') return cast;
    if (id === './diagnosticReport') return diagnosticReport;
    if (id === './diagnostics') return { copyDiagnostics };
    if (id === './castLoadSingleFlight') return loadCastLoadSingleFlight();
    if (id === './mediaProxyHeaders') {
      return {
        applyMediaProxyHeaderRules: (_url, headers) => ({ ...headers }),
      };
    }
    if (id === './networkJournal') {
      // Journal de diagnostic : inerte ici, il ne doit rien changer au pont.
      return {
        isNetworkJournalEnabled: () => false,
        recordJournalEntry: () => {},
      };
    }
    if (id === './playbackAwake') return { setPlaybackAwakeOwner: () => {} };
    if (id === './pictureInPicture') {
      return {
        enterPictureInPicture: async () => {},
        exitPictureInPicture: async () => {},
        isPictureInPictureSupported: async () => true,
        setPictureInPicturePlaybackActive: () => {},
        subscribePictureInPicture: () => () => {},
      };
    }
    throw new Error(`Unexpected bridge dependency: ${id}`);
  };
  vm.runInNewContext(
    `(function(require,module,exports){${output}\n})`,
    { URL, AbortController, Headers, Response, fetch, setTimeout, clearTimeout },
  )(require, module, module.exports);
  return {
    bridge: module.exports,
    emitStatus(status) {
      assert.ok(statusListener, 'status listener must be active');
      statusListener(status);
    },
  };
}

const trustedContext = {
  sourceUrl: 'https://movix.example/watch/1',
  trustedOrigins: ['https://movix.example'],
};
const untrustedContext = {
  sourceUrl: 'https://attacker.example/',
  trustedOrigins: ['https://movix.example'],
};
const capabilityA = 'a'.repeat(32);
const capabilityB = 'b'.repeat(32);

async function register(bridge, webViewRef, capability, context = trustedContext) {
  await bridge.handleBridgeMessage(
    JSON.stringify({
      type: 'CASTSHIM_REGISTER_CAPABILITY',
      capability,
    }),
    webViewRef,
    context,
  );
}

test('only the authenticated Movix document can copy Cast diagnostics', async () => {
  let copies = 0;
  const { bridge } = loadBridge({}, {}, async includeNetwork => {
    assert.equal(includeNetwork, false);
    copies += 1;
  });
  const injected = [];
  const ref = { current: { injectJavaScript: script => injected.push(script) } };
  await register(bridge, ref, capabilityA);
  const message = capability => JSON.stringify({ type: 'CASTSHIM_COPY_DIAGNOSTICS', id: 'copy', capability });
  await bridge.handleBridgeMessage(message(capabilityA), ref, untrustedContext);
  await bridge.handleBridgeMessage(message(capabilityB), ref, trustedContext);
  assert.equal(copies, 0);
  await bridge.handleBridgeMessage(message(capabilityA), ref, trustedContext);
  assert.equal(copies, 1);
  assert.match(injected.at(-1), /"ok":true/);
});

test('a failed native load retains its actionable code instead of the generic native message', async () => {
  const { bridge } = loadBridge({
    loadCastMedia: async () => { throw { code: 'MOVIX_RELAY_NETWORK_LOST', message: 'Cast indisponible.' }; },
  });
  const injected = [];
  const ref = { current: { injectJavaScript: script => injected.push(script) } };
  await register(bridge, ref, capabilityA);
  await bridge.handleBridgeMessage(JSON.stringify({
    type: 'CASTSHIM_LOAD_MEDIA', id: 'load', capability: capabilityA,
    source: { url: 'https://cdn.example/video.m3u8', headers: {}, protocolVersion: 1 },
    metadata: { title: 'Film', currentTime: 0 },
  }), ref, trustedContext);
  assert.match(injected.at(-1), /MOVIX_RELAY_NETWORK_LOST/);
  assert.ok(!injected.at(-1).includes('Cast indisponible.'));
});

test('status injection requires the active trusted document capability', async () => {
  const { bridge, emitStatus } = loadBridge();
  const injected = [];
  const webViewRef = {
    current: {
      injectJavaScript(script) {
        injected.push(script);
      },
    },
  };
  const status = {
    connected: true,
    state: 'playing',
    positionSec: 1,
    durationSec: 2,
    canSeek: true,
  };

  bridge.startCastShimEventForwarding(webViewRef);
  emitStatus(status);
  assert.equal(injected.length, 0, 'no active capability must block status');

  await register(bridge, webViewRef, capabilityA);
  emitStatus(status);
  assert.equal(injected.length, 1, 'current trusted document receives status');

  bridge.clearBridgeCapabilities(webViewRef);
  emitStatus(status);
  assert.equal(injected.length, 1, 'navigation/unmount invalidation blocks status');

  await register(bridge, webViewRef, capabilityB, untrustedContext);
  emitStatus(status);
  assert.equal(injected.length, 1, 'untrusted document cannot establish a gate');
});

test('an async response cannot cross navigation into a new capability', async () => {
  const support = deferred();
  const { bridge } = loadBridge({
    isCastSupported: () => support.promise,
  });
  const injected = [];
  const webViewRef = {
    current: {
      injectJavaScript(script) {
        injected.push(script);
      },
    },
  };

  await register(bridge, webViewRef, capabilityA);
  const oldResponse = bridge.handleBridgeMessage(
    JSON.stringify({
      type: 'CASTSHIM_INIT',
      id: 'old-document-request',
      capability: capabilityA,
    }),
    webViewRef,
    trustedContext,
  );

  bridge.clearBridgeCapabilities(webViewRef);
  await register(bridge, webViewRef, capabilityB);
  support.resolve(true);
  await oldResponse;

  assert.equal(
    injected.length,
    0,
    'response for the old capability must not enter the new document',
  );
});

test('an async status refresh cannot cross reload into a new capability', async () => {
  const refreshedStatus = deferred();
  const { bridge } = loadBridge({
    getCastStatus: () => refreshedStatus.promise,
  });
  const injected = [];
  const webViewRef = {
    current: {
      injectJavaScript(script) {
        injected.push(script);
      },
    },
  };

  await register(bridge, webViewRef, capabilityA);
  const refresh = bridge.refreshCastShimStatus(webViewRef);
  bridge.clearBridgeCapabilities(webViewRef);
  await register(bridge, webViewRef, capabilityB);
  refreshedStatus.resolve({
    connected: true,
    state: 'playing',
    positionSec: 1,
    durationSec: 2,
    canSeek: true,
  });
  await refresh;

  assert.equal(
    injected.length,
    0,
    'refresh started by the old document must not enter the new document',
  );
});

test('resolves an authenticated loopback media URL before native Cast loading', async () => {
  const loaded = [];
  const resolved = [];
  const localUrl =
    'http://127.0.0.1:36375/p/process-token/session-token/resource-token';
  const { bridge } = loadBridge(
    {
      loadCastMedia: async source => loaded.push(source),
    },
    {
      MediaProxy: {
        resolveForCast: async url => {
          resolved.push(url);
          return {
            url: 'https://cdn.example/master.m3u8',
            headers: { Referer: 'https://player.example/' },
            protocolVersion: 1,
          };
        },
      },
    },
  );
  const webViewRef = {
    current: { injectJavaScript() {} },
  };
  await register(bridge, webViewRef, capabilityA);

  await bridge.handleBridgeMessage(
    JSON.stringify({
      type: 'CASTSHIM_LOAD_MEDIA',
      id: 'loopback-load',
      capability: capabilityA,
      source: {
        url: localUrl,
        headers: {},
        contentType: 'application/vnd.apple.mpegurl',
        protocolVersion: 1,
      },
      metadata: { title: 'Film', currentTime: 12 },
    }),
    webViewRef,
    trustedContext,
  );

  assert.deepEqual(resolved, [localUrl]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded)), [{
    url: 'https://cdn.example/master.m3u8',
    headers: { Referer: 'https://player.example/' },
    contentType: 'application/vnd.apple.mpegurl',
    protocolVersion: 1,
  }]);
});

test('preserves bounded inline WebVTT tracks for the native LAN relay', async () => {
  const loaded = [];
  const { bridge } = loadBridge({
    loadCastMedia: async source => loaded.push(source),
  });
  const webViewRef = { current: { injectJavaScript() {} } };
  await register(bridge, webViewRef, capabilityA);
  const inlineVtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nBonjour\n';

  await bridge.handleBridgeMessage(JSON.stringify({
    type: 'CASTSHIM_LOAD_MEDIA',
    id: 'inline-subtitle-load',
    capability: capabilityA,
    source: {
      url: 'https://cdn.example/master.m3u8',
      headers: {},
      protocolVersion: 1,
      tracks: [{
        inlineVtt,
        contentType: 'text/vtt',
        protocolVersion: 1,
        language: 'fr',
        active: true,
      }],
    },
    metadata: { title: 'Film', currentTime: 0 },
  }), webViewRef, trustedContext);

  assert.equal(loaded[0].tracks[0].inlineVtt, inlineVtt);
  assert.equal('url' in loaded[0].tracks[0], false);
});

function mediaLoad(id, url = 'https://cdn.example/master.m3u8') {
  return JSON.stringify({
    type: 'CASTSHIM_LOAD_MEDIA', id, capability: capabilityA,
    source: { url, headers: {}, protocolVersion: 1 },
    metadata: { title: url, currentTime: 0 },
  });
}

test('stop followed immediately by the same media sends a fresh native load', async () => {
  let loads = 0;
  const { bridge } = loadBridge({ loadCastMedia: async () => { loads++; } });
  const ref = { current: { injectJavaScript() {} } };
  await register(bridge, ref, capabilityA);
  await bridge.handleBridgeMessage(mediaLoad('first'), ref, trustedContext);
  await bridge.handleBridgeMessage(JSON.stringify({ type: 'CASTSHIM_STOP', id: 'stop', capability: capabilityA }), ref, trustedContext);
  await bridge.handleBridgeMessage(mediaLoad('retry'), ref, trustedContext);
  assert.equal(loads, 2);
});

for (const invalidation of ['stop', 'navigation', 'newer load']) {
  test(`late source preparation cannot start casting after ${invalidation}`, { timeout: 2_000 }, async () => {
    const prepared = deferred();
    const started = deferred();
    const loads = [];
    const { bridge } = loadBridge({ loadCastMedia: async source => { loads.push(source.url); } }, {
      MediaProxy: { resolveForCast: async () => { started.resolve(); return prepared.promise; } },
    });
    const ref = { current: { injectJavaScript() {} } };
    await register(bridge, ref, capabilityA);
    const first = bridge.handleBridgeMessage(mediaLoad('old', 'http://127.0.0.1:36375/p/process-token/session-token/resource-token'), ref, trustedContext);
    await started.promise;
    if (invalidation === 'stop') {
      await bridge.handleBridgeMessage(JSON.stringify({ type: 'CASTSHIM_STOP', id: 'stop', capability: capabilityA }), ref, trustedContext);
    } else if (invalidation === 'navigation') {
      bridge.clearBridgeCapabilities(ref);
      await register(bridge, ref, capabilityB);
    } else {
      await bridge.handleBridgeMessage(mediaLoad('new', 'https://cdn.example/new.m3u8'), ref, trustedContext);
    }
    prepared.resolve({ url: 'https://cdn.example/old.m3u8', headers: {}, protocolVersion: 1 });
    await first;
    assert.deepEqual(loads, invalidation === 'newer load' ? ['https://cdn.example/new.m3u8'] : []);
  });
}

test('a terminal receiver status invalidates the successful load cache', async () => {
  let loads = 0;
  const { bridge, emitStatus } = loadBridge({ loadCastMedia: async () => { loads++; } });
  const ref = { current: { injectJavaScript() {} } };
  await register(bridge, ref, capabilityA);
  bridge.startCastShimEventForwarding(ref);
  await bridge.handleBridgeMessage(mediaLoad('first'), ref, trustedContext);
  emitStatus({ connected: false, state: 'error', errorCode: 'MOVIX_RELAY_NETWORK_LOST', positionSec: 0, durationSec: null, canSeek: false });
  await bridge.handleBridgeMessage(mediaLoad('retry'), ref, trustedContext);
  assert.equal(loads, 2);
});

test('receiver-side cancellation permits an immediate retry while still connected', async () => {
  let loads = 0;
  const { bridge, emitStatus } = loadBridge({ loadCastMedia: async () => { loads++; } });
  const ref = { current: { injectJavaScript() {} } };
  await register(bridge, ref, capabilityA);
  bridge.startCastShimEventForwarding(ref);
  await bridge.handleBridgeMessage(mediaLoad('first'), ref, trustedContext);
  emitStatus({ connected: true, state: 'idle', idleReason: 'CANCELLED', positionSec: 0, durationSec: null, canSeek: false });
  await bridge.handleBridgeMessage(mediaLoad('retry'), ref, trustedContext);
  assert.equal(loads, 2);
});

test('remote command failure keeps the native SDK cause in copied diagnostics', async () => {
  diagnosticReport.clearCastDiagnostics();
  const { bridge } = loadBridge({
    playCast: async () => { throw { code: 'MOVIX_CAST_PLAY_FAILED', userInfo: { nativeErrorCode: 'GCK_STATUS_2100' } }; },
  });
  const ref = { current: { injectJavaScript() {} } };
  await register(bridge, ref, capabilityA);
  await bridge.handleBridgeMessage(JSON.stringify({ type: 'CASTSHIM_PLAY', id: 'play', capability: capabilityA }), ref, trustedContext);
  assert.match(diagnosticReport.getCastDiagnostics().join('\n'), /MOVIX_CAST_PLAY_FAILED native=GCK_STATUS_2100/);
});
