import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

async function importTypeScript(relativePath) {
  const source = await text(relativePath);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('frontend TV runtime remains explicit and does not impersonate VIP', async () => {
  const originalWindow = globalThis.window;
  try {
    const { isMovixTvRuntime } = await importTypeScript('../src/utils/tvRuntime.ts');

    delete globalThis.window;
    assert.equal(isMovixTvRuntime(), false);

    globalThis.window = { MOVIX_TV: false };
    assert.equal(isMovixTvRuntime(), false);

    globalThis.window = { MOVIX_TV: true };
    assert.equal(isMovixTvRuntime(), true);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('generic playback advertising is disabled on every device without granting VIP', async () => {
  const context = await text('../src/context/AdFreePopupContext.tsx');
  const block = context.match(
    /const showPopupForPlayer = useCallback\(\([^)]*\) => \{([\s\S]{0,900}?)\n\s*\}, \[\]\);/,
  )?.[1] || '';

  assert.match(block, /setShowAdFreePopup\(false\)/);
  assert.match(block, /setShouldLoadIframe\(true\)/);
  assert.match(block, /setPlayerToShow\(null\)/);
  assert.doesNotMatch(block, /setIsVip|localStorage|loadAdScript|window\.open/);
  assert.doesNotMatch(context, /getAdPopupMode|subscribeToAdPopupModeChanges|SCRIPT_AD_MODE_ENABLED|loadAdScript/);
});

test('Live TV playback opens directly without ad credits on every device', async () => {
  const liveTv = await text('../src/pages/LiveTV.tsx');
  const branch = liveTv.match(
    /const handleChannelClick = useCallback\(\(channel: Channel\) => \{([\s\S]{0,500}?)\n\s*\}, \[openPlayer\]\);/,
  )?.[1] || '';

  assert.match(branch, /openPlayer\(channel\)/);
  assert.match(branch, /isPlayableEventChannel/);
  assert.doesNotMatch(branch, /livetv_ad_credits|sessionStorage|openAd|isMovixTvRuntime|isVip/);
  assert.doesNotMatch(liveTv, /livetv_ad_credits|AdFreePlayerAds/);
});

test('SwiftFlux advertising is disabled globally while Turnstile stays mandatory', async () => {
  const gate = await text('../src/components/SwiftfluxGate.tsx');

  assert.match(gate, /const skipAd = true;/);
  assert.match(gate, /useState<GateStep>\('verify'\)/);
  assert.match(gate, /<TurnstileWidget/);
  assert.match(gate, /forceChallenge/);
  assert.doesNotMatch(gate, /window\.open\(SWIFTFLUX_AD_URL/);
});
