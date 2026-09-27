import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('every details and direct watch route passes through the same media gate before its lazy page', async () => {
  const registry = await source('src/routing/registry.tsx');
  const app = await source('src/App.tsx');
  for (const [route, type] of [
    ['/movie/:id', 'movie'], ['/tv/:id', 'tv'], ['/watch/movie/:tmdbid', 'movie'],
    ['/watch/tv/:tmdbid/s/:season/e/:episode', 'tv'],
    ['/watch/anime/:id/season/:season/episode/:episode', 'tv'],
  ]) {
    const line = registry.split('\n').find(value => value.includes(`path: '${route}'`));
    assert.ok(line, `missing route ${route}`);
    assert.ok(line.includes(`parentalMedia: '${type}'`), `unguarded route ${route}`);
  }
  assert.match(app, /<ParentalMediaGate key=\{location\.pathname\} mediaType=\{entry\.parentalMedia\}>\{children\}<\/ParentalMediaGate>/);
  assert.match(app, /<MediaRouteContent entry=\{entry\}>[\s\S]*?<RouteLazyContent/);
  assert.match(app, /path="\/" element=\{<ParentalHome \/>\}/);
});

test('settings section remains outside the signed-in block and is indexed by both navigations', async () => {
  const settings = await source('src/pages/SettingsPage.tsx');
  assert.match(settings, /\{ id: 'privacy'[^\n]+\n\s*\{ id: 'parental'[^\n]+\n\s*\{ id: 'source-priority'/);
  const visible = settings.match(/const visibleSections =[\s\S]*?\}, \[isAuthenticated\]\);/)?.[0];
  assert.ok(visible);
  assert.doesNotMatch(visible, /'parental'/);
  assert.match(settings, /<section id="parental"[^>]*>[\s\S]*?data-settings-search-title/);
  assert.match(settings, /<ParentalSettings active=\{activeSection === 'parental'\}/);
});

test('blocked details never mount their controls, and direct players wait for metadata', async () => {
  const gate = await source('src/components/parental/ParentalMediaGate.tsx');
  const loading = gate.indexOf('if (loading) return');
  const block = gate.indexOf("if (decision.kind === 'profile')");
  const allowed = gate.indexOf("if (decision.kind === 'allowed' || unlocked) return <>{children}</>;");
  const dialog = gate.indexOf('role="dialog"');
  assert.ok(loading > 0 && block > loading && allowed > block && dialog > allowed);
  assert.match(gate, /getParentalMediaMetadata\(mediaType, mediaId\)/);
  assert.match(gate, /aria-modal="true"/);
});
