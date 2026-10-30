import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

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
