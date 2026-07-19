import React from 'react';

const TOP_GUARD_PX = 88;
const BOTTOM_GUARD_PX = 96;

export function useStableExpandedCardFocus<T extends HTMLElement>(
  isExpanded: boolean,
  focusKey?: unknown
) {
  const ref = React.useRef<T>(null);
  const collapseAnchorTopRef = React.useRef<number | null>(null);

  const focusCard = React.useCallback((
    behavior: ScrollBehavior = 'smooth',
    forceTopAlignment = false
  ) => {
    const element = ref.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const bottomLimit = window.innerHeight - BOTTOM_GUARD_PX;
    const topIsVisible = rect.top >= TOP_GUARD_PX && rect.top <= bottomLimit;

    if (forceTopAlignment) {
      element.scrollIntoView({
        behavior,
        block: 'start',
        inline: 'nearest',
      });
      return;
    }

    if (topIsVisible) return;

    element.scrollIntoView({
      behavior,
      block: rect.top < TOP_GUARD_PX ? 'start' : 'nearest',
      inline: 'nearest',
    });
  }, []);

  const prepareForCollapse = React.useCallback(() => {
    const element = ref.current;
    if (!element) return;
    collapseAnchorTopRef.current = element.getBoundingClientRect().top;
  }, []);

  const restoreCollapsedPosition = React.useCallback(() => {
    const element = ref.current;
    const anchorTop = collapseAnchorTopRef.current;
    if (!element || anchorTop === null) return;

    const currentTop = element.getBoundingClientRect().top;
    const delta = currentTop - anchorTop;
    if (Math.abs(delta) > 1) {
      window.scrollBy({ top: delta, behavior: 'auto' });
    }
  }, []);

  React.useEffect(() => {
    if (!isExpanded) return;

    const frameId = window.requestAnimationFrame(() => focusCard('smooth', true));
    const timeoutId = window.setTimeout(() => focusCard('auto', true), 320);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [isExpanded, focusKey, focusCard]);

  React.useLayoutEffect(() => {
    if (isExpanded || collapseAnchorTopRef.current === null) return;

    const frameId = window.requestAnimationFrame(restoreCollapsedPosition);
    const transitionId = window.setTimeout(restoreCollapsedPosition, 340);
    const cleanupId = window.setTimeout(() => {
      collapseAnchorTopRef.current = null;
      focusCard('auto');
    }, 380);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(transitionId);
      window.clearTimeout(cleanupId);
    };
  }, [isExpanded, focusCard, restoreCollapsedPosition]);

  return { ref, focusCard, prepareForCollapse };
}
