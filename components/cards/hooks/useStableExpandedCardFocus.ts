import React from 'react';

const TOP_GUARD_PX = 88;
const BOTTOM_GUARD_PX = 96;

export function useStableExpandedCardFocus<T extends HTMLElement>(
  isExpanded: boolean,
  focusKey?: unknown
) {
  const ref = React.useRef<T>(null);

  const focusCard = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = ref.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const bottomLimit = window.innerHeight - BOTTOM_GUARD_PX;
    const topIsVisible = rect.top >= TOP_GUARD_PX && rect.top <= bottomLimit;

    if (topIsVisible) return;

    element.scrollIntoView({
      behavior,
      block: rect.top < TOP_GUARD_PX ? 'start' : 'nearest',
      inline: 'nearest',
    });
  }, []);

  React.useEffect(() => {
    if (!isExpanded) return;

    const frameId = window.requestAnimationFrame(() => focusCard());
    const timeoutId = window.setTimeout(() => focusCard('auto'), 180);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [isExpanded, focusKey, focusCard]);

  return { ref, focusCard };
}
