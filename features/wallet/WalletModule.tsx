import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CreditCard, LockKeyhole, Plus, SlidersHorizontal, Wallet } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { UserProfile } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { useWalletAccess } from './hooks/useWalletAccess';
import { useWalletRealtime } from './hooks/useWalletRealtime';
import { getWalletRoute, WALLET_ROUTES, WalletRouteView } from './routes';
import { walletRepository, type WalletSnapshot } from './services/walletRepository';
import { WalletExpenseFab } from './components/WalletExpenseFab';
import { QuickWalletActionsModal, type QuickActionMode } from './components/QuickWalletActionsModal';
import { QuickExpenseModal } from './components/QuickExpenseModal';
import { CreateAccountModal } from './components/CreateAccountModal';

const StateCard: React.FC<{ kind: 'inactive' | 'error'; message: string }> = ({ kind, message }) => <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center text-white shadow-2xl">
  {kind === 'inactive' ? <LockKeyhole className="mx-auto mb-4 text-amber-300" size={34}/> : <AlertTriangle className="mx-auto mb-4 text-rose-300" size={34}/>}
  <h1 className="text-xl font-black">{kind === 'inactive' ? 'Módulo Carteira não está ativo' : 'Carteira temporariamente indisponível'}</h1>
  <p className="mt-2 text-sm text-slate-400">{message}</p>
</section>;

const WalletModule: React.FC<{ activeUser?: UserProfile | null }> = ({ activeUser }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useWalletAccess();
  const invalidate = useCallback(() => window.dispatchEvent(new Event('capitalflow:wallet-updated')), []);
  const realtimeStatus = useWalletRealtime(access.status === 'active' ? access.userId : null, invalidate);
  const route = getWalletRoute(location.pathname);
  const go = useCallback((path: string) => navigate(`/carteira/${path}`), [navigate]);

  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [quickModal, setQuickModal] = useState<{ mode: QuickActionMode; target?: string; cardId?: string } | null>(null);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await walletRepository.load();
      setSnapshot(res);
    } catch {}
  }, []);

  useEffect(() => {
    if (access.status === 'active') {
      void loadSnapshot();
    }
  }, [access.status, loadSnapshot]);

  useEffect(() => {
    const onUpdated = () => { void loadSnapshot(); };
    window.addEventListener('capitalflow:wallet-updated', onUpdated);
    return () => window.removeEventListener('capitalflow:wallet-updated', onUpdated);
  }, [loadSnapshot]);

  if (access.status === 'loading') return <div aria-label="Carregando módulo Carteira" className="mx-auto mt-8 h-72 max-w-5xl animate-pulse rounded-3xl bg-slate-900"/>;
  if (access.status === 'inactive') return <StateCard kind="inactive" message="Ative a Carteira no seu plano para acessar contas, cartões, dívidas e cobranças PIX."/>;
  if (access.status === 'error') return <StateCard kind="error" message={access.message}/>;

  return <main className="w-full pb-28">
    <div className="mx-auto mb-3 max-w-7xl px-4 sm:px-6">
      <PageHeader
        icon={<span className="relative block h-[22px] w-[22px]" aria-hidden="true"><Wallet size={22} strokeWidth={2.2}/><CreditCard size={10} strokeWidth={2.4} className="absolute -bottom-0.5 -right-1 rounded-sm bg-emerald-600"/></span>}
        iconClassName="border-slate-700 bg-slate-900 text-emerald-300 shadow-black/20"
        title={<>Minha <span className="text-emerald-400">Carteira</span></>}
        subtitle="Seus cartões e finanças em um único lugar"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="hidden"
            >
              <Plus size={14} /> + Nova Conta / Carteira
            </button>
            <button
              type="button"
              className="hidden"
            >
              <Plus size={14} /> Nova Despesa
            </button>
            <button
              type="button"
              className="hidden"
              title="Informar fatura atual, demais gastos e crédito livre de cartão já em uso"
            >
              <SlidersHorizontal size={14} className="text-emerald-400" /> Cartão em Uso
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {realtimeStatus === 'connected' ? 'Sincronizado' : 'Sincronizando'}
            </span>
          </div>
        }
      />
      {toastMsg && (
        <div role="status" className="mt-2 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3.5 py-2 text-xs font-semibold text-emerald-200">
          <span>{toastMsg}</span>
          <button type="button" onClick={() => setToastMsg('')} className="text-emerald-300 hover:text-white ml-2">✕</button>
        </div>
      )}
    </div>
    <div className="mx-auto mb-4 max-w-7xl px-4 sm:px-6">
      <nav aria-label="Navegação da Carteira" className="inline-flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/5 bg-slate-900/60 p-1.5 backdrop-blur-md scrollbar-hide">
        {WALLET_ROUTES.filter(item => item.key !== 'cobranca').map(item => (
          <button
            key={item.key}
            type="button"
            aria-current={route === item.key ? 'page' : undefined}
            onClick={() => go(item.key)}
            className={`shrink-0 px-4 py-2 text-xs md:text-sm font-medium rounded-xl transition-all ${
              route === item.key
                ? 'bg-blue-600 text-white shadow-md font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
    <WalletRouteView route={route} activeUser={activeUser} onNavigate={go}/>

    {quickExpenseOpen && snapshot && (
      <QuickExpenseModal
        accounts={snapshot.accounts}
        cards={snapshot.cards.filter(c => c.status !== 'CANCELED')}
        onClose={() => setQuickExpenseOpen(false)}
        onSaved={async () => {
          setToastMsg('Despesa registrada com sucesso!');
          invalidate();
          await loadSnapshot();
        }}
      />
    )}

    {createAccountOpen && (
      <CreateAccountModal
        onClose={() => setCreateAccountOpen(false)}
        onSaved={async () => {
          setToastMsg('Conta / Carteira adicionada com sucesso!');
          invalidate();
          await loadSnapshot();
        }}
      />
    )}

    {quickModal && snapshot && (
      <QuickWalletActionsModal
        mode={quickModal.mode}
        accounts={snapshot.accounts}
        cards={snapshot.cards}
        expenses={snapshot.expenses}
        installments={snapshot.installments}
        preselectedTarget={quickModal.target}
        preselectedCardId={quickModal.cardId}
        onClose={() => setQuickModal(null)}
        onSuccess={async (msg) => {
          setToastMsg(msg);
          invalidate();
          await loadSnapshot();
        }}
      />
    )}
    <WalletExpenseFab />
  </main>;
};

export default WalletModule;

