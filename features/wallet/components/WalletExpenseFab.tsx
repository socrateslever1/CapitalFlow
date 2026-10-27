import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useWalletSnapshot } from '../hooks/useWalletSnapshot';
import QuickExpenseModal from './QuickExpenseModal';

export const WalletExpenseFab: React.FC = () => {
  const { data, refresh } = useWalletSnapshot();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return <>
    <button type="button" aria-label="Adicionar despesa" title="Adicionar despesa"
      onClick={() => setOpen(true)}
      className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-xl shadow-rose-900/40 transition-all hover:scale-105 active:scale-95 max-sm:bottom-4 max-sm:right-4 sm:h-14 sm:w-14">
      <Plus size={22} strokeWidth={2.5}/>
    </button>
    {open && <QuickExpenseModal accounts={data.accounts} cards={data.cards} onClose={() => setOpen(false)} onSaved={async () => { await refresh(); window.dispatchEvent(new Event('capitalflow:wallet-updated')); }}/>} 
  </>;
};
