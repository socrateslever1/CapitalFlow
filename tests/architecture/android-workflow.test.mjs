import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const yaml = readFileSync('.github/workflows/android-apk.yml', 'utf8');
test('android workflow contains clean, independent build, verification and upload steps', () => {
  const names = [...yaml.matchAll(/^      - name: ([^\n]+)/gm)].map(m => m[1]);
  for (const step of [
    'Install locked dependencies',
    'Validate architecture and financial invariants',
    'Assemble Android debug APK',
    'Validate APK structure, signature and SHA-256',
    'Publish verified APK and checksum',
  ]) assert.equal(names.filter(name => name === step).length, 1, step);
  const verifyPos = yaml.indexOf('      - name: Validate APK structure');
  const uploadPos = yaml.indexOf('      - name: Publish verified APK');
  assert(verifyPos > 0 && uploadPos > verifyPos, 'artifact publication must follow verification');
  const verifyBlock = yaml.slice(verifyPos, uploadPos);
  assert(verifyBlock.includes('"$signer" verify "$apk"'), 'debug APK must have a valid Android signature');
  assert(verifyBlock.includes('sha256sum "$apk"'), 'debug APK must have SHA-256 checksum');
  assert(!verifyBlock.includes('actions/upload-artifact@'), 'YAML verification block contains upload code');
  assert(yaml.includes('npm ci --no-audit --no-fund'), 'locked dependency installation required');
  assert(!yaml.includes('service_role') && !yaml.includes('sb_secret_'), 'private credentials prohibited');
});
