import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Plus, QrCode, Wallet } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { UserProfile } from '../../../types';
import { AccountCardStack } from '../../../components/wallet/AccountCardStack';
import { AccountDetailsPage } from '../../../components/wallet/AccountDetailsPage';
import { formatMoney } from '../../../utils/formatters';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { AccountMovementModal } from '../../../components/wallet/AccountMovementModal';
import { WalletPixCharge } from '../../../components/wallet/WalletPixCharge';
import { CreateAccountModal } from '../../../components/wallet/CreateAccountModal';
import { WalletCapitalLinks } from '../components/WalletCapitalLinks';
import { buildWalletBalanceFacts } from '../../../components/wallet/walletBalanceDomain';

export const WalletAccountsPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createModalType, setCreateModalType] = useState<'CHECKING' | 'CASH' | null>(null);
  const [movementOpen, setMovementOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);

  const startCreate = (accountType: 'CHECKING' | 'CASH') => {
    setCreateModalType(accountType);
  };

  useEffect(() => {
    if (searchParams.get('acao') !== 'nova-conta') return;
    startCreate('CHECKING');
    const next = new URLSearchParams(searchParams);
    next.delete('acao');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const selected = data?.accounts.find(account => account.id === selectedId);
  const totalBalance = data?.accounts.reduce((total, account) => total + Number(account.balance || 0), 0) || 0;
  const hasPixAccount = Boolean(data?.accounts.some(account => account.pix_key?.trim()));

  const balanceFacts = useMemo(() => {
    if (!data?.accounts) return null;
    const effective = data.accounts.reduce((total, account) => total + Number(account.balance || 0), 0);
    const imported = (data.statementRows || []).reduce((total, row) => total + Number(row.amount || 0), 0);
    return buildWalletBalanceFacts({
      effectiveBalance: effective,
      reconciledBalance: effective,
      importedBalance: data.statementRows?.length ? imported : null,
    });
  }, [data]);

  return <WalletPageFrame title="Contas e PIX" description="Consulte os saldos e organize os movimentos de cada instituição."
    error={error} loading={loading} onRefresh={() => { void refresh().catch(() => {}); }}>
    {data && (selected ? <AccountDetailsPage account={selected} accounts={data.accounts} cards={data.cards} capitalSources={data.capitalSources}
      expenses={data.expenses} installments={data.installments} invoicePayments={data.invoicePayments} accountOperations={data.accountOperations}
      statementRows={data.statementRows} onBack={() => setSelectedId(null)} onSaved={async () => { await refresh(); }}
      ownerName={activeUser?.fullName || activeUser?.name} ownerCity={activeUser?.city}/> : <>
      {/* Composição mobile-first (1: Resumo no topo, 2: Contas em lista, 3: Ações abaixo) e desktop 8/4 equilibrado */}
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-12">
        {/* 1. Resumo no topo no celular / Lateral superior no desktop */}
        <aside aria-label="Resumo e movimentações" className="order-1 min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5 lg:order-2 lg:col-span-4">
          <p className="text-sm font-semibold text-slate-300">Liquidez em contas</p>
          <strong className={`mt-2 block break-words text-2xl font-bold tabular-nums tracking-tight ${totalBalance < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
            {formatMoney(totalBalance)}
          </strong>
          {balanceFacts && (
            <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Origem:</span>
                <span className="font-semibold text-emerald-300">{balanceFacts.effective.state} · {balanceFacts.effective.origin}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-400">
                Saldo contábil efetivo reconciliado por instituição.
              </p>
            </div>
          )}
          <p className="mt-1.5 text-xs sm:text-sm text-slate-300">
            {data.accounts.length} {data.accounts.length === 1 ? 'conta registrada' : 'contas registradas'}
          </p>

          {/* No desktop, as ações ficam integradas ao card lateral de resumo para evitar botões soltos e espaço vazio */}
          <div className="mt-5 hidden space-y-2.5 border-t border-slate-800 pt-4 lg:block">
            <button type="button" onClick={() => setMovementOpen(true)} disabled={!data.accounts.length}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40">
              <ArrowLeftRight size={17}/> Transferir / Movimentar
            </button>
            <button type="button" onClick={() => setChargeOpen(true)} disabled={!hasPixAccount}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40">
              <QrCode size={16} className="text-blue-300"/> Gerar cobrança PIX
            </button>
          </div>
        </aside>

        {/* 2. Lista de contas (maior largura no desktop lg:col-span-8, meio no celular) com "Nova conta" junto ao título */}
        <div className="order-2 min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5 lg:order-1 lg:col-span-8 lg:row-span-2">
          <AccountCardStack
            accounts={data.accounts}
            onOpen={account => setSelectedId(account.id)}
            headerActions={
              <>
                <button type="button" onClick={() => startCreate('CASH')}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                  <Wallet size={15} className="text-amber-300"/>Adicionar carteira física
                </button>
                <button
                  type="button"
                  onClick={() => startCreate('CHECKING')}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Plus size={16} />
                  <span>Nova conta</span>
                </button>
              </>
            }
          />
        </div>

        {/* 3. Ações abaixo da lista no celular + Integração com Capital na coluna lateral */}
        <div className="order-3 min-w-0 space-y-4 lg:order-3 lg:col-span-4">
          <div className="grid gap-2.5 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 lg:hidden">
            <button type="button" onClick={() => setMovementOpen(true)} disabled={!data.accounts.length}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40">
              <ArrowLeftRight size={18}/> Transferir / Movimentar
            </button>
            <button type="button" onClick={() => setChargeOpen(true)} disabled={!hasPixAccount}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40">
              <QrCode size={17} className="text-blue-300"/> Gerar cobrança PIX
            </button>
          </div>
          <WalletCapitalLinks
            accounts={data.accounts}
            sources={data.capitalSources}
            canManage={!!activeUser && !activeUser.supervisor_id && activeUser.id !== 'DEMO'}
            onSaved={refresh}
          />
        </div>
      </div>
      {createModalType && (
        <CreateAccountModal
          activeUser={activeUser}
          capitalSources={data.capitalSources || []}
          existingAccounts={data.accounts}
          existingCards={data.cards}
          initialAccountType={createModalType}
          onClose={() => setCreateModalType(null)}
          onSaved={async () => { await refresh(); }}
        />
      )}
      {movementOpen && <AccountMovementModal accounts={data.accounts} cards={data.cards}
        expenses={data.expenses} installments={data.installments}
        onClose={() => setMovementOpen(false)} onSaved={async () => { await refresh(); }}/>}
      {chargeOpen && <WalletPixCharge embedded accounts={data.accounts} recipient={activeUser?.fullName || activeUser?.name || ''}
        city={activeUser?.city} onClose={() => setChargeOpen(false)} onSaved={async () => { await refresh(); }}/>}
    </>)}
  </WalletPageFrame>;
};
