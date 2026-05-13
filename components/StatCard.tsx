
import React from 'react';
import { formatMoney } from '../utils/formatters';
import { ChevronRight } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  rawValue?: number;
  icon: React.ReactNode;
  trend?: string; // Mantido para compatibilidade, mas renderizado no footer se fornecido
  trendColor?: string;
  onClick?: () => void;
  target?: number;
  current?: number;
  isStealthMode?: boolean;
  
  // Novos Props para Layout Rico
  footer?: React.ReactNode;
  indicatorColor?: string;
  variant?: 'default' | 'compact';
}

export const StatCard: React.FC<StatCardProps> = ({ 
    title, value, rawValue, icon, trend, trendColor, onClick, target, current, isStealthMode, footer, indicatorColor = 'bg-blue-500', variant = 'default' 
}) => {
  const progress = target && target > 0 && current !== undefined ? Math.min(100, (current / target) * 100) : 0;
  
  const displayValue = isStealthMode && rawValue !== undefined 
    ? formatMoney(rawValue, true) 
    : isStealthMode ? "R$ ••••" : value;

  // Extrair a cor base (ex: blue de bg-blue-500)
  const colorBase = indicatorColor.split('-')[1] || 'blue';
  const textColorClass = `text-${colorBase}-400`;
  const borderColorClass = `border-${colorBase}-500/20`;
  const iconBgClass = `bg-${colorBase}-500/10`;

  const isCompact = variant === 'compact';
  const bgClass = isCompact ? `bg-${colorBase}-950/40` : 'bg-slate-900';

  return (
    <div 
      className={`relative overflow-hidden ${bgClass} border border-slate-800 rounded-2xl hover:border-${colorBase}-500/40 transition-all duration-300 group cursor-default flex flex-col justify-between ${isCompact ? 'p-3' : 'p-5'}`}
      onClick={onClick}
    >
        {/* Background Glow Effect */}
        <div className={`absolute -top-10 -right-10 w-32 h-32 ${indicatorColor} rounded-full blur-[60px] opacity-10 group-hover:opacity-30 transition-opacity`}></div>
        
        {/* Color Accent Bar */}
        <div className={`absolute top-0 left-0 w-1 h-full ${indicatorColor} opacity-50`}></div>

        <div className={isCompact ? 'flex items-center gap-3' : ''}>
            {/* Header */}
            <div className={`flex justify-between items-start ${isCompact ? 'mb-0' : 'mb-2'}`}>
                <div className="flex items-center gap-3">
                    <div className={`${isCompact ? 'p-1.5' : 'p-2.5'} rounded-xl ${iconBgClass} border ${borderColorClass} ${textColorClass} shadow-sm group-hover:scale-110 transition-transform duration-500`}>
                        {React.cloneElement(icon as React.ReactElement<any>, { size: isCompact ? 14 : 20 })}
                    </div>
                    {!isCompact && (
                        <p className="card-title font-black uppercase tracking-[0.15em] text-slate-500 group-hover:text-slate-400 transition-colors">{title}</p>
                    )}
                </div>
                {onClick && !isCompact && <ChevronRight size={16} className="text-slate-600 group-hover:text-white transition-colors" />}
            </div>

            <div className={isCompact ? 'flex flex-col' : ''}>
                {isCompact && (
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">{title}</p>
                )}
                {/* Value */}
                <h3 className={`${isCompact ? 'text-base' : 'stat-value'} font-black text-white ${isCompact ? 'mt-0.5' : 'my-3'} group-hover:translate-x-1 transition-transform duration-500`}>
                    {displayValue}
                </h3>
            </div>
        </div>

        {/* Footer / Context Block */}
        {!isCompact && (
            <div className="mt-auto space-y-3">
                {/* Progress Bar (if target exists) */}
                {target !== undefined && target > 0 && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-[9px] font-black uppercase tracking-wider">
                            <span className={textColorClass}>Meta: {Math.round(progress)}%</span>
                            <span className="text-slate-500 opacity-70">{isStealthMode ? 'Alvo: •••' : `Alvo: ${formatMoney(target)}`}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/50 p-[1px]">
                            <div 
                                className={`h-full rounded-full transition-all duration-1000 ${indicatorColor} shadow-[0_0_10px_rgba(59,130,246,0.5)]`} 
                                style={{ 
                                    width: `${progress}%`,
                                    boxShadow: `0 0 12px var(--tw-shadow-color)`,
                                    '--tw-shadow-color': `rgba(var(--${colorBase}-500-rgb), 0.4)`
                                } as any}
                            ></div>
                        </div>
                    </div>
                )}

                {/* Custom Footer Info */}
                {footer && (
                    <div className="bg-slate-950/40 border border-slate-800/40 rounded-xl p-3 flex items-center justify-between gap-3 backdrop-blur-md group-hover:bg-slate-950/60 transition-colors">
                        {footer}
                    </div>
                )}
            </div>
        )}
    </div>
  );
};
