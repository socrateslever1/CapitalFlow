import React from 'react';
import { ArrowRight, Lightbulb, ShieldAlert } from 'lucide-react';
import { formatMoney } from '../../../utils/formatters';

/** Read-only guidance derived from the canonical wallet overview. */
export const WalletSpendingGuide: React.FC<{
  projectedBalance: number;
  creditPercent: number;
  pendingCount: number;
  onNavigate: (path: string) => void;
}> = ({ projectedBalance, creditPercent, pendingCount, onNavigate }) => {
  const negative = projectedBalance < 0;
  const highCredit = creditPercent >= 80;
  const insights = [
    {
      title: negative ? 'Orçamento em atenção' : 'Projeção do mês',
      body: negative
        ? `Pelos valores registrados, faltam ${formatMoney(Math.abs(projectedBalance))} para cobrir os compromissos deste mês.`
        : `Projeção de ${formatMoney(projectedBalance)} após os compromissos registrados neste mês.`,
      tone: negative ? 'text-amber-300' : 'text-emerald-300',
    },
    {
      title: highCredit ? 'Limite em atenção' : 'Uso dos cartões',
      body: `${Math.round(creditPercent)}% do limite de crédito utilizado nos cartões cadastrados.`,
      tone: highCredit ? 'text-amber-300' : 'text-slate-200',
    },
    {
      title: 'Compromissos',
      body: pendingCount
        ? `${pendingCount} compromisso(s) cadastrado(s) com vencimento até os próximos 45 dias, incluindo atrasados.`
        : 'Sem compromissos com vencimento próximo identificados nos dados cadastrados.',
      tone: 'text-slate-200',
    },
  ];
  return <section aria-label="Ajuda para controlar gastos" className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Lightbulb size={17} className="text-cyan-300"/>Ajuda com meus gastos</h3>
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><ShieldAlert size={13}/> Somente leitura</span>
    </div>
    <p className="mt-1 text-xs text-slate-400">Orientações calculadas a partir dos dados cadastrados, sem movimentar valores.</p>
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      {insights.map(item => <div key={item.title} className="min-w-0 border-t border-slate-700/70 pt-3">
        <p className={`text-xs font-semibold ${item.tone}`}>{item.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">{item.body}</p>
      </div>)}
    </div>
    <button type="button" onClick={() => onNavigate('dividas')} className="mt-3 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">Ver compromissos <ArrowRight size={15}/></button>
  </section>;
};
