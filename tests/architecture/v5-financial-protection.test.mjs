import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const protectedPaths = [
  /^supabase\/migrations\//,
  /^supabase\/functions\/.*(?:payment|checkout|webhook|charge|collection|pix|asaas|infinitepay|mp-)/i,
  /^domain\/finance\//,
  /^services\/payments\//,
  /^features\/agreements\/domain\//,
  /^features\/agreements\/services\//,
  /^tests\/financial\//,
];

const base = process.env.V5_BASE_REF || 'origin/main';
function filesChanged() {
  return execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRT', `${base}...HEAD`], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim().split(/\r?\n/).filter(Boolean);
}
test('V5 audit PR must not modify protected financial code, tests or migrations', () => {
  const changed = filesChanged();
  const violations = changed.filter(file => protectedPaths.some(pattern => pattern.test(file)));
  assert.deepEqual(violations, [], `Protected files modified: ${violations.join(', ')}`);
});
