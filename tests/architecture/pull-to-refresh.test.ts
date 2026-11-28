import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computePullDistance,
  DEFAULT_MAX_PULL_PX,
  DEFAULT_PULL_THRESHOLD_PX,
  isPullReady,
  shouldStartPullToRefresh,
} from '../../utils/pullToRefreshGuard';

test('computePullDistance applies resistance and caps below maxPullPx', () => {
  assert.equal(computePullDistance(0), 0);
  assert.equal(computePullDistance(-25), 0);
  assert.equal(computePullDistance(Number.NaN), 0);

  const shortPull = computePullDistance(40);
  const longPull = computePullDistance(500);
  assert.ok(shortPull > 0 && shortPull < 40);
  assert.ok(longPull > shortPull);
  assert.ok(longPull <= DEFAULT_MAX_PULL_PX);
});

test('isPullReady requires reaching the threshold', () => {
  assert.equal(isPullReady(0), false);
  assert.equal(isPullReady(DEFAULT_PULL_THRESHOLD_PX - 1), false);
  assert.equal(isPullReady(DEFAULT_PULL_THRESHOLD_PX), true);
  assert.equal(isPullReady(DEFAULT_PULL_THRESHOLD_PX + 20), true);
});

test('shouldStartPullToRefresh allows only top-of-scroll single-touch without blockers', () => {
  const nominal = {
    enabled: true,
    isRefreshing: false,
    scrollTop: 0,
    touchCount: 1,
    hasOpenDialog: false,
    insideNoPullZone: false,
    hasScrolledAncestor: false,
  };
  assert.equal(shouldStartPullToRefresh(nominal), true);
  assert.equal(shouldStartPullToRefresh({ ...nominal, scrollTop: 1 }), true);
  assert.equal(shouldStartPullToRefresh({ ...nominal, enabled: false }), false);
  assert.equal(shouldStartPullToRefresh({ ...nominal, isRefreshing: true }), false);
  assert.equal(shouldStartPullToRefresh({ ...nominal, scrollTop: 12 }), false);
  assert.equal(shouldStartPullToRefresh({ ...nominal, touchCount: 2 }), false);
  assert.equal(shouldStartPullToRefresh({ ...nominal, hasOpenDialog: true }), false);
  assert.equal(shouldStartPullToRefresh({ ...nominal, insideNoPullZone: true }), false);
  assert.equal(shouldStartPullToRefresh({ ...nominal, hasScrolledAncestor: true }), false);
});

test('AppShell and App wire pull-to-refresh for authenticated views and wallet', () => {
  const root = process.cwd();
  const appShellSource = fs.readFileSync(path.join(root, 'layout/AppShell.tsx'), 'utf8');
  const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const indicatorSource = fs.readFileSync(path.join(root, 'components/system/PullToRefreshIndicator.tsx'), 'utf8');

  assert.match(appShellSource, /usePullToRefresh/);
  assert.match(appShellSource, /PullToRefreshIndicator/);
  assert.match(appShellSource, /enabled:\s*Boolean\(onRefresh\)\s*&&\s*!activeModal\s*&&\s*!isSupportOpen/);
  assert.match(appSource, /handlePullRefresh/);
  assert.match(appSource, /onRefresh=\{handlePullRefresh\}/);
  assert.match(appSource, /walletRepository\.prefetchFull\(\{\s*force:\s*true\s*\}\)/);
  assert.match(indicatorSource, /Puxe para atualizar/);
  assert.match(indicatorSource, /Solte para atualizar/);
  assert.match(indicatorSource, /Atualizando\.\.\./);
});
