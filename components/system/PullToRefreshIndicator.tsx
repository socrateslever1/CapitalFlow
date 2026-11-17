import React from 'react';
import { ArrowDown, Loader2, RefreshCw } from 'lucide-react';
import { DEFAULT_PULL_THRESHOLD_PX } from '../../utils/pullToRefreshGuard';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  isReady: boolean;
}

export const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  pullDistance,
  isRefreshing,
  isReady,
}) => {
  const visible = isRefreshing || pullDistance > 4;
  if (!visible) return null;

  const progress = Math.min(1, pullDistance / DEFAULT_PULL_THRESHOLD_PX);
  const translateY = isRefreshing ? 12 : Math.max(-24, Math.min(20, pullDistance * 0.38 - 18));
  const rotationDeg = Math.round(progress * 180);

  return (
    <div
      className="sticky top-0 z-30 h-0 overflow-visible pointer-events-none flex justify-center"
      aria-live={isRefreshing ? 'polite' : undefined}
      role={isRefreshing ? 'status' : undefined}
    >
      <div
        className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-xl backdrop-blur-md transition-[opacity,border-color,background-color,color] duration-150 ${
          isRefreshing
            ? 'border-blue-500/40 bg-slate-900/95 text-blue-200'
            : isReady
              ? 'border-emerald-500/40 bg-slate-900/95 text-emerald-300'
              : 'border-slate-700/80 bg-slate-900/90 text-slate-300'
        }`}
        style={{
          transform: `translate3d(0, ${translateY}px, 0)`,
          opacity: isRefreshing ? 1 : Math.min(1, 0.35 + progress * 0.65),
        }}
      >
        {isRefreshing ? (
          <Loader2 size={14} className="animate-spin text-blue-400" aria-hidden="true" />
        ) : isReady ? (
          <RefreshCw size={14} className="text-emerald-400" aria-hidden="true" />
        ) : (
          <ArrowDown
            size={14}
            className="text-slate-300 transition-transform duration-100"
            style={{ transform: `rotate(${rotationDeg}deg)` }}
            aria-hidden="true"
          />
        )}
        <span>
          {isRefreshing ? 'Atualizando...' : isReady ? 'Solte para atualizar' : 'Puxe para atualizar'}
        </span>
      </div>
    </div>
  );
};
