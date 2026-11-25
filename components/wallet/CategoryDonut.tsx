import React from 'react';
import { getWalletCategoryVisual } from '../../features/wallet/domain/walletCategoryVisual';

type Slice = { name: string; amount: number; percentage: number };

/** Rosca de participação por categoria; cores iguais às dos ícones. Somente leitura. */
export const CategoryDonut: React.FC<{ slices: readonly Slice[]; size?: number; center?: React.ReactNode }> = ({
  slices, size = 168, center,
}) => {
  const stroke = Math.round(size * 0.14);
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.amount), 0);
  let offset = 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={'Participação por categoria: ' + slices.map(s => `${s.name} ${s.percentage}%`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(30 41 59)" strokeWidth={stroke} />
        {total > 0 && slices.map(slice => {
          const length = circumference * Math.max(0, slice.amount) / total;
          const gap = slices.length > 1 ? Math.min(2, length / 3) : 0;
          const element = (
            <circle key={slice.name} cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke={getWalletCategoryVisual(slice.name).color} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
              strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          offset += length;
          return element;
        })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
};
