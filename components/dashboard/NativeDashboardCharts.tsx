import React, { useMemo } from 'react';

type PieDatum = { name: string; value: number; color: string };
type TrendDatum = { name: string; Entradas: number; Saidas: number };

export const NativeDonutChart: React.FC<{ data?: PieDatum[]; height?: number }> = ({ data = [], height = 180 }) => {
  const total = data.reduce((sum, item) => sum + Math.max(0, Number(item.value) || 0), 0) || 1;
  let offset = 0;

  return (
    <div className="flex w-full items-center justify-center gap-4" style={{ minHeight: height }}>
      <svg viewBox="0 0 120 120" className="h-[150px] w-[150px] shrink-0" role="img" aria-label="Saúde da carteira">
        <circle cx="60" cy="60" r="43" fill="none" stroke="#1e293b" strokeWidth="18" />
        {data.map((item) => {
          const value = Math.max(0, Number(item.value) || 0);
          const length = (value / total) * 100;
          const currentOffset = offset;
          offset += length;
          return (
            <circle
              key={item.name}
              cx="60"
              cy="60"
              r="43"
              fill="none"
              stroke={item.color}
              strokeWidth="18"
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-currentOffset}
              pathLength="100"
              transform="rotate(-90 60 60)"
            />
          );
        })}
      </svg>
      <div className="min-w-0 space-y-2">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="truncate">{item.name}</span>
            <span className="text-slate-200">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const toPoints = (data: TrendDatum[], key: 'Entradas' | 'Saidas', maxValue: number) =>
  data.map((item, index) => {
    const x = data.length <= 1 ? 50 : 6 + (index / (data.length - 1)) * 88;
    const y = 82 - ((Math.max(0, Number(item[key]) || 0) / maxValue) * 68);
    return `${x},${y}`;
  }).join(' ');

export const NativeTrendChart: React.FC<{ data?: TrendDatum[]; height?: number }> = ({ data = [], height = 180 }) => {
  const maxValue = useMemo(() => Math.max(1, ...data.flatMap((item) => [Number(item.Entradas) || 0, Number(item.Saidas) || 0])), [data]);
  const incomingPoints = useMemo(() => toPoints(data, 'Entradas', maxValue), [data, maxValue]);
  const outgoingPoints = useMemo(() => toPoints(data, 'Saidas', maxValue), [data, maxValue]);

  return (
    <div className="w-full" style={{ minHeight: height }}>
      <div className="mb-2 flex justify-end gap-4 text-[9px] font-black uppercase">
        <span className="text-emerald-400">Entradas</span>
        <span className="text-rose-400">Saídas</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-[140px] w-full" role="img" aria-label="Evolução financeira dos últimos seis meses">
        {[14, 31, 48, 65, 82].map((y) => <line key={y} x1="6" x2="94" y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />)}
        {data.length > 0 && <polyline points={incomingPoints} fill="none" stroke="#10b981" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {data.length > 0 && <polyline points={outgoingPoints} fill="none" stroke="#f43f5e" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="grid text-center text-[8px] font-black text-slate-600" style={{ gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))` }}>
        {data.map((item) => <span key={item.name}>{item.name}</span>)}
      </div>
    </div>
  );
};
