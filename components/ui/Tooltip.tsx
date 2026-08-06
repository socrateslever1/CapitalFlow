import React from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
}

type TooltipCoordinates = {
  left: number;
  top: number;
};

const LONG_PRESS_DELAY_MS = 450;

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top' }) => {
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = React.useRef<number | null>(null);
  const [visible, setVisible] = React.useState(false);
  const [coordinates, setCoordinates] = React.useState<TooltipCoordinates | null>(null);

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const updatePosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    setCoordinates({
      left: rect.left + rect.width / 2,
      top: position === 'top' ? rect.top - 8 : rect.bottom + 8,
    });
  }, [position]);

  const showTooltip = React.useCallback(() => {
    updatePosition();
    setVisible(true);
  }, [updatePosition]);

  const hideTooltip = React.useCallback(() => {
    clearLongPressTimer();
    setVisible(false);
  }, [clearLongPressTimer]);

  const startLongPress = React.useCallback(() => {
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      showTooltip();
      longPressTimerRef.current = null;
    }, LONG_PRESS_DELAY_MS);
  }, [clearLongPressTimer, showTooltip]);

  React.useEffect(() => {
    if (!visible) return;

    const reposition = () => updatePosition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [visible, updatePosition]);

  React.useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  const tooltip = visible && coordinates && typeof document !== 'undefined'
    ? createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[9999] whitespace-nowrap"
          style={{
            left: coordinates.left,
            top: coordinates.top,
            transform: position === 'top'
              ? 'translate(-50%, -100%)'
              : 'translate(-50%, 0)',
          }}
        >
          <span className="relative block rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-100 shadow-2xl">
            {content}
            <span
              className={`absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 border-slate-700 bg-slate-950 ${
                position === 'top'
                  ? 'bottom-[-4px] border-b border-r'
                  : 'top-[-4px] border-l border-t'
              }`}
            />
          </span>
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      ref={anchorRef}
      className="inline-flex items-center justify-center"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocusCapture={showTooltip}
      onBlurCapture={hideTooltip}
      onTouchStart={startLongPress}
      onTouchEnd={hideTooltip}
      onTouchCancel={hideTooltip}
      onPointerDown={(event) => {
        if (event.pointerType === 'touch') startLongPress();
      }}
      onPointerUp={(event) => {
        if (event.pointerType === 'touch') hideTooltip();
      }}
      onPointerCancel={(event) => {
        if (event.pointerType === 'touch') hideTooltip();
      }}
    >
      {children}
      {tooltip}
    </div>
  );
};
