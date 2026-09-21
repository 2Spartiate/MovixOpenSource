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

test('frontend TV runtime is explicit and does not impersonate VIP', async () => {
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

test('generic preplay gate exits before advertising on television', async () => {
  const context = await text('../src/context/AdFreePopupContext.tsx');

  assert.match(context, /if \(isMovixTvRuntime\(\)\) \{[\s\S]{0,320}setShouldLoadIframe\(true\)[\s\S]{0,200}return;/);
  assert.match(context, /const sync = \(\) => \{\s*if \(isMovixTvRuntime\(\)\) return;/);
  const tvBranch = context.match(/if \(isMovixTvRuntime\(\)\) \{([\s\S]{0,500}?)\n\s*\}/)?.[1] || '';
  assert.doesNotMatch(tvBranch, /setIsVip|localStorage|loadAdScript|showAdFreePopup\(true\)/);
});

test('Live TV opens directly without reading or minting ad credits on television', async () => {
  const liveTv = await text('../src/pages/LiveTV.tsx');
  const branch = liveTv.match(/if \(isMovixTvRuntime\(\)\) \{([\s\S]{0,220}?)\n\s*\}/)?.[1] || '';

  assert.match(branch, /openPlayer\(channel\)/);
  assert.match(branch, /return/);
  assert.doesNotMatch(branch, /livetv_ad_credits|sessionStorage|openAd/);
});

test('SwiftFlux skips only its advertising step on TV and retains verification', async () => {
  const gate = await text('../src/components/SwiftfluxGate.tsx');

  assert.match(gate, /const skipAd = isVip \|\| isMovixTvRuntime\(\) \|\| !SWIFTFLUX_AD_URL/);
  assert.match(gate, /isUserVip\(\) \|\| isMovixTvRuntime\(\) \|\| !SWIFTFLUX_AD_URL \? 'verify' : 'ad'/);
  assert.match(gate, /<TurnstileWidget/);
  assert.match(gate, /window\.open\(SWIFTFLUX_AD_URL, '_blank', 'noopener'\)/);
});
