import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (name) => readFile(new URL('../src/injection/' + name, import.meta.url), 'utf8');

test('key 2 resolves semantic account controls before seasonal avatars', async () => {
  const dom = await read('app-site-overrides.ts');
  const remote = await read('tv-dpad-runtime.ts');
  assert.match(dom, /button\[data-tv-primary-focus="account"\]/);
  assert.match(dom, /button\[aria-haspopup="menu"\]/);
  assert.match(dom, /'connexion', 'se connecter', 'login'/);
  assert.match(dom, /markTvShortcutBadge\(account, '2'\)/);
  assert.match(remote, /policy\.targets\(\)/);
  assert.match(remote, /refreshed\.account\.isConnected/);
  assert.match(remote, /key === '2'[\s\S]{0,150}return 'account'/);
  assert.match(remote, /kind === 'search'/);
  assert.match(remote, /kind === 'explore'/);
});

test('Halloween cleanup is TV-only and hides scoped Home rails, never the account control', async () => {
  const src = await read('app-site-overrides.ts');
  assert.match(src, /const suppressTvHalloween = \(\) =>/);
  assert.match(src, /window\.MOVIX_TV !== true\) return/);
  assert.match(src, /window\.location\.pathname !== '\/'\) return/);
  assert.match(src, /home\.querySelectorAll\('\.home-section, \[data-home-section\]'\)/);
  assert.match(src, /title\.includes\('halloween'\)/);
  assert.match(src, /heading\.closest\('\[data-tv-card\]/);
  assert.match(src, /data-tv-seasonal-hidden/);
  assert.match(src, /node\.closest\('\[data-tv-header-shortcut="account"\]'\)/);
  assert.match(src, /suppressTvHalloween\(\)/);
  assert.doesNotMatch(src, /\n    ensureTvHomeLayout\(\);/);
});

test('TV does not detach seasonal React nodes or hide the whole main element', async () => {
  const src = await read('app-site-overrides.ts');
  const section = src.split('const suppressTvHalloween = () => {')[1]
    .split('  const ensureTvHomeLayout')[0];
  assert.match(section, /hideManagedNode\(rail\)/);
  assert.match(section, /hideManagedNode\(section\)/);
  assert.match(section, /section === home/);
  assert.doesNotMatch(section, /\.remove\(\)/);
  assert.doesNotMatch(section, /removeChild/);
});
