export interface PullStartGuardParams {
  enabled: boolean;
  isRefreshing: boolean;
  scrollTop: number;
  touchCount: number;
  hasOpenDialog: boolean;
  insideNoPullZone: boolean;
  hasScrolledAncestor: boolean;
}

export const DEFAULT_PULL_THRESHOLD_PX = 64;
export const DEFAULT_MAX_PULL_PX = 110;
export const PULL_ACTIVATION_DEADZONE_PX = 8;

/**
 * Applies rubber-band resistance so pulling down feels responsive without
 * letting the indicator travel arbitrarily far down the screen.
 */
export const computePullDistance = (
  deltaY: number,
  maxPullPx: number = DEFAULT_MAX_PULL_PX
): number => {
  if (!Number.isFinite(deltaY) || deltaY <= 0 || maxPullPx <= 0) return 0;
  return Math.round(maxPullPx * (1 - Math.exp(-deltaY / (maxPullPx * 1.6))));
};

export const isPullReady = (
  pullDistance: number,
  thresholdPx: number = DEFAULT_PULL_THRESHOLD_PX
): boolean => Number.isFinite(pullDistance) && pullDistance >= thresholdPx;

export const shouldStartPullToRefresh = (params: PullStartGuardParams): boolean => {
  if (!params.enabled || params.isRefreshing) return false;
  if (params.touchCount !== 1) return false;
  if (params.scrollTop > 1) return false;
  if (params.hasOpenDialog) return false;
  if (params.insideNoPullZone) return false;
  if (params.hasScrolledAncestor) return false;
  return true;
};

export const isInteractivePullBlockTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof Element === 'undefined' || !(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [data-no-pull-refresh="true"]')
  );
};

export const hasOpenModalDialog = (): boolean => {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('[role="dialog"], [data-modal-open="true"]'));
};

export const hasScrollableAncestorWithOffset = (
  target: EventTarget | null,
  stopAt: HTMLElement | null
): boolean => {
  if (!target || typeof Element === 'undefined' || !(target instanceof Element)) {
    return false;
  }

  let current: Element | null = target;
  while (current && current !== stopAt) {
    if (current instanceof HTMLElement && current.scrollTop > 0) {
      const style = typeof window !== 'undefined' ? window.getComputedStyle(current) : null;
      const overflowY = style?.overflowY ?? '';
      if (
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
        current.scrollHeight > current.clientHeight
      ) {
        return true;
      }
    }
    current = current.parentElement;
  }

  return false;
};
