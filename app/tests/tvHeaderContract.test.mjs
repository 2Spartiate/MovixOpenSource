import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('TV header contracts use stable semantic markers', async () => {
  const header = await text('../src/components/Header.tsx');
  assert.match(header, /to="\/"[\s\S]{0,120}data-tv-ignore-focus[\s\S]{0,120}data-tv-header-logo/);
  assert.match(header, /href="https:\/\/t\.me\/movix_site"[\s\S]{0,160}data-tv-ignore-focus[\s\S]{0,160}data-tv-header-telegram/);
  assert.match(header, /ref=\{searchInputRef\}[\s\S]{0,120}data-tv-primary-focus="search"[\s\S]{0,120}type="text"/);
});

test('profile/account trigger is a native focusable button', async () => {
  const profile = await text('../src/components/ProfileMenu.tsx');
  assert.match(profile, /<motion\.button[\s\S]{0,220}data-tv-primary-focus="account"/);
  assert.match(profile, /aria-haspopup="menu"/);
  assert.match(profile, /aria-expanded=\{isOpen\}/);
  assert.doesNotMatch(
    profile,
    /<motion\.div[\s\S]{0,220}data-tv-primary-focus="account"/,
  );
});
