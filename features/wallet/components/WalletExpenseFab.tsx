import React, { useEffect, useState } from 'react';
import { ClipboardList, CreditCard, Landmark, Plus, ReceiptText, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import QuickExpenseModal from './QuickExpenseModal';

const menuItemClass = 'flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-100 shadow-xl shadow-black/30 transition hover:border-blue-500/50 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400';

/** Financial data is not fetched until the user actually opens the expense form. */
const ExpenseModalOnDemand: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { data, loading, error, refresh } = useWalletSnapshot();
  if (loading) return <div role="status" aria-label="Preparando lançamento de despesa"
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 text-sm text-slate-100">
    Preparando lançamento...
  </div>;
  if (error || !data) return <div role="alert" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
    <div className="w-full max-w-sm rounded-xl border border-rose-700/40 bg-slate-900 p-4 text-sm text-rose-200">
      {error || 'Não foi possível carregar contas e cartões.'}
      <button type="button" onClick={onClose} className="mt-3 block min-h-11 rounded-lg bg-slate-800 px-4 text-white">Fechar</button>
    </div>
  </div>;
  return <QuickExpenseModal accounts={data.accounts} cards={data.cards} onClose={onClose}
    onSaved={async () => { await refresh(); window.dispatchEvent(new Event('capitalflow:wallet-updated')); }}/>;
};

export const WalletExpenseFab: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const onCards = location.pathname.startsWith('/carteira/cartoes');
  const [menuOpen, setMenuOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const goToAction = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return <>
    {menuOpen && <button type="button" aria-label="Fechar ações rápidas" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 cursor-default bg-slate-950/20 backdrop-blur-[1px]"/>}
    <div className={`fixed right-4 z-40 flex flex-col-reverse items-end gap-2 pb-[env(safe-area-inset-bottom)] ${onCards ? 'bottom-28' : 'bottom-20'}`}>
      <button
        type="button"
        aria-label={menuOpen ? 'Fechar ações rápidas' : 'Abrir ações rápidas'}
        aria-expanded={menuOpen}
        aria-controls="wallet-quick-actions"
        onClick={() => setMenuOpen(value => !value)}
        className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-white shadow-xl transition-all hover:scale-105 active:scale-95 sm:h-14 sm:w-14 ${menuOpen ? 'rotate-90 bg-slate-700 shadow-black/40' : 'bg-gradient-to-r from-blue-600 to-blue-500 shadow-blue-900/40'}`}
      >
        {menuOpen ? <X size={21}/> : <Plus size={22} strokeWidth={2.5}/>}
      </button>
      {menuOpen && <div id="wallet-quick-actions" role="menu" aria-label="Ações rápidas da Carteira" className="flex flex-col items-end gap-2 animate-in slide-in-from-bottom-2 fade-in duration-150">
        <button role="menuitem" type="button" onClick={() => goToAction('/carteira/cartoes?acao=novo-cartao')} className={menuItemClass}><CreditCard size={16} className="text-violet-300"/>Adicionar cartão</button>
        <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setExpenseOpen(true); }} className={menuItemClass}><ReceiptText size={16} className="text-rose-300"/>Adicionar despesa</button>
        <button role="menuitem" type="button" onClick={() => goToAction('/carteira/contas?acao=nova-conta')} className={menuItemClass}><Landmark size={16} className="text-emerald-300"/>Adicionar conta</button>
        <button role="menuitem" type="button" onClick={() => goToAction('/carteira/dividas?acao=novo-compromisso')} className={menuItemClass}><ClipboardList size={16} className="text-amber-300"/>Adicionar compromisso</button>
      </div>}
    </div>
    {expenseOpen && <ExpenseModalOnDemand onClose={() => setExpenseOpen(false)}/>}
  </>;
};
