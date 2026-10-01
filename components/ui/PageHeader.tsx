import React from 'react';

interface PageHeaderProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle: string;
  actions?: React.ReactNode;
  actionsInline?: boolean;
  stackActionsUntilLg?: boolean;
  className?: string;
  iconClassName?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  icon,
  title,
  subtitle,
  actions,
  actionsInline = false,
  stackActionsUntilLg = false,
  className = '',
  iconClassName = 'border-blue-500/30 bg-blue-600 text-white shadow-blue-950/30',
}) => (
  <header className={`grid w-full items-center gap-x-3 gap-y-4 border-b border-slate-800/70 pb-4 ${stackActionsUntilLg ? 'grid-cols-[3rem_minmax(0,1fr)] lg:grid-cols-[3rem_minmax(0,1fr)_auto]' : actionsInline ? 'grid-cols-[3rem_minmax(0,1fr)_auto]' : 'grid-cols-[3rem_minmax(0,1fr)] sm:grid-cols-[3rem_minmax(0,1fr)_auto]'} ${className}`}>
    <div className={`page-header-icon flex items-center justify-center rounded-full border shadow-lg ${iconClassName}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <h1 className="page-header-title uppercase text-white">
        {title}
      </h1>
      <p className="page-header-subtitle uppercase text-slate-500">
        {subtitle}
      </p>
    </div>
    {actions && <div className={stackActionsUntilLg ? 'col-span-2 w-full lg:col-span-1 lg:w-auto' : actionsInline ? 'w-auto' : 'col-span-2 w-full sm:col-span-1 sm:w-auto'}>{actions}</div>}
  </header>
);
