import { PrivateMoney } from '../../../contexts/FinancialPrivacyContext';
import React, { useMemo, useState } from 'react';
import { ArrowDownToLine, ReceiptText } from 'lucide-react';
import type { UserProfile } from '../../../types';
import { RecurringIncomePanel } from '../../../components/wallet/RecurringIncomePanel';
import { formatMoney } from '../../../utils/formatters';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { isExternalIncome } from '../domain/walletIncomeHistory';
import { businessDateInManaus } from '../../../utils/businessDate';

export const WalletIncomePage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser }) => {
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [showHistory, setShowHistory] = useState(true);
  const month = businessDateInManaus().slice(0, 7);
  const receivedIds = useMemo(() => new Set((data?.recurringReceipts || [])
    .filter(receipt => String(receipt.reference_month).slice(0, 7) === month)
    .map(receipt => receipt.income_id)), [data, month]);

  // Only one-off INCOME operations; recurring RECEIPT and Capital repayment
  // remain in their respective canonical sections, avoiding double-counting.
  const manualReceipts = useMemo(() => {
    const operations = data?.accountOperations || [];
    return operations.filter(op => String(op.operation_date).slice(0,7) === month
      && isExternalIncome(op, operations))
      .sort((a,b) => String(b.operation_date).localeCompare(String(a.operation_date)));
  }, [data,month]);
  const manualTotal = manualReceipts.reduce((sum,op) => sum + Number(op.amount || 0),0);
  const accountNames = useMemo(() => new Map((data?.accounts || []).map(account => [account.id,account.nickname])),[data]);

  return <WalletPageFrame title="Receitas" description="Consulte entradas realizadas e organize recebimentos recorrentes."

    error={error} loading={loading} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && <div className="space-y-4">
      <div className="inline-flex w-full rounded-xl border border-slate-800 bg-slate-900/80 p-1 sm:w-auto" role="tablist" aria-label="Seções de receitas">
        <button
          type="button"
          role="tab"
          aria-selected={showHistory}
          onClick={() => setShowHistory(true)}
          className={`flex-1 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors sm:flex-none ${
            showHistory
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          Entradas do mês ({manualReceipts.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!showHistory}
          onClick={() => setShowHistory(false)}
          className={`flex-1 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors sm:flex-none ${
            !showHistory
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          Receitas fixas ({data.recurringIncomes.filter(item => item.active).length})
        </button>
      </div>
      {!showHistory && <RecurringIncomePanel accounts={data.accounts} incomes={data.recurringIncomes}
        receivedIds={receivedIds} onSaved={async () => { await refresh(); }}/>}
      {showHistory && <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5" aria-label="Entradas avulsas já realizadas">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <ArrowDownToLine size={17} className="text-emerald-300"/> Histórico de entradas avulsas
            </h3>
            <p className="mt-1 text-xs text-slate-300">Valores efetivamente registrados em {month.slice(5,7)}/{month.slice(0,4)}, não disponíveis novamente.</p>
          </div>
          <strong className="break-words text-xl font-bold tabular-nums text-emerald-300"><PrivateMoney value={formatMoney(manualTotal)} /></strong>
        </div>
        {manualReceipts.length ? <ul className="mt-4 divide-y divide-slate-800">
          {manualReceipts.slice(0,8).map(op => <li key={op.id} className="flex min-w-0 items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-white">{op.description}</p>
              <p className="mt-1 text-xs text-slate-300">
                {op.operation_date.slice(0,10).split('-').reverse().join('/')} · {accountNames.get(op.to_account_id || '') || 'Conta arquivada'} · {op.category}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-300"><PrivateMoney value={formatMoney(Number(op.amount))} /></span>
          </li>)}
        </ul> : <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-950 px-3 py-3 text-xs text-slate-300">
          <ReceiptText size={16} className="shrink-0 text-slate-400"/>
          Nenhuma receita avulsa externa registrada neste mês. Ajustes, estornos, saldos iniciais e transferências estão no extrato.
        </p>}
        {manualReceipts.length > 8 && <p className="mt-2 text-xs text-slate-300">
          Exibindo os oito recebimentos mais recentes. Consulte o extrato da conta para o histórico completo.
        </p>}
        <p className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-400">
          Somente os saldos das contas representam dinheiro disponível. Saldos iniciais, ajustes, estornos e transferências internas são exibidos somente no extrato para evitar contagem duplicada.
        </p>
      </section>}
    </div>}
  </WalletPageFrame>;
};
