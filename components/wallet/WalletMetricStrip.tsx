import React from 'react';

export const WalletMetricStrip: React.FC<{
  items: Array<{ label: string; value: React.ReactNode; tone?: 'positive' | 'negative' }>;
}> = ({ items }) => <div className="@container rounded-2xl border border-slate-800 bg-slate-900"><dl className="grid gap-5 p-5 @lg:grid-cols-3 @lg:gap-6 @lg:p-6">
  {items.map(item => <div key={item.label} className="min-w-0">
    <dt className="text-sm text-slate-400">{item.label}</dt>
    <dd className={`mt-2 break-words text-2xl font-bold tracking-tight tabular-nums ${item.tone === 'positive' ? 'text-emerald-300' : item.tone === 'negative' ? 'text-rose-300' : 'text-white'}`}>{item.value}</dd>
  </div>)}
</dl></div>;
