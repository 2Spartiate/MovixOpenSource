import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const bytes = path => readFile(new URL(path, root));

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(buffer).digest('hex');
}

test('final validated Movix logo and adaptive launcher assets remain byte-for-byte frozen', async () => {
  const expected = new Map([
    ['../public/movix-logo.png', '1e8ca691939ff7de2d8cc588e1b436fa7724ae6f'],
    ['android/app/src/main/res/drawable-nodpi/ic_launcher_background.png', '4016824cb5ae09766f9a500bc3ff89a22ea73b3d'],
    ['android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png', '45194593aecaf9fd9275e4e1b348bc5899088b95'],
    ['android/app/src/main/res/drawable-nodpi/ic_launcher_monochrome.png', '45715a99f19565d7f192e076b26e502fd69b0aa1'],
    ['android/app/src/main/res/drawable/ic_launcher_foreground_scaled.xml', '3de60a17abf148db68b07d291310dc1b695a710e'],
    ['android/app/src/main/res/drawable/ic_launcher_monochrome_scaled.xml', 'b430661a1a26a965efb34de2bd97cb2235d1012e'],
    ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', '24f928dc5d8947b7159b7b9a39f27c244e064eec'],
    ['android/app/src/main/res/mipmap-anydpi-v33/ic_launcher.xml', '02082c28552d03b7485a9fbb94ec6df06b26ca98'],
    ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', '24f928dc5d8947b7159b7b9a39f27c244e064eec'],
    ['android/app/src/main/res/mipmap-anydpi-v33/ic_launcher_round.xml', '02082c28552d03b7485a9fbb94ec6df06b26ca98'],
    ['src/screens/UpdateScreen.tsx', 'c7b3e51e3bb5450babf91c0b64a781a411ee1bbe'],
    ['../src/components/Header.tsx', '2df183bb65f92ffa1bbb31023267363fc5a1bb69'],
  ]);

  for (const [path, sha] of expected) {
    assert.equal(gitBlobSha(await bytes(path)), sha, path);
  }
});


test('rounded and standard adaptive launchers share the validated 20dp safe-zone', async () => {
  const foreground = (await bytes('android/app/src/main/res/drawable/ic_launcher_foreground_scaled.xml')).toString('utf8');
  const launcher = (await bytes('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml')).toString('utf8');
  const round = (await bytes('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml')).toString('utf8');

  for (const edge of ['left', 'top', 'right', 'bottom']) {
    assert.match(foreground, new RegExp(`android:${edge}="20dp"`));
  }
  assert.match(launcher, /@drawable\/ic_launcher_foreground_scaled/);
  assert.match(round, /@drawable\/ic_launcher_foreground_scaled/);
});


test('TV launcher uses a dedicated adaptive icon with an intentionally smaller 40dp A/B foreground', async () => {
  const [manifest, tvForeground, tv26, tv33, phoneForeground] = await Promise.all([
    bytes('android/app/src/main/AndroidManifest.xml').then(buffer => buffer.toString('utf8')),
    bytes('android/app/src/main/res/drawable/ic_launcher_tv_foreground_scaled.xml').then(buffer => buffer.toString('utf8')),
    bytes('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_tv.xml').then(buffer => buffer.toString('utf8')),
    bytes('android/app/src/main/res/mipmap-anydpi-v33/ic_launcher_tv.xml').then(buffer => buffer.toString('utf8')),
    bytes('android/app/src/main/res/drawable/ic_launcher_foreground_scaled.xml').then(buffer => buffer.toString('utf8')),
  ]);

  // Phone keeps its previously validated 20dp framing.
  for (const edge of ['left', 'top', 'right', 'bottom']) {
    assert.match(phoneForeground, new RegExp(`android:${edge}="20dp"`));
    assert.match(tvForeground, new RegExp(`android:${edge}="40dp"`));
  }

  assert.match(tv26, /@drawable\/ic_launcher_tv_foreground_scaled/);
  assert.match(tv33, /@drawable\/ic_launcher_tv_foreground_scaled/);

  // MainActivity remains the handheld LAUNCHER; TV uses a dedicated alias/icon.
  assert.match(manifest, /<activity-alias[\s\S]*android:name="\.TvLauncherAlias"[\s\S]*android:icon="@mipmap\/ic_launcher_tv"[\s\S]*android\.intent\.category\.LEANBACK_LAUNCHER/);
  const mainActivityBlock = manifest.match(/<activity\s+[\s\S]*?android:name="\.MainActivity"[\s\S]*?<\/activity>/)?.[0] || '';
  assert.match(mainActivityBlock, /android\.intent\.category\.LAUNCHER/);
  assert.doesNotMatch(mainActivityBlock, /android\.intent\.category\.LEANBACK_LAUNCHER/);
});
