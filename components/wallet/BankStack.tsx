import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, CreditCard, Pencil, Plus, RotateCcw, Wifi } from 'lucide-react';
import { copyCardDataToClipboard, copyCardLastFourToClipboard } from '../../utils/cardClipboard';
import type { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { BankLogo } from './BankLogo';
import { getBankVisual } from './walletPresentation';

type Props = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  onAccount: (id: string) => void;
  onCard: (card: PersonalWalletCard) => void;
  onEditCard: (card: PersonalWalletCard) => void;
  onCreateCard?: () => void;
  onSelectionChange?: (card: PersonalWalletCard | null) => void;
  onNewExpense?: (card: PersonalWalletCard) => void;
  onPayInvoice?: (card: PersonalWalletCard) => void;
};

const Chip = () => <svg viewBox="0 0 42 33" width="36" height="29" aria-label="Chip EMV"><rect x="1" y="1" width="40" height="31" rx="6" fill="#DFC48C" stroke="#977844"/><path d="M14 1v31M28 1v31M1 11h40M1 22h40M14 11h14v11H14z" fill="none" stroke="#977844" strokeWidth="1.5"/></svg>;

const Network = ({ brand }: { brand: string | null }) => {
  const value = (brand || '').toLowerCase();
  if (value.includes('master')) return <span aria-label="Mastercard" className="relative h-6 w-9"><span className="absolute left-0 top-0 h-6 w-6 rounded-full bg-red-500"/><span className="absolute right-0 top-0 h-6 w-6 rounded-full bg-yellow-400/90"/></span>;
  if (value.includes('visa')) return <span className="rounded bg-white px-1.5 py-0.5 text-xs font-black italic text-blue-900">VISA</span>;
  return <span className="text-xs font-bold">{brand || 'CRÉDITO'}</span>;
};

export const BankStack: React.FC<Props> = ({ accounts, cards, onCard, onEditCard, onCreateCard, onSelectionChange, onNewExpense, onPayInvoice }) => {
  const availableCards = useMemo(() => cards.filter(card => card.status !== 'CANCELED'), [cards]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const drag = useRef<{ x: number; delta: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!selected) return;
    const res = await copyCardDataToClipboard(selected);
    setCopyFeedback(res.message);
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  const handleCopyDigits = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!selected) return;
    const res = await copyCardLastFourToClipboard(selected.last_four);
    setCopyFeedback(res.message);
    setTimeout(() => setCopyFeedback(null), 2500);
  };
  const preventOpen = useRef(false);
  const selected = availableCards.find(card => card.id === selectedId) || availableCards[0] || null;
  const index = selected ? availableCards.findIndex(card => card.id === selected.id) : 0;
  const rear = availableCards.filter(card => card.id !== selected?.id).slice(0, 3);

  useEffect(() => { onSelectionChange?.(selected); }, [selected, onSelectionChange]);
  useEffect(() => { setIsFlipped(false); setCopyFeedback(null); }, [selected?.id]);

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
  const available = selected ? Math.max(0, Number(selected.credit_limit) - Number(selected.used_limit)) : 0;
  const maskedNumber = selected?.last_four
    ? `•••• •••• •••• ${selected.last_four}`
    : '•••• •••• •••• ----';

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
              className="relative z-30 aspect-[1.586/1] w-full touch-pan-y select-none transition-transform duration-200 motion-reduce:transition-none"
              style={{ perspective: '1000px', transform: `translateX(${dragOffset}px)` }}
              onPointerDown={event => {
                if (!event.isPrimary || event.button !== 0) return;
                drag.current = { x: event.clientX, delta: 0 };
                preventOpen.current = false;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={event => {
                if (!drag.current) return;
                drag.current.delta = event.clientX - drag.current.x;
                if (Math.abs(drag.current.delta) > 8) preventOpen.current = true;
                setDragOffset(Math.max(-65, Math.min(65, drag.current.delta)));
              }}
              onPointerUp={() => {
                if (drag.current && Math.abs(drag.current.delta) > 45) cycle(drag.current.delta < 0 ? 1 : -1);
                drag.current = null;
                setDragOffset(0);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDragOffset(0);
                preventOpen.current = true;
              }}
              onClick={() => { if (preventOpen.current) { preventOpen.current = false; return; } setIsFlipped(value => !value); }}
              role="button"
              tabIndex={0}
              aria-label={isFlipped ? 'Mostrar frente do cartão' : 'Mostrar verso do cartão'}
              aria-pressed={isFlipped}
              onKeyDown={event => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowRight' ? 1 : -1); }
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setIsFlipped(value => !value); }
              }}
            >
              <div className="absolute inset-0 transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transformStyle: 'preserve-3d', transform: `rotateY(${isFlipped ? 180 : 0}deg)` }}>
                <div className="absolute inset-0 overflow-hidden rounded-2xl border border-white/25 shadow-2xl" style={{ backfaceVisibility: 'hidden', background: `linear-gradient(125deg,${front!.accent},${front!.visual.secondary})` }}>
                  <div aria-hidden className="absolute -right-7 -top-10 select-none text-[7rem] font-black text-white/10">{front!.visual.monogram}</div>
                  <div className="relative flex h-full flex-col justify-between p-3.5 text-white sm:p-5">
                    <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="rounded-lg bg-white p-0.5"><BankLogo size="sm" name={front!.issuer} alternateName={selected.nickname}/></span><strong className="truncate text-xs">{front!.issuer}</strong></div><Network brand={selected.brand}/></div>
                    <div className="flex items-center justify-between"><Chip/><Wifi size={18} className="rotate-90 opacity-80"/></div>
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0"><small className="block text-[9px] uppercase text-white/75">Disponível</small><strong className="block truncate text-base font-black sm:text-xl">{formatMoney(available)}</strong><small className="text-[9px] text-white/70">{selected.status === 'BLOCKED' ? 'Bloqueado' : selected.nickname}</small></div>
                      <button type="button" onPointerDown={event => event.stopPropagation()} onClick={handleCopyDigits} title="Copiar o final do cartão" className="flex items-center gap-1 rounded-lg border border-white/20 bg-black/30 px-2 py-1 font-mono text-[10px] tracking-wide text-white transition hover:bg-black/50 sm:text-xs">
                        <span>{maskedNumber}</span><Copy size={11}/>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 overflow-hidden rounded-2xl border border-white/20 bg-slate-200 text-slate-950 shadow-2xl" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                  <div className="absolute inset-x-0 top-5 h-10 bg-black/90 shadow-inner" aria-label="Faixa magnética"/>
                  <div className="relative flex h-full flex-col px-4 pb-3 pt-[4.35rem] sm:px-5">
                    <div>
                      <div className="mb-1 flex items-end justify-between gap-2 text-[7px] font-bold uppercase tracking-wider text-slate-600 sm:text-[8px]">
                        <span>Assinatura autorizada</span>
                        <span>Código de segurança</span>
                      </div>
                      <div className="flex h-9 overflow-hidden rounded-sm border border-slate-400 bg-white shadow-inner sm:h-11">
                        <div className="flex min-w-0 flex-1 items-center bg-[repeating-linear-gradient(0deg,#f8fafc_0px,#f8fafc_3px,#e2e8f0_4px)] px-3 font-serif text-xs italic text-slate-600 sm:text-sm">{selected.nickname}</div>
                        <div className="flex w-14 shrink-0 items-center justify-center border-l border-slate-400 bg-white font-mono text-xs font-black tracking-widest sm:w-16">•••</div>
                      </div>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[7px] leading-tight text-slate-600 sm:text-[8px]">Este cartão é de uso pessoal. Em caso de perda ou roubo, contate imediatamente a instituição emissora.</p>
                    <div className="mt-auto flex items-end justify-between gap-3 border-t border-slate-400/60 pt-2">
                      <div className="min-w-0">
                        <strong className="block truncate text-[10px] sm:text-xs">{front!.issuer}</strong>
                        <span className="block truncate font-mono text-[8px] text-slate-600 sm:text-[9px]">{maskedNumber}</span>
                        <span className="block text-[7px] text-slate-500 sm:text-[8px]">Fecha {selected.closing_day ? `dia ${selected.closing_day}` : 'não informado'} · Vence {selected.due_day ? `dia ${selected.due_day}` : 'não informado'}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button type="button" title="Copiar resumo do cartão" aria-label="Copiar resumo do cartão" onPointerDown={event => event.stopPropagation()} onClick={handleCopy} className="rounded-md border border-slate-400 bg-white p-1.5 text-slate-800 transition hover:bg-slate-100"><Copy size={12}/></button>
                        <button type="button" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onCard(selected); }} className="rounded-md bg-slate-900 px-2 py-1.5 text-[8px] font-bold text-white sm:text-[9px]">Detalhes</button>
                        <Network brand={selected.brand}/>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button type="button" disabled={availableCards.length < 2} onClick={() => cycle(1)} aria-label="Próximo cartão" className="rounded-full p-1 text-slate-300 disabled:opacity-30"><ArrowRight size={19}/></button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => onNewExpense?.(selected)} className="flex min-w-0 items-center justify-center gap-1 rounded-xl bg-blue-600 px-2 py-2.5 text-[10px] font-bold text-white sm:text-xs"><Plus size={14}/> Despesa</button>
        <button type="button" onClick={() => onPayInvoice?.(selected)} className="flex min-w-0 items-center justify-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2 py-2.5 text-[10px] font-bold text-amber-200 sm:text-xs"><CreditCard size={14}/> Pagar fatura</button>
        <button type="button" onClick={() => onEditCard(selected)} className="flex min-w-0 items-center justify-center gap-1 rounded-xl border border-slate-700 px-2 py-2.5 text-[10px] font-bold text-slate-200 sm:text-xs"><Pencil size={14}/> Editar cartão</button>
      </div>
      {copyFeedback && <p role="status" className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] text-emerald-300"><Check size={12}/>{copyFeedback}</p>}
      <p className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] text-slate-500"><RotateCcw size={11}/>{index + 1} de {availableCards.length} · Toque para virar · Deslize ou use as setas para trocar</p>
    </>}
  </section>;
};
