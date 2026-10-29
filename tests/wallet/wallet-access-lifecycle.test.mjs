import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  fs.readFileSync('features/wallet/hooks/useWalletAccess.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

test('wallet defers auth callback requests, coalesces focus checks and cleans up', async () => {
  let callback;
  let cleanup;
  let state;
  let calls = 0;
  let insideAuthCallback = false;
  let resolveUser;
  let unsubscribed = false;
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 0;
  const userResponse = new Promise(resolve => { resolveUser = resolve; });
  const supabase = { auth: {
    getUser() {
      assert.equal(insideAuthCallback, false, 'must not call auth API under auth callback lock');
      calls++;
      return userResponse;
    },
    onAuthStateChange(fn) {
      callback = fn;
      return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } };
    },
  } };
  const modules = {
    react: {
      useState(initial) { state = initial; return [state, value => { state = value; }]; },
      useEffect(fn) { cleanup = fn(); },
    },
    '../../../lib/supabase': { supabase },
    '../services/walletRepository': { walletRepository: {
      async getAccess(userId) {
        assert.equal(userId, 'user-a');
        return { active: true, settings: {} };
      },
    } },
  };
  const exports = {};
  new Function('require', 'exports', 'window', 'setTimeout', 'clearTimeout', compiled)(
    name => modules[name] ?? require(name), exports,
    { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    fn => { timers.set(++nextTimer, fn); return nextTimer; },
    id => timers.delete(id),
  );
  exports.useWalletAccess();
  insideAuthCallback = true;
  callback('INITIAL_SESSION');
  insideAuthCallback = false;
  assert.equal(calls, 1);
  listeners.get('focus')();
  for (const [id, fn] of timers) { timers.delete(id); fn(); }
  assert.equal(calls, 1, 'concurrent checks must share their request');
  resolveUser({ data: { user: { id: 'user-a' } }, error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.status, 'active');
  callback('TOKEN_REFRESHED');
  assert.equal(timers.size, 1);
  cleanup();
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
  assert.equal(unsubscribed, true);
});
