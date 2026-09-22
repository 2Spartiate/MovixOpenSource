import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../.github/workflows/android-tv-foundations.yml', import.meta.url);
const androidBuildArtifactName = /^movix-google-tv-(standalone|debug)-(apk|aab)$/i;

test('Android workflow deletes only older recognized APK/AAB build artifacts', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /actions:\s*write/);
  assert.match(workflow, /Delete previous Movix Android APK\/AAB artifacts/);
  assert.match(workflow, /actions\/artifacts\?per_page=100&page=/);
  assert.ok(
    workflow.includes(
      'test("^movix-google-tv-(standalone|debug)-(apk|aab)$"; "i")',
    ),
  );
  assert.match(workflow, /\.workflow_run\.id != \$current_run/);
  assert.match(workflow, /gh api --method DELETE/);

  const cleanupIndex = workflow.indexOf('Delete previous Movix Android APK/AAB artifacts');
  const uploadIndex = workflow.indexOf('Upload Google TV standalone APK');
  assert.ok(cleanupIndex >= 0 && uploadIndex > cleanupIndex);
});

test('artifact cleanup naming rule rejects APK/AAB substrings in unrelated names', () => {
  for (const name of [
    'movix-google-tv-standalone-apk',
    'movix-google-tv-debug-apk',
    'movix-google-tv-standalone-aab',
    'movix-google-tv-debug-aab',
  ]) {
    assert.equal(androidBuildArtifactName.test(name), true, name);
  }

  for (const name of [
    'movix-apk-report',
    'movix-aab-analysis',
    'movix-google-tv-apk-report',
    'movix-google-tv-aab-metadata',
    'movix-google-tv-standalone-apk-report',
    'movix-google-tv-standalone-aab-checksum',
    'movix-google-tv-standalone-apk.txt',
    'some-apk-random-file',
  ]) {
    assert.equal(androidBuildArtifactName.test(name), false, name);
  }
});
