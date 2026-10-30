import React from 'react';

export const WalletMetricStrip: React.FC<{
  items: Array<{ label: string; value: React.ReactNode; tone?: 'positive' | 'negative' }>;
}> = ({ items }) => <div className="@container rounded-xl border border-slate-800 bg-slate-900"><dl className="grid gap-2 divide-y divide-slate-800/80 p-3.5 @lg:grid-cols-3 @lg:gap-6 @lg:divide-x @lg:divide-y-0 @lg:p-6">
  {items.map((item, idx) => <div key={item.label} className={`min-w-0 flex items-baseline justify-between gap-3 pt-3 first:pt-0 @lg:block @lg:pt-0 ${idx > 0 ? '@lg:pl-6' : ''}`}>
    <dt className="text-sm font-medium text-slate-300">{item.label}</dt>
    <dd className={`text-right @lg:text-left @lg:mt-2 break-words text-lg sm:text-xl font-bold tracking-tight tabular-nums ${item.tone === 'positive' ? 'text-emerald-300' : item.tone === 'negative' ? 'text-rose-300' : 'text-white'}`}>{item.value}</dd>
  </div>)}
</dl></div>;
