import React, { useEffect, useRef, useState } from 'react';
import { getWalletCategoryVisual } from '../../features/wallet/domain/walletCategoryVisual';

type Props = {
  category: string;
  /** Participação 0–100 desenhada no anel. Sem valor, mostra só o ícone. */
  percentage?: number | null;
  size?: number;
  className?: string;
};

/** Ícone da categoria com anel medidor da participação no total (somente leitura). */
export const CategoryGaugeIcon: React.FC<Props> = ({ category, percentage, size = 52, className = '' }) => {
  const visual = getWalletCategoryVisual(category);
  const Icon = visual.icon;
  const stroke = Math.max(3, Math.round(size / 15));
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const value = percentage == null || !Number.isFinite(percentage) ? null : Math.min(100, Math.max(0, percentage));
  const hasProgress = value !== null && value > 0;
  const gaugeRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [canObserve] = useState(() => typeof IntersectionObserver !== 'undefined');

  useEffect(() => {
    const gauge = gaugeRef.current;
    if (!hasProgress || !gauge || !canObserve) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35);
    }, { threshold: 0.35 });
    observer.observe(gauge);
    return () => observer.disconnect();
  }, [hasProgress, canObserve]);

  return (
    <span ref={gaugeRef} className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={radius - stroke} fill={visual.background} />
        {value !== null && <>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(51 65 85)" strokeWidth={stroke} />
          {value > 0 && <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={visual.color} strokeWidth={stroke}
            className={visible ? 'cf-category-gauge-progress' : undefined}
            data-cf-gauge-waiting={canObserve && !visible ? 'true' : undefined} strokeLinecap="round"
            style={{ '--cf-gauge-empty': circumference, '--cf-gauge-current': circumference * (1 - value / 100) } as React.CSSProperties}
            strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - value / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
        </>}
      </svg>
      <Icon size={Math.round(size * 0.42)} color={visual.color} strokeWidth={2} className="relative" />
    </span>
  );
};
