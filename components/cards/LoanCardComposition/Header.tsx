import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Handshake,
  ChevronDown,
  Wallet,
  Hash,
  ShieldAlert,
  ShieldCheck,
  ShieldX
} from 'lucide-react';
import { Loan } from '../../../types';
import { RiskProfile } from '../../../domain/finance/riskAnalysis';
import { formatMoney, formatShortName } from '../../../utils/formatters';
import { getDueBadgeLabel, getDueBadgeStyle } from './helpers';
import { translateBillingCycle } from '../../../utils/translationHelpers';
import { computeLoanRemainingBalance, ZERO_BALANCE_THRESHOLD } from '../../../domain/finance/calculations';

interface HeaderProps {
  loan: Loan;
  debtorNameSafe: string;
  isFullyFinalized: boolean;
  isLate: boolean;
  hasActiveAgreement: boolean;
  daysUntilDue: number; // regra: >0 faltam dias, 0 hoje, <0 vencido
  nextDueDate: string | null | undefined;
  iconStyle: string;
  isStealthMode?: boolean;
  isExpanded?: boolean;
  currentDebt?: number; // Valor total real (Principal + Juros + Multa)
  onToggleExpand?: () => void;
  onNavigate?: (id: string) => void;
  onMarkAsBilled?: (loan: Loan) => void;
  riskProfile?: RiskProfile;
  isCapitalOnlyRecovery?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  loan,
  debtorNameSafe,
  isFullyFinalized,
  isLate,
  hasActiveAgreement,
  daysUntilDue,
  iconStyle,
  isStealthMode,
  isExpanded,
  currentDebt,
  onToggleExpand,
  onNavigate,
  onMarkAsBilled,
  riskProfile,
  isCapitalOnlyRecovery
}) => {
  const isOverdueByDays = daysUntilDue < 0;

  // Lógica de 24h e Countdown
  const [timeLeft, setTimeLeft] = React.useState<string | null>(null);

  const checkIsLocked = React.useCallback((lastBilledAt: string | null | undefined) => {
    if (!lastBilledAt || lastBilledAt === '') return false;
    const lastBilled = new Date(lastBilledAt).getTime();
    if (isNaN(lastBilled)) return false;
    const now = new Date().getTime();
    const diff = now - lastBilled;
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return diff > 0 && diff < twentyFourHours;
  }, []);

  const [isLocked, setIsLocked] = React.useState(() => checkIsLocked(loan.last_billed_at));
  const [localLastBilledAt, setLocalLastBilledAt] = React.useState<string | null>(null);
  const lastClickedRef = React.useRef<number>(0);
  const effectiveLastBilledAt = localLastBilledAt || loan.last_billed_at;

  React.useEffect(() => {
    const now = Date.now();
    if (now - lastClickedRef.current > 3000) {
      setIsLocked(checkIsLocked(effectiveLastBilledAt));
    }
    
    if (!effectiveLastBilledAt) {
      setIsLocked(false);
      setTimeLeft(null);
      return;
    }

    const timer = setInterval(() => {
      const nowTs = Date.now();
      if (nowTs - lastClickedRef.current < 3000) return;

      const lastBilled = new Date(effectiveLastBilledAt).getTime();
      const now = new Date().getTime();
      const diff = now - lastBilled;
      const twentyFourHours = 24 * 60 * 60 * 1000;

      if (diff < twentyFourHours) {
        const remaining = twentyFourHours - diff;
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m`);
        setIsLocked(true);
      } else {
        setTimeLeft(null);
        setIsLocked(false);
        setLocalLastBilledAt(null);
      }
    }, 60_000);

    return () => clearInterval(timer);
  }, [effectiveLastBilledAt, checkIsLocked]);
  
  const displayAmount = currentDebt ?? loan.totalToReceive ?? loan.principal;
  const amountLabel = 'Total';
  const clientAvatarUrl = String(loan.clientAvatarUrl || '').trim();
  const amountBreakdown = React.useMemo(() => {
    const balance = computeLoanRemainingBalance(loan);
    const capital = Math.max(0, Number(balance.principalRemaining) || 0);
    const juros = Math.max(0, (Number(balance.interestRemaining) || 0) + (Number(balance.lateFeeRemaining) || 0));
    const total = Math.max(0, Number(balance.totalRemaining) || capital + juros);
    return { capital, juros, total, shouldShow: total > ZERO_BALANCE_THRESHOLD };
  }, [loan]);

  // Badges refinados
  let Badge = null;
  if (isCapitalOnlyRecovery && !isFullyFinalized) {
    Badge = (
      <div className="flex min-w-0 max-w-full items-center gap-1 rounded-md border border-rose-600/40 bg-rose-600/20 px-1.5 py-0.5 text-rose-500">
        <ShieldAlert size={8} />
        <span className="truncate text-[7px] font-black uppercase">Somente Capital</span>
      </div>
    );
  } else if (isFullyFinalized) {
    Badge = (
      <div className="flex min-w-0 max-w-full items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500">
        <CheckCircle2 size={8} />
        <span className="truncate text-[7px] font-black uppercase">Finalizado</span>
      </div>
    );
  } else if (hasActiveAgreement) {
    Badge = (
      <div className="flex min-w-0 max-w-full items-center gap-1 rounded-md border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-indigo-400">
        <Handshake size={8} />
        <span className="truncate text-[7px] font-black uppercase">Renegociado</span>
      </div>
    );
  } else if (isOverdueByDays) {
    const { cls } = getDueBadgeStyle(daysUntilDue);
    Badge = (
      <div className={`flex min-w-0 max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 ${cls}`}>
        <AlertTriangle size={8} />
        <span className="truncate text-[7px] font-black uppercase">Atrasado</span>
      </div>
    );
  }

  // Risk Badge logic
  let RiskBadge = null;
  if (riskProfile && !isFullyFinalized && !isCapitalOnlyRecovery) {
    const { level, flags, isPotentialDefaulter, category, label } = riskProfile;
    
    let config = { icon: ShieldCheck, color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20', label: 'Risco Baixo' };
    
    if (isPotentialDefaulter) {
       config = { icon: ShieldX, color: 'text-rose-600', bg: 'bg-rose-600/20', border: 'border-rose-600/40', label };
    } else if (category === 'DOCUMENTAL') {
       config = { icon: ShieldAlert, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', label };
    } else if (category === 'HISTORICO' && level === 'BAIXO') {
       config = { icon: ShieldAlert, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', label };
    } else if (category === 'COBRANCA' && level === 'BAIXO') {
       config = { icon: ShieldAlert, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label };
    } else if (level === 'CRITICO') {
       config = { icon: ShieldX, color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20', label };
    } else if (level === 'ALTO') {
       config = { icon: ShieldAlert, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label };
    } else if (level === 'MODERADO') {
       config = { icon: ShieldAlert, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label };
    }

    if (level !== 'BAIXO' || category !== 'REGULAR' || isPotentialDefaulter) {
      RiskBadge = (
        <div 
          className={`flex min-w-0 max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 ${config.bg} ${config.color} ${config.border}`}
          title={flags.join('\n')}
        >
          <config.icon size={8} />
          <span className="truncate text-[7px] font-black uppercase">{config.label}</span>
        </div>
      );
    }
  }

  return (
    <div className="relative flex w-full h-full flex-col justify-between gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative shrink-0">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onNavigate?.(loan.id);
              }}
              className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-all hover:scale-105 active:scale-95 border border-slate-700/50 ${iconStyle}`}
              title="Abrir Contrato"
            >
              {clientAvatarUrl ? (
                <img
                  src={clientAvatarUrl}
                  alt={debtorNameSafe}
                  className="w-full h-full rounded-lg object-cover"
                />
              ) : (
                isFullyFinalized ? <CheckCircle2 size={18} /> : isCapitalOnlyRecovery ? <ShieldAlert size={18} /> : (isOverdueByDays || isLate) ? <AlertTriangle size={18} /> : <Calendar size={18} />
              )}
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand?.();
              }}
              className="absolute -bottom-1 -right-1 bg-slate-900 rounded-lg p-1 border border-slate-700 hover:bg-slate-800 transition-colors z-10 shadow-lg"
            >
              {isExpanded ? <ChevronDown size={12} className="text-white rotate-180 transition-transform"/> : <ChevronDown size={12} className="text-white transition-transform"/>}
            </button>
          </div>

          <div className="min-w-0 flex flex-col flex-1 justify-center">
            <h3 className="client-name font-black text-white uppercase leading-tight w-full truncate">
              {formatShortName(debtorNameSafe)}
            </h3>
            
            <div className="mt-1 flex flex-wrap items-center gap-1.5 min-w-0">
              {RiskBadge}
              {Badge}
              <span className="bg-slate-800/50 px-1.5 py-0.5 text-[7px] text-slate-500 font-black uppercase rounded-sm border border-slate-700/50">
                {translateBillingCycle(loan.billingCycle)}
              </span>
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-start justify-end max-w-[7.5rem] sm:max-w-none">
          {isOverdueByDays && !isFullyFinalized && (
             <div className="animate-in fade-in zoom-in duration-300 flex items-center justify-end gap-1.5 flex-wrap">
                {(loan.billing_count || 0) > 0 && (
                    <div className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded-md border border-slate-700 font-black text-[7px] uppercase">
                    Int: {loan.billing_count}
                  </div>
                )}

                {isLocked ? (
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded-md border border-emerald-500/20">
                      <span className="text-[8px] font-black uppercase">Cobrado</span>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      lastClickedRef.current = Date.now();
                      setLocalLastBilledAt(new Date(lastClickedRef.current).toISOString());
                      setIsLocked(true);
                      onMarkAsBilled?.(loan);
                    }}
                    className="flex items-center gap-1 px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-md border border-rose-400 shadow-sm shadow-rose-500/20 transition-all active:scale-95 animate-pulse"
                  >
                    <span className="text-[8px] font-black uppercase">Cobrar</span>
                  </button>
                )}
             </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2 pt-2 border-t border-slate-800/30">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-950/30 text-[7px] text-slate-500 font-bold uppercase rounded-sm border border-slate-800/50">
            <Hash size={7} />
            <span>{loan.id.substring(0, 6)}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Wallet size={10} className="opacity-50" />
            <span className="text-[8px] font-black uppercase">{amountLabel}</span>
          </div>
        </div>
        
        <div className="min-w-0 flex flex-wrap items-baseline justify-end gap-2">
          {isOverdueByDays && (
            <span className="text-[8px] sm:text-[9px] font-black text-rose-500/80 uppercase">
              {getDueBadgeLabel(daysUntilDue)}
            </span>
          )}
          <span className={`text-lg sm:text-xl font-black leading-none text-right transition-all ${
            (isOverdueByDays || (isLate && !hasActiveAgreement)) 
              ? 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]' 
              : isFullyFinalized 
                ? 'text-emerald-400' 
                : 'text-white'
          }`}>
            {formatMoney(displayAmount, isStealthMode)}
          </span>
          {isExpanded && amountBreakdown.shouldShow && (
            <div className="mt-1 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0 text-[8px] font-black uppercase leading-tight text-slate-500 max-w-[190px]">
              <span>Cap <b className="text-slate-300">{formatMoney(amountBreakdown.capital, isStealthMode)}</b></span>
              <span className="text-slate-700">•</span>
              <span>Juros <b className={amountBreakdown.juros > ZERO_BALANCE_THRESHOLD ? 'text-rose-400' : 'text-slate-400'}>{formatMoney(amountBreakdown.juros, isStealthMode)}</b></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
