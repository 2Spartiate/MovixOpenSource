import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vipSourceUrl = new URL('../../src/utils/vipUtils.ts', import.meta.url);

async function source() {
  return readFile(vipSourceUrl, 'utf8');
}

test('client VIP state performs no server revalidation or timer-based revocation', async () => {
  const vip = await source();

  assert.doesNotMatch(vip, /\/api\/check-vip/);
  assert.doesNotMatch(vip, /fetch\s*\(/);
  assert.doesNotMatch(vip, /setInterval\s*\(/);
  assert.match(vip, /localStorage\.getItem\('is_vip'\) === 'true'/);
});

test('server authorization header still requires a stored access code', async () => {
  const vip = await source();

  assert.match(vip, /localStorage\.getItem\('access_code'\)/);
  assert.match(vip, /'x-access-key': accessKey/);
  assert.doesNotMatch(vip, /localStorage\.setItem\('access_code'/);
});
