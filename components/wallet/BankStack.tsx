import React, { useMemo, useState } from 'react';
import { ArrowRight, CreditCard } from 'lucide-react';
import { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { getBankVisual, getCreditSummary, groupWalletByBank } from './walletPresentation';
import { WalletCardsSheet } from './WalletCardsSheet';

type Props = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  onAccount: (id: string) => void;
  onCard: (card: PersonalWalletCard) => void;
};

export const BankStack: React.FC<Props> = ({ accounts, cards, onAccount, onCard }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const groups = useMemo(() => groupWalletByBank(accounts, cards), [accounts, cards]);
  const summary = useMemo(() => getCreditSummary(cards), [cards]);
  const deck = cards.length
    ? cards.slice(0, 4).map(card => ({ id: card.id, label: card.nickname, visual: getBankVisual(card.issuer || card.nickname) }))
    : groups.slice(0, 4).map(group => ({ id: group.key, label: group.visual.name, visual: group.visual }));
  if (!deck.length) return null;

  return <>
    <section className="rounded-3xl border border-slate-800/80 bg-slate-950/60 p-4 shadow-xl shadow-black/10 sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-400">Cartões de crédito</p><h2 className="mt-1 text-base font-black text-white">Seus cartões</h2></div>
        <button type="button" onClick={() => setSheetOpen(true)} className="text-[11px] font-bold text-blue-300 hover:text-blue-200">Abrir carteira</button>
      </div>

      <button type="button" aria-label="Abrir cartões e uso do limite" onClick={() => setSheetOpen(true)} className="group block w-full rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
        <div className="relative h-[9.25rem] sm:h-[10.25rem]">
          {deck.map((item, index) => {
            const top = index * 17;
            const isFront = index === deck.length - 1;
            return <div key={item.id} className="absolute inset-x-0 overflow-hidden rounded-2xl border border-white/15 shadow-xl transition-transform duration-300 group-hover:-translate-y-1" style={{ top, height: isFront ? 118 : 82, zIndex: index + 1, background: `linear-gradient(125deg, ${item.visual.accent}, ${item.visual.secondary})` }}>
              <div className="absolute -right-4 -top-9 text-[6rem] font-black text-white/10">{item.visual.monogram}</div>
              <div className="relative flex items-start justify-between p-4 text-white"><span className="grid h-9 min-w-9 place-items-center rounded-full bg-white px-2 text-[11px] font-black" style={{ color: item.visual.accent }}>{item.visual.monogram}</span><span className="text-[10px] font-black uppercase tracking-widest text-white/75">{isFront ? `${cards.length} cartão(ões)` : item.label}</span></div>
              {isFront && <div className="relative flex items-end justify-between px-4 pb-4 text-white"><div><small className="block text-[9px] font-bold uppercase tracking-wider text-white/65">Limite disponível</small><strong className="text-xl font-black">{formatMoney(summary.available)}</strong></div><CreditCard size={24} className="text-white/75" /></div>}
            </div>;
          })}
        </div>
      </button>

      <div className="mt-1 flex items-end justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase text-slate-500">Limite total em {groups.filter(group => group.cards.length).length || cards.length} banco(s)</p><strong className="mt-1 block text-sm text-white">{formatMoney(summary.total)}</strong></div>
        <button type="button" onClick={() => setSheetOpen(true)} className="inline-flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300">Ver uso do limite <ArrowRight size={14} /></button>
      </div>
    </section>

    <WalletCardsSheet open={sheetOpen} cards={cards} accounts={accounts} onClose={() => setSheetOpen(false)} onCard={card => { setSheetOpen(false); onCard(card); }} onAccount={accountId => { setSheetOpen(false); onAccount(accountId); }} />
  </>;
};
