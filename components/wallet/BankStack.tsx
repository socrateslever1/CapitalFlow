import React, { useMemo, useState } from 'react';
import { ArrowUpRight, CreditCard } from 'lucide-react';
import { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { getBankVisual, getCreditSummary, groupWalletByBank } from './walletPresentation';
import { BankLogo } from './BankLogo';
import { WalletCardsSheet } from './WalletCardsSheet';

type Props = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  onAccount: (id: string) => void;
  onCard: (card: PersonalWalletCard) => void;
  onCreateCard?: () => void;
};

/** Physical overlapping deck: cards behind peek ABOVE the front card, not an accordion. */
export const BankStack: React.FC<Props> = ({ accounts, cards, onAccount, onCard, onCreateCard }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const groups = useMemo(() => groupWalletByBank(accounts, cards), [accounts, cards]);
  const summary = useMemo(() => getCreditSummary(cards), [cards]);
  const uniqueBanks = groups.filter(group => group.cards.length > 0).length;
  const deck = cards.slice(0, 4).reverse();

  return <section aria-label="Carteira de cartões" className="mx-auto w-full max-w-xl">
    <div className="mb-3 flex items-center justify-between gap-3 px-1">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Minha carteira</p>
        <h2 className="text-base font-bold text-slate-100">Cartões de crédito</h2>
      </div>
      {onCreateCard && <button type="button" onClick={onCreateCard} className="text-xs font-bold text-blue-300">+ Novo cartão</button>}
    </div>
    {cards.length === 0
      ? <div className="rounded-2xl border border-dashed border-slate-700 px-5 py-7 text-center text-sm text-slate-400">
          Nenhum cartão cadastrado.
          {onCreateCard && <button type="button" onClick={onCreateCard} className="ml-2 font-bold text-blue-300">Cadastrar cartão</button>}
        </div>
      : <button type="button" onClick={() => setSheetOpen(true)} aria-label="Abrir uso do limite dos cartões"
          className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
          <div className="relative w-full" style={{ height: `${Math.min(deck.length - 1, 3) * 16 + 168}px` }}>
            {deck.map((card, index) => {
              const visual = getBankVisual(card.issuer || card.nickname);
              const front = index === deck.length - 1;
              const depth = deck.length - 1 - index;
              const institution = groups.find(group => group.cards.some(item => item.id === card.id));
              return <div key={card.id}
                className="absolute inset-x-0 bottom-0 origin-bottom overflow-hidden rounded-2xl border border-white/20 shadow-xl transition-transform duration-200 hover:-translate-y-1"
                style={{
                  height: '168px',
                  transform: `scale(${1 - depth * 0.025}) translateY(${-depth * 16}px)`,
                  zIndex: index + 1,
                  background: `linear-gradient(120deg, ${visual.accent}, ${visual.secondary})`,
                }}>
                <div className="pointer-events-none absolute -right-6 -top-12 select-none text-[7.5rem] font-black text-white/10">{visual.monogram}</div>
                <div className="relative flex h-full flex-col justify-between p-4 text-white">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="rounded-xl bg-white/95 p-1"><BankLogo size="sm" name={institution?.visual.name || card.issuer} alternateName={card.nickname}/></span>
                      <span className="min-w-0"><span className="block truncate text-xs font-bold">{visual.name}</span>
                        {front && <small className="block text-[10px] text-white/70">{card.nickname}</small>}</span>
                    </span>
                    <span className="text-[10px] font-bold tracking-widest text-white/75">{card.brand || 'CRÉDITO'}</span>
                  </div>
                  {front && <div className="flex items-end justify-between gap-2">
                    <div><span className="block text-[10px] font-semibold uppercase tracking-wider text-white/70">Disponível</span>
                      <strong className="text-xl font-black">{formatMoney(summary.available)}</strong></div>
                    <span className="font-mono text-xs font-bold tracking-wider text-white/85">•••• {card.last_four || '----'}</span>
                  </div>}
                </div>
              </div>;
            })}
          </div>
        </button>}
    {cards.length > 0 && <div className="mt-2 flex items-center justify-between gap-3 px-1">
      <div className="min-w-0 text-[11px] text-slate-400">Limite total em {uniqueBanks} banco(s)
        <strong className="ml-1 whitespace-nowrap font-bold text-slate-200">{formatMoney(summary.total)}</strong>
      </div>
      <button type="button" onClick={() => setSheetOpen(true)} className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-blue-300">
        Ver uso do limite <ArrowUpRight size={15}/>
      </button>
    </div>}
    <WalletCardsSheet open={sheetOpen} cards={cards} accounts={accounts}
      onClose={() => setSheetOpen(false)}
      onCard={card => {setSheetOpen(false);onCard(card);}}
      onAccount={id => {setSheetOpen(false);onAccount(id);}}/>
  </section>;
};
