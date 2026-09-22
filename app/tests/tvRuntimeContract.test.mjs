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

test('TV runtime policy accepts Android TV from Platform.isTV or uiMode', async () => {
  const { resolveAndroidTvRuntime } = await importTypeScript(
    'src/platform/tvRuntimePolicy.ts',
  );

  assert.equal(resolveAndroidTvRuntime('android', true), true);
  assert.equal(resolveAndroidTvRuntime('android', false, 'tv'), true);
  assert.equal(resolveAndroidTvRuntime('android', false, 'TV'), true);
  assert.equal(resolveAndroidTvRuntime('android', false, 'normal'), false);
  assert.equal(resolveAndroidTvRuntime('ios', true, 'tv'), false);
  assert.equal(resolveAndroidTvRuntime('ios', false, 'tv'), false);
});

test('TV runtime wrapper uses native Android TV signals without screen heuristics', async () => {
  const source = await text('src/platform/tvRuntime.ts');

  assert.match(source, /Platform\.OS/);
  assert.match(source, /Platform\.isTV/);
  assert.match(source, /Platform\.constants/);
  assert.match(source, /uiMode/);
  assert.doesNotMatch(source, /Dimensions|screenWidth|innerWidth|userAgent|PixelRatio/);
});

test('BrowserScreen explicitly propagates isTV to WebViewBrowser', async () => {
  const [browser, webView] = await Promise.all([
    text('src/screens/BrowserScreen.tsx'),
    text('src/components/WebViewBrowser.tsx'),
  ]);

  assert.match(browser, /const isTV = useMemo\(\(\) => isAndroidTvRuntime\(\), \[\]\)/);
  assert.match(browser, /<WebViewBrowser[\s\S]*?isTV=\{isTV\}/);
  assert.match(webView, /interface WebViewBrowserProps \{[\s\S]*?isTV: boolean;/);
});
