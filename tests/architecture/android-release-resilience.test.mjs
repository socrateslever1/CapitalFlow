import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { lookupRelease, compareReleaseIdentity, qualityRunState } from '../../scripts/android/release-safety.mjs';

const fingerprint = 'a'.repeat(64);
const digest = 'b'.repeat(64);
const release = { packageName: 'com.socrateslever.capitalflow', certificate: fingerprint, versionCode: 100100, sha256: digest };

test('release lookup distinguishes a confirmed 404 from API failures', () => {
  const execute = (status, body, exitCode = 0) => () => ({ status: exitCode, stdout: `HTTP/2.0 ${status}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(body)}` });
  const metadata = { id: 1, assets: [{ name: 'CapitalFlow-Android.apk' }] };
  assert.deepEqual(lookupRelease('owner/repo', 'android-signed-beta', execute(200, metadata)), metadata);
  assert.equal(lookupRelease('owner/repo', 'android-signed-beta', execute(404, { message: 'Not Found' }, 1)), null);
  for (const status of [401, 403, 429, 500, 503]) {
    assert.throws(() => lookupRelease('owner/repo', 'tag', execute(status, { message: 'failure' }, 1)), /consultar/i);
  }
  assert.throws(() => lookupRelease('owner/repo', 'tag', () => ({ status: 1, stdout: '', error: new Error('network') })), /consultar/i);
  assert.throws(() => lookupRelease('owner/repo', 'tag', execute(200, {})), /resposta/i);
});

test('publication accepts an upgrade and recovers only the exact same signed bytes', () => {
  assert.equal(compareReleaseIdentity({ ...release, versionCode: 100101, sha256: 'c'.repeat(64) }, release), 'upgrade');
  assert.equal(compareReleaseIdentity(release, { ...release }), 'identical');
  assert.throws(() => compareReleaseIdentity({ ...release, versionCode: 100099 }, release), /versionCode/i);
  assert.throws(() => compareReleaseIdentity({ ...release, certificate: 'c'.repeat(64) }, release), /certificado/i);
  assert.throws(() => compareReleaseIdentity({ ...release, packageName: 'different.package' }, release), /pacote/i);
  assert.throws(() => compareReleaseIdentity({ ...release, sha256: 'c'.repeat(64) }, release), /bytes/i);
  assert.throws(() => compareReleaseIdentity({ ...release, versionCode: NaN }, release), /versionCode/i);
  assert.throws(() => compareReleaseIdentity({ ...release, certificate: '' }, release), /certificado/i);
});

test('publication requires the latest complete Quality Gates run for its exact commit', () => {
  const sha = '1'.repeat(40);
  const green = { databaseId: 10, headSha: sha, status: 'completed', conclusion: 'success' };
  assert.equal(qualityRunState([green], sha), 'success');
  assert.equal(qualityRunState([{ ...green, headSha: '2'.repeat(40) }], sha), 'pending');
  assert.equal(qualityRunState([green, { ...green, databaseId: 11, status: 'in_progress', conclusion: '' }], sha), 'pending');
  assert.throws(() => qualityRunState([green, { ...green, databaseId: 11, conclusion: 'failure' }], sha), /Quality Gates/i);
  assert.throws(() => qualityRunState([{ ...green, conclusion: 'cancelled' }], sha), /Quality Gates/i);
});

test('Android signed release tolerates transient GitHub errors but refuses mismatched assets',()=>{
  const flow=readFileSync('.github/workflows/android-apk.yml','utf8');
  assert(flow.includes('for attempt in 1 2 3 4 5; do'));
  assert(flow.includes('gh release upload "$tag"'));
  assert(flow.includes('--clobber'));
  assert(flow.includes('gh release download "$tag"'));
  assert(flow.includes('cmp "$checksum" "$verify_dir/CapitalFlow-Android.apk.sha256"'));
  assert(flow.includes('actual_sha'));
  assert(flow.includes('expected_sha'));
  assert(flow.includes('Arquivo publicado difere da release assinada'));
  assert(flow.includes('for tag in android-signed-beta android-preview'));
  assert(flow.includes('gh release edit "$tag"'));
  assert(flow.includes('new_code <= prior_code'));
  assert(flow.includes('new_cert'));
});
