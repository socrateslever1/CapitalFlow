import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  computePullDistance,
  DEFAULT_MAX_PULL_PX,
  DEFAULT_PULL_THRESHOLD_PX,
  hasOpenModalDialog,
  hasScrollableAncestorWithOffset,
  isInteractivePullBlockTarget,
  isPullReady,
  PULL_ACTIVATION_DEADZONE_PX,
  shouldStartPullToRefresh,
} from '../utils/pullToRefreshGuard';

interface UsePullToRefreshOptions {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  onRefresh?: () => Promise<void> | void;
  enabled?: boolean;
  thresholdPx?: number;
  maxPullPx?: number;
}

interface UsePullToRefreshResult {
  pullDistance: number;
  isRefreshing: boolean;
  isReady: boolean;
}

const MIN_REFRESH_FEEDBACK_MS = 350;

export function usePullToRefresh({
  scrollContainerRef,
  onRefresh,
  enabled = true,
  thresholdPx = DEFAULT_PULL_THRESHOLD_PX,
  maxPullPx = DEFAULT_MAX_PULL_PX,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const isRefreshingRef = useRef(false);
  isRefreshingRef.current = isRefreshing;

  const pullDistanceRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !enabled || !onRefreshRef.current) {
      pullDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }

    let tracking = false;
    let engaged = false;
    let startX = 0;
    let startY = 0;

    const resetGesture = () => {
      tracking = false;
      engaged = false;
      pullDistanceRef.current = 0;
      if (mountedRef.current) {
        setPullDistance(0);
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      const canStart = shouldStartPullToRefresh({
        enabled,
        isRefreshing: isRefreshingRef.current,
        scrollTop: container.scrollTop,
        touchCount: event.touches.length,
        hasOpenDialog: hasOpenModalDialog(),
        insideNoPullZone: isInteractivePullBlockTarget(event.target),
        hasScrolledAncestor: hasScrollableAncestorWithOffset(event.target, container),
      });

      if (!canStart) {
        tracking = false;
        engaged = false;
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      tracking = true;
      engaged = false;
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!tracking || isRefreshingRef.current) return;
      if (event.touches.length !== 1 || container.scrollTop > 1 || hasOpenModalDialog()) {
        resetGesture();
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!engaged) {
        if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
          resetGesture();
          return;
        }
        if (deltaY < PULL_ACTIVATION_DEADZONE_PX) {
          return;
        }
        engaged = true;
      }

      if (deltaY <= PULL_ACTIVATION_DEADZONE_PX) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      const nextDistance = computePullDistance(deltaY - PULL_ACTIVATION_DEADZONE_PX, maxPullPx);
      if (nextDistance > 0 && event.cancelable) {
        event.preventDefault();
      }

      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);
    };

    const handleTouchEnd = async () => {
      if (!tracking) return;
      const finalDistance = pullDistanceRef.current;
      tracking = false;
      engaged = false;

      if (!isPullReady(finalDistance, thresholdPx) || !onRefreshRef.current || isRefreshingRef.current) {
        pullDistanceRef.current = 0;
        if (mountedRef.current) setPullDistance(0);
        return;
      }

      isRefreshingRef.current = true;
      pullDistanceRef.current = 48;
      if (mountedRef.current) {
        setIsRefreshing(true);
        setPullDistance(48);
      }

      const startedAt = Date.now();
      try {
        await onRefreshRef.current();
      } finally {
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_REFRESH_FEEDBACK_MS) {
          await new Promise((resolve) => window.setTimeout(resolve, MIN_REFRESH_FEEDBACK_MS - elapsed));
        }
        isRefreshingRef.current = false;
        pullDistanceRef.current = 0;
        if (mountedRef.current) {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', resetGesture, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', resetGesture);
    };
  }, [enabled, maxPullPx, scrollContainerRef, thresholdPx]);

  return {
    pullDistance,
    isRefreshing,
    isReady: isPullReady(pullDistance, thresholdPx),
  };
}
