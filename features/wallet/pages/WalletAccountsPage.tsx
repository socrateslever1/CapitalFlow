import React, { useEffect, useMemo, useState } from 'react';
import { History, Plus, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { UserProfile } from '../../../types';
import { AccountCardStack } from '../../../components/wallet/AccountCardStack';
import { AccountDetailsPage } from '../../../components/wallet/AccountDetailsPage';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import { WalletPageFrame } from '../components/WalletPageFrame';
import { CreateAccountModal } from '../../../components/wallet/CreateAccountModal';
import { buildAccountStatementEntries } from '../../../components/wallet/accountStatementDomain';
import { formatMoney } from '../../../utils/formatters';
import { PrivateMoney } from '../../../contexts/FinancialPrivacyContext';

export const WalletAccountsPage: React.FC<{ activeUser?: UserProfile | null; onNavigate: (path: string) => void }> = ({ activeUser }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { data, loading, error, refresh } = useWalletSnapshot();
    const selectedId = searchParams.get('conta');
    const openAccount = (id: string) => {
        const next = new URLSearchParams(searchParams);
        next.set('conta', id);
        setSearchParams(next);
    };
    const closeAccount = () => {
        if (Number(window.history.state?.idx ?? 0) > 0) navigate(-1);
        else {
            const next = new URLSearchParams(searchParams);
            next.delete('conta');
            setSearchParams(next, { replace: true });
        }
    };
    useEffect(() => {
        if (!selectedId) return;
        const onBack = (event: Event) => { event.preventDefault(); closeAccount(); };
        window.addEventListener('capitalflow:back', onBack);
        return () => window.removeEventListener('capitalflow:back', onBack);
    }, [selectedId, searchParams, setSearchParams, navigate]);
    const [createModalType, setCreateModalType] = useState<'CHECKING' | 'CASH' | null>(null);
    const [canTransferCapital, setCanTransferCapital] = useState(false);
    const [statementSearch, setStatementSearch] = useState('');
    const [showAllStatement, setShowAllStatement] = useState(false);
    useEffect(() => {
        setCanTransferCapital(Boolean(activeUser?.id && activeUser.id !== 'DEMO' && !activeUser?.supervisor_id));
    }, [activeUser?.id, activeUser?.supervisor_id]);

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
  const generalStatement = useMemo(() => {
    if (!data?.accounts?.length) return [];
    const merged = data.accounts.flatMap(account =>
      buildAccountStatementEntries({
        accountId: account.id,
        accounts: data.accounts,
        operations: data.accountOperations,
        expenses: data.expenses,
        invoicePayments: data.invoicePayments,
        statementRows: data.statementRows,
      }).map(entry => ({
        ...entry,
        key: `${account.id}:${entry.id}`,
        accountId: account.id,
        accountNickname: account.nickname,
      })),
    );
    return merged.sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);

  const filteredStatement = useMemo(() => {
    const query = statementSearch.trim().toLocaleLowerCase('pt-BR');
    if (!query) return generalStatement;
    return generalStatement.filter(entry =>
      `${entry.label} ${entry.accountNickname} ${entry.category} ${entry.tag}`
        .toLocaleLowerCase('pt-BR')
        .includes(query),
    );
  }, [generalStatement, statementSearch]);

  const visibleStatement = showAllStatement ? filteredStatement : filteredStatement.slice(0, 20);

    return <WalletPageFrame error={error} loading={loading}>
        {data && (selected ? <AccountDetailsPage account={selected} accounts={data.accounts} cards={data.cards} capitalSources={data.capitalSources}
            expenses={data.expenses} installments={data.installments} invoicePayments={data.invoicePayments} accountOperations={data.accountOperations}
            statementRows={data.statementRows} recurringIncomes={data.recurringIncomes} recurringReceipts={data.recurringReceipts}
            recurringObligations={data.recurringObligations} onBack={closeAccount} onSaved={async () => { await refresh(); }}
            ownerName={activeUser?.fullName || activeUser?.name} ownerCity={activeUser?.city}
            canTransferCapital={canTransferCapital} profileId={activeUser?.profile_id || activeUser?.id}
            onCreateAccount={() => startCreate('CHECKING')} /> : <>
            <div className="min-w-0 space-y-2.5">
                <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
                    <AccountCardStack
                        accounts={data.accounts}
                        showTotal={false}
                        onOpen={account => openAccount(account.id)}
                    />
                    {!data.accounts.length && (
                        <div className="mt-3 flex justify-center">
                            <button
                                type="button"
                                onClick={() => startCreate('CHECKING')}
                                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                            >
                                <Plus size={15} /> Nova conta
                            </button>
                        </div>
                    )}
                </div>

                {data.accounts.length > 0 && (
                    <section aria-label="Extrato geral das contas" className="min-w-0 space-y-2.5 rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                                <History size={16} className="text-cyan-400" /> Extrato geral das contas
                            </h2>
                            <span className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                                {filteredStatement.length}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2.5">
                            <Search size={14} className="shrink-0 text-slate-500" />
                            <input
                                type="search"
                                aria-label="Buscar no extrato geral"
                                placeholder="Buscar conta, descrição ou categoria"
                                value={statementSearch}
                                onChange={event => setStatementSearch(event.target.value)}
                                className="w-full bg-transparent py-2 text-xs text-white outline-none placeholder:text-slate-500"
                            />
                        </div>
                        {filteredStatement.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-xs text-slate-400">
                                Nenhuma movimentação encontrada nas contas.
                            </p>
                        ) : (
                            <>
                                <div className="divide-y divide-slate-800/80">
                                    {visibleStatement.map(entry => (
                                        <button
                                            key={entry.key}
                                            type="button"
                                            onClick={() => openAccount(entry.accountId)}
                                            className="flex w-full min-w-0 items-center justify-between gap-2.5 rounded-lg px-1 py-2 text-left transition-colors hover:bg-slate-800/40"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs sm:text-sm font-semibold text-white">{entry.label}</p>
                                                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                                    {entry.accountNickname} · {entry.date.slice(0, 10).split('-').reverse().join('/')} · {entry.category}
                                                </p>
                                            </div>
                                            <strong className={`shrink-0 text-xs sm:text-sm font-bold tabular-nums ${entry.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                                {entry.amount >= 0 ? '+' : '−'}<PrivateMoney value={formatMoney(Math.abs(entry.amount))} />
                                            </strong>
                                        </button>
                                    ))}
                                </div>
                                {filteredStatement.length > 20 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllStatement(current => !current)}
                                        className="w-full rounded-lg border border-slate-800 bg-slate-950/70 py-2 text-xs font-semibold text-blue-300 hover:bg-slate-800"
                                    >
                                        {showAllStatement ? 'Mostrar menos' : `Ver todos (${filteredStatement.length})`}
                                    </button>
                                )}
                            </>
                        )}
                    </section>
                )}
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
        </>)}
    </WalletPageFrame>;
};
