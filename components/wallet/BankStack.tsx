import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CreditCard, Plus, WalletCards } from 'lucide-react';
import { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { WalletCardsSheet } from './WalletCardsSheet';
import { getCreditSummary, groupWalletByBank } from './walletPresentation';

type Props = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  onAccount: (id: string) => void;
  onCard: (card: PersonalWalletCard) => void;
  onEditCard: (card: PersonalWalletCard) => void;
  onCreateCard?: () => void;
  onSelectionChange?: (card: PersonalWalletCard | null) => void;
  holderName?: string;
};

export const BankStack: React.FC<Props> = ({ accounts, cards, onAccount, onCard, onCreateCard, onSelectionChange }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const availableCards = useMemo(() => cards.filter(card => card.status !== 'CANCELED'), [cards]);
  const groups = useMemo(() => groupWalletByBank(accounts, availableCards), [accounts, availableCards]);
  const creditBanks = groups.filter(group => group.cards.length > 0);
  const summary = useMemo(() => getCreditSummary(availableCards), [availableCards]);
  const layers = creditBanks.slice(0, 3);
  useEffect(() => onSelectionChange?.(availableCards[0] || null), [availableCards, onSelectionChange]);
  const open = () => setSheetOpen(true);

  return <section aria-labelledby="wallet-stack-title" className="w-full min-w-0 px-1 py-1">
    <header className="mb-3 flex items-end justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-emerald-400">Carteira</p><h2 id="wallet-stack-title" className="mt-0.5 text-lg font-black text-white">Seus cartões</h2></div>
      {onCreateCard && <button type="button" onClick={onCreateCard} className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1.5 text-[11px] font-bold text-blue-300"><Plus size={13}/> Cartão</button>}
    </header>

    {!groups.length ? <button type="button" onClick={onCreateCard} className="w-full rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">Cadastre sua primeira conta ou cartão</button> : <>
      <button type="button" aria-label="Abrir carteira e uso do limite" onClick={open} className="group block w-full text-left focus-visible:rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
        <div className="relative h-[10.6rem] sm:h-[11.4rem]">
          {layers.map((group, index) => <div key={group.key} aria-hidden="true" className="absolute inset-x-0 h-24 origin-top overflow-hidden rounded-[1.35rem] border border-white/15 shadow-xl transition-transform duration-300 group-hover:-translate-y-0.5" style={{ top: index * 13, zIndex: index + 1, transform: `scale(${0.94 + index * 0.02})`, background: `linear-gradient(110deg, ${group.visual.accent}, ${group.visual.secondary})` }}>
            <div className="flex items-center justify-between px-5 py-3 text-white"><span className="text-[11px] font-black uppercase tracking-wider">{group.visual.name}</span><span className="text-xs font-black opacity-80">{group.visual.monogram}</span></div>
          </div>)}
          <div className="absolute inset-x-0 bottom-0 z-10 h-[7.8rem] overflow-hidden rounded-[1.45rem] border border-white/15 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 p-4 text-white shadow-2xl transition-transform duration-300 group-hover:-translate-y-1">
            <div className="absolute -right-5 -top-8 opacity-[.07]"><WalletCards size={132}/></div>
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 ring-1 ring-white/15"><CreditCard size={18}/></span><span className="text-[9px] font-black uppercase tracking-[.2em] text-white/55">CapitalFlow</span></div>
              <div className="flex items-end justify-between gap-3"><div><small className="block text-[9px] font-bold uppercase tracking-wider text-white/55">Limite disponível</small><strong className="mt-0.5 block text-xl font-black sm:text-2xl">{formatMoney(summary.available)}</strong></div><span className="pb-1 text-[10px] font-bold text-white/65">{availableCards.length} cartão(ões)</span></div>
            </div>
          </div>
        </div>
      </button>
      <footer className="mt-3 flex items-end justify-between gap-3 px-1">
        <p className="text-[11px] text-slate-400">Limite total em <strong className="text-slate-200">{creditBanks.length} {creditBanks.length === 1 ? 'banco' : 'bancos'}</strong><span className="ml-2 font-black text-white">{formatMoney(summary.total)}</span></p>
        <button type="button" onClick={open} className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-blue-400">Ver uso do limite <ArrowRight size={14}/></button>
      </footer>
    </>}

    <WalletCardsSheet open={sheetOpen} cards={availableCards} accounts={accounts} onClose={() => setSheetOpen(false)} onCard={card => { setSheetOpen(false); onCard(card); }} onAccount={accountId => { setSheetOpen(false); onAccount(accountId); }}/>
  </section>;
};
