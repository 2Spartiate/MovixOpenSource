import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('MOVIX brand is inert while handheld Telegram chrome is removed only by the TV override', async () => {
  const header = await text('../src/components/Header.tsx');
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(
    header,
    /<div[\s\S]{0,220}data-tv-ignore-focus[\s\S]{0,160}data-tv-header-logo/,
  );
  assert.match(header, />MOVIX<\/span>/);
  assert.doesNotMatch(
    header,
    /<Link[\s\S]{0,220}data-tv-header-logo/,
  );

  // Preserve the current handheld source. Google TV removes this action from
  // the live remote DOM instead of deleting a phone feature from shared code.
  assert.match(header, /data-tv-header-telegram/);
  assert.match(header, /https:\/\/t\.me\/movix_site/);
  assert.match(overrides, /const removeTelegramUi = \(\) =>/);
  assert.match(overrides, /a\[href\*="t\.me\/movix_site"\]/);

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
