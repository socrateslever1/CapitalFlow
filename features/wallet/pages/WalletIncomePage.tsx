import React, { useMemo, useState } from 'react';
import { ArrowDownToLine, Plus, ReceiptText } from 'lucide-react';
import type { UserProfile } from '../../../types';
import { RecurringIncomePanel } from '../../../components/wallet/RecurringIncomePanel';
import { formatMoney } from '../../../utils/formatters';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';

const QuickIncomeModal = React.lazy(() => import('../components/QuickIncomeModal').then(module => ({ default: module.QuickIncomeModal })));

const localMonth = () => {
  const date = new Date();
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0')].join('-');
};

export const WalletIncomePage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = () => {
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [quickIncomeOpen, setQuickIncomeOpen] = useState(false);
  const month = localMonth();
  const receivedIds = useMemo(() => new Set((data?.recurringReceipts || [])
    .filter(receipt => String(receipt.reference_month).slice(0, 7) === month)
    .map(receipt => receipt.income_id)), [data, month]);

  // Only one-off INCOME operations; recurring RECEIPT and Capital repayment
  // remain in their respective canonical sections, avoiding double-counting.
  const manualReceipts = useMemo(() => (data?.accountOperations || [])
    .filter(op => op.operation_type === 'INCOME' && String(op.operation_date).slice(0,7) === month)
    .sort((a,b) => String(b.operation_date).localeCompare(String(a.operation_date))), [data,month]);
  const manualTotal = manualReceipts.reduce((sum,op) => sum + Number(op.amount || 0),0);
  const accountNames = useMemo(() => new Map((data?.accounts || []).map(account => [account.id,account.nickname])),[data]);

  return <WalletPageFrame title="Receitas" description="Consulte entradas realizadas e organize recebimentos recorrentes."
    actions={<button type="button" onClick={() => setQuickIncomeOpen(true)}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
      <Plus size={17}/> Receber valor
    </button>}
    error={error} loading={loading} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && <div className="space-y-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5" aria-label="Entradas comuns do mês">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <ArrowDownToLine size={17} className="text-emerald-300"/> Entradas avulsas
            </h3>
            <p className="mt-1 text-xs text-slate-300">Valores registrados nas suas contas em {month.slice(5,7)}/{month.slice(0,4)}.</p>
          </div>
          <strong className="break-words text-xl font-bold tabular-nums text-emerald-300">{formatMoney(manualTotal)}</strong>
        </div>
        {manualReceipts.length ? <ul className="mt-4 divide-y divide-slate-800">
          {manualReceipts.slice(0,8).map(op => <li key={op.id} className="flex min-w-0 items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-white">{op.description}</p>
              <p className="mt-1 text-xs text-slate-300">
                {op.operation_date.slice(0,10).split('-').reverse().join('/')} · {accountNames.get(op.to_account_id || '') || 'Conta arquivada'} · {op.category}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-300">{formatMoney(Number(op.amount))}</span>
          </li>)}
        </ul> : <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-950 px-3 py-3 text-xs text-slate-300">
          <ReceiptText size={16} className="shrink-0 text-slate-400"/>
          Nenhuma entrada avulsa registrada neste mês. Use o botão Receber valor para registrar.
        </p>}
        {manualReceipts.length > 8 && <p className="mt-2 text-xs text-slate-300">
          Exibindo os oito recebimentos mais recentes. Consulte o extrato da conta para o histórico completo.
        </p>}
        <p className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-400">
          Este valor não inclui pagamentos de clientes, transferências internas ou receitas recorrentes para evitar contagem duplicada.
        </p>
      </section>
      <RecurringIncomePanel accounts={data.accounts} incomes={data.recurringIncomes}
        receivedIds={receivedIds} onSaved={async () => { await refresh(); }}/>
      {quickIncomeOpen && <React.Suspense fallback={<div role="status" className="fixed inset-0 z-[2000] grid place-items-center bg-slate-950/80 text-sm text-slate-100">Preparando recebimento...</div>}>
        <QuickIncomeModal onClose={() => { setQuickIncomeOpen(false); void refresh().catch(() => {}); }}/>
      </React.Suspense>}
    </div>}
  </WalletPageFrame>;
};
