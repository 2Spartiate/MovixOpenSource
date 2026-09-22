import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../.github/workflows/android-tv-foundations.yml', import.meta.url);

test('Android workflow deletes older Movix APK/AAB artifacts before uploading a new build', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /actions:\s*write/);
  assert.match(workflow, /Delete previous Movix Android APK\/AAB artifacts/);
  assert.match(workflow, /actions\/artifacts\?per_page=100&page=/);
  assert.match(workflow, /test\("\(\^\|\[-_\]\)\(apk\|aab\)\(\[-_\]\|\$\)"; "i"\)/);
  assert.match(workflow, /\.workflow_run\.id != \$current_run/);
  assert.match(workflow, /gh api --method DELETE/);

  const cleanupIndex = workflow.indexOf('Delete previous Movix Android APK/AAB artifacts');
  const uploadIndex = workflow.indexOf('Upload Google TV standalone APK');
  assert.ok(cleanupIndex >= 0 && uploadIndex > cleanupIndex);
});
