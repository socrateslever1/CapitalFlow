import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Pencil, Wifi } from 'lucide-react';
import type { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { BankLogo } from './BankLogo';
import { WalletCardsSheet } from './WalletCardsSheet';
import { getBankVisual, getCreditSummary, groupWalletByBank } from './walletPresentation';

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

const Chip = () => <svg viewBox="0 0 42 33" width="36" height="29" aria-label="Chip EMV"><rect x="1" y="1" width="40" height="31" rx="6" fill="#DFC48C" stroke="#977844"/><path d="M14 1v31M28 1v31M1 11h40M1 22h40M14 11h14v11H14z" fill="none" stroke="#977844" strokeWidth="1.5"/></svg>;

const Network = ({ brand }: { brand: string | null }) => {
  const value = (brand || '').toLowerCase();
  if (value.includes('master')) return <span aria-label="Mastercard" className="relative h-6 w-9"><span className="absolute left-0 top-0 h-6 w-6 rounded-full bg-red-500"/><span className="absolute right-0 top-0 h-6 w-6 rounded-full bg-yellow-400/90"/></span>;
  if (value.includes('visa')) return <span className="rounded bg-white px-1.5 py-0.5 text-xs font-black italic text-blue-900">VISA</span>;
  return <span className="text-xs font-bold">{brand || 'CRÉDITO'}</span>;
};

export const BankStack: React.FC<Props> = ({ accounts, cards, onAccount, onCard, onEditCard, onCreateCard, onSelectionChange, holderName }) => {
  const availableCards = useMemo(() => cards.filter(card => card.status !== 'CANCELED'), [cards]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showHolder, setShowHolder] = useState(false);
  const startX = useRef<number | null>(null);
  const preventOpen = useRef(false);
  const selected = availableCards.find(card => card.id === selectedId) || availableCards[0] || null;
  const index = selected ? availableCards.findIndex(card => card.id === selected.id) : 0;
  const rear = availableCards.filter(card => card.id !== selected?.id).slice(0, 3);
  const summary = useMemo(() => getCreditSummary(availableCards), [availableCards]);
  const banks = useMemo(() => groupWalletByBank(accounts, availableCards), [accounts, availableCards]);
  const count = banks.filter(group => group.cards.length > 0).length;

  useEffect(() => { onSelectionChange?.(selected); }, [selected, onSelectionChange]);
  useEffect(() => { setShowHolder(false); }, [selected?.id]);

  const cycle = (step: number) => {
    if (availableCards.length > 1) setSelectedId(availableCards[(index + step + availableCards.length) % availableCards.length].id);
  };
  const identity = (card: PersonalWalletCard) => {
    const account = accounts.find(item => item.id === card.account_id);
    const issuer = account?.bank_name || card.issuer || card.nickname;
    const key = card.institution_key || account?.institution_key || issuer;
    const visual = getBankVisual(key);
    const lower = String(key).toLowerCase();
    const accent = card.primary_color || (lower === 'mercadopago' ? '#1F2229' : lower === 'picpay' ? '#11C76F' : lower === 'nubank' ? '#820AD1' : lower === 'bradesco' ? '#CC092F' : lower === 'inter' ? '#FF7A00' : visual.accent);
    return { issuer, visual, accent };
  };
  const front = selected ? identity(selected) : null;

  return <section aria-label="Carteira de cartões" className="w-full min-w-0">
    <header className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-white">Cartões de crédito</h2>{onCreateCard && <button onClick={onCreateCard} type="button" className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-blue-300">+ Cartão</button>}</header>
    {!selected ? <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">Nenhum cartão cadastrado.</div> : <>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 sm:gap-3">
        <button type="button" disabled={availableCards.length < 2} onClick={() => cycle(-1)} aria-label="Cartão anterior" className="rounded-full p-1 text-slate-300 disabled:opacity-30"><ArrowLeft size={19}/></button>
        <div className="mx-auto w-full min-w-0 max-w-[285px] sm:max-w-[370px]">
          <div className="relative w-full" style={{ paddingTop: rear.length * 14 }}>
            {rear.map((card, rearIndex) => {
              const cardIdentity = identity(card);
              return <button type="button" key={card.id} onClick={() => setSelectedId(card.id)} aria-label={`Selecionar ${card.nickname}`} className="absolute inset-x-0 top-0 mx-auto h-14 rounded-t-2xl border border-white/20 shadow-xl transition-all duration-300 ease-out" style={{ zIndex: rearIndex + 1, width: `${92 + rearIndex * 3}%`, transform: `translateY(${rearIndex * 14}px)`, background: cardIdentity.accent }}><span className="absolute left-3 top-1.5 text-[10px] font-bold text-white">{card.nickname}</span></button>;
            })}
            <div
              className="relative z-30 aspect-[1.586/1] w-full overflow-hidden rounded-2xl border border-white/25 shadow-2xl"
              style={{ background: `linear-gradient(125deg,${front!.accent},${front!.visual.secondary})` }}
              onTouchStart={event => { startX.current = event.touches[0]?.clientX ?? null; }}
              onTouchEnd={event => {
                const distance = (event.changedTouches[0]?.clientX ?? 0) - (startX.current ?? 0);
                startX.current = null;
                if (Math.abs(distance) > 45) { preventOpen.current = true; cycle(distance < 0 ? 1 : -1); }
              }}
              onClick={() => { if (preventOpen.current) { preventOpen.current = false; return; } setSheetOpen(true); }}
              role="button"
              tabIndex={0}
              aria-label="Ver uso do limite dos cartões"
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSheetOpen(true); } }}
            >
              <div aria-hidden className="absolute -right-7 -top-10 select-none text-[7rem] font-black text-white/10">{front!.visual.monogram}</div>
              <div className="relative flex h-full flex-col justify-between p-3.5 text-white sm:p-5">
                <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="rounded-lg bg-white p-0.5"><BankLogo size="sm" name={front!.issuer} alternateName={selected.nickname}/></span><strong className="truncate text-xs">{front!.issuer}</strong></div><Network brand={selected.brand}/></div>
                <div className="flex items-center justify-between"><Chip/><Wifi size={18} className="rotate-90 opacity-80"/></div>
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0"><small className="block text-[9px] uppercase text-white/75">{showHolder ? 'Titular' : 'Disponível'}</small><strong className="block truncate text-base font-black sm:text-xl">{showHolder ? (holderName || selected.nickname).toUpperCase() : formatMoney(Math.max(0, Number(selected.credit_limit) - Number(selected.used_limit)))}</strong><small className="text-[9px] text-white/70">{selected.status === 'BLOCKED' ? 'Bloqueado' : selected.nickname}</small></div>
                  <strong className="shrink-0 font-mono text-xs tracking-wide">•••• {selected.last_four || '----'}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button type="button" disabled={availableCards.length < 2} onClick={() => cycle(1)} aria-label="Próximo cartão" className="rounded-full p-1 text-slate-300 disabled:opacity-30"><ArrowRight size={19}/></button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => setShowHolder(current => !current)} className="rounded-full border border-slate-700 px-3 py-2 text-xs text-slate-200">{showHolder ? 'Ver limite' : 'Ver titular'}</button>
        <button type="button" onClick={() => onEditCard(selected)} className="flex items-center gap-1 rounded-full border border-slate-700 px-3 py-2 text-xs text-slate-200"><Pencil size={14}/> Editar cartão</button>
        <button type="button" onClick={() => onCard(selected)} className="rounded-full border border-slate-700 px-3 py-2 text-xs text-blue-300">Detalhes</button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]"><span className="text-slate-400">Limite total em {count} bancos <strong className="text-slate-200">{formatMoney(summary.total)}</strong></span><button type="button" onClick={() => setSheetOpen(true)} className="flex items-center gap-1 font-bold text-blue-300">Ver uso <ArrowUpRight size={14}/></button></div>
      <p className="mt-2 text-center text-[10px] text-slate-500">{index + 1} de {availableCards.length} · Deslize ou use as setas para trocar</p>
    </>}
    <WalletCardsSheet open={sheetOpen} cards={availableCards} accounts={accounts} onClose={() => setSheetOpen(false)} onCard={card => { setSheetOpen(false); setSelectedId(card.id); onCard(card); }} onAccount={accountId => { setSheetOpen(false); onAccount(accountId); }}/>
  </section>;
};
