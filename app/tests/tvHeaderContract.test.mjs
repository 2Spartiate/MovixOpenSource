import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('final PNG brand stays a phone Home link but TV makes it inert in the live DOM', async () => {
  const [header, overrides] = await Promise.all([
    text('../src/components/Header.tsx'),
    text('src/injection/app-site-overrides.ts'),
  ]);

  assert.match(header, /<Link[\s\S]{0,180}to="\/"[\s\S]{0,180}data-tv-ignore-focus[\s\S]{0,180}data-tv-header-logo/);
  assert.match(header, /src="\/movix-logo\.png"/);
  assert.match(header, /alt="Movix"/);
  assert.match(header, /aria-label="Movix"/);

  assert.match(overrides, /const makeMovixBrandInert = \(\) =>/);
  assert.match(overrides, /header \[data-tv-header-logo\]/);
  assert.match(overrides, /header \[data-movix-app-brand-logo\]/);
  assert.match(overrides, /document\.querySelectorAll\('header img'\)/);
  assert.match(overrides, /imageSignature\.includes\('movix'\)/);
  assert.match(overrides, /element\.removeAttribute\('href'\)/);
  assert.match(overrides, /data-movix-brand-inert/);
  assert.match(overrides, /pointer-events', 'none', 'important'/);
  assert.match(overrides, /data-tv-ignore-focus/);
});

test('header retains stable TV markers for Telegram and primary search focus', async () => {
  const header = await text('../src/components/Header.tsx');

  assert.match(header, /href="https:\/\/t\.me\/movix_site"[\s\S]{0,180}data-tv-ignore-focus[\s\S]{0,180}data-tv-header-telegram/);
  assert.match(header, /ref=\{searchInputRef\}[\s\S]{0,120}data-tv-primary-focus="search"[\s\S]{0,120}type="text"/);
});

test('profile/account trigger is a native focusable button', async () => {
  const profile = await text('../src/components/ProfileMenu.tsx');
  assert.match(profile, /<motion\.button[\s\S]{0,220}data-tv-primary-focus="account"/);
  assert.match(profile, /aria-haspopup="menu"/);
  assert.match(profile, /aria-expanded=\{isOpen\}/);
  assert.doesNotMatch(profile, /<motion\.div[\s\S]{0,220}data-tv-primary-focus="account"/);
});

test('live TV injection discovers header shortcuts even when remote frontend lacks branch markers', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(overrides, /const markTvHeaderShortcutTargets = \(\) =>/);
  assert.match(overrides, /input\[type="search"\], input\[type="text"\]/);
  assert.match(overrides, /\[data-explore-trigger\]/);
  assert.match(overrides, /label\.includes\('profil'\)/);
  assert.match(overrides, /\[class\*="cursor-pointer"\]/);
  assert.match(overrides, /data-tv-header-shortcut', 'account'/);
});
